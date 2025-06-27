// === 247Convo Chat Logic (white-labeled) ===
(function () {
  const run = () => {
    const bubble = document.getElementById('chat-bubble');
    const popup = document.getElementById('chatPopup');
    const msg = document.getElementById('chat-bubble-msg');
    const snd = document.getElementById('bubbleSound');

    if (!bubble || !popup) return;

    let chatLog = '';
    let userName = '';
    let userEmail = '';
    let leadSubmitted = false;

    // === Fallback Bot Name & User Label ===
    const safeBotName = '{{botName}}'.includes('{{') ? '247Convo Bot' : '{{botName}}';
    const userLabel = '{{userLabel}}'.includes('{{') ? '🙋 You:' : '{{userLabel}}';

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

        document.getElementById('leadForm')?.classList.add('hidden');
        const chatBox = document.getElementById('chatBox');
        chatBox?.classList.remove('hidden');

        const chat = document.getElementById('chat');
        chat.innerHTML = `
          <p class="bot">
            Hi <strong>${userName}</strong>! I’m <strong>${safeBotName}</strong>. How can I help you today?
            <span class="timestamp">${now()}</span>
          </p>
          <div class="quick-options" id="quickOpts">
            <button onclick="quickAsk('{{quickOption1}}')">{{quickOption1}}</button>
            <button onclick="quickAsk('{{quickOption2}}')">{{quickOption2}}</button>
            <button onclick="quickAsk('{{quickOption3}}')">{{quickOption3}}</button>
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
        `<p class="user">${userLabel} ${txt}<span class="timestamp">${now()}</span></p>`;
      input.value = '';
      document.getElementById('quickOpts')?.style.setProperty('display', 'none');

      const id = 'load-' + Date.now();
      chat.innerHTML += `<p class="bot" id="${id}">${safeBotName} is thinking…</p>`;
      chat.scrollTop = chat.scrollHeight;

      chatLog += `You: ${txt}\n`;

      try {
        const res = await fetch('https://two47convobot.onrender.com/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: txt,
            token: '{{token}}'
          })
        });
        const data = await res.json();

        document.getElementById(id).outerHTML =
          `<p class="bot">${safeBotName}: ${data.answer}<span class="timestamp">${now()}</span></p>`;
        document.getElementById('replySound')?.play();

        chatLog += `${safeBotName}: ${data.answer}\n`;

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
            token: '{{token}}'
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
