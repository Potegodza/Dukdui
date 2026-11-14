import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "../login/firebase.js";
import { loadFriendFilters, updateFriend } from "../shared/friends.js";

const loginPage = "../login/login.html";
const appContainer = document.getElementById("appContainer");
const authStatus = document.getElementById("authStatus");
const connectionStatus = document.getElementById("connectionStatus");
const contactListEl = document.getElementById("contactList");
const searchInput = document.getElementById("searchInput");
const activeChatName = document.getElementById("activeChatName");
const activeChatStatus = document.getElementById("activeChatStatus");
const activeAvatar = document.getElementById("activeAvatar");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const removeFriendBtn = document.getElementById("removeFriendBtn");
const blockFriendBtn = document.getElementById("blockFriendBtn");
const friendActionDialog = document.getElementById("friendActionDialog");
const friendActionTitle = document.getElementById("friendActionTitle");
const friendActionMessage = document.getElementById("friendActionMessage");
const cancelFriendActionBtn = document.getElementById("cancelFriendAction");
const confirmFriendActionBtn = document.getElementById("confirmFriendAction");

let currentUser = null;
let contactsData = [];
let currentActiveContactId = null;
let messagesUnsubscribe = null;
let latestMatchesSnapshot = null;
let friendFilters = { hiddenMatchIds: new Set(), blockedUserIds: new Set() };
let pendingFriendAction = null;
let selectingInitialContact = true;
let sendingMessage = false;
const latestMessageUnsubscribers = new Map();
const requestedMatchId = new URLSearchParams(window.location.search).get("match");

function setConnectionStatus(text, isError = false) {
  connectionStatus.textContent = text;
  connectionStatus.dataset.state = isError ? "error" : "success";
}

function getFirestoreErrorMessage(error) {
  const messages = {
    "permission-denied": "ไม่มีสิทธิ์เข้าถึงห้องนี้ ระบบอนุญาตเฉพาะคู่ที่แมตช์แล้ว",
    "failed-precondition": "Firestore ต้องตั้งค่าดัชนีที่จำเป็นก่อนใช้งาน",
    "unavailable": "เชื่อมต่อ Firestore ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต",
    "network-request-failed": "เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต",
    "not-found": "ยังไม่ได้สร้าง Cloud Firestore database ในโปรเจกต์ Firebase"
  };
  return messages[error.code] || "เกิดข้อผิดพลาดในการเชื่อมต่อแชท กรุณาลองใหม่";
}

function formatTime(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== "function") return "";
  const date = timestamp.toDate();
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short" }).format(date);
}

function getVisibleContacts() {
  const keyword = searchInput.value.trim().toLocaleLowerCase();
  if (!keyword) return contactsData;
  return contactsData.filter((contact) =>
    contact.name.toLocaleLowerCase().includes(keyword)
    || contact.lastMsg.toLocaleLowerCase().includes(keyword)
  );
}

function renderContacts(contacts = getVisibleContacts()) {
  contactListEl.replaceChildren();
  if (contacts.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "contact-empty";
    emptyMessage.textContent = contactsData.length === 0
      ? "ยังไม่มีเพื่อนที่แมตช์ เมื่อมีคนกดถูกใจกัน รายชื่อจะแสดงที่นี่"
      : "ไม่พบรายชื่อเพื่อน";
    contactListEl.append(emptyMessage);
    return;
  }

  for (const contact of contacts) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `contact-item ${currentActiveContactId === contact.id ? "active" : ""}`;

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");

    const details = document.createElement("span");
    details.className = "contact-details";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = contact.name;
    const lastMessage = document.createElement("span");
    lastMessage.className = "last-msg";
    lastMessage.textContent = contact.lastMsg;
    details.append(name, lastMessage);

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = contact.time;
    item.append(avatar, details, time);
    item.addEventListener("click", () => selectContact(contact));
    contactListEl.append(item);
  }
}

function showMessageState(text) {
  chatMessages.replaceChildren();
  const state = document.createElement("p");
  state.className = "message-state";
  state.textContent = text;
  chatMessages.append(state);
}

