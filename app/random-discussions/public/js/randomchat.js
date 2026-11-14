const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let queue = []; // คนที่รอจับคู่อยู่ (หลายคนได้)

function broadcastOnline() {
    io.emit('online', io.engine.clientsCount);
}

function removeFromQueue(socket) {
    queue = queue.filter((s) => s !== socket);
}

// ตัดการจับคู่ แล้วให้อีกฝั่งกลับเข้าคิวอัตโนมัติ
function unpair(socket) {
    const partner = socket.partner;
    if (!partner) return;
    socket.partner = null;
    partner.partner = null;
    partner.emit('partner-left');
    join(partner);
}

function join(socket) {
    removeFromQueue(socket);
    if (socket.partner) return;

    const other = queue.shift();
    if (!other) {
        queue.push(socket);
        socket.emit('waiting');
        return;
    }
    socket.partner = other;
    other.partner = socket;
    socket.emit('matched', { initiator: true });
    other.emit('matched', { initiator: false });
}

io.on('connection', (socket) => {
    broadcastOnline();

    socket.on('join', () => join(socket));

    // กด "ถัดไป": ออกจากคู่เดิม แล้วหาคนใหม่
    socket.on('next', () => {
        unpair(socket);
        join(socket);
    });

    // กด "ออก": ออกจากคู่เดิม
    socket.on('leave', () => {
        removeFromQueue(socket);
        unpair(socket);
    });

    socket.on('signal', (data) => {
        if (socket.partner) socket.partner.emit('signal', data);
    });

    socket.on('disconnect', () => {
        removeFromQueue(socket);
        unpair(socket);
        broadcastOnline();
    });
});

const PORT = process.env.PORT || 8765;
server.listen(PORT, () => console.log(`รันที่ http://localhost:${PORT}`));
