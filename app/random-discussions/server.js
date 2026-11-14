
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { applicationDefault, cert, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
const server = http.createServer(app);
const allowedOrigins = [...new Set([
    ...(process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    process.env.RENDER_EXTERNAL_URL
].filter(Boolean))];
const isProduction = process.env.NODE_ENV === 'production';
const isRenderDeployment = process.env.DEPLOY_TARGET === 'render';
const io = new Server(server, {
    cors: {
        origin: allowedOrigins.length ? allowedOrigins : true,
        credentials: true
    }
});

const projectId = process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || 'dukdui-b71b0';

function getFirebaseCredential() {
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!rawServiceAccount) {
        if (isProduction && isRenderDeployment) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required on Render');
        }
        return applicationDefault();
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(rawServiceAccount);
    } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON');
    }

    if (!serviceAccount
        || typeof serviceAccount !== 'object'
        || serviceAccount.project_id !== projectId
        || typeof serviceAccount.client_email !== 'string'
        || !serviceAccount.client_email
        || typeof serviceAccount.private_key !== 'string'
        || !serviceAccount.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be a service account for the configured project');
    }

    return cert(serviceAccount);
}

const firebaseApp = initializeApp({
    credential: getFirebaseCredential(),
    projectId
});
const firebaseAuth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const reportsCollection = firestore.collection('reports');
const sanctionsCollection = firestore.collection('user_sanctions');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const appRoot = path.join(__dirname, '..');
for (const directory of ['account', 'home', 'login', 'private-chat', 'shared']) {
    const directoryPath = path.join(appRoot, directory);
    app.use(`/app/${directory}`, express.static(directoryPath));
    app.use(`/${directory}`, express.static(directoryPath));
}
app.get(['/','/app'], (req, res) => {
    res.redirect('/app/login/login.html');
});

// =====================================
// ADMIN SECURITY
// =====================================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET
    || (isProduction ? '' : crypto.randomBytes(32).toString('hex'));

if (isProduction && (!ADMIN_PASSWORD || !SESSION_SECRET || !allowedOrigins.length)) {
    throw new Error('Production requires ADMIN_PASSWORD, SESSION_SECRET, and ALLOWED_ORIGINS or RENDER_EXTERNAL_URL');
}

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

app.get('/api/client-config', (_req, res) => {
    const socketOrigin = process.env.PUBLIC_SOCKET_ORIGIN
        || process.env.RENDER_EXTERNAL_URL
        || '';
    if (isProduction && !socketOrigin) {
        return res.status(503).json({
            success: false,
            message: 'ยังไม่ได้ตั้งค่า PUBLIC_SOCKET_ORIGIN ใน Server'
        });
    }

    res.json({ success: true, socketOrigin });
});

// =====================================
// ADMIN API
// =====================================

const allowedStatuses = [
    'pending',
    'reviewed',
    'dismissed'
];

// Dashboard statistics
app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
    try {
        const statuses = ['pending', 'reviewed', 'dismissed'];
        const [totalSnapshot, ...statusSnapshots] = await Promise.all([
            reportsCollection.count().get(),
            ...statuses.map((status) =>
                reportsCollection.where('status', '==', status).count().get()
            )
        ]);
        const statusCounts = statusSnapshots.map((snapshot) => snapshot.data().count);

        res.json({
            success: true,
            stats: {
                total: totalSnapshot.data().count,
                pending: statusCounts[0],
                reviewed: statusCounts[1],
                dismissed: statusCounts[2]
            }
        });
    } catch (error) {
        console.error('โหลดสถิติรายงานไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'โหลดสถิติรายงานไม่สำเร็จ' });
    }
});

