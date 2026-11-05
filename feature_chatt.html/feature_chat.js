let chatsData = [
    {
        id: 1,
        name: "@งดทักยืมตังค์_Devvy",
        status: "ออนไลน์",
        time: "23:07",
        messages: [
            { sender: "incoming", text: "สวัสดีครับ java ที่ผมเคยช่วยคุณไปเป็นยังไงบ้าง?", time: "23:00" },
            { sender: "outgoing", text: "แอบยากนิดหน่อย แต่กำลังฝึกอยู่ครับ", time: "23:10" }
            
        ]
    },
    {
        id: 2,
        name: "@เทพไม่รวมกลุ่ม_และไม่ทำงานด้วย",
        status: "ออฟไลน์",
        time: "21:15",
        messages: [
            { sender: "incoming", text: "พี่ สอนเขียนโปรแกรมให้หน่อยคับ", time: "21:10" },
            { sender: "outgoing", text: "เอาไว้ทำโปรเจคเสร็จเดี๋ยวสอนให้ แต่พี่ยังได้แค่พื้นฐานนะ", time: "21:15" } ,
            { sender: "incoming", text: "ขอบคุณครับ", time: "21:21" },
            
        ]
    },
    {
        id: 3,
        name: "@Anucha_spu",
        status: "ออนไลน์",
        time: "19:40",
        messages: [
            { sender: "incoming", text: "พรุ่งนี้เจอกันกี่โมงครับ", time: "19:40" }
        ]
    }
];

//เก็บIDแชท
let currentChatId = 1;


const contactListEl = document.getElementById('contactList');
const chatMessagesEl = document.getElementById('chatMessages');
const activeChatNameEl = document.getElementById('activeChatName');
const activeChatStatusEl = document.getElementById('activeChatStatus');
const activeChatAvatarEl = document.getElementById('activeChatAvatar');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const searchInput = document.getElementById('searchInput');




//ฟังก์ชันเรนเดอร์รายชื่อเพื่อน
function renderContacts(filterText = "") {
    contactListEl.innerHTML = "";

    const filteredChats = chatsData.filter(chat => 
        chat.name.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filteredChats.length === 0) {
        contactListEl.innerHTML = `<p style="color: #64748b; font-size: 12px; padding: 10px; text-align: center;">ไม่พบชื่อผู้ใช้งาน</p>`;
        return;
    }

    filteredChats.forEach(chat => {
        const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : "";
        
        const contactDiv = document.createElement('div');
        contactDiv.classList.add('contact-item');
        if (chat.id === currentChatId) {
            contactDiv.classList.add('active');
        }

        contactDiv.innerHTML = `
            <div class="avatar online"></div>
            <div class="contact-details">
                <span class="name">${chat.name}</span>
                <span class="last-msg">${lastMsg}</span>
            </div>
            <span class="time">${chat.time}</span>
        `;

        //กดสลับแชท
        contactDiv.addEventListener('click', () => {
            currentChatId = chat.id;
            renderContacts(searchInput.value);
            renderChatWindow();
        });

        contactListEl.appendChild(contactDiv);
    });
}

//แสดงหน้าแชท
function renderChatWindow() {
    const currentChat = chatsData.find(chat => chat.id === currentChatId);
    if (!currentChat) return;

    //อัปเดตข้อมูลหัวข้อแชทฝขวา
    activeChatNameEl.textContent = currentChat.name;
    activeChatStatusEl.textContent = currentChat.status;
    
    if (currentChat.status === "ออนไลน์") {
        activeChatAvatarEl.classList.add('online');
    } else {
        activeChatAvatarEl.classList.remove('online');
    }

    //ล้าง-เติมข้อความในกล่องแชท
    chatMessagesEl.innerHTML = "";
    currentChat.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', msg.sender);
        msgDiv.innerHTML = `
            <p>${escapeHtml(msg.text)}</p>
            <span class="msg-time">${msg.time}</span>
        `;
        chatMessagesEl.appendChild(msgDiv);
    });

    //เลื่อนลงล่าง
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

//ส่งข้อความใหม่
function sendMessage() {
    const text = messageInput.value.trim();
    if (text === "") return;

    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                       now.getMinutes().toString().padStart(2, '0');

    const currentChat = chatsData.find(chat => chat.id === currentChatId);
    if (currentChat) {
        //บันทึกข้อความลงในข้อมูลแชท
        currentChat.messages.push({
            sender: "outgoing",
            text: text,
            time: timeString
        });
        currentChat.time = timeString;
    }

    messageInput.value = "";
    renderChatWindow();
    renderContacts(searchInput.value);
}

//XSS 
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

//พิมพค้นหา
searchInput.addEventListener('input', (e) => {
    renderContacts(e.target.value);
});

//ส่งข้อความใส่คีย์enterไว้ด้วย
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

//เริ่มโหลดหน้าเว็บครั้ง1 ถ้าไม่จำเป็นก็ลบออก
renderContacts();
renderChatWindow();