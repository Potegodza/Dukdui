import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "../login/firebase.js";
import { loadFriendFilters } from "../shared/friends.js";

const loginPage = "../login/login.html";
const dashboard = document.querySelector("[data-authenticated-content]");
const loadingMessage = document.querySelector("[data-auth-loading]");
const userName = document.querySelector("[data-user-name]");
const signOutButton = document.querySelector("[data-sign-out]");
const friendList = document.getElementById("friendList");
const friendCount = document.getElementById("friendCount");
let friendsUnsubscribe = null;

function renderFriends(snapshot, filters, user) {
  const friends = snapshot.docs.flatMap((matchDocument) => {
    const match = matchDocument.data();
    if (
      !Array.isArray(match.participants)
      || match.participants.length !== 2
      || !match.participants.includes(user.uid)
      || filters.hiddenMatchIds.has(matchDocument.id)
    ) {
      return [];
    }

    const friendUid = match.participants.find((uid) => uid !== user.uid);
    if (!friendUid || filters.blockedUserIds.has(friendUid)) return [];

    const names = match.participantNames;
    const displayName = names && typeof names[friendUid] === "string"
      ? names[friendUid].trim()
      : "";
    return [{
      id: matchDocument.id,
      name: displayName || "เพื่อน Dukdui",
      createdAt: match.createdAt || ""
    }];
  });
  friends.sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));

  friendCount.textContent = `(${friends.length})`;
  friendList.replaceChildren();
  if (friends.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "friend-empty";
    emptyMessage.append("ยังไม่มีเพื่อนในแชท ลอง ");
    const randomLink = document.createElement("a");
    randomLink.href = "/random-discussions.html";
    randomLink.dataset.appLink = "random";
    randomLink.textContent = "สุ่มคุยหาเพื่อนใหม่";
    emptyMessage.append(randomLink);
    friendList.append(emptyMessage);
    return;
  }

  for (const friend of friends) {
    const item = document.createElement("a");
    item.className = "online-user";
    item.href = `/private-chat/chat.html?match=${encodeURIComponent(friend.id)}`;
    item.dataset.appLink = "chat";

    const avatar = document.createElement("span");
    avatar.className = "online-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = friend.name.charAt(0).toLocaleUpperCase();

    const details = document.createElement("span");
    const name = document.createElement("span");
    name.className = "online-user-name";
    name.textContent = friend.name;
    const status = document.createElement("small");
    status.textContent = "เพื่อนในแชท";
    details.append(name, status);
    item.append(avatar, details);
    friendList.append(item);
  }
}

async function watchFriends(user) {
  friendList.replaceChildren();
  const loadingMessage = document.createElement("p");
  loadingMessage.className = "friend-empty";
  loadingMessage.textContent = "กำลังโหลดรายชื่อเพื่อน...";
  friendList.append(loadingMessage);

  try {
    const filters = await loadFriendFilters(user);
    if (auth.currentUser?.uid !== user.uid) return;

    friendsUnsubscribe?.();
    const matchesQuery = query(
      collection(db, "matches"),
      where("participants", "array-contains", user.uid)
    );
    friendsUnsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => renderFriends(snapshot, filters, user),
      (error) => {
        console.error("โหลดรายชื่อเพื่อนไม่สำเร็จ", error);
        friendCount.textContent = "(—)";
        friendList.replaceChildren();
        const errorMessage = document.createElement("p");
        errorMessage.className = "friend-empty";
        errorMessage.textContent = "โหลดรายชื่อเพื่อนไม่สำเร็จ กรุณาลองใหม่";
        friendList.append(errorMessage);
      }
    );
  } catch (error) {
    console.error("โหลดการตั้งค่าเพื่อนไม่สำเร็จ", error);
    friendCount.textContent = "(—)";
    friendList.replaceChildren();
    const errorMessage = document.createElement("p");
    errorMessage.className = "friend-empty";
    errorMessage.textContent = "โหลดรายชื่อเพื่อนไม่สำเร็จ กรุณาลองใหม่";
    friendList.append(errorMessage);
  }
}

onAuthStateChanged(
  auth,
  (user) => {
    if (!user) {
      window.location.replace(loginPage);
      return;
    }

    if (userName) {
      userName.textContent = user.displayName || user.email || "ผู้ใช้";
    }
    if (loadingMessage) loadingMessage.hidden = true;
    if (dashboard) dashboard.hidden = false;
    void watchFriends(user);
  },
  (error) => {
    console.error("ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ", error);
    if (loadingMessage) {
      loadingMessage.textContent = "ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ กรุณาโหลดหน้าใหม่";
    }
  }
);

signOutButton?.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    await signOut(auth);
    window.location.replace(loginPage);
  } catch (error) {
    console.error("ออกจากระบบไม่สำเร็จ", error);
    signOutButton.disabled = false;
    if (loadingMessage) {
      loadingMessage.hidden = false;
      loadingMessage.textContent = "ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง";
    }
  }
});