// Get reports with optional filters
app.get('/api/admin/reports', requireAdmin, async (req, res) => {
    const status = String(req.query.status || '');
    const reason = String(req.query.reason || '');
    const search = String(req.query.search || '').slice(0, 100);

    try {
        const snapshot = await reportsCollection
            .orderBy('created_at', 'desc')
            .limit(200)
            .get();
        let reports = snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data()
        }));

        if (allowedStatuses.includes(status)) {
            reports = reports.filter((report) => report.status === status);
        }
        if (reason) {
            reports = reports.filter((report) => report.reason === reason);
        }
        if (search) {
            const keyword = search.toLocaleLowerCase();
            reports = reports.filter((report) =>
                JSON.stringify(report).toLocaleLowerCase().includes(keyword)
            );
        }

        res.json({ success: true, reports });
    } catch (error) {
        console.error('โหลดรายการรายงานไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'โหลดรายการรายงานไม่สำเร็จ' });
    }
});

function validDocumentId(id) {
    return typeof id === 'string'
        && id.length > 0
        && id.length <= 128
        && !id.includes('/');
}

// Get history for one report
app.get('/api/admin/reports/:id/actions', requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (!validDocumentId(id)) {
        return res.status(400).json({
            success: false,
            message: 'รหัสรายงานไม่ถูกต้อง'
        });
    }

    try {
        const snapshot = await reportsCollection
            .doc(id)
            .collection('actions')
            .orderBy('created_at', 'desc')
            .limit(100)
            .get();
        const actions = snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data()
        }));
        res.json({ success: true, actions });
    } catch (error) {
        console.error('โหลดประวัติรายงานไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'โหลดประวัติรายงานไม่สำเร็จ' });
    }
});

// Update report status
app.patch('/api/admin/reports/:id/status', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const { status, note = '' } = req.body || {};

    if (!validDocumentId(id)) {
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

    const safeNote = typeof note === 'string'
        ? note.trim().slice(0, 1000)
        : '';

    try {
        const reportRef = reportsCollection.doc(id);
        let reportExists = true;
        await firestore.runTransaction(async (transaction) => {
            const reportSnapshot = await transaction.get(reportRef);
            if (!reportSnapshot.exists) {
                reportExists = false;
                return;
            }

            const now = new Date().toISOString();
            const actionRef = reportRef.collection('actions').doc();
            transaction.update(reportRef, {
                status,
                updated_at: now
            });
            transaction.create(actionRef, {
                old_status: reportSnapshot.get('status') || 'pending',
                new_status: status,
                note: safeNote,
                created_at: now
            });
        });

        if (!reportExists) {
            return res.status(404).json({
                success: false,
                message: 'ไม่พบรายงานนี้'
            });
        }
        res.json({ success: true, message: 'อัปเดตสถานะรายงานแล้ว' });
    } catch (error) {
        console.error('อัปเดตสถานะรายงานไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'อัปเดตสถานะรายงานไม่สำเร็จ' });
    }
});

// =====================================
// USER MODERATION API
// =====================================
function validUid(uid) {
    return typeof uid === 'string'
        && uid.length > 0
        && uid.length <= 128
        && uid.trim() === uid
        && !/[\u0000-\u001f\u007f/]/.test(uid);
}

async function requireFirebaseUser(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) {
        return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบใหม่' });
    }

    try {
        req.firebaseUser = await firebaseAuth.verifyIdToken(match[1]);
        if (!validUid(req.firebaseUser.uid)) {
            return res.status(401).json({ success: false, message: 'บัญชีผู้ใช้ไม่ถูกต้อง' });
        }
        next();
    } catch (error) {
        console.error('ตรวจสอบ Firebase ID token สำหรับรายชื่อเพื่อนไม่สำเร็จ:', error);
        res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบใหม่' });
    }
}

