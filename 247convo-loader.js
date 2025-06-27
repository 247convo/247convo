// === 247Convo Loader (with dynamic config support) ===
(function () {
  let started = false;

  async function init247Convo() {
    if (started) return;
    started = true;

    try {
      // 0. Fetch config.json
      const res = await fetch('https://two47convo.onrender.com/config.json');
      const config = await res.json();

      // Inject config as a global JS object
      const configScript = document.createElement('script');
      configScript.type = 'text/javascript';
      configScript.textContent = `window.__247CONVO_CONFIG__ = ${JSON.stringify(config)};`;
      document.head.appendChild(configScript);

      // 1. Load CSS
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://two47convo.onrender.com/247convo-style.css';
      document.head.appendChild(css);

      // 2. Load Widget HTML
      const htmlRes = await fetch('https://two47convo.onrender.com/index.html');
      let html = await htmlRes.text();

      // 3. Replace placeholders using config
      Object.entries(config).forEach(([key, value]) => {
        const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        html = html.replace(pattern, value);
      });

      // 4. Inject HTML
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      document.body.appendChild(wrapper);

      // 5. Load JS
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        injectScript();
      } else {
        window.addEventListener('DOMContentLoaded', injectScript);
      }

    } catch (err) {
      console.error("❌ 247Convo widget failed to load:", err);
    }
  }

  function injectScript() {
    const script = document.createElement('script');
    script.src = 'https://two47convo.onrender.com/247convo-script.js';
    script.defer = false;
    document.body.appendChild(script);
  }

  // Lazy-load only on user interaction
  ['mouseover', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, init247Convo, { once: true })
  );
})();
