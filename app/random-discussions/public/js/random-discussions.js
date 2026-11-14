
// เลือก Element จาก HTML
const topicCards = document.querySelectorAll(".topic-card");
const startButton = document.getElementById("startMatching");
const message = document.getElementById("message");

// เก็บหัวข้อที่ผู้ใช้เลือก
let selectedTopic = null;

// วนลูปตรวจสอบการคลิกแต่ละหัวข้อ
topicCards.forEach((card) => {
    card.addEventListener("click", () => {

        // เอาสถานะ selected ออกจากทุกหัวข้อ
        topicCards.forEach((item) => {
            item.classList.remove("selected");
        });

        // เพิ่มสถานะ selected ให้หัวข้อที่คลิก
        card.classList.add("selected");

        // เก็บค่าหัวข้อที่เลือก
        selectedTopic = card.dataset.topic;

        // เปิดใช้งานปุ่มเริ่ม
        startButton.disabled = false;

        // เปลี่ยนข้อความ
        message.textContent = "คุณเลือกหัวข้อนี้แล้ว สามารถเริ่มสุ่มคุยได้เลย";
    });
});

// เมื่อกดเริ่มสุ่มคุย
startButton.addEventListener("click", () => {

    // ตรวจสอบว่ามีการเลือกหัวข้อหรือยัง
    if (!selectedTopic) {
        message.textContent = "กรุณาเลือกหัวข้อก่อนเริ่ม";
        return;
    }

    // บันทึกหัวข้อไว้ก่อนเปลี่ยนหน้า
    sessionStorage.setItem("selectedTopic", selectedTopic);

    // ไปยังหน้าวิดีโอคอล
    window.location.href = "/randomchat.html";
});
