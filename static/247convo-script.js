// File: 247convo-script.js
// Purpose: Main chatbot widget logic, using snake_case client_id throughout.

(function () {
  const DEFAULT_CLIENT_ID = "default";
  const BASE_CONFIG_URL  = "https://two47convo.onrender.com/configs";

  // 1️⃣ Read client_id from loader-injected config, URL, or script tag
  function getClientID() {
    // a) Config injected by loader?
    if (window.__247CONVO_CONFIG__?.client_id) {
      return window.__247CONVO_CONFIG__.client_id;
    }
    // b) URL param
    const params = new URLSearchParams(window.location.search);
    if (params.get("client_id")) {
      return params.get("client_id");
    }
    // c) This script’s own tag
    const src = document.currentScript?.src || "";
    const match = src.match(/[?&]client_id=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    // d) Fallback
    return DEFAULT_CLIENT_ID;
  }

  // 2️⃣ Fetch client config (if not already injected)
  async function loadConfig(client_id) {
    try {
      const res = await fetch(`${BASE_CONFIG_URL}/${client_id}.json`);
      return res.ok ? await res.json() : {};
    } catch {
      return {};
    }
  }

  // 3️⃣ Entry point: initialize widget
  async function run() {
    const client_id = getClientID();
    // Use injected config if available, otherwise fetch
    const config = window.__247CONVO_CONFIG__ || await loadConfig(client_id);

    const {
      token = "",
      chatbotName  = "247Convo Bot",
      brandName    = "247Convo",
      quickOption1 = "What's your pricing?",
      quickOption2 = "How do I integrate?",
      quickOption3 = "Talk to a human",
      supportUrl   = "#",
      avatarUrl    = ""
    } = config;

    // DOM references
    const bubble    = document.getElementById("chat-bubble");
    const popup     = document.getElementById("chatPopup");
    const tooltip   = document.getElementById("chat-bubble-msg");
    const userInput = document.getElementById("userInput");
    const sendBtn   = document.getElementById("sendBtn");
    const header    = document.getElementById("headerBrand");
    const avatar    = document.getElementById("headerAvatar");
    const support   = document.getElementById("supportLink");
    const bubbleSound = document.getElementById("bubbleSound");
    const replySound  = document.getElementById("replySound");

    let chatLog = "";
    let userName = "";
    let userEmail = "";
    let leadSubmitted = false;
    let collecting = "name";

    // Apply branding
    document.title = `${brandName} Chat`;
    if (tooltip) tooltip.innerText = `Need help? Ask ${chatbotName}.`;
    if (header)    header.innerText = `${brandName} Assistant`;
    if (avatar && avatarUrl) {
      avatar.style.backgroundImage = `url('${avatarUrl}')`;
    }
    if (support) {
      support.href = supportUrl;
    }

    // Utility: current time for timestamps
    const now = () =>
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Utility: append a message bubble
    function showMessage(text, isUser = false, isTyping = false, id = "") {
      const chat = document.getElementById("chat");
      if (!chat) return;

      const cls = isUser ? "user" : "bot";
      const avatarHTML = !isUser && avatarUrl
        ? `<div class="bot-avatar" style="background-image:url('${avatarUrl}')"></div>`
        : "";
      const loadingSpan = isTyping
        ? `<span class="typing"><span></span><span></span><span></span></span>`
        : "";
      const ts = !isTyping ? `<span class="timestamp">${now()}</span>` : "";

      const bubbleHTML = `
        <div class="msg-wrapper ${cls}" ${id ? `id="${id}-wrapper"` : ""}>
          ${avatarHTML}
          <p class="${cls}" ${id ? `id="${id}"` : ""}>
            ${text}${loadingSpan}${ts}
          </p>
        </div>
      `;
      chat.insertAdjacentHTML("beforeend", bubbleHTML);
      chat.scrollTop = chat.scrollHeight;
    }

    // Utility: insert quick-reply buttons
    function insertQuickOptions() {
      const chat = document.getElementById("chat");
      if (!chat) return;
      const optionsHTML = `
        <div class="quick-options" id="quickOpts">
          <button onclick="quickAsk('${quickOption1}')">${quickOption1}</button>
          <button onclick="quickAsk('${quickOption2}')">${quickOption2}</button>
          <button onclick="quickAsk('${quickOption3}')">${quickOption3}</button>
        </div>
      `;
      chat.insertAdjacentHTML("beforeend", optionsHTML);
      chat.scrollTop = chat.scrollHeight;
    }

    // Handle user input (name, email, or regular chat)
    async function handleInput() {
      const txt = userInput.value.trim();
      if (!txt) return;
      showMessage(txt, true);
      userInput.value = "";

      // Lead collection flow
      if (!leadSubmitted) {
        if (collecting === "name") {
          userName = txt;
          collecting = "email";
          showMessage(`Great, ${userName}! Now, what’s your email?`);
        } else if (collecting === "email") {
          userEmail = txt;
          if (!userEmail.includes("@")) {
            showMessage("❌ Please enter a valid email.");
            return;
          }
          collecting = "done";
          leadSubmitted = true;
          showMessage(`✅ Thanks, ${userName}! I’m ${chatbotName}. How can I help?`);
          insertQuickOptions();
        }
        return;
      }

      // Regular chat message
      await sendMessage(txt);
    }

    // Send message to backend and display response
    async function sendMessage(txt) {
      const id = `msg-${Date.now()}`;
      showMessage("", false, true, id);
      chatLog += `You: ${txt}\n`;

      if (!token) {
        document.getElementById(id).innerText = "❌ Missing configuration token.";
        return;
      }

      try {
        const res = await fetch("https://two47convobot.onrender.com/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: txt,
            token: token,
            client_id: client_id
          })
        });
        const data = await res.json();
        // Replace typing placeholder
        const wrapper = document.getElementById(`${id}-wrapper`);
        if (wrapper) wrapper.remove();
        showMessage(`${chatbotName}: ${data.answer}`, false);
        replySound?.play();
        chatLog += `${chatbotName}: ${data.answer}\n`;
      } catch {
        const errElem = document.getElementById(id);
        if (errElem) errElem.innerText = "⚠️ Something went wrong.";
      }
    }

    // Quick-reply handler
    window.quickAsk = (txt) => {
      document.getElementById("quickOpts")?.remove();
      userInput.value = txt;
      handleInput();
    };

    // Toggle chat popup visibility
    window.toggleChat = () => {
      const isOpen = popup.classList.contains("open");
      popup.classList.toggle("open", !isOpen);
      tooltip.style.display = isOpen ? "block" : "none";
      if (!isOpen) bubbleSound?.play();
      if (!leadSubmitted && !isOpen) {
        showMessage("👋 Hi there! What’s your name?");
      }
    };

    // Event listeners
    bubble?.addEventListener("click", window.toggleChat);
    sendBtn?.addEventListener("click", handleInput);
    userInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleInput();
    });

    // Send summary on page unload
    window.addEventListener("beforeunload", () => {
      if (leadSubmitted && chatLog.trim()) {
        fetch("https://two47convobot.onrender.com/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: userName,
            email: userEmail,
            chat_log: chatLog,
            token: token,
            client_id: client_id
          })
        }).catch(() => {});
      }
    });

    // Play bubble sound once on first interaction
    let soundPlayed = false;
    function playBubbleSoundOnce() {
      if (!soundPlayed) {
        bubbleSound?.play();
        soundPlayed = true;
      }
    }
    ["click", "scroll", "mousemove", "keydown"].forEach(ev =>
      window.addEventListener(ev, playBubbleSoundOnce, { once: true })
    );
  }

  // Initialize on DOMContentLoaded
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
