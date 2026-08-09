const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const attachButton = document.getElementById("attachButton");
const fileInput = document.getElementById("fileInput");
const attachments = document.getElementById("attachments");
const messages = document.getElementById("messages");
const welcomeScreen = document.getElementById("welcomeScreen");
const chatContainer = document.getElementById("chatContainer");
const newChatButton = document.getElementById("newChatButton");

let selectedFiles = [];

function resizeInput() {
  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 250) + "px";
}

messageInput.addEventListener("input", resizeInput);

attachButton.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const files = Array.from(fileInput.files);

  for (const file of files) {
    const exists = selectedFiles.some(
      item =>
        item.name === file.name &&
        item.size === file.size
    );

    if (!exists) {
      selectedFiles.push(file);
    }
  }

  fileInput.value = "";

  renderAttachments();
});

function renderAttachments() {
  attachments.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const item = document.createElement("div");

    item.className = "attachment";

    const name = document.createElement("span");
    name.textContent = `📎 ${file.name}`;

    const remove = document.createElement("button");

    remove.className = "remove-attachment";
    remove.type = "button";
    remove.textContent = "×";

    remove.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderAttachments();
    });

    item.appendChild(name);
    item.appendChild(remove);

    attachments.appendChild(item);
  });
}

async function sendMessage() {
  const text = messageInput.value.trim();

  if (!text && selectedFiles.length === 0) {
    return;
  }

  const files = [...selectedFiles];

  addUserMessage(text, files);

  welcomeScreen.style.display = "none";

  messageInput.value = "";
  messageInput.style.height = "auto";

  selectedFiles = [];

  renderAttachments();

  sendButton.disabled = true;

  try {
    const formData = new FormData();

    formData.append("message", text);

    files.forEach(file => {
      formData.append("files", file);
    });

    const response = await fetch("/api/chat", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Request failed"
      );
    }

    addAssistantMessage(
      data.reply || "تم استلام الرسالة."
    );

  } catch (error) {
    console.error(error);

    addAssistantMessage(
      "حدث خطأ أثناء الاتصال بالسيرفر."
    );

  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
}

sendButton.addEventListener(
  "click",
  sendMessage
);

messageInput.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  }
);

function addUserMessage(text, files) {
  const wrapper = document.createElement("div");

  wrapper.className = "message user";

  const bubble = document.createElement("div");

  bubble.className = "message-bubble";

  if (text) {
    const textElement =
      document.createElement("div");

    textElement.textContent = text;

    bubble.appendChild(textElement);
  }

  if (files.length) {
    const filesBox =
      document.createElement("div");

    filesBox.style.marginTop =
      text ? "12px" : "0";

    files.forEach(file => {
      const fileElement =
        document.createElement("div");

      fileElement.style.padding = "8px 10px";
      fileElement.style.marginTop = "6px";
      fileElement.style.borderRadius = "9px";
      fileElement.style.background =
        "rgba(57,255,136,0.07)";
      fileElement.style.fontSize = "12px";

      fileElement.textContent =
        `📎 ${file.name}`;

      filesBox.appendChild(fileElement);
    });

    bubble.appendChild(filesBox);
  }

  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);

  scrollToBottom();
}

function addAssistantMessage(text) {
  const wrapper = document.createElement("div");

  wrapper.className =
    "message assistant";

  const bubble = document.createElement("div");

  bubble.className = "message-bubble";

  renderContent(bubble, text);

  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);

  scrollToBottom();
}

function renderContent(container, text) {
  const codeRegex =
    /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;

  while (
    (match = codeRegex.exec(text)) !== null
  ) {
    const before =
      text.slice(lastIndex, match.index);

    if (before) {
      const paragraph =
        document.createElement("div");

      paragraph.textContent = before;

      container.appendChild(paragraph);
    }

    const language =
      match[1] || "code";

    const code =
      match[2];

    container.appendChild(
      createCodeBlock(language, code)
    );

    lastIndex =
      codeRegex.lastIndex;
  }

  const remaining =
    text.slice(lastIndex);

  if (remaining) {
    const paragraph =
      document.createElement("div");

    paragraph.textContent = remaining;

    container.appendChild(paragraph);
  }
}

function createCodeBlock(language, code) {
  const block =
    document.createElement("div");

  block.className = "code-block";

  const header =
    document.createElement("div");

  header.className = "code-header";

  const languageLabel =
    document.createElement("span");

  languageLabel.textContent = language;

  const copyButton =
    document.createElement("button");

  copyButton.className = "copy-code";
  copyButton.type = "button";
  copyButton.textContent = "نسخ";

  copyButton.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(code);

        copyButton.textContent =
          "تم النسخ ✓";

        setTimeout(() => {
          copyButton.textContent = "نسخ";
        }, 1500);

      } catch {
        copyButton.textContent =
          "فشل النسخ";
      }
    }
  );

  header.appendChild(languageLabel);
  header.appendChild(copyButton);

  const pre =
    document.createElement("pre");

  pre.className = "code-content";

  const codeElement =
    document.createElement("code");

  codeElement.textContent = code;

  pre.appendChild(codeElement);

  block.appendChild(header);
  block.appendChild(pre);

  return block;
}

newChatButton.addEventListener(
  "click",
  () => {
    messages.innerHTML = "";

    selectedFiles = [];

    renderAttachments();

    messageInput.value = "";

    messageInput.style.height = "auto";

    welcomeScreen.style.display = "block";

    messageInput.focus();
  }
);

function scrollToBottom() {
  setTimeout(() => {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: "smooth"
    });
  }, 50);
}
