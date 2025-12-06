const socket = io('/');
// استفاده از سرور ابری رایگان PeerJS (بدون نیاز به کانفیگ سرور)
const myPeer = new Peer(undefined); 

let myPeerId = null;
let myName = '';
let roomId = '';
let myStream;
const peers = {};
let isSyncing = false;

const youtubeFrame = document.getElementById('youtube-frame');
const videoPlayer = document.getElementById('main-video');
const chatMessages = document.getElementById('chat-messages');

// دریافت شناسه PeerJS از سرور ابری
myPeer.on('open', id => {
    myPeerId = id;
    console.log('My Peer ID is: ' + id);
});

// --- بخش ورود و لابی ---

function enterLobby() {
    const nameInput = document.getElementById('username-input');
    if (!nameInput.value) return alert('نام الزامی است');
    myName = nameInput.value;
    
    document.getElementById('login-container').classList.remove('active');
    document.getElementById('lobby-container').classList.add('active');
    document.getElementById('status-msg').innerText = `سلام ${myName}، منتظر دریافت شناسه صوتی...`;
    
    // صبر میکنیم تا Peer ID ساخته شود
    checkPeerReady();
}

function checkPeerReady() {
    if (myPeerId) {
        document.getElementById('status-msg').innerText = `آماده اتصال!`;
    } else {
        setTimeout(checkPeerReady, 500);
    }
}

function createRoom() {
    if (!myPeerId) return alert('لطفا چند ثانیه صبر کنید تا اتصال صوتی برقرار شود');
    const id = Math.random().toString(36).substring(2, 8); // تولید آی‌دی تصادفی
    enterRoom(id);
}

function joinRoom() {
    if (!myPeerId) return alert('لطفا چند ثانیه صبر کنید تا اتصال صوتی برقرار شود');
    const id = document.getElementById('room-id-input').value;
    if (!id) return alert('ID اتاق را وارد کنید');
    enterRoom(id);
}

function enterRoom(id) {
    roomId = id;
    document.getElementById('lobby-container').classList.remove('active');
    document.getElementById('room-container').style.display = 'flex';
    document.getElementById('display-room-id').innerText = roomId;

    // حالا که وارد اتاق شدیم، میکروفون را آماده میکنیم اما خاموش نگه میداریم
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
            myStream = stream;
            // پیش فرض خاموش
            myStream.getAudioTracks()[0].enabled = false;
            
            // پاسخ دادن به تماس دیگران
            myPeer.on('call', call => {
                call.answer(stream);
                const audio = document.createElement('audio');
                call.on('stream', userAudioStream => {
                    addAudioStream(audio, userAudioStream);
                });
            });

            // اتصال به سوکت (ورود رسمی به اتاق)
            socket.emit('join-room', roomId, myPeerId, myName);
        })
        .catch(err => {
            console.error('دسترسی به میکروفون داده نشد', err);
            // حتی اگر میکروفون نداد، اجازه میدهیم وارد شود
            socket.emit('join-room', roomId, myPeerId, myName);
        });
}

// وقتی کاربر جدیدی می‌آید
socket.on('user-connected', (userId, userName) => {
    addMessage(`سیستم: ${userName} وارد شد.`);
    connectToNewUser(userId, myStream);
});

socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
});

// --- بخش تماس صوتی ---

function connectToNewUser(userId, stream) {
    if (!stream) return; // اگر دسترسی میکروفون نداریم تماس نگیر
    // تماس با کاربر جدید
    const call = myPeer.call(userId, stream);
    const audio = document.createElement('audio');
    
    call.on('stream', userAudioStream => {
        addAudioStream(audio, userAudioStream);
    });
    call.on('close', () => {
        audio.remove();
    });

    peers[userId] = call;
}

function addAudioStream(audio, stream) {
    audio.srcObject = stream;
    audio.addEventListener('loadedmetadata', () => {
        audio.play();
    });
    document.body.append(audio);
}

