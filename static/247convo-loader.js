// File: 247convo-loader.js
// Purpose: Show chat bubble immediately, then load full chatbot on first mousemove or bubble click.

(function(){
  let started = false;

  // PHASE 1: Inject bubble shell on page load
  document.addEventListener('DOMContentLoaded', () => {
    injectBubbleShell();
    // Defer full widget load until first mouse movement
    window.addEventListener('mousemove', initFullWidget, { once: true });
  });

  function injectBubbleShell() {
    // Inline CSS for immediate bubble styling
    const css = document.createElement('style');
    css.textContent = `
      #chat-bubble {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: var(--accent-color, #800080);
        color: #fff;
        font-size: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        z-index: 1000;
      }
      #chat-bubble-msg {
        position: fixed;
        bottom: 90px;
        right: 20px;
        background: #fff;
        color: #222;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.9rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
      }
    `;
    document.head.appendChild(css);

    // Bubble HTML
    const bubble = document.createElement('div');
    bubble.id = 'chat-bubble';
    bubble.textContent = '💬';
    document.body.appendChild(bubble);

    const msg = document.createElement('div');
    msg.id = 'chat-bubble-msg';
    msg.textContent = 'Need help? Ask us anything.';
    document.body.appendChild(msg);

    // Also init full widget if user clicks bubble
    bubble.addEventListener('click', initFullWidget, { once: true });
  }

  // PHASE 2: Load full chatbot on first interaction
  async function initFullWidget() {
    if (started) return;
    started = true;

    const client_id = getClientID();
    const configURL = `https://two47convobot.onrender.com/configs/${client_id}.json`;

    // a) Fetch client config JSON
    let config = {};
    try {
      const res = await fetch(configURL);
      config = res.ok ? await res.json() : {};
    } catch {}

    // b) Expose config globally for widget script
    const cfgScript = document.createElement('script');
    cfgScript.type = 'text/javascript';
    cfgScript.textContent = `window.__247CONVO_CONFIG__ = ${JSON.stringify(config)};`;
    document.head.appendChild(cfgScript);

    // c) Apply theme CSS variables from config
    const vars = document.createElement('style');
    vars.textContent = `
      :root {
        --primary-color: ${config.primaryColor || ''};
        --accent-color: ${config.accentColor || ''};
        --button-color: ${config.buttonColor || ''};
        --text-light: ${config.textLight || ''};
      }
    `;
    document.head.appendChild(vars);

    // d) Load full stylesheet for chat UI (via backend’s CORS-enabled /static)
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://two47convobot.onrender.com/static/247convo-style.css';
    document.head.appendChild(link);

    // e) Inject chat widget HTML fragment (via backend’s CORS-enabled /static)
    try {
      const fragRes = await fetch('https://two47convobot.onrender.com/static/widget-fragment.html');
      const fragment = await fragRes.text();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = fragment;
      document.body.appendChild(wrapper);
    } catch {}

    // f) Load main chatbot logic script (via backend’s CORS-enabled /static)
    const script = document.createElement('script');
    script.src = `https://two47convobot.onrender.com/static/247convo-script.js?client_id=${client_id}`;
    script.defer = true;
    document.body.appendChild(script);
  }

  // Helper: Read client_id from URL or loader script tag
  function getClientID() {
    // 1) URL parameter
    const p = new URLSearchParams(window.location.search);
    if (p.get('client_id')) return p.get('client_id');

    // 2) Check this loader <script> tag’s src
    const scripts = document.getElementsByTagName('script');
    for (let s of scripts) {
      const m = (s.src || '').match(/[?&]client_id=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }

    // 3) Default fallback
    return 'default';
  }
})();
