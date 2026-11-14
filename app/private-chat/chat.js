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
const audioCallBtn = document.getElementById("audioCallBtn");
const videoCallBtn = document.getElementById("videoCallBtn");
const callModal = document.getElementById("callModal");
const callTitle = document.getElementById("callTitle");
const callStatus = document.getElementById("callStatus");
const callVideoStage = document.getElementById("callVideoStage");
const callAudioStage = document.getElementById("callAudioStage");
const remoteCallVideo = document.getElementById("remoteCallVideo");
const localCallVideo = document.getElementById("localCallVideo");
const remoteCallAudio = document.getElementById("remoteCallAudio");
const audioCallName = document.getElementById("audioCallName");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const declineCallBtn = document.getElementById("declineCallBtn");
const cancelCallBtn = document.getElementById("cancelCallBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const endCallBtn = document.getElementById("endCallBtn");
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
let callSocket = null;
let activeCall = null;
let localCallStream = null;
let callPeerConnection = null;
let waitingCallCandidates = [];
const latestMessageUnsubscribers = new Map();
const requestedMatchId = new URLSearchParams(window.location.search).get("match");

function setConnectionStatus(text, isError = false) {
  connectionStatus.textContent = text;
  connectionStatus.dataset.state = isError ? "error" : "success";
}

function updateCallButtons() {
  const canCall = Boolean(
    currentUser
    && currentActiveContactId
    && callSocket?.connected
    && !activeCall
  );
  audioCallBtn.disabled = !canCall;
  videoCallBtn.disabled = !canCall;
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
  updateCallButtons();
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
  const seenFriendUids = new Set();
  contactsData = [...snapshot.docs]
    .sort((first, second) =>
      String(second.get("createdAt") || "").localeCompare(String(first.get("createdAt") || ""))
      || first.id.localeCompare(second.id)
    )
    .flatMap((matchDocument) => {
      const match = matchDocument.data();
      if (
        !Array.isArray(match.participants)
        || match.participants.length !== 2
        || !match.participants.includes(currentUser.uid)
      ) {
        return [];
      }

      const otherUserId = match.participants.find((uid) => uid !== currentUser.uid);
      if (!otherUserId || seenFriendUids.has(otherUserId)) return [];
      seenFriendUids.add(otherUserId);
      if (
        friendFilters.hiddenMatchIds.has(matchDocument.id)
        || friendFilters.blockedUserIds.has(otherUserId)
      ) return [];

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
    endCallForMatch(currentActiveContactId);
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

  updateCallButtons();
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
    endCallForMatch(contact.id);
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

const callIceConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function renderCallState() {
  if (!activeCall) {
    callModal.hidden = true;
    acceptCallBtn.hidden = true;
    declineCallBtn.hidden = true;
    cancelCallBtn.hidden = true;
    toggleMicBtn.hidden = true;
    toggleCameraBtn.hidden = true;
    endCallBtn.hidden = true;
    updateCallButtons();
    return;
  }

  const isIncoming = activeCall.role === "callee"
    && ["incoming", "accepting"].includes(activeCall.status);
  const canCancelCaller = activeCall.role === "caller"
    && ["starting", "ringing"].includes(activeCall.status);
  const isActive = activeCall.status === "active";
  const showVideo = activeCall.callType === "video"
    && activeCall.status !== "incoming";

  callModal.hidden = false;
  callTitle.textContent = activeCall.callType === "video" ? "วิดีโอคอล" : "โทรเสียง";
  callStatus.textContent = activeCall.statusMessage || "";
  audioCallName.textContent = activeCall.displayName;
  callVideoStage.hidden = !showVideo;
  callAudioStage.hidden = showVideo;
  localCallVideo.srcObject = activeCall.callType === "video" ? localCallStream : null;
  acceptCallBtn.hidden = !isIncoming;
  acceptCallBtn.disabled = activeCall.status === "accepting";
  declineCallBtn.hidden = !isIncoming;
  cancelCallBtn.hidden = !canCancelCaller;
  toggleMicBtn.hidden = !isActive;
  toggleCameraBtn.hidden = !isActive || activeCall.callType !== "video";
  endCallBtn.hidden = !isActive;
  toggleMicBtn.textContent = localCallStream?.getAudioTracks()[0]?.enabled === false
    ? "เปิดไมค์"
    : "ปิดไมค์";
  toggleCameraBtn.textContent = localCallStream?.getVideoTracks()[0]?.enabled === false
    ? "เปิดกล้อง"
    : "ปิดกล้อง";
  updateCallButtons();
}

function closeCallUi() {
  if (callPeerConnection) {
    callPeerConnection.close();
    callPeerConnection = null;
  }
  for (const track of localCallStream?.getTracks() || []) {
    track.stop();
  }
  localCallStream = null;
  waitingCallCandidates = [];
  remoteCallVideo.srcObject = null;
  localCallVideo.srcObject = null;
  remoteCallAudio.srcObject = null;
  activeCall = null;
  renderCallState();
}

function endActiveCall() {
  const call = activeCall;
  if (!call) return;

  if (call.callId && callSocket?.connected) {
    if (call.role === "caller" && call.status === "ringing") {
      callSocket.emit("call:cancel", { callId: call.callId });
    } else if (call.role === "callee" && call.status !== "active") {
      callSocket.emit("call:decline", { callId: call.callId });
    } else {
      callSocket.emit("call:hangup", { callId: call.callId });
    }
  }
  closeCallUi();
}

function endCallForMatch(matchId) {
  if (activeCall?.matchId === matchId) endActiveCall();
}

function isCurrentCall(callId) {
  if (
    activeCall?.role === "caller"
    && activeCall.status === "starting"
    && !activeCall.callId
  ) {
    activeCall.callId = callId;
  }
  return Boolean(activeCall && activeCall.callId === callId);
}

function createCallPeerConnection() {
  const call = activeCall;
  const peerConnection = new RTCPeerConnection(callIceConfiguration);
  callPeerConnection = peerConnection;
  for (const track of localCallStream.getTracks()) {
    peerConnection.addTrack(track, localCallStream);
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && activeCall === call && call.callId && callSocket?.connected) {
      callSocket.emit("call:signal", {
        callId: call.callId,
        signal: { candidate: event.candidate.toJSON() }
      });
    }
  };
  peerConnection.ontrack = (event) => {
    const stream = event.streams[0];
    if (!stream || activeCall !== call) return;
    if (call.callType === "video") {
      remoteCallVideo.srcObject = stream;
      remoteCallVideo.play().catch((error) => {
        console.error("เล่นวิดีโอจากเพื่อนไม่สำเร็จ", error);
      });
    } else {
      remoteCallAudio.srcObject = stream;
      remoteCallAudio.play().catch((error) => {
        console.error("เล่นเสียงจากเพื่อนไม่สำเร็จ", error);
      });
    }
    call.statusMessage = "เชื่อมต่อแล้ว";
    callStatus.textContent = call.statusMessage;
  };
  peerConnection.onconnectionstatechange = () => {
    if (activeCall === call && peerConnection.connectionState === "failed") {
      setConnectionStatus("การเชื่อมต่อสายล้มเหลว กรุณาวางสายแล้วลองอีกครั้ง", true);
    }
  };
  return peerConnection;
}

async function handleCallSignal(data) {
  if (
    !activeCall
    || data?.callId !== activeCall.callId
    || !callPeerConnection
  ) return;

  const peerConnection = callPeerConnection;
  try {
    if (data.signal?.description) {
      await peerConnection.setRemoteDescription(data.signal.description);
      if (callPeerConnection !== peerConnection) return;

      for (const candidate of waitingCallCandidates) {
        await peerConnection.addIceCandidate(candidate);
      }
      waitingCallCandidates = [];

      if (data.signal.description.type === "offer") {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        if (callPeerConnection !== peerConnection || !activeCall) return;
        callSocket.emit("call:signal", {
          callId: activeCall.callId,
          signal: { description: peerConnection.localDescription }
        });
      }
    } else if (data.signal?.candidate) {
      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(data.signal.candidate);
      } else {
        waitingCallCandidates.push(data.signal.candidate);
      }
    }
  } catch (error) {
    console.error("ส่งสัญญาณวิดีโอคอลไม่สำเร็จ", error);
    setConnectionStatus("เชื่อมต่อสายไม่สำเร็จ กรุณาวางสายแล้วลองอีกครั้ง", true);
  }
}

async function startCall(callType) {
  if (!currentActiveContactId || !callSocket?.connected || activeCall) return;
  const contact = contactsData.find((item) => item.id === currentActiveContactId);
  if (!contact) return;

  activeCall = {
    callId: null,
    matchId: contact.id,
    callType,
    role: "caller",
    displayName: contact.name,
    status: "starting",
    statusMessage: `กำลังเรียก ${contact.name}...`
  };
  const call = activeCall;
  renderCallState();

  let mediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video"
    });
  } catch (error) {
    console.error("เปิดไมโครโฟนหรือกล้องไม่สำเร็จ", error);
    if (activeCall === call) {
      closeCallUi();
      setConnectionStatus("เปิดไมโครโฟนหรือกล้องไม่ได้ กรุณาอนุญาตสิทธิ์แล้วลองอีกครั้ง", true);
    }
    return;
  }

  if (activeCall !== call || !callSocket?.connected) {
    for (const track of mediaStream.getTracks()) track.stop();
    return;
  }

  localCallStream = mediaStream;
  renderCallState();

  callSocket.timeout(10000).emit(
    "call:start",
    { matchId: contact.id, callType },
    (timeoutError, response) => {
      if (activeCall !== call) return;
      if (timeoutError || !response?.success) {
        const message = response?.message || "เริ่มสายโทรไม่สำเร็จ กรุณาลองอีกครั้ง";
        closeCallUi();
        setConnectionStatus(message, true);
        return;
      }
      activeCall.callId = response.callId;
      if (activeCall.status === "starting") {
        activeCall.status = "ringing";
        renderCallState();
      }
    }
  );
}

