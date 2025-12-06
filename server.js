const express = require('express');
const app = express();
// تنظیم سرور برای کار با سوکت
const server = require('http').Server(app);
const io = require('socket.io')(server);

// تنظیم پورت برای رندر (Render) یا لوکال
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', socket => {
    // وقتی کاربری وارد اتاق می‌شود
    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);
        // به بقیه خبر بده که فلانی آمد
        socket.to(roomId).emit('user-connected', userId, userName);

        // دریافت و ارسال پیام چت
        socket.on('send-chat-message', message => {
            socket.to(roomId).emit('receive-chat-message', { message: message, name: userName });
        });

        // دریافت و ارسال دستورات ویدیو (پخش، توقف و...)
        socket.on('sync-video-action', (actionData) => {
            socket.to(roomId).emit('receive-video-action', actionData);
        });

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});