// 1. โหลดข้อมูลจาก localStorage (ถ้ามี) หรือใช้ข้อมูลเริ่มต้นถ้ายังไม่เคยมี
let contactsData = JSON.parse(localStorage.getItem('chatContactsData')) || [
    { 
        id: 1, 
        name: "Bell", 
        status: "ออนไลน์", 
        lastMsg: "สวัสดีค่ะ", 
        time: "10:30 น.",
        messages: [
            { sender: "incoming", text: "สวัสดีค่ะ", time: "10:30 น." }
        ]
    },
    { 
        id: 2, 
        name: "L i v a n", 
        status: "ออฟไลน์", 
        lastMsg: "หาคนไปกินตี๋น้อยอยู่ แกไปป่ะ?", 
        time: "เมื่อวาน",
        messages: [
            { sender: "incoming", text: "หาคนไปกินตี๋น้อยอยู่ แกไปป่ะ?", time: "เมื่อวาน" }
        ]
    },
    { 
        id: 3, 
        name: "Ahaahaha", 
        status: "ออนไลน์", 
        lastMsg: "เย็นนี้ไปกินข้าวกัน โดนเพื่อนบิดมา", 
        time: "09:15 น.",
        messages: [
            { sender: "incoming", text: "เย็นนี้ไปกินข้าวกัน โดนเพื่อนบิดมา", time: "09:15 น." }
        ]
    },
    { 
        id: 4, 
        name: "เทพไม่รวมกลุ่ม", 
        status: "ออฟไลน์", 
        lastMsg: "ขอบคุณที่เอาหนังสือไปคืนให้นะครับ", 
        time: "จันทร์",
        messages: [
            { sender: "incoming", text: "ขอบคุณที่เอาหนังสือไปคืนให้นะครับ", time: "จันทร์" }
        ]
    }
];

let currentActiveContactId = null;

// ฟังก์ชันสำหรับบันทึกข้อมูลลงในหน่วยความจำของเบราว์เซอร์
function saveToLocalStorage() {
    localStorage.setItem('chatContactsData', JSON.stringify(contactsData));
}

// ระบบเปลี่ยนหน้าแท็บเมนูด้านซ้าย
const menuBtns = document.querySelectorAll('.menu-btn');
const appSections = document.querySelectorAll('.app-section');

menuBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        menuBtns.forEach(b => b.classList.remove('active'));
        appSections.forEach(s => s.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// แสดงรายชื่อเพื่อน
const contactListEl = document.getElementById('contactList');

function renderContacts(list) {
    contactListEl.innerHTML = '';
    if (list.length === 0) {
        contactListEl.innerHTML = '<div style="color: #64748b; font-size: 12px; text-align: center; padding: 20px;">ไม่พบรายชื่อเพื่อน</div>';
        return;
    }

    list.forEach(contact => {
        const item = document.createElement('div');
        item.className = `contact-item ${currentActiveContactId === contact.id ? 'active' : ''}`;
        item.innerHTML = `
            <div class="avatar ${contact.status === 'ออนไลน์' ? 'online' : ''}"></div>
            <div class="contact-details">
                <span class="name">${contact.name}</span>
                <span class="last-msg">${contact.lastMsg}</span>
            </div>
            <span class="time">${contact.time}</span>
        `;
        item.addEventListener('click', () => selectContact(contact));
        contactListEl.appendChild(item);
    });
}

// เลือกเพื่อนเพื่อเปิดห้องแชท
function selectContact(contact) {
    currentActiveContactId = contact.id;
    renderContacts(contactsData); 

    document.getElementById('activeChatName').textContent = contact.name;
    document.getElementById('activeChatStatus').textContent = contact.status;
    document.getElementById('messageInput').disabled = false;

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    
    // แสดงประวัติแชททั้งหมด
    contact.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.sender}`;
        msgDiv.innerHTML = `
            ${msg.text}
            <span class="msg-time">${msg.time}</span>
        `;
        chatMessages.appendChild(msgDiv);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ค้นหาชื่อเพื่อน,ข้อความ
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    const filtered = contactsData.filter(contact => {
        const matchName = contact.name.toLowerCase().includes(keyword);
        const matchMessage = contact.messages.some(msg => msg.text.toLowerCase().includes(keyword));
        return matchName || matchMessage;
    });
    renderContacts(filtered);
});

// ส่งข้อความ
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');

function sendMessage() {
    const text = messageInput.value.trim();
    if (text === '' || currentActiveContactId === null) return;

    const currentContact = contactsData.find(c => c.id === currentActiveContactId);

    // เพิ่มข้อความใหม่เข้าไปในอาเรย์ของเพื่อน
    const newMsg = { sender: "outgoing", text: text, time: "เมื่อสักครู่" };
    currentContact.messages.push(newMsg);
    currentContact.lastMsg = text;
    currentContact.time = "เมื่อสักครู่";

    // บันทึกข้อมูลในlocalStorage
    saveToLocalStorage();

    // แสดงผลข้อความ
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message outgoing';
    msgDiv.innerHTML = `
        ${text}
        <span class="msg-time">เมื่อสักครู่</span>
    `;
    chatMessages.appendChild(msgDiv);
    messageInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    renderContacts(contactsData);
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// เปิด/ปิดหน้าต่างวิดีโอคอล
const videoModal = document.getElementById('videoModal');
const videoCallBtn = document.getElementById('videoCallBtn');
const closeVideoBtn = document.getElementById('closeVideoBtn');

videoCallBtn.addEventListener('click', () => {
    if (currentActiveContactId === null) {
        alert('กรุณาเลือกเพื่อนในแชทส่วนตัวก่อนเปิดกล้องโทร');
        return;
    }
    videoModal.style.display = 'flex';
});

closeVideoBtn.addEventListener('click', () => {
    videoModal.style.display = 'none';
});

// โหลดรายชื่อเพื่อน
renderContacts(contactsData);