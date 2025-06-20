const express = require('express');
const https = require('https');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();

// HTTPS için self-signed sertifika oluştur
let server;
try {
    // HTTPS sertifikası varsa kullan
    const options = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    };
    server = https.createServer(options, app);
    console.log('HTTPS sunucusu başlatılıyor...');
} catch (error) {
    // HTTPS yoksa HTTP kullan
    server = http.createServer(app);
    console.log('HTTP sunucusu başlatılıyor...');
}
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Static dosyaları serve et
app.use(express.static(path.join(__dirname)));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('Kullanıcı bağlandı:', socket.id);

    socket.on('create-room', (callback) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms.set(roomId, {
            host: socket.id,
            guest: null,
            messages: []
        });
        socket.join(roomId);
        socket.roomId = roomId;
        socket.isHost = true;
        
        callback({ success: true, roomId });
        console.log('Oda oluşturuldu:', roomId);
    });

    socket.on('join-room', (roomId, callback) => {
        const room = rooms.get(roomId);
        if (!room) {
            callback({ success: false, error: 'Oda bulunamadı' });
            return;
        }
        
        if (room.guest) {
            callback({ success: false, error: 'Oda dolu' });
            return;
        }
        
        room.guest = socket.id;
        socket.join(roomId);
        socket.roomId = roomId;
        socket.isHost = false;
        
        // Her iki oyuncuya da oyunun başladığını bildir
        io.to(roomId).emit('game-start');
        
        callback({ success: true, roomId });
        console.log('Odaya katılındı:', roomId);
    });

    // WebRTC sinyalleri
    socket.on('webrtc-offer', (data) => {
        socket.to(socket.roomId).emit('webrtc-offer', data);
    });

    socket.on('webrtc-answer', (data) => {
        socket.to(socket.roomId).emit('webrtc-answer', data);
    });

    socket.on('webrtc-ice-candidate', (data) => {
        socket.to(socket.roomId).emit('webrtc-ice-candidate', data);
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                // Diğer oyuncuya ayrıldığını bildir
                socket.to(socket.roomId).emit('player-disconnected');
                
                // Odayı temizle
                if (room.host === socket.id || room.guest === socket.id) {
                    rooms.delete(socket.roomId);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});