async function acceptIncomingCall() {
  const call = activeCall;
  if (!call || call.role !== "callee" || call.status !== "incoming") return;
  call.status = "accepting";
  call.statusMessage = "กำลังเปิดไมโครโฟนและกล้อง...";
  renderCallState();

  let mediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: call.callType === "video"
    });
  } catch (error) {
    console.error("เปิดไมโครโฟนหรือกล้องไม่สำเร็จ", error);
    if (activeCall !== call) return;
    if (callSocket?.connected) callSocket.emit("call:decline", { callId: call.callId });
    closeCallUi();
    setConnectionStatus("รับสายไม่ได้ เพราะไม่สามารถเปิดไมโครโฟนหรือกล้อง", true);
    return;
  }

  if (activeCall !== call) {
    for (const track of mediaStream.getTracks()) track.stop();
    return;
  }
  localCallStream = mediaStream;

  try {
    createCallPeerConnection();
  } catch (error) {
    console.error("เตรียมการเชื่อมต่อสายไม่สำเร็จ", error);
    if (callSocket?.connected) callSocket.emit("call:decline", { callId: call.callId });
    closeCallUi();
    setConnectionStatus("เตรียมการโทรไม่สำเร็จ กรุณาลองอีกครั้ง", true);
    return;
  }

  callSocket.timeout(10000).emit("call:accept", { callId: call.callId }, (timeoutError, response) => {
    if (activeCall !== call) return;
    if (timeoutError || !response?.success) {
      const message = response?.message || "รับสายไม่สำเร็จ กรุณาลองอีกครั้ง";
      if (callSocket?.connected) {
        callSocket.emit("call:decline", { callId: call.callId });
        callSocket.emit("call:hangup", { callId: call.callId });
      }
      closeCallUi();
      setConnectionStatus(message, true);
      return;
    }
    call.status = "active";
    call.statusMessage = "กำลังเชื่อมต่อ...";
    renderCallState();
  });
}