function toggleVoice() {
    if (!myStream) return alert('میکروفون در دسترس نیست');
    const audioTrack = myStream.getAudioTracks()[0];
    const btn = document.getElementById('voice-btn');

    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        btn.innerHTML = '<i class="fas fa-microphone-slash"></i> غیرفعال';
        btn.className = 'voice-off';
    } else {
        audioTrack.enabled = true;
        btn.innerHTML = '<i class="fas fa-microphone"></i> صحبت کنید';
        btn.className = 'voice-on';
    }
}

// --- بخش چت ---

function sendMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if (!msg) return;
    
    addMessage(`من: ${msg}`);
    socket.emit('send-chat-message', msg);
    input.value = '';
}

socket.on('receive-chat-message', data => {
    addMessage(`${data.name}: ${data.message}`);
});

function addMessage(text) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerText = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- بخش ویدیو و سینک ---
// --- بخش ویدیو و سینک ---

// تابع جدید و هوشمند برای بارگذاری منبع ویدیو
function loadVideoSource(url) {
    // 1. پاکسازی و مخفی کردن هر دو پلیر
    videoPlayer.style.display = 'none';
    youtubeFrame.style.display = 'none';
    
    // 2. بررسی لینک یوتیوب
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let videoId;
        // تلاش برای استخراج ID از لینک‌های مختلف یوتیوب
        try {
            if (url.includes('youtu.be/')) {
                videoId = url.split('youtu.be/')[1].split(/[?&]/)[0];
            } else {
                videoId = new URLSearchParams(new URL(url).search).get('v');
            }
        } catch (e) {
            console.error('Failed to parse YouTube URL', e);
            videoId = null;
        }

        if (videoId) {
            // ساخت لینک صحیح یوتیوب
            youtubeFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
            youtubeFrame.style.display = 'block';
            console.log('Loading YouTube video ID:', videoId);
        } else {
            alert('لینک یوتیوب معتبر نیست یا ID آن یافت نشد.');
        }

    // 3. بررسی لینک مستقیم MP4
    } else if (url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.avi') || url.toLowerCase().endsWith('.webm')) {
        
        videoPlayer.src = url;
        videoPlayer.style.display = 'block';
        videoPlayer.play();
        console.log('Loading direct video file:', url);
    
    // 4. حالت عمومی (اغلب برای لینک‌های مستقیم غیرمعمول)
    } else {
        videoPlayer.src = url; 
        videoPlayer.style.display = 'block';
        videoPlayer.play();
        console.log('Attempting to load generic URL:', url);
        alert('هشدار: این لینک به فایل ویدیویی مستقیم ختم نمی‌شود. اگر پخش نشد، باید لینک MP4 مستقیم را وارد کنید.');
    }
}


function changeVideo() {
    const url = document.getElementById('video-url').value.trim();
    if(url){
        socket.emit('sync-video-action', { type: 'changeSrc', url: url });
        loadVideoSource(url); // استفاده از تابع جدید
    }
}
// (بقیه کدهای سینک و رویدادهای onplay و onpause را دست نزنید.)

// رویدادهای پلیر
videoPlayer.onplay = () => {
    if(!isSyncing) socket.emit('sync-video-action', { type: 'play', time: videoPlayer.currentTime });
};

videoPlayer.onpause = () => {
    if(!isSyncing) socket.emit('sync-video-action', { type: 'pause', time: videoPlayer.currentTime });
};

videoPlayer.onseeked = () => {
    if(!isSyncing) socket.emit('sync-video-action', { type: 'seek', time: videoPlayer.currentTime });
};

socket.on('receive-video-action', data => {
    isSyncing = true; // جلوگیری از لوپ
    if (data.type === 'changeSrc') {
        playLocalVideo(data.url);
    } else if (data.type === 'play') {
        videoPlayer.currentTime = data.time;
        videoPlayer.play();
    } else if (data.type === 'pause') {
        videoPlayer.currentTime = data.time;
        videoPlayer.pause();
    } else if (data.type === 'seek') {
        videoPlayer.currentTime = data.time;
    }
    
    // بعد از نیم ثانیه قفل سینک را برمیداریم
    setTimeout(() => { isSyncing = false; }, 500);
});