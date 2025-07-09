// === 247Convo Loader (Dynamic Client Support) ===
(function () {
  let started = false;

  // 🔍 Get client ID from URL, fallback to 'default'
  function getClientID() {
    const params = new URLSearchParams(window.location.search);
    return params.get("client_id") || "default";
  }

  // 🔁 Lazy-load on interaction
  ['mouseover', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, init247Convo, { once: true })
  );

  async function init247Convo() {
    if (started) return;
    started = true;

    const clientID = getClientID();
    const configURL = `https://two47convo.onrender.com/configs/${clientID}.json`;

    try {
      // ✅ Step 1: Load config
      const res = await fetch(configURL);
      if (!res.ok) throw new Error(`Failed to load config for ${clientID}`);
      const config = await res.json();

      // ✅ Step 2: Inject config globally
      const configScript = document.createElement('script');
      configScript.type = 'text/javascript';
      configScript.textContent = `window.__247CONVO_CONFIG__ = ${JSON.stringify(config)};`;
      document.head.appendChild(configScript);

      // ✅ Step 3: Set CSS variables from config (safely)
      const styleVars = document.createElement('style');
      styleVars.innerHTML = `
        :root {
          --primary-color: ${config.primaryColor || ''};
          --accent-color: ${config.accentColor || ''};
          --light-accent: ${config.lightAccent || ''};
          --button-color: ${config.buttonColor || ''};
          --text-light: ${config.textLight || ''};
        }
      `;
      document.head.appendChild(styleVars);

      // ✅ Step 4: Load main CSS
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://two47convo.onrender.com/247convo-style.css';
      document.head.appendChild(css);

      // ✅ Step 5: Load Widget HTML
      const htmlRes = await fetch('https://two47convo.onrender.com/index.html');
      let html = await htmlRes.text();

      // ❌ Step Removed: Replacing {{placeholders}} – handled dynamically by script.js
      // Safer to inject branding via JS to avoid mismatch between loader and index.html

      // ✅ Step 6: Inject widget HTML into page
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);

      // ✅ Step 7: Load chatbot script with ?client_id=...
      injectScript(clientID);

    } catch (err) {
      console.error("❌ 247Convo widget failed to load:", err);
    }
  }

  function injectScript(clientID) {
    const script = document.createElement('script');
    script.src = `https://two47convo.onrender.com/247convo-script.js?client_id=${clientID}`;
    script.defer = true;
    document.body.appendChild(script);
  }
})();
