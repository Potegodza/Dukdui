
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =====================================
// ADMIN SECURITY
// =====================================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET =
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const SESSION_DURATION = 8 * 60 * 60 * 1000;

function createToken() {
    const payload = Buffer.from(
        JSON.stringify({
            exp: Date.now() + SESSION_DURATION
        })
    ).toString('base64url');

    const signature = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(payload)
        .digest('base64url');

    return `${payload}.${signature}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string') return false;

    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [payload, signature] = parts;

    const expectedSignature = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(payload)
        .digest('base64url');

    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSignature);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return false;
    }

    try {
        const data = JSON.parse(
            Buffer.from(payload, 'base64url').toString()
        );

        return Number.isFinite(data.exp) && data.exp > Date.now();
    } catch {
        return false;
    }
}

function getCookie(req, name) {
    const cookies = req.headers.cookie || '';

    for (const item of cookies.split(';')) {
        const [key, ...value] = item.trim().split('=');

        if (key === name) {
            return decodeURIComponent(value.join('='));
        }
    }

    return null;
}

function requireAdmin(req, res, next) {
    const token = getCookie(req, 'admin_session');

    if (!verifyToken(token)) {
        return res.status(401).json({
            success: false,
            message: 'กรุณาเข้าสู่ระบบ Admin'
        });
    }

    next();
}

// Login
app.post('/api/admin/login', (req, res) => {
    if (!ADMIN_PASSWORD) {
        return res.status(503).json({
            success: false,
            message: 'ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ใน Server'
        });
    }

    const password = req.body?.password;

    if (typeof password !== 'string' || password.length > 200) {
        return res.status(400).json({
            success: false,
            message: 'กรุณากรอกรหัสผ่าน'
        });
    }

    const submittedHash = crypto
        .createHash('sha256')
        .update(password)
        .digest();

    const correctHash = crypto
        .createHash('sha256')
        .update(ADMIN_PASSWORD)
        .digest();

    if (!crypto.timingSafeEqual(submittedHash, correctHash)) {
        return res.status(401).json({
            success: false,
            message: 'รหัสผ่านไม่ถูกต้อง'
        });
    }

    const secure = process.env.NODE_ENV === 'production'
        ? '; Secure'
        : '';

    res.setHeader(
        'Set-Cookie',
        `admin_session=${createToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`
    );

    res.json({
        success: true,
        message: 'เข้าสู่ระบบสำเร็จ'
    });
});

// Logout
app.post('/api/admin/logout', (req, res) => {
    res.setHeader(
        'Set-Cookie',
        'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    );

    res.json({ success: true });
});

// =====================================
// DATABASE: SQLITE
// =====================================

const db = new DatabaseSync(
    path.join(__dirname, 'reports.db')
);

db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_socket_id TEXT NOT NULL,
        reported_socket_id TEXT NOT NULL,
        topic TEXT,
        reason TEXT NOT NULL,
        detail TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

// Safe migrations for existing databases
const reportColumns = db.prepare("PRAGMA table_info(reports)").all();
for (const [name, definition] of [
    ['updated_at', 'TEXT'],
    ['reporter_uid', 'TEXT'],
    ['reported_uid', 'TEXT']
]) {
    if (!reportColumns.some(column => column.name === name)) {
        db.exec(`ALTER TABLE reports ADD COLUMN ${name} ${definition}`);
    }
}

// Persistent moderation records. A UID is self-declared unless verified by SPU login.
db.exec(`
    CREATE TABLE IF NOT EXISTS user_sanctions (
        uid TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        reason TEXT DEFAULT '',
        expires_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_moderation_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT DEFAULT '',
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`);

// Admin action history
db.exec(`
    CREATE TABLE IF NOT EXISTS report_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES reports(id)
    )
`);

const insertReport = db.prepare(`
    INSERT INTO reports (
        reporter_socket_id,
        reported_socket_id,
        topic,
        reason,
        detail,
        reporter_uid,
        reported_uid
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

console.log('SQLite database พร้อมใช้งาน');

// =====================================
// ADMIN API
// =====================================

const allowedStatuses = [
    'pending',
    'reviewed',
    'dismissed'
];

// Dashboard statistics
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const total = db.prepare(
        'SELECT COUNT(*) AS count FROM reports'
    ).get().count;

    const pending = db.prepare(
        "SELECT COUNT(*) AS count FROM reports WHERE status = 'pending'"
    ).get().count;

    const reviewed = db.prepare(
        "SELECT COUNT(*) AS count FROM reports WHERE status = 'reviewed'"
    ).get().count;

    const dismissed = db.prepare(
        "SELECT COUNT(*) AS count FROM reports WHERE status = 'dismissed'"
    ).get().count;

    res.json({
        success: true,
        stats: { total, pending, reviewed, dismissed }
    });
});

// Get reports with optional filters
app.get('/api/admin/reports', requireAdmin, (req, res) => {
    const status = req.query.status || '';
    const reason = req.query.reason || '';
    const search = String(req.query.search || '').slice(0, 100);

    let sql = 'SELECT * FROM reports WHERE 1 = 1';
    const params = [];

    if (status && allowedStatuses.includes(status)) {
        sql += ' AND status = ?';
        params.push(status);
    }

    if (reason) {
        sql += ' AND reason = ?';
        params.push(reason);
    }

    if (search) {
        sql += ` AND (
            CAST(id AS TEXT) LIKE ?
            OR reporter_socket_id LIKE ?
            OR reported_socket_id LIKE ?
            OR detail LIKE ?
        )`;

        const keyword = `%${search}%`;
        params.push(keyword, keyword, keyword, keyword, keyword, keyword);
    }

    sql += ' ORDER BY id DESC LIMIT 200';

    const reports = db.prepare(sql).all(...params);

    res.json({
        success: true,
        reports
    });
});

// Get history for one report
app.get('/api/admin/reports/:id/actions', requireAdmin, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            success: false,
            message: 'รหัสรายงานไม่ถูกต้อง'
        });
    }

    const actions = db.prepare(`
        SELECT * FROM report_actions
        WHERE report_id = ?
        ORDER BY id DESC
    `).all(id);

    res.json({
        success: true,
        actions
    });
});

