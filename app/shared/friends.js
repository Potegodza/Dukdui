export async function loadFriendFilters(user) {
  const token = await user.getIdToken();
  const response = await fetch("/api/me/friend-filters", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "โหลดการตั้งค่าเพื่อนไม่สำเร็จ");
  }

  return {
    hiddenMatchIds: new Set(Array.isArray(data.hiddenMatchIds) ? data.hiddenMatchIds : []),
    blockedUserIds: new Set(Array.isArray(data.blockedUserIds) ? data.blockedUserIds : [])
  };
}

export async function updateFriend(user, matchId, action) {
  if (!["remove", "block"].includes(action)) {
    throw new Error("คำสั่งจัดการเพื่อนไม่ถูกต้อง");
  }

  const token = await user.getIdToken();
  const response = await fetch(
    `/api/me/friends/${encodeURIComponent(matchId)}/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "จัดการเพื่อนไม่สำเร็จ");
  }

  return data;
}
