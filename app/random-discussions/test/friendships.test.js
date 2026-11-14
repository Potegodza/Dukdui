const assert = require('node:assert/strict');
const test = require('node:test');
const { getFriendshipId, registerLike } = require('../friendships');

test('a friendship requires both users to like the same session', () => {
    const first = {};
    const second = {};

    assert.equal(registerLike(first, second, 'session-1'), false);
    assert.equal(registerLike(second, first, 'session-1'), true);
});

test('a like from another session does not count as mutual', () => {
    const first = {};
    const second = {};

    registerLike(first, second, 'session-1');
    assert.equal(registerLike(second, first, 'session-2'), false);
});

test('friendship IDs are stable regardless of participant order', () => {
    assert.equal(getFriendshipId('user-a', 'user-b'), getFriendshipId('user-b', 'user-a'));
    assert.notEqual(getFriendshipId('user-a', 'user-b'), getFriendshipId('user-a', 'user-c'));
});
