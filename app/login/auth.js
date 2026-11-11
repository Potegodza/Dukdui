import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth } from "./firebase.js";
const form = document.querySelector("[data-auth-form]");
const message = document.querySelector("[data-auth-message]");
const googleButton = document.querySelector("[data-google-sign-in]");
const passwordResetButton = document.querySelector("[data-password-reset]");
const provider = new GoogleAuthProvider();
const homePage = "../home/homepage.html";
let initialAuthCheck = true;

function showMessage(text, isError = false) {
  if (!message) return;
  message.textContent = text;
  message.dataset.state = isError ? "error" : "success";
}

function getErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "อีเมลนี้ถูกใช้งานแล้ว",
    "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
    "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/invalid-login-credentials": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/wrong-password": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/user-not-found": "ไม่พบบัญชีนี้",
    "auth/user-disabled": "บัญชีนี้ถูกระงับการใช้งาน",
    "auth/weak-password": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
    "auth/popup-closed-by-user": "คุณปิดหน้าต่าง Google ก่อนเข้าสู่ระบบเสร็จ",
    "auth/popup-blocked": "เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ กรุณาอนุญาต popup แล้วลองอีกครั้ง",
    "auth/cancelled-popup-request": "มีคำขอเข้าสู่ระบบ Google อื่นกำลังดำเนินการ",
    "auth/account-exists-with-different-credential": "อีเมลนี้ผูกกับวิธีเข้าสู่ระบบอื่นอยู่แล้ว",
    "auth/too-many-requests": "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
    "auth/network-request-failed": "เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
    "auth/configuration-not-found": "โปรเจกต์ Firebase ยังไม่ได้ตั้งค่า Authentication กรุณาเปิดใช้งานใน Firebase Console",
    "auth/operation-not-allowed": "ยังไม่ได้เปิดใช้งานวิธีเข้าสู่ระบบนี้ใน Firebase",
    "auth/unauthorized-domain": "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication"
  };

  return messages[error.code] || "ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
}

async function runAuthAction(action) {
  showMessage("");
  const buttons = document.querySelectorAll("button[type='submit'], [data-google-sign-in], [data-password-reset]");
  buttons.forEach((button) => {
    button.disabled = true;
  });

  try {
    await action();
  } catch (error) {
    showMessage(getErrorMessage(error), true);
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    runAuthAction(async () => {
      if (form.dataset.authForm === "register") {
        const confirmPassword = String(formData.get("confirm-password") || "");
        if (!/[A-Za-z]/.test(password)) {
          showMessage("รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษอย่างน้อย 1 ตัว", true);
          return;
        }
        if (password !== confirmPassword) {
          showMessage("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน", true);
          return;
        }

        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const nickname = String(formData.get("nickname") || "").trim();
        if (nickname) {
          await updateProfile(credential.user, { displayName: nickname });
        }
        window.location.replace(homePage);
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
      window.location.replace(homePage);
    });
  });
}

if (googleButton) {
  googleButton.addEventListener("click", () => {
    runAuthAction(async () => {
      await signInWithPopup(auth, provider);
      window.location.replace(homePage);
    });
  });
}

if (passwordResetButton) {
  passwordResetButton.addEventListener("click", () => {
    runAuthAction(async () => {
      const email = String(form?.elements.namedItem("email")?.value || "").trim();
      if (!email) {
        showMessage("กรุณากรอกอีเมลก่อนขอรีเซ็ตรหัสผ่าน", true);
        return;
      }
      await sendPasswordResetEmail(auth, email);
      showMessage("ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว");
    });
  });
}

onAuthStateChanged(
  auth,
  (user) => {
    if (!initialAuthCheck) return;
    initialAuthCheck = false;
    if (user) {
      window.location.replace(homePage);
    }
  },
  (error) => {
    console.error("ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ", error);
    showMessage("ตรวจสอบสถานะการเข้าสู่ระบบไม่สำเร็จ กรุณาโหลดหน้าใหม่", true);
  }
);
