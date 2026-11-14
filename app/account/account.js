import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "../login/firebase.js";

const loginPage = "../login/login.html";
const accountPage = document.querySelector("[data-account-page]");
const loadingMessage = document.querySelector("[data-auth-loading]");
const navigationUserName = document.querySelector("#userName");
const profileForm = document.querySelector("[data-profile-form]");
const profileMessage = document.querySelector("[data-profile-message]");
const saveProfileButton = document.querySelector("[data-save-profile]");
const passwordForm = document.querySelector("[data-password-form]");
const passwordMessage = document.querySelector("[data-password-message]");
const passwordHelp = document.querySelector("[data-password-help]");
const changePasswordButton = document.querySelector("[data-change-password]");
const logoutButton = document.querySelector("[data-sign-out]");
const logoutMessage = document.querySelector("[data-logout-message]");
const accountUid = document.querySelector("[data-user-uid]");
const providerList = document.querySelector("[data-provider-list]");
const createdAt = document.querySelector("[data-created-at]");
const emailVerified = document.querySelector("[data-email-verified]");
const presetContainer = document.querySelector("[data-preset-tags]");
const selectedTagsContainer = document.querySelector("[data-selected-tags]");
const customTagInput = document.querySelector("#custom-tag");

const suggestedTags = ["ดนตรี", "เกม", "ภาพยนตร์", "หนังสือ", "กีฬา", "ท่องเที่ยว", "เทคโนโลยี", "ถ่ายภาพ", "อาหาร", "ภาษา"];
const maxTags = 10;
let currentUser = null;
let profileLoaded = false;
let selectedTags = [];

function showMessage(element, text, isError = false) {
  element.textContent = text;
  element.dataset.state = isError ? "error" : "success";
}

function getErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "รหัสผ่านปัจจุบันไม่ถูกต้อง",
    "auth/wrong-password": "รหัสผ่านปัจจุบันไม่ถูกต้อง",
    "auth/weak-password": "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร",
    "auth/requires-recent-login": "เซสชันหมดอายุ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่",
    "auth/too-many-requests": "ดำเนินการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
    "auth/network-request-failed": "เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต",
    "permission-denied": "ไม่มีสิทธิ์อ่านหรือบันทึกโปรไฟล์ กรุณาตรวจสอบ Firestore Security Rules",
    "unavailable": "บริการ Firestore ยังไม่พร้อมใช้งาน กรุณาลองอีกครั้ง"
  };
  return messages[error.code] || "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

function setBusy(button, busy) {
  button.disabled = busy;
}

function setFirestoreFieldsEnabled(enabled) {
  for (const field of profileForm.querySelectorAll(
    "[name='bio'], [name='department'], [name='year'], #custom-tag, [data-add-tag], [data-preset-tags] button"
  )) {
    field.disabled = !enabled;
  }
}

function normalizeTag(tag) {
  return tag.trim().replace(/\s+/g, " ");
}

function addTag(rawTag) {
  const tag = normalizeTag(rawTag);
  if (!tag) return;
  if (tag.length > 30) {
    showMessage(profileMessage, "แท็กต้องมีความยาวไม่เกิน 30 ตัวอักษร", true);
    return;
  }
  if (selectedTags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
    showMessage(profileMessage, "มีแท็กนี้อยู่แล้ว", true);
    return;
  }
  if (selectedTags.length >= maxTags) {
    showMessage(profileMessage, `เลือกแท็กได้ไม่เกิน ${maxTags} แท็ก`, true);
    return;
  }
  selectedTags = [...selectedTags, tag];
  renderTags();
  showMessage(profileMessage, "");
}

function renderTags() {
  presetContainer.replaceChildren();
  for (const tag of suggestedTags) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip";
    button.textContent = tag;
    button.setAttribute("aria-pressed", String(selectedTags.includes(tag)));
    button.addEventListener("click", () => {
      showMessage(profileMessage, "");
      if (selectedTags.includes(tag)) {
        selectedTags = selectedTags.filter((item) => item !== tag);
      } else {
        addTag(tag);
        return;
      }
      renderTags();
    });
    presetContainer.append(button);
  }

  selectedTagsContainer.replaceChildren();
  for (const tag of selectedTags) {
    const item = document.createElement("li");
    const chip = document.createElement("span");
    chip.className = "selected-tag";
    const text = document.createElement("span");
    text.textContent = tag;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-tag";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `ลบแท็ก ${tag}`);
    removeButton.addEventListener("click", () => {
      selectedTags = selectedTags.filter((item) => item !== tag);
      showMessage(profileMessage, "");
      renderTags();
    });
    chip.append(text, removeButton);
    item.append(chip);
    selectedTagsContainer.append(item);
  }
}

function showProfile(user, profile) {
  accountUid.textContent = user.uid;
  profileForm.elements.namedItem("displayName").value = user.displayName || "";
  profileForm.elements.namedItem("email").value = user.email || "";
  profileForm.elements.namedItem("bio").value = typeof profile.bio === "string" ? profile.bio : "";
  profileForm.elements.namedItem("department").value = typeof profile.department === "string" ? profile.department : "";
  profileForm.elements.namedItem("year").value = typeof profile.year === "string" ? profile.year : "";
  selectedTags = Array.isArray(profile.interests)
    ? [...new Set(profile.interests.filter((tag) => typeof tag === "string").map(normalizeTag))]
        .filter((tag) => tag.length > 0 && tag.length <= 30)
        .slice(0, maxTags)
    : [];
  renderTags();

  const providers = [...new Set(user.providerData.map((provider) => {
    if (provider.providerId === "password") return "อีเมลและรหัสผ่าน";
    if (provider.providerId === "google.com") return "Google";
    return provider.providerId;
  }))];
  providerList.textContent = providers.join(", ") || "ไม่ระบุ";
  createdAt.textContent = user.metadata.creationTime
    ? new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date(user.metadata.creationTime))
    : "ไม่ระบุ";
  emailVerified.textContent = user.emailVerified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน";

  const hasPasswordProvider = user.providerData.some((provider) => provider.providerId === "password");
  if (!hasPasswordProvider) {
    passwordForm.hidden = true;
    passwordHelp.textContent = "บัญชีนี้ใช้ Google Sign-In จัดการรหัสผ่านผ่านบัญชี Google ของคุณ";
  }
}

