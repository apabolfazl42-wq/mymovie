const socket = io('/');
const myPeer = new Peer(undefined); 

let myPeerId = null;
let myName = '';
let roomId = '';
let myStream;
const peers = {};
let isSyncing = false; // قفل برای جلوگیری از چرخه بی نهایت

// المان‌ها
const videoPlayer = document.getElementById('main-video');
const youtubeFrame = document.getElementById('youtube-frame');
const overlay = document.getElementById('start-overlay');
const chatSidebar = document.getElementById('chat-sidebar');
const floatingArea = document.getElementById('floating-chat-area');
const chatHistory = document.getElementById('chat-history');

myPeer.on('open', id => { myPeerId = id; });

// --- توابع رابط کاربری ---
function enterLobby() {
    const nameInput = document.getElementById('username-input');
    if (!nameInput.value) return alert('نام الزامی است');
    myName = nameInput.value;
    document.getElementById('login-container').classList.remove('active');
    document.getElementById('lobby-container').classList.add('active');
    document.getElementById('status-msg').innerText = 'درحال اتصال...';
    checkPeerReady();
}

function checkPeerReady() {
    if (myPeerId) {
        document.getElementById('status-msg').innerText = 'آماده!';
        document.getElementById('status-msg').style.color = '#4CAF50';
    } else setTimeout(checkPeerReady, 500);
}

function createRoom() {
    if (!myPeerId) return;
    enterRoom(Math.random().toString(36).substring(2, 8));
}

function joinRoom() {
    if (!myPeerId) return;
    const id = document.getElementById('room-id-input').value;
    if (!id) return alert('ID را وارد کنید');
    enterRoom(id);
}

function enterRoom(id) {
    roomId = id;
    document.getElementById('lobby-container').classList.remove('active');
    document.getElementById('room-container').style.display = 'flex';
    document.getElementById('display-room-id').innerText = roomId;

    // میکروفون
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
            myStream = stream;
            myStream.getAudioTracks()[0].enabled = false;
            myPeer.on('call', call => {
                call.answer(stream);
                const audio = document.createElement('audio');
                call.on('stream', s => addAudioStream(audio, s));
            });
            socket.emit('join-room', roomId, myPeerId, myName);
        })
        .catch(() => socket.emit('join-room', roomId, myPeerId, myName));
}

// --- رفع مشکل موبایل (صفحه خاکستری) ---
function enableMobileVideo() {
    // یک صدای خالی پخش میکنیم تا مرورگر اجازه پخش ویدیو را بدهد
    videoPlayer.play().then(() => {
        videoPlayer.pause();
        overlay.classList.remove('visible'); // برداشتن پرده
    }).catch(e => console.log(e));
}

// --- مدیریت چت ---
function toggleChatHistory() { chatSidebar.classList.toggle('hidden'); }

function sendMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if (!msg) return;
    displayMessage(myName, msg);
    socket.emit('send-chat-message', msg);
    input.value = '';
}

socket.on('receive-chat-message', data => displayMessage(data.name, data.message));

function displayMessage(name, text) {
    const hDiv = document.createElement('div');
    hDiv.className = 'history-msg';
    hDiv.innerHTML = `<b>${name}:</b> ${text}`;
    chatHistory.appendChild(hDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    const fDiv = document.createElement('div');
    fDiv.className = 'floating-msg';
    fDiv.innerText = `${name}: ${text}`;
    floatingArea.appendChild(fDiv);
    setTimeout(() => fDiv.remove(), 3500);
}

socket.on('user-connected', (uid, uname) => {
    displayMessage('سیستم', `${uname} وارد شد`);
    connectToNewUser(uid, myStream);
});

// --- مدیریت ویدیو (اصلاح شده برای باگ ریستارت) ---

function loadVideoSource(url) {
    // نمایش دکمه فعال سازی برای موبایل
    overlay.classList.add('visible');
    
    videoPlayer.style.display = 'none';
    youtubeFrame.style.display = 'none';
    
    // توقف اجباری قبل از لود جدید
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
            overlay.classList.remove('visible'); // یوتیوب معمولا خودش هندل میکنه
        }
    } else {
        videoPlayer.src = url;
        videoPlayer.style.display = 'block';
        // در موبایل اتوپلی کار نمیکنه، پس منتظر کلیک روی overlay میمانیم
    }
}

function changeVideo() {
    const url = document.getElementById('video-url').value;
    if(url) {
        socket.emit('sync-video-action', { type: 'changeSrc', url: url });
        loadVideoSource(url);
    }
}

// دریافت دستورات از سرور
socket.on('receive-video-action', data => {
    isSyncing = true; // فعال کردن قفل

    if (data.type === 'changeSrc') {
        loadVideoSource(data.url);
    } 
    else if (data.type === 'play') {
        // فیکس باگ ریستارت: اول زمان رو ست میکنیم، بعد پلی
        // اگر اختلاف زمانی زیاد بود (بیشتر از نیم ثانیه) زورکی زمان رو ست کن
        if (Math.abs(videoPlayer.currentTime - data.time) > 0.5) {
            videoPlayer.currentTime = data.time;
        }
        
        var playPromise = videoPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("پخش خودکار توسط مرورگر مسدود شد. روی صفحه بزنید.");
                overlay.classList.add('visible'); // نشان دادن دکمه به کاربر اگر مسدود شد
            });
        }
    } 
    else if (data.type === 'pause') {
        videoPlayer.pause();
        videoPlayer.currentTime = data.time;
    } 
    else if (data.type === 'seek') {
        videoPlayer.currentTime = data.time;
    }
    
    // باز کردن قفل بعد از کمی تاخیر
    setTimeout(() => { isSyncing = false; }, 500);
});

// ارسال دستورات به سرور
videoPlayer.onplay = () => {
    if(!isSyncing) {
        // ارسال زمان دقیق فعلی برای جلوگیری از پرش به عقب
        socket.emit('sync-video-action', { type: 'play', time: videoPlayer.currentTime });
    }
};

videoPlayer.onpause = () => {
    if(!isSyncing) {
        socket.emit('sync-video-action', { type: 'pause', time: videoPlayer.currentTime });
    }
};

videoPlayer.onseeked = () => {
    if(!isSyncing) {
        socket.emit('sync-video-action', { type: 'seek', time: videoPlayer.currentTime });
    }
};

// --- ویس ---
function connectToNewUser(uid, stream) {
    if(!stream) return;
    const call = myPeer.call(uid, stream);
    const audio = document.createElement('audio');
    call.on('stream', s => addAudioStream(audio, s));
    peers[uid] = call;
}
function addAudioStream(audio, stream) {
    audio.srcObject = stream;
    audio.addEventListener('loadedmetadata', () => audio.play());
}
function toggleVoice() {
    if (!myStream) return alert('میکروفون نیست');
    const t = myStream.getAudioTracks()[0];
    t.enabled = !t.enabled;
    const btn = document.getElementById('voice-btn');
    btn.className = t.enabled ? 'voice-on' : 'voice-off';
    btn.innerHTML = t.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
}