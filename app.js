"use strict";

const API_BASE_URL =
  "https://ozxe4wjvhrpmrek5n2d42qhcgq0qnlte.lambda-url.us-east-1.on.aws";
const CHAT_ENDPOINT = `${API_BASE_URL}/chat`;
const STORAGE_KEY = "qwen-chat-history-v1";
const THEME_KEY = "qwen-chat-theme";
const MAX_STORED_CHATS = 20;

const elements = {
  chatForm: document.querySelector("#chatForm"),
  chatMain: document.querySelector("#chatMain"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  historyList: document.querySelector("#historyList"),
  menuButton: document.querySelector("#menuButton"),
  messageInput: document.querySelector("#messageInput"),
  messages: document.querySelector("#messages"),
  newChatButton: document.querySelector("#newChatButton"),
  sendButton: document.querySelector("#sendButton"),
  sidebar: document.querySelector("#sidebar"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
  welcomePanel: document.querySelector("#welcomePanel"),
};

let chats = loadChats();
let activeChatId = chats[0]?.id ?? null;
let requestInFlight = false;
let toastTimer;

initializeTheme();
renderHistory();
renderActiveChat();
checkConnection();

elements.chatForm.addEventListener("submit", handleSubmit);
elements.messageInput.addEventListener("input", handleInput);
elements.messageInput.addEventListener("keydown", handleInputKeydown);
elements.themeToggle.addEventListener("click", toggleTheme);
elements.newChatButton.addEventListener("click", startNewChat);
elements.clearHistoryButton.addEventListener("click", clearHistory);
elements.menuButton.addEventListener("click", openSidebar);
elements.sidebarScrim.addEventListener("click", closeSidebar);

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.messageInput.value = button.dataset.prompt;
    handleInput();
    elements.messageInput.focus();
  });
});

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return [];

    return saved.filter(
      (chat) =>
        chat &&
        typeof chat.id === "string" &&
        Array.isArray(chat.messages) &&
        typeof chat.updatedAt === "number",
    );
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_STORED_CHATS)));
  } catch {
    showToast("History could not be saved on this device.");
  }
}

function getActiveChat() {
  return chats.find((chat) => chat.id === activeChatId) ?? null;
}

function createChat(firstMessage) {
  const chat = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    title: firstMessage.slice(0, 48),
    updatedAt: Date.now(),
    messages: [],
  };

  chats.unshift(chat);
  activeChatId = chat.id;
  return chat;
}

function renderHistory() {
  elements.historyList.replaceChildren();

  if (!chats.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your conversations will appear here.";
    elements.historyList.append(empty);
    return;
  }

  chats.forEach((chat) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `history-item${chat.id === activeChatId ? " active" : ""}`;
    button.setAttribute("aria-label", `Open chat: ${chat.title}`);

    const title = document.createElement("p");
    title.textContent = chat.title;

    const time = document.createElement("time");
    time.dateTime = new Date(chat.updatedAt).toISOString();
    time.textContent = formatRelativeDate(chat.updatedAt);

    button.append(title, time);
    button.addEventListener("click", () => {
      activeChatId = chat.id;
      renderHistory();
      renderActiveChat();
      closeSidebar();
    });
    elements.historyList.append(button);
  });
}

function renderActiveChat() {
  const chat = getActiveChat();
  elements.messages.replaceChildren();

  if (!chat?.messages.length) {
    elements.messages.append(elements.welcomePanel);
    return;
  }

  chat.messages.forEach((message) => {
    elements.messages.append(createMessageElement(message.role, message.content));
  });
  scrollToBottom(false);
}

function createMessageElement(role, content, options = {}) {
  const row = document.createElement("article");
  row.className = `message-row ${role}${options.error ? " error" : ""}`;

  const contentBox = document.createElement("div");
  contentBox.className = "message-content";

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "Q";
    avatar.setAttribute("aria-hidden", "true");
    row.append(avatar);

    const label = document.createElement("p");
    label.className = "message-label";
    label.textContent = options.error ? "Connection issue" : "Qwen";
    contentBox.append(label);
  }

  const text = document.createElement("p");
  text.className = "message-text";
  text.textContent = content;
  contentBox.append(text);
  row.append(contentBox);
  return row;
}

function createTypingElement() {
  const row = document.createElement("article");
  row.className = "message-row assistant";
  row.id = "typingIndicator";
  row.setAttribute("aria-label", "Qwen is responding");

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "Q";
  avatar.setAttribute("aria-hidden", "true");

  const dots = document.createElement("div");
  dots.className = "typing-dots";
  dots.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));

  row.append(avatar, dots);
  return row;
}