app.get('/api/me/friend-filters', requireFirebaseUser, async (req, res) => {
    const userRef = firestore.collection('users').doc(req.firebaseUser.uid);
    try {
        const [hiddenMatches, blockedUsers] = await Promise.all([
            userRef.collection('hidden_matches').get(),
            userRef.collection('blocked_users').get()
        ]);
        res.json({
            success: true,
            hiddenMatchIds: hiddenMatches.docs.map((document) => document.id),
            blockedUserIds: blockedUsers.docs.map((document) => document.id)
        });
    } catch (error) {
        console.error('โหลดการตั้งค่าเพื่อนไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'โหลดรายชื่อเพื่อนไม่สำเร็จ' });
    }
});

async function getMatchForUser(matchId, userId) {
    if (!validUid(matchId)) return null;

    const matchRef = firestore.collection('matches').doc(matchId);
    const snapshot = await matchRef.get();
    if (!snapshot.exists) return null;

    const match = snapshot.data();
    if (
        !Array.isArray(match.participants)
        || match.participants.length !== 2
        || !match.participants.includes(userId)
    ) {
        return null;
    }

    const friendUid = match.participants.find((uid) => uid !== userId);
    if (!validUid(friendUid)) return null;
    return { matchRef, friendUid };
}

app.post('/api/me/friends/:matchId/remove', requireFirebaseUser, async (req, res) => {
    try {
        const match = await getMatchForUser(req.params.matchId, req.firebaseUser.uid);
        if (!match) {
            return res.status(404).json({ success: false, message: 'ไม่พบเพื่อนในรายชื่อของคุณ' });
        }

        await firestore.collection('users').doc(req.firebaseUser.uid)
            .collection('hidden_matches').doc(req.params.matchId)
            .set({ createdAt: new Date().toISOString() });
        res.json({ success: true });
    } catch (error) {
        console.error('ลบเพื่อนออกจากรายชื่อไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'ลบเพื่อนไม่สำเร็จ กรุณาลองใหม่' });
    }
});

app.post('/api/me/friends/:matchId/block', requireFirebaseUser, async (req, res) => {
    try {
        const match = await getMatchForUser(req.params.matchId, req.firebaseUser.uid);
        if (!match) {
            return res.status(404).json({ success: false, message: 'ไม่พบเพื่อนในรายชื่อของคุณ' });
        }

        const userRef = firestore.collection('users').doc(req.firebaseUser.uid);
        const batch = firestore.batch();
        const createdAt = new Date().toISOString();
        batch.set(userRef.collection('blocked_users').doc(match.friendUid), { createdAt });
        batch.set(userRef.collection('hidden_matches').doc(req.params.matchId), { createdAt });
        await batch.commit();
        res.json({ success: true });
    } catch (error) {
        console.error('บล็อกเพื่อนไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'บล็อกเพื่อนไม่สำเร็จ กรุณาลองใหม่' });
    }
});

async function getActiveSanction(uid) {
    const sanctionRef = sanctionsCollection.doc(uid);
    const snapshot = await sanctionRef.get();
    if (!snapshot.exists) return null;

    const sanction = snapshot.data();
    if (sanction.action === 'ban'
        && sanction.expires_at
        && Date.parse(sanction.expires_at) <= Date.now()) {
        await sanctionRef.delete();
        return null;
    }
    return sanction;
}

app.get('/api/admin/sanctions', requireAdmin, async (_req, res) => {
    try {
        const snapshot = await sanctionsCollection.orderBy('updated_at', 'desc').limit(200).get();
        const sanctions = snapshot.docs.map((document) => ({
            uid: document.id,
            ...document.data()
        }));
        res.json({ success: true, sanctions });
    } catch (error) {
        console.error('โหลดรายการบทลงโทษไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'โหลดรายการบทลงโทษไม่สำเร็จ' });
    }
});

app.get('/api/admin/users/:uid/actions', requireAdmin, async (req, res) => {
    const uid = req.params.uid;
    if (!validUid(uid)) {
        return res.status(400).json({ success: false, message: 'UID ไม่ถูกต้อง' });
    }

    try {
        const [actionsSnapshot, sanction] = await Promise.all([
            firestore.collection('users').doc(uid).collection('moderation_actions')
                .orderBy('created_at', 'desc').limit(50).get(),
            getActiveSanction(uid)
        ]);
        const actions = actionsSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data()
        }));
        res.json({ success: true, actions, sanction });
    } catch (error) {
        console.error('โหลดประวัติการดูแลผู้ใช้ไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'โหลดประวัติการดูแลผู้ใช้ไม่สำเร็จ' });
    }
});

app.post('/api/admin/users/:uid/action', requireAdmin, async (req, res) => {
    const uid = req.params.uid;
    const { action, duration, reason = '' } = req.body || {};
    if (!validUid(uid)) {
        return res.status(400).json({ success: false, message: 'UID ไม่ถูกต้อง' });
    }
    if (!['warn', 'ban', 'unban'].includes(action)) {
        return res.status(400).json({ success: false, message: 'คำสั่งไม่ถูกต้อง' });
    }

    let expiresAt = null;
    const safeReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    if (action === 'ban') {
        const hours = { '1h': 1, '1d': 24, '7d': 168 };
        if (duration === 'permanent') expiresAt = null;
        else if (hours[duration]) expiresAt = new Date(Date.now() + hours[duration] * 3600000).toISOString();
        else return res.status(400).json({ success: false, message: 'ระยะเวลาแบนไม่ถูกต้อง' });
    }

    try {
        const now = new Date().toISOString();
        const batch = firestore.batch();
        const actionRef = firestore.collection('users').doc(uid)
            .collection('moderation_actions').doc();
        const sanctionRef = sanctionsCollection.doc(uid);

        if (action === 'ban') {
            batch.set(sanctionRef, {
                action: 'ban',
                reason: safeReason,
                expires_at: expiresAt,
                updated_at: now
            });
        } else if (action === 'unban') {
            batch.delete(sanctionRef);
        }

        batch.create(actionRef, {
            action,
            reason: safeReason,
            expires_at: expiresAt,
            created_at: now
        });
        await batch.commit();

        for (const client of io.sockets.sockets.values()) {
            if (client.uid !== uid) continue;
            if (action === 'warn') client.emit('user-warning', { reason: safeReason });
            if (action === 'ban') {
                client.emit('user-banned', { reason: safeReason, expiresAt });
                removeFromQueue(client);
                unpair(client);
                client.disconnect(true);
            }
        }

        res.json({
            success: true,
            message: action === 'warn'
                ? 'ส่งคำเตือนแล้ว'
                : action === 'ban'
                    ? 'แบนผู้ใช้แล้ว'
                    : 'ปลดแบนแล้ว'
        });
    } catch (error) {
        console.error('ดำเนินการดูแลผู้ใช้ไม่สำเร็จ:', error);
        res.status(500).json({ success: false, message: 'ดำเนินการดูแลผู้ใช้ไม่สำเร็จ' });
    }
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

async function usersHaveBlockedEachOther(firstUid, secondUid) {
    const firstBlock = firestore.collection('users').doc(firstUid)
        .collection('blocked_users').doc(secondUid);
    const secondBlock = firestore.collection('users').doc(secondUid)
        .collection('blocked_users').doc(firstUid);
    const [firstSnapshot, secondSnapshot] = await Promise.all([
        firstBlock.get(),
        secondBlock.get()
    ]);
    return firstSnapshot.exists || secondSnapshot.exists;
}

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

async function join(socket, topic) {
    const sanction = await getActiveSanction(socket.uid);
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
    let remainingCandidates = queue.length;
    let other = null;
    while (remainingCandidates > 0) {
        const candidate = queue.shift();
        remainingCandidates -= 1;
        if (!candidate?.connected || candidate.partner || candidate === socket) continue;

        if (await usersHaveBlockedEachOther(socket.uid, candidate.uid)) {
            addToQueue(candidate);
            continue;
        }

        if (candidate.connected && !candidate.partner && socket.connected) {
            other = candidate;
            break;
        }
    }

    if (!other) {
        addToQueue(socket);
        return;
    }

    socket.partner = other;
    other.partner = socket;
    const sessionId = crypto.randomUUID();
    socket.matchSessionId = sessionId;
    other.matchSessionId = sessionId;

    socket.emit('matched', { initiator: true, sessionId });
    other.emit('matched', { initiator: false, sessionId });

    console.log('จับคู่สำเร็จ:', socket.id, other.id);
}

function unpair(socket) {
    const partner = socket.partner;

    if (!partner) {
        socket.matchSessionId = null;
        return;
    }

    socket.partner = null;
    partner.partner = null;
    socket.matchSessionId = null;
    partner.matchSessionId = null;

    partner.emit('partner-left');
    addToQueue(partner);
}

// =====================================
// SOCKET.IO
// =====================================

io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
        return next(new Error('Firebase sign-in is required'));
    }

    try {
        const decodedToken = await firebaseAuth.verifyIdToken(token);
        if (!validUid(decodedToken.uid)) {
            return next(new Error('Firebase account UID is invalid'));
        }

        const sanction = await getActiveSanction(decodedToken.uid);
        if (sanction?.action === 'ban') {
            const error = new Error('Account is suspended');
            error.data = {
                code: 'ACCOUNT_BANNED',
                reason: sanction.reason,
                expiresAt: sanction.expires_at
            };
            return next(error);
        }

        socket.uid = decodedToken.uid;
        socket.displayName = (
            typeof decodedToken.name === 'string' && decodedToken.name.trim()
                ? decodedToken.name.trim()
                : typeof decodedToken.email === 'string'
                    ? decodedToken.email.split('@')[0]
                    : ''
        ) || 'เพื่อน Dukdui';
        next();
    } catch (error) {
        console.error('ตรวจสอบ Firebase ID token ไม่สำเร็จ:', error);
        next(new Error('Firebase authentication failed'));
    }
});

io.on('connection', (socket) => {
    console.log('มีผู้ใช้เชื่อมต่อ:', socket.id);

    socket.on('join', (data) => {
        join(socket, data?.topic).catch((error) => {
            console.error('เข้าคิวสุ่มจับคู่ไม่สำเร็จ:', error);
            socket.emit('match-error', 'ไม่สามารถเริ่มจับคู่ได้ กรุณาลองอีกครั้ง');
        });
    });

    socket.on('next', () => {
        const topic = socket.topic;

        unpair(socket);

        if (topic) {
            join(socket, topic).catch((error) => {
                console.error('ค้นหาคู่ถัดไปไม่สำเร็จ:', error);
                socket.emit('match-error', 'ไม่สามารถค้นหาคู่ได้ กรุณาลองอีกครั้ง');
            });
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

    socket.on('like', async (data) => {
        const partner = socket.partner;
        const sessionId = data?.sessionId;
        if (
            !partner?.connected
            || !partner.uid
            || typeof sessionId !== 'string'
            || sessionId !== socket.matchSessionId
            || sessionId !== partner.matchSessionId
        ) {
            socket.emit('like-error', { message: 'ไม่พบคู่สนทนาปัจจุบัน กรุณาลองใหม่' });
            return;
        }

        try {
            if (await usersHaveBlockedEachOther(socket.uid, partner.uid)) {
                socket.emit('like-error', { message: 'ไม่สามารถเพิ่มผู้ใช้รายนี้เป็นเพื่อนได้' });
                return;
            }

            await firestore.collection('matches').doc(sessionId).set({
                participants: [socket.uid, partner.uid],
                participantNames: {
                    [socket.uid]: socket.displayName,
                    [partner.uid]: partner.displayName
                },
                createdAt: new Date().toISOString()
            });
            socket.emit('like-saved', { sessionId, friendName: partner.displayName });
            partner.emit('friend-added', { sessionId, friendName: socket.displayName });
        } catch (error) {
            console.error('บันทึกเพื่อนจากการสุ่มคุยไม่สำเร็จ:', error);
            socket.emit('like-error', { message: 'เพิ่มเพื่อนไม่สำเร็จ กรุณาลองอีกครั้ง' });
        }
    });

    // =================================
    // REPORT SYSTEM
    // =================================

    socket.on('submit-report', async (data, callback) => {
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
            const reportRef = reportsCollection.doc();
            await reportRef.create({
                reporter_socket_id: socket.id,
                reported_socket_id: socket.partner.id,
                topic: socket.topic || '',
                reason,
                detail,
                status: 'pending',
                created_at: new Date().toISOString(),
                reporter_uid: socket.uid,
                reported_uid: socket.partner.uid
            });

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

const PORT = Number(process.env.PORT || 8765);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
}

server.listen(PORT, () => {
    console.log(`Dukdui server running at http://localhost:${PORT}`);
    console.log(`Login page: http://localhost:${PORT}/app/login/login.html`);
    console.log('Admin API พร้อมใช้งาน');
});