function renderMessages(documents) {
  chatMessages.replaceChildren();
  if (documents.length === 0) {
    showMessageState("เริ่มส่งข้อความเพื่อทักทายเพื่อนของคุณ");
    return;
  }

  for (const messageDocument of documents) {
    const message = messageDocument.data();
    const messageEl = document.createElement("div");
    messageEl.className = `message ${message.authorId === currentUser.uid ? "outgoing" : "incoming"}`;
    messageEl.append(document.createTextNode(message.text));

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = formatTime(message.sentAt) || "กำลังส่ง...";
    messageEl.append(time);
    chatMessages.append(messageEl);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function stopMessageListener() {
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
}

function selectContact(contact) {
  currentActiveContactId = contact.id;
  renderContacts();
  activeChatName.textContent = contact.name;
  activeAvatar.textContent = contact.name.charAt(0).toLocaleUpperCase();
  activeChatStatus.textContent = "จับคู่แล้ว";
  messageInput.disabled = false;
  sendBtn.disabled = false;
  removeFriendBtn.disabled = false;
  blockFriendBtn.disabled = false;
  showMessageState("กำลังโหลดข้อความ...");

  stopMessageListener();
  const messagesQuery = query(
    collection(db, "matches", contact.id, "messages"),
    orderBy("sentAt", "asc"),
    limitToLast(100)
  );
  messagesUnsubscribe = onSnapshot(
    messagesQuery,
    (snapshot) => renderMessages(snapshot.docs),
    (error) => {
      console.error("โหลดข้อความแชทไม่สำเร็จ", error);
      showMessageState(getFirestoreErrorMessage(error));
      setConnectionStatus(getFirestoreErrorMessage(error), true);
    }
  );
}

function subscribeToLatestMessage(contact) {
  if (latestMessageUnsubscribers.has(contact.id)) return;

  const latestMessageQuery = query(
    collection(db, "matches", contact.id, "messages"),
    orderBy("sentAt", "desc"),
    limit(1)
  );
  const unsubscribe = onSnapshot(
    latestMessageQuery,
    (snapshot) => {
      const currentContact = contactsData.find((item) => item.id === contact.id);
      if (!currentContact) return;

      const latestMessage = snapshot.docs[0]?.data();
      currentContact.lastMsg = latestMessage?.text || "เริ่มส่งข้อความ";
      currentContact.time = formatTime(latestMessage?.sentAt);
      renderContacts();
    },
    (error) => {
      console.error("โหลดข้อความล่าสุดไม่สำเร็จ", error);
      setConnectionStatus(getFirestoreErrorMessage(error), true);
    }
  );
  latestMessageUnsubscribers.set(contact.id, unsubscribe);
}

function handleMatchesSnapshot(snapshot) {
  latestMatchesSnapshot = snapshot;
  const previousContacts = new Map(contactsData.map((contact) => [contact.id, contact]));
  contactsData = snapshot.docs.flatMap((matchDocument) => {
    const match = matchDocument.data();
    if (
      !Array.isArray(match.participants)
      || match.participants.length !== 2
      || !match.participants.includes(currentUser.uid)
      || friendFilters.hiddenMatchIds.has(matchDocument.id)
    ) {
      return [];
    }

    const otherUserId = match.participants.find((uid) => uid !== currentUser.uid);
    if (!otherUserId || friendFilters.blockedUserIds.has(otherUserId)) return [];

    const previous = previousContacts.get(matchDocument.id);
    const names = match.participantNames;
    const displayName = names && typeof names[otherUserId] === "string"
      ? names[otherUserId].trim()
      : "";
    return [{
      id: matchDocument.id,
      uid: otherUserId,
      name: displayName || "เพื่อน Dukdui",
      lastMsg: previous?.lastMsg || "เริ่มส่งข้อความ",
      time: previous?.time || ""
    }];
  });

  const activeIds = new Set(contactsData.map((contact) => contact.id));
  for (const [matchId, unsubscribe] of latestMessageUnsubscribers) {
    if (!activeIds.has(matchId)) {
      unsubscribe();
      latestMessageUnsubscribers.delete(matchId);
    }
  }
  for (const contact of contactsData) {
    subscribeToLatestMessage(contact);
  }

  if (currentActiveContactId && !activeIds.has(currentActiveContactId)) {
    stopMessageListener();
    currentActiveContactId = null;
    activeChatName.textContent = "เลือกเพื่อนเพื่อเริ่มแชท";
    activeChatStatus.textContent = "";
    messageInput.disabled = true;
    sendBtn.disabled = true;
    removeFriendBtn.disabled = true;
    blockFriendBtn.disabled = true;
    activeAvatar.textContent = "";
    showMessageState("ห้องสนทนานี้ไม่พร้อมใช้งานแล้ว");
  }

  renderContacts();
  setConnectionStatus("เชื่อมต่อแชทแล้ว");

  if (selectingInitialContact && requestedMatchId) {
    const requestedContact = contactsData.find((contact) => contact.id === requestedMatchId);
    if (requestedContact) selectContact(requestedContact);
    selectingInitialContact = false;
  }
}

function openFriendAction(action) {
  const contact = contactsData.find((item) => item.id === currentActiveContactId);
  if (!contact) return;

  pendingFriendAction = { action, contact };
  const isBlock = action === "block";
  friendActionTitle.textContent = isBlock ? "บล็อกเพื่อนคนนี้หรือไม่" : "ลบเพื่อนคนนี้หรือไม่";
  friendActionMessage.textContent = isBlock
    ? `คุณจะไม่เห็น ${contact.name} ในรายชื่อเพื่อน และจะไม่ถูกสุ่มจับคู่กันอีก`
    : `${contact.name} จะถูกซ่อนจากรายชื่อเพื่อนของคุณ แต่ประวัติแชทของอีกฝ่ายจะยังอยู่`;
  confirmFriendActionBtn.textContent = isBlock ? "บล็อกเพื่อน" : "ลบเพื่อน";
  confirmFriendActionBtn.dataset.action = action;
  confirmFriendActionBtn.disabled = false;
  cancelFriendActionBtn.disabled = false;
  friendActionDialog.showModal();
}

async function confirmFriendAction() {
  if (!pendingFriendAction || !currentUser) return;

  const { action, contact } = pendingFriendAction;
  confirmFriendActionBtn.disabled = true;
  cancelFriendActionBtn.disabled = true;
  friendActionMessage.textContent = action === "block"
    ? "กำลังบล็อกเพื่อน..."
    : "กำลังลบเพื่อน...";

  try {
    await updateFriend(currentUser, contact.id, action);
    friendFilters.hiddenMatchIds.add(contact.id);
    if (action === "block") friendFilters.blockedUserIds.add(contact.uid);
    friendActionDialog.close();
    pendingFriendAction = null;
    if (latestMatchesSnapshot) handleMatchesSnapshot(latestMatchesSnapshot);
    setConnectionStatus(action === "block" ? "บล็อกเพื่อนแล้ว" : "ลบเพื่อนแล้ว");

    try {
      friendFilters = await loadFriendFilters(currentUser);
      if (latestMatchesSnapshot) handleMatchesSnapshot(latestMatchesSnapshot);
    } catch (error) {
      console.error("รีเฟรชการตั้งค่าเพื่อนไม่สำเร็จ", error);
      setConnectionStatus("บันทึกการเปลี่ยนแปลงแล้ว แต่รีเฟรชสถานะไม่สำเร็จ", true);
    }
  } catch (error) {
    console.error("จัดการเพื่อนไม่สำเร็จ", error);
    friendActionMessage.textContent = error.message || "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
    setConnectionStatus(friendActionMessage.textContent, true);
    confirmFriendActionBtn.disabled = false;
    cancelFriendActionBtn.disabled = false;
  }
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentUser || !currentActiveContactId || sendingMessage) return;

  sendingMessage = true;
  messageInput.disabled = true;
  sendBtn.disabled = true;
  try {
    await addDoc(collection(db, "matches", currentActiveContactId, "messages"), {
      authorId: currentUser.uid,
      text,
      sentAt: serverTimestamp()
    });
    messageInput.value = "";
  } catch (error) {
    console.error("ส่งข้อความไม่สำเร็จ", error);
    setConnectionStatus(getFirestoreErrorMessage(error), true);
  } finally {
    sendingMessage = false;
    messageInput.disabled = !currentUser || !currentActiveContactId;
    sendBtn.disabled = !currentUser || !currentActiveContactId;
  }
}

searchInput.addEventListener("input", () => renderContacts());
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});

