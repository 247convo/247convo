// === 247Convo Chat Logic with config loader ===
(function () {
  const CONFIG_URL = "https://two47convo.onrender.com/config.json";

  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_URL);
      if (!res.ok) throw new Error("Failed to load config");
      return await res.json();
    } catch (err) {
      console.error("❌ Error loading config.json:", err);
      return {};
    }
  }

  const run = async () => {
    const config = await loadConfig();

    const {
      chatbotName = "247Convo Bot",
      brandName = "247Convo",
      quickOption1 = "What's your pricing?",
      quickOption2 = "How do I integrate?",
      quickOption3 = "Talk to a human",
      supportUrl = "https://two47convo.com/support",
      token = "",
    } = config;

    const bubble = document.getElementById('chat-bubble');
    const popup = document.getElementById('chatPopup');
    const msg = document.getElementById('chat-bubble-msg');
    const snd = document.getElementById('bubbleSound');

    if (!bubble || !popup) return;

    let chatLog = '';
    let userName = '';
    let userEmail = '';
    let leadSubmitted = false;
    let collecting = 'name'; // name > email > ready

    // Inject text
    document.title = `${brandName} Chat Widget`;
    if (msg) msg.innerText = `Need help? Ask ${chatbotName}.`;

    const header = popup.querySelector('.chat-header');
    if (header) header.childNodes[0].textContent = `${brandName} Assistant`;

    const supportLink = document.querySelector('.support-link a');
    if (supportLink) supportLink.href = supportUrl;

    // === Toggle popup ===
    window.toggleChat = () => {
      const isOpen = popup.classList.contains('open');
      popup.classList.toggle('open', !isOpen);
      msg.style.display = isOpen ? 'block' : 'none';
      if (!isOpen) snd?.play();

      if (!leadSubmitted) {
        showMessage(`👋 Hello! Before we begin, what’s your **first name**?`);
      }
    };

    bubble.addEventListener('click', window.toggleChat);

    const now = () =>
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const showMessage = (text, isUser = false) => {
      const chat = document.getElementById('chat');
      const className = isUser ? 'user' : 'bot';
      const prefix = isUser ? '🙋 You: ' : '';
      chat.innerHTML += `<p class="${className}">${prefix}${text}<span class="timestamp">${now()}</span></p>`;
      chat.scrollTop = chat.scrollHeight;
    };

    const insertQuickOptions = () => {
      const chat = document.getElementById('chat');
      chat.innerHTML += `
        <div class="quick-options" id="quickOpts">
          <button onclick="quickAsk('${quickOption1}')">${quickOption1}</button>
          <button onclick="quickAsk('${quickOption2}')">${quickOption2}</button>
          <button onclick="quickAsk('${quickOption3}')">${quickOption3}</button>
        </div>`;
    };

    window.handleKey = e => {
      if (e.key === 'Enter') handleInput();
    };

    window.quickAsk = txt => {
      document.getElementById('quickOpts')?.remove();
      document.getElementById('userInput').value = txt;
      handleInput();
    };

    const handleInput = () => {
      const input = document.getElementById('userInput');
      const txt = input.value.trim();
      if (!txt) return;

      showMessage(txt, true);
      input.value = '';

      if (!leadSubmitted) {
        if (collecting === 'name') {
          userName = txt;
          showMessage(`Great, ${userName}! Now, what’s your email?`);
          collecting = 'email';
        } else if (collecting === 'email') {
          userEmail = txt;
          if (!userEmail.includes('@')) {
            showMessage(`❌ That doesn’t look like a valid email. Please try again.`);
            return;
          }
          collecting = 'done';
          leadSubmitted = true;
          showMessage(`✅ Thanks, ${userName}! I’m ${chatbotName}. How can I help you today?`);
          insertQuickOptions();
        }
        return;
      }

      sendMessage(txt);
    };

    const sendMessage = async (txt) => {
      const chat = document.getElementById('chat');
      const id = 'load-' + Date.now();
      chat.innerHTML += `<p class="bot" id="${id}">${chatbotName} is thinking…</p>`;
      chat.scrollTop = chat.scrollHeight;

      chatLog += `You: ${txt}\n`;

      try {
        const res = await fetch('https://two47convobot.onrender.com/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: txt, token: token })
        });
        const data = await res.json();

        document.getElementById(id).outerHTML =
          `<p class="bot">${chatbotName}: ${data.answer}<span class="timestamp">${now()}</span></p>`;
        document.getElementById('replySound')?.play();

        chatLog += `${chatbotName}: ${data.answer}\n`;
      } catch {
        document.getElementById(id).innerText = '⚠️ Sorry, something went wrong.';
      }

      chat.scrollTop = chat.scrollHeight;
    };

    // Save summary on refresh
    window.addEventListener('beforeunload', () => {
      if (leadSubmitted && chatLog.trim()) {
        fetch('https://two47convobot.onrender.com/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userEmail,
            name: userName,
            chat_log: chatLog,
            token: token
          })
        }).catch(() => {});
      }
    });

    // Play welcome sound once
    let soundPlayed = false;
    const playBubbleSoundOnce = () => {
      if (!soundPlayed) {
        snd?.play();
        soundPlayed = true;
      }
    };
    ['click', 'scroll', 'mousemove', 'keydown'].forEach(ev =>
      window.addEventListener(ev, playBubbleSoundOnce, { once: true })
    );
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
