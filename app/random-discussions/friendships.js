const crypto = require('crypto');

function getFriendshipId(firstUid, secondUid) {
    return crypto
        .createHash('sha256')
        .update([firstUid, secondUid].sort().join('\0'))
        .digest('hex');
}

function registerLike(socket, partner, sessionId) {
    socket.likedMatchSessionId = sessionId;
    return partner.likedMatchSessionId === sessionId;
}

module.exports = { getFriendshipId, registerLike };
