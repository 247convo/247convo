let started = false;

function getClientID() {
  const scripts = document.getElementsByTagName('script');
  for (let s of scripts) {
    if (s.src.includes('247convo-loader.js')) {
      const url = new URL(s.src);
      return url.searchParams.get('client_id') || 'default';
    }
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('client_id') || 'default';
}

async function init247Convo() {
  if (started) return;
  started = true;

  const clientID = getClientID();
  const configURL = `https://two47convo.onrender.com/configs/${clientID}.json`;

  try {
    // Step 1: Load config
    const res = await fetch(configURL);
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status} ${res.statusText}`);
    const config = await res.json();
    console.log(`Config loaded for ${clientID}:`, config);

    // Step 2: Inject config globally
    const configScript = document.createElement('script');
    configScript.type = 'text/javascript';
    configScript.textContent = `window.__247CONVO_CONFIG__ = ${JSON.stringify(config)};`;
    document.head.appendChild(configScript);

    // Step 3: Set CSS variables
    const styleVars = document.createElement('style');
    styleVars.innerHTML = `
      :root {
        --primary-color: ${config.primaryColor || '#000'};
        --accent-color: ${config.accentColor || '#fff'};
        --light-accent: ${config.lightAccent || '#ccc'};
        --button-color: ${config.buttonColor || '#007bff'};
        --text-light: ${config.textLight || '#fff'};
      }
    `;
    document.head.appendChild(styleVars);

    // Step 4: Load main CSS
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://two47convo.onrender.com/static/247convo-style.css';
    document.head.appendChild(css);

    // Step 5: Load Widget HTML
    const htmlRes = await fetch('https://two47convo.onrender.com/static/index.html');
    if (!htmlRes.ok) throw new Error(`Failed to load widget HTML: ${htmlRes.status}`);
    const html = await htmlRes.text();
    const widget = document.createElement('div');
    widget.innerHTML = html;
    document.body.appendChild(widget);

    // Step 6: Load Widget Script
    const script = document.createElement('script');
    script.src = `https://two47convo.onrender.com/static/247convo-script.js?client_id=${clientID}`;
    script.defer = true;
    document.body.appendChild(script);
  } catch (err) {
    console.error(`❌ Failed to load chatbot for ${clientID}: ${err.message}`);
    throw err;
  }
}

['mouseover', 'touchstart'].forEach(ev => {
  window.addEventListener(ev, init247Convo, { once: true });
});