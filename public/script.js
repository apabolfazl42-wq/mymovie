const socket = io('/');
const myPeer = new Peer(undefined); 

let myPeerId = null;
let myName = '';
let roomId = '';
let myStream;
const peers = {};
let isSyncing = false;

// المان‌های صفحه
const videoPlayer = document.getElementById('main-video');
const youtubeFrame = document.getElementById('youtube-frame');
const chatSidebar = document.getElementById('chat-sidebar');
const floatingArea = document.getElementById('floating-chat-area');
const chatHistory = document.getElementById('chat-history');

myPeer.on('open', id => {
    myPeerId = id;
    console.log('Peer ID:', id);
});

// --- بخش ۱: ورود و لابی ---

function enterLobby() {
    const nameInput = document.getElementById('username-input');
    if (!nameInput.value) return alert('نام الزامی است');
    myName = nameInput.value;
    
    document.getElementById('login-container').classList.remove('active');
    document.getElementById('lobby-container').classList.add('active');
    document.getElementById('status-msg').innerText = 'در حال اتصال به سرور صوتی...';
    checkPeerReady();
}

function checkPeerReady() {
    if (myPeerId) {
        document.getElementById('status-msg').innerText = 'اتصال برقرار شد! آماده ورود.';
        document.getElementById('status-msg').style.color = '#4CAF50';
    } else {
        setTimeout(checkPeerReady, 500);
    }
}

function createRoom() {
    if (!myPeerId) return alert('کمی صبر کنید...');
    enterRoom(Math.random().toString(36).substring(2, 8));
}

function joinRoom() {
    if (!myPeerId) return alert('کمی صبر کنید...');
    const id = document.getElementById('room-id-input').value;
    if (!id) return alert('ID اتاق را وارد کنید');
    enterRoom(id);
}

function enterRoom(id) {
    roomId = id;
    document.getElementById('lobby-container').classList.remove('active');
    document.getElementById('room-container').style.display = 'flex';
    document.getElementById('display-room-id').innerText = roomId;

    // اتصال میکروفون (ابتدا خاموش)
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
            myStream = stream;
            myStream.getAudioTracks()[0].enabled = false;
            
            myPeer.on('call', call => {
                call.answer(stream);
                const audio = document.createElement('audio');
                call.on('stream', userStream => addAudioStream(audio, userStream));
            });

            socket.emit('join-room', roomId, myPeerId, myName);
        })
        .catch(() => {
            console.log('بدون دسترسی میکروفون وارد شد.');
            socket.emit('join-room', roomId, myPeerId, myName);
        });
}

socket.on('user-connected', (userId, userName) => {
    showFloatingMessage(`سیستم: ${userName} وارد شد`);
    connectToNewUser(userId, myStream);
});

// --- بخش ۲: چت پیشرفته (شناور + تاریخچه) ---

function toggleChatHistory() {
    chatSidebar.classList.toggle('hidden');
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if (!msg) return;

    // نمایش برای خودمان
    displayMessage(myName, msg);
    
    // ارسال به دیگران
    socket.emit('send-chat-message', msg);
    input.value = '';
}

socket.on('receive-chat-message', data => {
    displayMessage(data.name, data.message);
});

function displayMessage(name, text) {
    // ۱. اضافه کردن به تاریخچه (پنل کناری)
    const historyDiv = document.createElement('div');
    historyDiv.className = 'history-msg';
    historyDiv.innerHTML = `<b>${name}:</b> ${text}`;
    chatHistory.appendChild(historyDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // ۲. اضافه کردن به حالت شناور (روی ویدیو)
    showFloatingMessage(`${name}: ${text}`);
}

function showFloatingMessage(text) {
    const floatDiv = document.createElement('div');
    floatDiv.className = 'floating-msg';
    floatDiv.innerText = text;
    floatingArea.appendChild(floatDiv);

    // حذف خودکار بعد از ۳.۵ ثانیه (همزمان با انیمیشن CSS)
    setTimeout(() => {
        floatDiv.remove();
    }, 3500);
}


// --- بخش ۳: ویدیو و رفع باگ سینک ---

// این تابع اصلی مدیریت لینک است
function loadVideoSource(url) {
    console.log("دریافت دستور پخش:", url); // برای تست

    // ریست کردن پلیرها
    videoPlayer.style.display = 'none';
    youtubeFrame.style.display = 'none';
    videoPlayer.pause();
    youtubeFrame.src = "";

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let videoId;
        try {
            if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split(/[?&]/)[0];
            else videoId = new URLSearchParams(new URL(url).search).get('v');
        } catch (e) {}

        if (videoId) {
            youtubeFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            youtubeFrame.style.display = 'block';
        }
    } else {
        // فرض بر لینک مستقیم
        videoPlayer.src = url;
        videoPlayer.style.display = 'block';
        videoPlayer.play().catch(e => console.log("Auto-play blocked:", e));
    }
}

// دکمه پخش توسط سازنده اتاق
function changeVideo() {
    const url = document.getElementById('video-url').value;
    if(url){
        socket.emit('sync-video-action', { type: 'changeSrc', url: url });
        loadVideoSource(url);
    }
}

// گوش دادن به دستورات سرور (رفع باگ یک طرفه بودن)
socket.on('receive-video-action', data => {
    isSyncing = true;
    console.log("دستور سینک دریافت شد:", data); // لاگ برای دیباگ

    if (data.type === 'changeSrc') {
        loadVideoSource(data.url); // **این خط قبلاً مشکل داشت یا نبود**
    } 
    else if (data.type === 'play') {
        videoPlayer.currentTime = data.time;
        videoPlayer.play();
    } 
    else if (data.type === 'pause') {
        videoPlayer.currentTime = data.time;
        videoPlayer.pause();
    } 
    else if (data.type === 'seek') {
        videoPlayer.currentTime = data.time;
    }
    
    setTimeout(() => { isSyncing = false; }, 500);
});

// ارسال دستورات پخش/توقف خودمان به سرور
videoPlayer.onplay = () => {
    if(!isSyncing) socket.emit('sync-video-action', { type: 'play', time: videoPlayer.currentTime });
};
videoPlayer.onpause = () => {
    if(!isSyncing) socket.emit('sync-video-action', { type: 'pause', time: videoPlayer.currentTime });
};
videoPlayer.onseeked = () => {
    if(!isSyncing) socket.emit('sync-video-action', { type: 'seek', time: videoPlayer.currentTime });
};

// --- بخش ۴: ویس (بدون تغییر) ---
function connectToNewUser(userId, stream) {
    if(!stream) return;
    const call = myPeer.call(userId, stream);
    const audio = document.createElement('audio');
    call.on('stream', s => addAudioStream(audio, s));
    peers[userId] = call;
}
function addAudioStream(audio, stream) {
    audio.srcObject = stream;
    audio.addEventListener('loadedmetadata', () => audio.play());
}
function toggleVoice() {
    if (!myStream) return alert('میکروفون یافت نشد');
    const track = myStream.getAudioTracks()[0];
    const btn = document.getElementById('voice-btn');
    track.enabled = !track.enabled;
    if (track.enabled) {
        btn.innerHTML = '<i class="fas fa-microphone"></i> صحبت کنید';
        btn.className = 'voice-on';
    } else {
        btn.innerHTML = '<i class="fas fa-microphone-slash"></i> غیرفعال';
        btn.className = 'voice-off';
    }
}