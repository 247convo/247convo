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

    // Inject text based on config
    document.title = `${brandName} Chat Widget`;
    if (msg) msg.innerText = `Need help? Ask ${chatbotName}.`;

    const header = popup.querySelector('.chat-header');
    if (header) header.childNodes[0].textContent = `${brandName} Assistant`;

    const supportLink = document.querySelector('.support-link a');
    if (supportLink) supportLink.href = supportUrl;

    const quickOpts = document.getElementById('quickOpts');
    if (quickOpts) {
      quickOpts.innerHTML = `
        <button onclick="quickAsk('${quickOption1}')">${quickOption1}</button>
        <button onclick="quickAsk('${quickOption2}')">${quickOption2}</button>
        <button onclick="quickAsk('${quickOption3}')">${quickOption3}</button>
      `;
    }

    // === Toggle popup ===
    window.toggleChat = () => {
      const isOpen = popup.classList.contains('open');
      popup.classList.toggle('open', !isOpen);
      msg.style.display = isOpen ? 'block' : 'none';
      if (!isOpen) snd?.play();
    };

    bubble.addEventListener('click', window.toggleChat);

    const now = () =>
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    window.handleKey = e => {
      if (e.key === 'Enter') {
        if (!leadSubmitted) submitLead();
        else sendMessage();
      }
    };

    window.quickAsk = txt => {
      document.getElementById('quickOpts')?.style.setProperty('display', 'none');
      document.getElementById('userInput').value = txt;
      sendMessage();
    };

    window.submitLead = () => {
      const name = document.getElementById('leadName')?.value.trim();
      const email = document.getElementById('leadEmail')?.value.trim();
      const errorBox = document.getElementById('leadError');
      const startBtn = document.querySelector('#leadForm button');

      if (!name || !email) {
        errorBox.textContent = 'Please enter both name and email to start.';
        errorBox.style.display = 'block';
        return;
      }

      errorBox.style.display = 'none';
      startBtn.innerText = 'Starting Chat… ⏳';
      startBtn.disabled = true;

      setTimeout(() => {
        userName = name;
        userEmail = email;
        leadSubmitted = true;

        // ✅ Just hide lead form and show chatBox
        document.getElementById('leadForm')?.classList.add('hidden');
        document.getElementById('chatBox')?.classList.remove('hidden');

        const chat = document.getElementById('chat');
        chat.innerHTML = `
          <p class="bot">
            Hi <strong>${userName}</strong>! I’m <strong>${chatbotName}</strong>. How can I help you today?
            <span class="timestamp">${now()}</span>
          </p>
          <div class="quick-options" id="quickOpts">
            <button onclick="quickAsk('${quickOption1}')">${quickOption1}</button>
            <button onclick="quickAsk('${quickOption2}')">${quickOption2}</button>
            <button onclick="quickAsk('${quickOption3}')">${quickOption3}</button>
          </div>
        `;
      }, 1200);
    };

    window.sendMessage = async () => {
      const input = document.getElementById('userInput');
      const txt = input.value.trim();
      if (!txt) return;

      const chat = document.getElementById('chat');
      chat.innerHTML +=
        `<p class="user">🙋 You: ${txt}<span class="timestamp">${now()}</span></p>`;
      input.value = '';
      document.getElementById('quickOpts')?.style.setProperty('display', 'none');

      const id = 'load-' + Date.now();
      chat.innerHTML += `<p class="bot" id="${id}">${chatbotName} is thinking…</p>`;
      chat.scrollTop = chat.scrollHeight;

      chatLog += `You: ${txt}\n`;

      try {
        const res = await fetch('https://two47convobot.onrender.com/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: txt,
            token: token
          })
        });
        const data = await res.json();

        document.getElementById(id).outerHTML =
          `<p class="bot">${chatbotName}: ${data.answer}<span class="timestamp">${now()}</span></p>`;
        document.getElementById('replySound')?.play();

        chatLog += `${chatbotName}: ${data.answer}\n`;

      } catch {
        document.getElementById(id).innerText =
          '⚠️ Sorry, something went wrong.';
      }

      chat.scrollTop = chat.scrollHeight;
    };

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
        }).catch(() => { });
      }
    });

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