document.querySelector("[data-add-tag]").addEventListener("click", () => {
  addTag(customTagInput.value);
  if (selectedTags.some((tag) => tag === normalizeTag(customTagInput.value))) {
    customTagInput.value = "";
  }
});

customTagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("[data-add-tag]").click();
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const formData = new FormData(profileForm);
  const displayName = String(formData.get("displayName") || "").trim();
  if (!displayName) {
    showMessage(profileMessage, "กรุณากรอกชื่อที่แสดง", true);
    return;
  }

  setBusy(saveProfileButton, true);
  showMessage(profileMessage, "");
  try {
    await updateProfile(currentUser, { displayName });
    if (!profileLoaded) {
      showMessage(profileMessage, "เปลี่ยนชื่อแล้ว แต่ยังบันทึกรายละเอียดและแท็กไม่ได้ กรุณาสร้าง Firestore database ก่อน");
      profileMessage.dataset.state = "warning";
      return;
    }

    try {
      await setDoc(doc(db, "users", currentUser.uid), {
        bio: String(formData.get("bio") || "").trim(),
        department: String(formData.get("department") || "").trim(),
        year: String(formData.get("year") || ""),
        interests: selectedTags,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("บันทึกรายละเอียดโปรไฟล์ไม่สำเร็จ", error);
      showMessage(
        profileMessage,
        `เปลี่ยนชื่อบัญชีแล้ว แต่บันทึกรายละเอียดไม่สำเร็จ: ${getErrorMessage(error)}`,
        true
      );
      return;
    }
    showMessage(profileMessage, "บันทึกโปรไฟล์เรียบร้อยแล้ว");
  } catch (error) {
    console.error("บันทึกโปรไฟล์ไม่สำเร็จ", error);
    showMessage(
      profileMessage,
      error.code === "permission-denied"
        ? "ไม่มีสิทธิ์บันทึกโปรไฟล์ กรุณาตรวจสอบ Firestore Security Rules"
        : getErrorMessage(error),
      true
    );
  } finally {
    setBusy(saveProfileButton, false);
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  const formData = new FormData(passwordForm);
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (newPassword.length < 6) {
    showMessage(passwordMessage, "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร", true);
    return;
  }
  if (!/[A-Za-z]/.test(newPassword)) {
    showMessage(passwordMessage, "รหัสผ่านใหม่ต้องมีตัวอักษรภาษาอังกฤษอย่างน้อย 1 ตัว", true);
    return;
  }
  if (newPassword !== confirmPassword) {
    showMessage(passwordMessage, "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน", true);
    return;
  }
  if (newPassword === currentPassword) {
    showMessage(passwordMessage, "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน", true);
    return;
  }

  setBusy(changePasswordButton, true);
  showMessage(passwordMessage, "");
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);
    passwordForm.reset();
    showMessage(passwordMessage, "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
  } catch (error) {
    console.error("เปลี่ยนรหัสผ่านไม่สำเร็จ", error);
    showMessage(passwordMessage, getErrorMessage(error), true);
  } finally {
    setBusy(changePasswordButton, false);
  }
});

logoutButton.addEventListener("click", async () => {
  setBusy(logoutButton, true);
  showMessage(logoutMessage, "");
  try {
    await signOut(auth);
    window.location.replace(loginPage);
  } catch (error) {
    console.error("ออกจากระบบไม่สำเร็จ", error);
    showMessage(logoutMessage, getErrorMessage(error), true);
    setBusy(logoutButton, false);
  }
});

onAuthStateChanged(
  auth,
  async (user) => {
    if (!user) {
      window.location.replace(loginPage);
      return;
    }

    currentUser = user;
    if (navigationUserName) {
      navigationUserName.textContent = user.displayName || user.email || "ผู้ใช้";
    }
    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      showProfile(user, profileSnapshot.exists() ? profileSnapshot.data() : {});
      profileLoaded = true;
      setFirestoreFieldsEnabled(true);
      saveProfileButton.disabled = false;
      loadingMessage.hidden = true;
      accountPage.hidden = false;
    } catch (error) {
      console.error("โหลดโปรไฟล์ไม่สำเร็จ", error);
      showProfile(user, {});
      profileLoaded = false;
      setFirestoreFieldsEnabled(false);
      saveProfileButton.disabled = false;
      showMessage(profileMessage, error.code === "permission-denied"
        ? "ยังอ่านโปรไฟล์ไม่ได้ กรุณาเผยแพร่ Firestore Security Rules"
        : "ยังอ่านโปรไฟล์ไม่ได้: สร้าง Firestore database ID (default) ในโปรเจกต์ dukdui-b71b0 และเผยแพร่ firestore.rules ก่อน");
      profileMessage.dataset.state = "warning";
      loadingMessage.hidden = true;
      accountPage.hidden = false;
    }
  },
  (error) => {
    console.error("ตรวจสอบสถานะบัญชีไม่สำเร็จ", error);
    loadingMessage.textContent = "ตรวจสอบสถานะบัญชีไม่สำเร็จ กรุณาโหลดหน้าใหม่";
  }
);
