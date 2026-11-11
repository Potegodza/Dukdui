# คำสั่งและวิธีใช้งานโปรเจกต์

## รันเว็บในเครื่อง (Localhost)

ติดตั้ง dependency (หากเป็นครั้งแรก) และเปิด local server ด้วย npm จากโฟลเดอร์หลักของโปรเจกต์:

```powershell
npm install
npm run dev
```

เมื่อเห็นข้อความแจ้ง URL แล้ว เปิดหน้าเว็บ:

- Login: <http://localhost:8765/app/login/login.html>
- สมัครสมาชิก: <http://localhost:8765/app/login/sign.html>
- Home: <http://localhost:8765/app/home/homepage.html>
- บัญชีของฉัน: <http://localhost:8765/app/account/account.html>

หยุดเซิร์ฟเวอร์ด้วย `Ctrl+C` ในหน้าต่าง PowerShell เดิม ใช้ `npm start` แทน `npm run dev` ได้เช่นกัน เซิร์ฟเวอร์ให้บริการเฉพาะไฟล์ใน `app/` ไม่ควรเปิด HTML ด้วย `file://`

สำหรับ Google Sign-In ให้ใช้ URL ที่ขึ้นต้นด้วย `localhost` และเพิ่ม `localhost` ใน Firebase Console → Authentication → Settings → Authorized domains หากพอร์ต `8765` ถูกใช้งาน ให้กำหนดพอร์ตอื่นก่อนรัน เช่น `$env:PORT=8766; npm run dev` แล้วเปิด URL พอร์ต `8766`

## คำสั่งตรวจ JavaScript

รันจากโฟลเดอร์หลักของ repository:

```powershell
npm run check
```

script นี้เรียก `node --check` กับไฟล์ JavaScript ใน Login, Firebase, Home และ Account เพื่อตรวจ syntax เท่านั้น ไม่ได้เรียก Firebase หรือทดสอบการล็อกอินจริง

## ตรวจ whitespace และสถานะ Git

```powershell
git diff --check
git status --short
```

- `git diff --check` ตรวจ whitespace ที่ผิดปกติใน diff
- `git status --short` แสดงไฟล์ที่แก้ไขหรือยังไม่ได้ติดตาม

## ตรวจ Firebase Authentication API

ใช้ตรวจว่า API key ตอบสนองและแสดงโดเมนที่อนุญาตหรือไม่:

```powershell
curl.exe -sS -i "https://identitytoolkit.googleapis.com/v1/projects?key=YOUR_FIREBASE_WEB_API_KEY"
```

แทน `YOUR_FIREBASE_WEB_API_KEY` ด้วยค่า `apiKey` จาก `app/login/firebase.js` คำสั่งนี้ไม่ตรวจว่าเปิด Google provider อยู่หรือไม่ และไม่ใช่การทดสอบล็อกอิน

## ตั้งค่าใน Firebase Console

1. เลือกโปรเจกต์ Firebase ที่ตรงกับค่า `projectId` ใน `app/login/firebase.js`
2. ไปที่ **Authentication → Sign-in method** แล้วเปิด **Email/Password** และ **Google**
3. ไปที่ **Authentication → Settings → Authorized domains** แล้วเพิ่ม `localhost`
4. ไปที่ **Build → Firestore Database → Create database** สร้าง Cloud Firestore โดยเลือก database ID `(default)` ในโปรเจกต์ `dukdui-b71b0` เพื่อใช้หน้า Account บันทึกรายละเอียดและแท็กส่วนตัว
5. เผยแพร่กฎจาก `firestore.rules` โดยใช้ Firebase Console → **Firestore → Rules** หรือ Firebase CLI:

```powershell
firebase deploy --only firestore:rules
```

กฎปัจจุบันให้ผู้ใช้ที่เข้าสู่ระบบอ่านและแก้ไขโปรไฟล์ของ UID ตัวเองเท่านั้น โปรไฟล์/แท็กจึงยังไม่เปิดให้อ่านข้ามบัญชี ตรวจ endpoint แล้วพบว่า `(default)` database ใน `dukdui-b71b0` ยังไม่มีอยู่ ต้องสร้างก่อนหน้า Account จึงจะอ่าน/บันทึกข้อมูลได้

## ข้อจำกัดของการทดสอบ

การตรวจ syntax และการเปิดหน้าเว็บไม่ยืนยันการทำงานของบัญชี Firebase จริง การทดสอบ end-to-end ต้องใช้ Firebase project ที่ตั้งค่า provider, domain และ Firestore rules แล้ว การ redirect หน้า Home/Account ฝั่ง browser ไม่ใช่การควบคุมสิทธิ์ฝั่ง server