function connectCallSocket(user) {
  if (typeof window.io !== "function") {
    setConnectionStatus("โหลดระบบโทรไม่สำเร็จ กรุณาโหลดหน้าใหม่", true);
    return;
  }

  fetch("/api/client-config")
    .then(async (response) => {
      const config = await response.json();
      if (!response.ok || !config.success) {
        throw new Error(config.message || "โหลดการตั้งค่าโทรไม่สำเร็จ");
      }
      return config.socketOrigin;
    })
    .then((socketOrigin) => {
      if (auth.currentUser?.uid !== user.uid) return;
      callSocket = window.io(socketOrigin || window.location.origin, {
        autoConnect: false,
        auth: (callback) => {
          const currentAuthUser = auth.currentUser;
          if (!currentAuthUser) {
            callback({});
            return;
          }
          currentAuthUser.getIdToken()
            .then((token) => callback({ token }))
            .catch((error) => {
              console.error("ตรวจสอบบัญชีสำหรับระบบโทรไม่สำเร็จ", error);
              callback({});
            });
        }
      });

      callSocket.on("connect", updateCallButtons);
      callSocket.on("connect_error", (error) => {
        console.error("เชื่อมต่อระบบโทรไม่สำเร็จ", error);
        updateCallButtons();
        if (activeCall) closeCallUi();
        setConnectionStatus("เชื่อมต่อระบบโทรไม่ได้ กรุณาโหลดหน้าใหม่", true);
      });
      callSocket.on("disconnect", () => {
        if (activeCall) closeCallUi();
        updateCallButtons();
      });
      callSocket.on("call:incoming", (data) => {
        if (activeCall) {
          callSocket.emit("call:decline", { callId: data.callId });
          return;
        }
        activeCall = {
          callId: data.callId,
          matchId: data.matchId,
          callType: data.callType,
          role: "callee",
          displayName: data.callerName || "เพื่อน",
          status: "incoming",
          statusMessage: data.callType === "video" ? "มีสายวิดีโอเข้า" : "มีสายโทรเข้า"
        };
        renderCallState();
      });
      callSocket.on("call:taken", ({ callId } = {}) => {
        if (activeCall?.callId !== callId || activeCall.role !== "callee") return;
        closeCallUi();
      });
      callSocket.on("call:accepted", async ({ callId } = {}) => {
        if (!isCurrentCall(callId) || activeCall.role !== "caller") return;
        activeCall.status = "active";
        activeCall.statusMessage = "กำลังเชื่อมต่อ...";
        renderCallState();
        try {
          const peerConnection = createCallPeerConnection();
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          if (callPeerConnection !== peerConnection || !activeCall) return;
          callSocket.emit("call:signal", {
            callId,
            signal: { description: peerConnection.localDescription }
          });
        } catch (error) {
          console.error("เริ่มการเชื่อมต่อสายไม่สำเร็จ", error);
          setConnectionStatus("เริ่มการเชื่อมต่อสายไม่สำเร็จ กรุณาลองอีกครั้ง", true);
          endActiveCall();
        }
      });
      callSocket.on("call:rejected", ({ callId, message } = {}) => {
        if (!isCurrentCall(callId)) return;
        closeCallUi();
        setConnectionStatus(message || "อีกฝ่ายปฏิเสธสาย");
      });
      callSocket.on("call:ended", ({ callId, message } = {}) => {
        if (!isCurrentCall(callId)) return;
        closeCallUi();
        setConnectionStatus(message || "อีกฝ่ายวางสายแล้ว");
      });
      callSocket.on("call:signal", handleCallSignal);
      callSocket.connect();
    })
    .catch((error) => {
      console.error("โหลดการตั้งค่าระบบโทรไม่สำเร็จ", error);
      updateCallButtons();
      setConnectionStatus("โหลดระบบโทรไม่สำเร็จ กรุณาโหลดหน้าใหม่", true);
    });
}

audioCallBtn.addEventListener("click", () => startCall("audio"));
videoCallBtn.addEventListener("click", () => startCall("video"));
acceptCallBtn.addEventListener("click", acceptIncomingCall);
declineCallBtn.addEventListener("click", endActiveCall);
cancelCallBtn.addEventListener("click", endActiveCall);
endCallBtn.addEventListener("click", endActiveCall);
toggleMicBtn.addEventListener("click", () => {
  const audioTrack = localCallStream?.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  toggleMicBtn.textContent = audioTrack.enabled ? "ปิดไมค์" : "เปิดไมค์";
});
toggleCameraBtn.addEventListener("click", () => {
  const videoTrack = localCallStream?.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  toggleCameraBtn.textContent = videoTrack.enabled ? "ปิดกล้อง" : "เปิดกล้อง";
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
    connectCallSocket(user);
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
