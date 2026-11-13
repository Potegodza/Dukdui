# Dukdui SPU — การเชื่อม UID กับระบบ Profile

## ตอนพัฒนา
หน้า `public/randomchat.html` มี mock profile ชั่วคราว:

```js
window.currentUser = window.currentUser || { uid: '69012345' };
```

ทำให้ทดสอบระบบจับคู่ รายงาน และระบบแบนได้ โดยไม่ต้องให้ผู้ใช้กรอก UID

## เมื่อต่อกับระบบ Login/Profile ของทีม
1. ให้ระบบ Login/Profile กำหนด `window.currentUser` ก่อนสคริปต์ของ Random Chat ทำงาน
2. รูปแบบข้อมูลขั้นต่ำ:

```js
window.currentUser = {
  uid: '69012345' // UID ที่ระบบ Login ยืนยันแล้ว เป็น string 8 หลัก
};
```

3. ลบ/ปิดบรรทัด mock `window.currentUser = window.currentUser || ...` ใน `randomchat.html`
4. Random Chat จะอ่าน `window.currentUser.uid` แล้วส่งให้ Socket.IO event `identify` โดยอัตโนมัติ

**สำคัญ:** ค่า UID ที่ส่งจาก browser ยังแก้ไขได้โดยผู้ใช้ทางเทคนิค หากนำขึ้นใช้งานจริง Server ควรอ่าน UID จาก session/cookie ที่ระบบ Login ตรวจสอบฝั่ง Server แล้ว ไม่ควรเชื่อ UID ที่ client ส่งมาเพียงอย่างเดียว