const videoModal = document.getElementById("videoModal");
document.getElementById("videoCallBtn").addEventListener("click", () => {
  if (!currentActiveContactId) {
    alert("กรุณาเลือกเพื่อนที่แมตช์แล้วก่อน");
    return;
  }
  videoModal.style.display = "flex";
});
document.getElementById("closeVideoBtn").addEventListener("click", () => {
  videoModal.style.display = "none";
});
removeFriendBtn.addEventListener("click", () => openFriendAction("remove"));
blockFriendBtn.addEventListener("click", () => openFriendAction("block"));
cancelFriendActionBtn.addEventListener("click", () => {
  friendActionDialog.close();
  pendingFriendAction = null;
});
friendActionDialog.addEventListener("cancel", (event) => {
  if (confirmFriendActionBtn.disabled) event.preventDefault();
});
confirmFriendActionBtn.addEventListener("click", confirmFriendAction);

onAuthStateChanged(
  auth,
  async (user) => {
    if (!user) {
      window.location.replace(loginPage);
      return;
    }

    currentUser = user;
    authStatus.hidden = true;
    appContainer.hidden = false;

    try {
      friendFilters = await loadFriendFilters(user);
    } catch (error) {
      console.error("โหลดการตั้งค่าเพื่อนไม่สำเร็จ", error);
      setConnectionStatus("โหลดการตั้งค่าเพื่อนไม่สำเร็จ กรุณาโหลดหน้าใหม่", true);
      return;
    }

    if (auth.currentUser?.uid !== user.uid) return;
    const matchesQuery = query(
      collection(db, "matches"),
      where("participants", "array-contains", user.uid)
    );
    onSnapshot(
      matchesQuery,
      handleMatchesSnapshot,
      (error) => {
        console.error("โหลดรายชื่อคู่แมตช์ไม่สำเร็จ", error);
        setConnectionStatus(getFirestoreErrorMessage(error), true);
      }
    );
  },
  (error) => {
    console.error("ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ", error);
    authStatus.textContent = "ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ กรุณาโหลดหน้าใหม่";
  }
);
