import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth } from "../login/firebase.js";

const loginPage = "../login/login.html";
const dashboard = document.querySelector("[data-authenticated-content]");
const loadingMessage = document.querySelector("[data-auth-loading]");
const userName = document.querySelector("[data-user-name]");
const signOutButton = document.querySelector("[data-sign-out]");

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
