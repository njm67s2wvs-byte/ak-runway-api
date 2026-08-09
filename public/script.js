const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messages = document.getElementById("messages");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = `message ${type}`;

  if (type === "user") {
    message.innerHTML = `
      <div class="bubble">
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  } else {
    message.innerHTML = `
      <div class="avatar">AK</div>
      <div class="bubble">
        <div class="message-name">AK Assistant</div>
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  }

  messages.appendChild(message);

  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: "smooth"
  });
}

async function sendMessage() {
  const message = messageInput.value.trim();

  if (!message) return;

  addMessage(message, "user");

  messageInput.value = "";
  messageInput.style.height = "auto";

  sendButton.disabled = true;
  sendButton.textContent = "جاري الإرسال...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message
      })
    });

    const data = await response.json();

    if (data.success) {
      addMessage(data.reply, "assistant");
    } else {
      addMessage("حدث خطأ أثناء معالجة الرسالة.", "assistant");
    }

  } catch (error) {
    console.error(error);
    addMessage("تعذر الاتصال بالسيرفر.", "assistant");
  }

  sendButton.disabled = false;
  sendButton.textContent = "إرسال";
}

sendButton.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 250) + "px";
});