// Update report status
app.patch('/api/admin/reports/:id/status', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const { status, note = '' } = req.body || {};

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            success: false,
            message: 'รหัสรายงานไม่ถูกต้อง'
        });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: 'สถานะไม่ถูกต้อง'
        });
    }

    const report = db.prepare(
        'SELECT id, status FROM reports WHERE id = ?'
    ).get(id);

    if (!report) {
        return res.status(404).json({
            success: false,
            message: 'ไม่พบรายงานนี้'
        });
    }

    const safeNote = typeof note === 'string'
        ? note.trim().slice(0, 1000)
        : '';

    db.prepare(`
        UPDATE reports
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(status, id);

    db.prepare(`
        INSERT INTO report_actions (
            report_id,
            old_status,
            new_status,
            note
        )
        VALUES (?, ?, ?, ?)
    `).run(id, report.status, status, safeNote);

    res.json({
        success: true,
        message: 'อัปเดตสถานะรายงานแล้ว'
    });
});

// =====================================
// USER MODERATION API
// =====================================
function validUid(uid) {
    return typeof uid === 'string' && /^\d{8}$/.test(uid);
}
function getActiveSanction(uid) {
    const row = db.prepare('SELECT * FROM user_sanctions WHERE uid = ?').get(uid);
    if (!row) return null;
    if (row.action === 'ban' && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        db.prepare('DELETE FROM user_sanctions WHERE uid = ?').run(uid);
        return null;
    }
    return row;
}
app.get('/api/admin/sanctions', requireAdmin, (req, res) => {
    const sanctions = db.prepare('SELECT * FROM user_sanctions ORDER BY updated_at DESC').all();
    res.json({ success: true, sanctions });
});
app.get('/api/admin/users/:uid/actions', requireAdmin, (req, res) => {
    const uid = req.params.uid;
    if (!validUid(uid)) return res.status(400).json({ success: false, message: 'UID ต้องเป็นตัวเลข 8 หลัก' });
    const actions = db.prepare('SELECT * FROM user_moderation_actions WHERE uid = ? ORDER BY id DESC LIMIT 50').all(uid);
    res.json({ success: true, actions, sanction: getActiveSanction(uid) });
});
app.post('/api/admin/users/:uid/action', requireAdmin, (req, res) => {
    const uid = req.params.uid;
    const { action, duration, reason = '' } = req.body || {};
    if (!validUid(uid)) return res.status(400).json({ success: false, message: 'UID ต้องเป็นตัวเลข 8 หลัก' });
    if (!['warn', 'ban', 'unban'].includes(action)) return res.status(400).json({ success: false, message: 'คำสั่งไม่ถูกต้อง' });
    let expiresAt = null;
    const safeReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    if (action === 'ban') {
        const hours = { '1h': 1, '1d': 24, '7d': 168 };
        if (duration === 'permanent') expiresAt = null;
        else if (hours[duration]) expiresAt = new Date(Date.now() + hours[duration] * 3600000).toISOString();
        else return res.status(400).json({ success: false, message: 'ระยะเวลาแบนไม่ถูกต้อง' });
        db.prepare(`INSERT INTO user_sanctions (uid, action, reason, expires_at, updated_at)
            VALUES (?, 'ban', ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(uid) DO UPDATE SET action='ban', reason=excluded.reason,
            expires_at=excluded.expires_at, updated_at=CURRENT_TIMESTAMP`).run(uid, safeReason, expiresAt);
    } else if (action === 'unban') {
        db.prepare('DELETE FROM user_sanctions WHERE uid = ?').run(uid);
    }
    db.prepare('INSERT INTO user_moderation_actions (uid, action, reason, expires_at) VALUES (?, ?, ?, ?)')
        .run(uid, action, safeReason, expiresAt);
    for (const client of io.sockets.sockets.values()) {
        if (client.uid !== uid) continue;
        if (action === 'warn') client.emit('user-warning', { reason: safeReason });
        if (action === 'ban') {
            client.emit('user-banned', { reason: safeReason, expiresAt });
            removeFromQueue(client); unpair(client); client.disconnect(true);
        }
    }
    res.json({ success: true, message: action === 'warn' ? 'ส่งคำเตือนแล้ว' : action === 'ban' ? 'แบนผู้ใช้แล้ว' : 'ปลดแบนแล้ว' });
});

// =====================================
// MATCHING SYSTEM
// =====================================

const allowedTopics = [
    'study',
    'university',
    'career',
    'technology',
    'lifestyle'
];

const allowedReasons = [
    'harassment',
    'inappropriate',
    'sexual',
    'spam',
    'violence',
    'other'
];

const queues = new Map();

function getQueue(topic) {
    if (!queues.has(topic)) {
        queues.set(topic, []);
    }

    return queues.get(topic);
}

function removeFromQueue(socket) {
    for (const queue of queues.values()) {
        const index = queue.indexOf(socket);

        if (index !== -1) {
            queue.splice(index, 1);
        }
    }
}

function addToQueue(socket) {
    if (!socket.topic || !socket.connected || socket.partner) {
        return;
    }

    removeFromQueue(socket);

    const queue = getQueue(socket.topic);

    queue.push(socket);

    socket.emit('waiting');
}

function join(socket, topic) {
    if (!socket.uid) {
        socket.emit('match-error', 'กรุณาระบุรหัสผู้ใช้ 8 หลักก่อนเริ่มใช้งาน');
        return;
    }
    const sanction = getActiveSanction(socket.uid);
    if (sanction?.action === 'ban') {
        socket.emit('user-banned', { reason: sanction.reason, expiresAt: sanction.expires_at });
        return;
    }
    if (!allowedTopics.includes(topic)) {
        socket.emit('match-error', 'กรุณาเลือกหัวข้อที่ถูกต้อง');
        return;
    }

    if (socket.partner) {
        return;
    }

    removeFromQueue(socket);

    socket.topic = topic;

    const queue = getQueue(topic);

    const otherIndex = queue.findIndex(
        (user) =>
            user.connected &&
            !user.partner &&
            user !== socket
    );

    if (otherIndex === -1) {
        addToQueue(socket);
        return;
    }

    const other = queue.splice(otherIndex, 1)[0];

    socket.partner = other;
    other.partner = socket;

    socket.emit('matched', { initiator: true });
    other.emit('matched', { initiator: false });

    console.log('จับคู่สำเร็จ:', socket.id, other.id);
}

function unpair(socket) {
    const partner = socket.partner;

    if (!partner) {
        return;
    }

    socket.partner = null;
    partner.partner = null;

    partner.emit('partner-left');

    addToQueue(partner);
}

// =====================================
// SOCKET.IO
// =====================================

io.on('connection', (socket) => {
    console.log('มีผู้ใช้เชื่อมต่อ:', socket.id);

    socket.on('identify', (data, callback) => {
        const uid = data?.uid;
        if (!validUid(uid)) {
            if (typeof callback === 'function') callback({ success: false, message: 'กรุณากรอกรหัส 8 หลัก' });
            return;
        }
        const sanction = getActiveSanction(uid);
        if (sanction?.action === 'ban') {
            if (typeof callback === 'function') callback({ success: false, banned: true, message: 'บัญชีนี้ถูกระงับการใช้งาน', reason: sanction.reason, expiresAt: sanction.expires_at });
            socket.disconnect(true);
            return;
        }
        socket.uid = uid;
        if (typeof callback === 'function') callback({ success: true });
    });

    socket.on('join', (data) => {
        join(socket, data?.topic);
    });

    socket.on('next', () => {
        const topic = socket.topic;

        unpair(socket);

        if (topic) {
            join(socket, topic);
        }
    });

    socket.on('leave', () => {
        removeFromQueue(socket);

        unpair(socket);

        socket.topic = null;
    });

    socket.on('signal', (data) => {
        if (socket.partner) {
            socket.partner.emit('signal', data);
        }
    });

    // =================================
    // REPORT SYSTEM
    // =================================

    socket.on('submit-report', (data, callback) => {
        console.log('ได้รับคำสั่ง Report:', data);

        const reply = (result) => {
            if (typeof callback === 'function') {
                callback(result);
            }
        };

        if (!socket.uid || !socket.partner?.uid) {
            reply({ success: false, message: 'ไม่พบข้อมูล UID ของผู้ใช้' });
            return;
        }

        if (!socket.partner || !socket.partner.connected) {
            reply({
                success: false,
                message: 'ไม่พบผู้ใช้ที่ต้องการรายงาน'
            });
            return;
        }

        const reason = data?.reason;

        const detail = typeof data?.detail === 'string'
            ? data.detail.trim().slice(0, 1000)
            : '';

        if (!allowedReasons.includes(reason)) {
            reply({
                success: false,
                message: 'กรุณาเลือกเหตุผลในการรายงาน'
            });
            return;
        }

        try {
            insertReport.run(
                socket.id,
                socket.partner.id,
                socket.topic || '',
                reason,
                detail,
                socket.uid,
                socket.partner.uid
            );

            console.log('บันทึกรายงานแล้ว:', socket.id);

            reply({
                success: true,
                message: 'ส่งรายงานเรียบร้อยแล้ว ขอบคุณที่แจ้งให้เราทราบ'
            });

        } catch (error) {
            console.error('บันทึกรายงานไม่สำเร็จ:', error);

            reply({
                success: false,
                message: 'เกิดข้อผิดพลาดในการบันทึกรายงาน'
            });
        }
    });

    socket.on('disconnect', () => {
        removeFromQueue(socket);

        unpair(socket);

        console.log('ผู้ใช้ออกจากระบบ:', socket.id);
    });
});

// =====================================
// START SERVER
// =====================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Admin API พร้อมใช้งาน');
});