async function handleSubmit(event) {
  event.preventDefault();
  const message = elements.messageInput.value.trim();
  if (!message || requestInFlight) return;

  requestInFlight = true;
  updateComposerState();

  const chat = getActiveChat() ?? createChat(message);
  chat.messages.push({ role: "user", content: message });
  chat.updatedAt = Date.now();
  chats = [chat, ...chats.filter((item) => item.id !== chat.id)];
  saveChats();
  renderHistory();

  elements.welcomePanel.remove();
  elements.messages.append(createMessageElement("user", message));
  const typing = createTypingElement();
  elements.messages.append(typing);

  elements.messageInput.value = "";
  resizeInput();
  scrollToBottom();

  try {
    const requestMethod = "POST";
    const requestHeaders = { "Content-Type": "application/json" };
    const requestBody = { message, max_tokens: 768, temperature: 0.7 };

    console.log("[Qwen API] Request URL:", CHAT_ENDPOINT);
    console.log("[Qwen API] Request method:", requestMethod);
    console.log("[Qwen API] Request headers:", requestHeaders);
    console.log("[Qwen API] Request body:", requestBody);

    const response = await fetch(CHAT_ENDPOINT, {
      method: requestMethod,
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    const data = await parseResponse(response);
    console.log("[Qwen API] Response status:", response.status, response.statusText);
    console.log("[Qwen API] Response:", data);

    if (!response.ok) {
      throw new Error(data.detail || `The server returned ${response.status}.`);
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("The model returned an empty response.");
    }

    typing.remove();
    chat.messages.push({ role: "assistant", content: data.reply });
    chat.updatedAt = Date.now();
    saveChats();
    renderHistory();
    elements.messages.append(createMessageElement("assistant", data.reply));
    setConnectionStatus("online", "Connected");
  } catch (error) {
    console.error("[Qwen API] Request failed:", {
      url: CHAT_ENDPOINT,
      method: "POST",
      error,
    });
    typing.remove();
    const browserBlocked = error instanceof TypeError;
    const messageText = browserBlocked
      ? "The browser could not reach the chat service. Check that CORS is enabled on the Lambda endpoint."
      : error.message || "Something went wrong. Please try again.";
    elements.messages.append(
      createMessageElement("assistant", messageText, { error: true }),
    );
    setConnectionStatus("offline", "Connection unavailable");
  } finally {
    requestInFlight = false;
    updateComposerState();
    elements.messageInput.focus();
    scrollToBottom();
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return { detail: (await response.text()) || "Unexpected server response." };
}

async function checkConnection() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Health check failed");
    setConnectionStatus("online", "Connected");
  } catch {
    setConnectionStatus("offline", "Connection unavailable");
  }
}

function setConnectionStatus(state, label) {
  elements.connectionStatus.className = `connection-status ${state}`;
  elements.connectionStatus.querySelector("span:last-child").textContent = label;
}

function handleInput() {
  resizeInput();
  updateComposerState();
}

function resizeInput() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 145)}px`;
}

function updateComposerState() {
  elements.sendButton.disabled =
    requestInFlight || !elements.messageInput.value.trim();
  elements.sendButton.setAttribute("aria-label", requestInFlight ? "Waiting for response" : "Send message");
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
}

function startNewChat() {
  activeChatId = null;
  renderHistory();
  renderActiveChat();
  closeSidebar();
  elements.messageInput.focus();
}

function clearHistory() {
  if (!chats.length) {
    showToast("There is no history to clear.");
    return;
  }

  if (!globalThis.confirm("Clear all chat history from this device?")) return;
  chats = [];
  activeChatId = null;
  saveChats();
  renderHistory();
  renderActiveChat();
  showToast("Chat history cleared.");
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const preferredTheme = matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
  applyTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : preferredTheme);
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  elements.themeToggle.querySelector(".theme-icon").textContent = isDark ? "☼" : "☾";
  elements.themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
}

function openSidebar() {
  elements.sidebar.classList.add("open");
  elements.sidebarScrim.classList.add("visible");
  elements.menuButton.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarScrim.classList.remove("visible");
  elements.menuButton.setAttribute("aria-expanded", "false");
}

function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    elements.chatMain.scrollTo({
      top: elements.chatMain.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  });
}

function formatRelativeDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}
