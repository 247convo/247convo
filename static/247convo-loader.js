// File: 247convo-loader.js
// ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
// Shows bubble immediately, then loads full widget.
// Auto-detects where static files actually live (root vs /static).
// Configs still come from your API host.
// ––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

(function(){
  let started = false;

  // 1) Figure out:
//    - where this script was loaded from (static files origin + path prefix)
//    - where your API lives
  const loaderTag  = document.currentScript;
  const loaderUrl  = new URL(loaderTag.src);
  // e.g. loaderUrl.pathname might be "/static/247convo-loader.js"
  // strip off the filename to get "/static"
  const staticPath = loaderUrl.pathname.replace(/\/[^/]+$/, "");
  const staticHost = loaderUrl.origin + staticPath;
  const apiHost    = "https://two47convobot.onrender.com";

  // 2) Phase 1: inject bubble shell on DOMContentLoaded
  document.addEventListener("DOMContentLoaded", () => {
    injectBubbleShell();
    window.addEventListener("mousemove", initFullWidget, { once: true });
  });

  function injectBubbleShell() {
    const css = document.createElement("style");
    css.textContent = `
      /* minimal bubble CSS */
      #chat-bubble { position:fixed;bottom:20px;right:20px;
        width:60px;height:60px;border-radius:50%;
        background:var(--accent-color,#800080);color:#fff;
        font-size:30px;display:flex;align-items:center;
        justify-content:center;cursor:pointer;
        box-shadow:0 4px 14px rgba(0,0,0,0.3);z-index:1000; }
      #chat-bubble-msg { position:fixed;bottom:90px;right:20px;
        background:#fff;color:#222;padding:8px 12px;
        border-radius:8px;font-size:.9rem;
        box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:1000; }
    `;
    document.head.appendChild(css);

    const bubble = document.createElement("div");
    bubble.id = "chat-bubble";
    bubble.textContent = "💬";
    document.body.appendChild(bubble);

    const msg = document.createElement("div");
    msg.id = "chat-bubble-msg";
    msg.textContent = "Need help? Ask us anything.";
    document.body.appendChild(msg);

    bubble.addEventListener("click", initFullWidget, { once: true });
  }

  // 3) Phase 2: load full widget on first interaction
  async function initFullWidget() {
    if (started) return;
    started = true;

    const client_id = getClientID();

    // 3a) fetch config from your API
    let config = {};
    try {
      const res = await fetch(`${apiHost}/configs/${client_id}.json`);
      config = res.ok ? await res.json() : {};
    } catch (e) {
      console.error("Failed to load config:", e);
    }

    // 3b) expose it globally
    const cfgScript = document.createElement("script");
    cfgScript.textContent = `window.__247CONVO_CONFIG__ = ${JSON.stringify(config)};`;
    document.head.appendChild(cfgScript);

    // 3c) apply theme vars
    const vars = document.createElement("style");
    vars.textContent = `
      :root {
        --primary-color: ${config.primaryColor||""};
        --accent-color: ${config.accentColor||""};
        --button-color: ${config.buttonColor||""};
        --text-light: ${config.textLight||""};
      }
    `;
    document.head.appendChild(vars);

    // 3d) load full CSS from static host
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${staticHost}/247convo-style.css`;
    document.head.appendChild(link);

    // 3e) inject widget HTML fragment
    try {
      const frag = await fetch(`${staticHost}/widget-fragment.html`);
      const html = await frag.text();
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);
    } catch (e) {
      console.error("Failed to load widget fragment:", e);
    }

    // 3f) load main logic script from static host
    const script = document.createElement("script");
    script.src = `${staticHost}/247convo-script.js?client_id=${client_id}`;
    script.defer = true;
    document.body.appendChild(script);
  }

  // Utility: read client_id from URL or this tag
  function getClientID() {
    const p = new URLSearchParams(window.location.search);
    if (p.get("client_id")) return p.get("client_id");
    // fallback: check src for ?client_id=
    const m = loaderTag.src.match(/[?&]client_id=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
    return "default";
  }
})();
