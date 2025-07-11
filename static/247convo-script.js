// File: 247convo-script.js
// Purpose: Main chatbot widget logic with defensive DOM checks

(function () {
  const DEFAULT_CLIENT_ID = "default";
  const BASE_CONFIG_URL  = "https://two47convobot.onrender.com/configs";

  // 1️⃣ Read client_id consistently
  function getClientID() {
    if (window.__247CONVO_CONFIG__?.client_id) {
      return window.__247CONVO_CONFIG__.client_id;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("client_id")) return params.get("client_id");
    const src = document.currentScript?.src || "";
    const m = src.match(/[?&]client_id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : DEFAULT_CLIENT_ID;
  }

  // 2️⃣ Fetch config if not already injected
  async function loadConfig(client_id) {
    try {
      const res = await fetch(`${BASE_CONFIG_URL}/${client_id}.json`);
      return res.ok ? await res.json() : {};
    } catch {
      return {};
    }
  }

  // 3️⃣ Utility: get current time
  const now = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // 4️⃣ Entry point
  async function run() {
    const client_id = getClientID();
    const config    = window.__247CONVO_CONFIG__ || await loadConfig(client_id);

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

    // DOM refs (may not exist yet until fragment injected)
    const getEl = id => document.getElementById(id);
    const bubble    = getEl("chat-bubble");
    const popup     = getEl("chatPopup");
    const tooltip   = getEl("chat-bubble-msg");
    const userInput = getEl("userInput");
    const sendBtn   = getEl("sendBtn");
    const header    = getEl("headerBrand");
    const avatar    = getEl("headerAvatar");
    const support   = getEl("supportLink");
    const bubbleSound = getEl("bubbleSound");
    const replySound  = getEl("replySound");
    const chatBox     = getEl("chat");

    let chatLog = "";
    let userName = "";
    let userEmail = "";
    let leadSubmitted = false;
    let collecting = "name";

    // Apply branding if elements exist
    if (header)  header.innerText = `${brandName} Assistant`;
    if (avatar && avatarUrl) avatar.style.backgroundImage = `url('${avatarUrl}')`;
    if (support) support.href = supportUrl;
    if (tooltip) tooltip.innerText = `Need help? Ask ${chatbotName}.`;
    document.title = `${brandName} Chat`;

    // Safe showMessage
    function showMessage(text, isUser = false, isTyping = false, id = "") {
      const chat = getEl("chat");
      if (!chat) return;
      const cls = isUser ? "user" : "bot";
      const avatarHTML = (!isUser && avatarUrl)
        ? `<div class="bot-avatar" style="background-image:url('${avatarUrl}')"></div>`
        : "";
      const typingHTML = isTyping
        ? `<span class="typing"><span></span><span></span><span></span></span>`
        : "";
      const tsHTML = !isTyping
        ? `<span class="timestamp">${now()}</span>`
        : "";
      const wrapperID = id ? `id="${id}-wrapper"` : "";
      const bubbleID  = id ? `id="${id}"` : "";

      chat.insertAdjacentHTML("beforeend", `
        <div class="msg-wrapper ${cls}" ${wrapperID}>
          ${avatarHTML}
          <p class="${cls}" ${bubbleID}>
            ${text}${typingHTML}${tsHTML}
          </p>
        </div>
      `);
      chat.scrollTop = chat.scrollHeight;
    }

    // Safe insert quick options
    function insertQuickOptions() {
      const chat = getEl("chat");
      if (!chat) return;
      chat.insertAdjacentHTML("beforeend", `
        <div class="quick-options" id="quickOpts">
          <button onclick="quickAsk('${quickOption1}')">${quickOption1}</button>
          <button onclick="quickAsk('${quickOption2}')">${quickOption2}</button>
          <button onclick="quickAsk('${quickOption3}')">${quickOption3}</button>
        </div>
      `);
      chat.scrollTop = chat.scrollHeight;
    }

    // Handle input (name/email or chat)
    async function handleInput() {
      if (!userInput) return;
      const txt = userInput.value.trim();
      if (!txt) return;
      showMessage(txt, true);
      userInput.value = "";

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

      // Send to backend
      await sendMessage(txt);
    }

    // Send message and display response
    async function sendMessage(txt) {
      const id = `msg-${Date.now()}`;
      showMessage("", false, true, id);
      chatLog += `You: ${txt}\n`;

      if (!token) {
        const errEl = getEl(id);
        if (errEl) errEl.innerText = "❌ Missing token";
        return;
      }

      try {
        const res = await fetch("https://two47convobot.onrender.com/chat", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ question: txt, token, client_id })
        });
        const data = await res.json();
        // remove typing
        const wrapper = getEl(`${id}-wrapper`);
        if (wrapper) wrapper.remove();
        showMessage(`${chatbotName}: ${data.answer}`, false);
        replySound?.play();
        chatLog += `${chatbotName}: ${data.answer}\n`;
      } catch {
        const errEl = getEl(id);
        if (errEl) errEl.innerText = "⚠️ Something went wrong";
      }
    }

    // Quick replies
    window.quickAsk = (txt) => {
      getEl("quickOpts")?.remove();
      if (userInput) userInput.value = txt;
      handleInput();
    };

    // Toggle chat popup with null-checks
    window.toggleChat = () => {
      const p = getEl("chatPopup");
      const t = getEl("chat-bubble-msg");
      if (!p || !t) {
        console.warn("toggleChat: elements not ready");
        return;
      }
      const open = p.classList.contains("open");
      p.classList.toggle("open", !open);
      t.style.display = open ? "block" : "none";
      if (!open) {
        bubbleSound?.play();
        if (!leadSubmitted) showMessage("👋 Hi there! What’s your name?");
      }
    };

    // Event hookups
    bubble?.addEventListener("click", window.toggleChat);
    sendBtn?.addEventListener("click", handleInput);
    userInput?.addEventListener("keydown", e => {
      if (e.key === "Enter") handleInput();
    });

    // Summary on unload
    window.addEventListener("beforeunload", () => {
      if (leadSubmitted && chatLog.trim()) {
        fetch("https://two47convobot.onrender.com/summary", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            name: userName,
            email: userEmail,
            chat_log: chatLog,
            token,
            client_id
          })
        }).catch(() => {});
      }
    });

    // Play bubble sound once on first interaction
    let played = false;
    const playOnce = () => {
      if (!played) {
        bubbleSound?.play();
        played = true;
      }
    };
    ["click","scroll","mousemove","keydown"].forEach(ev =>
      window.addEventListener(ev, playOnce, { once: true })
    );
  }

  // Start
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
