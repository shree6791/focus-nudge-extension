(() => {
  // ---- Local counters (reset every minute) ----
  let scrollCount = 0;
  let keyCount = 0;
  let clickCount = 0;

  let lastResetTs = Date.now();

  const resetIfNeeded = () => {
    const now = Date.now();
    if (now - lastResetTs >= 60_000) {
      scrollCount = 0;
      keyCount = 0;
      clickCount = 0;
      lastResetTs = now;
    }
  };

  window.addEventListener("scroll", () => {
    resetIfNeeded();
    scrollCount += 1;
  }, { passive: true });

  window.addEventListener("keydown", () => {
    resetIfNeeded();
    keyCount += 1;
  }, { passive: true });

  window.addEventListener("click", () => {
    resetIfNeeded();
    clickCount += 1;
  }, { passive: true });

  // ---- Overlay ----
  const OVERLAY_ID = "focus-nudge-overlay";

  function showOverlay(message) {
    // Remove existing
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.style.cssText = `
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      z-index: 2147483647;
      pointer-events: none;
    `;

    const inner = document.createElement("div");
    inner.className = "focus-nudge-inner";
    inner.textContent = message;
    inner.style.cssText = `
      max-width: 720px;
      margin: 0 16px;
      padding: 18px 22px;
      border-radius: 16px;
      background: rgba(20, 20, 20, 0.88);
      color: #fff;
      font-size: 20px;
      line-height: 1.25;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      pointer-events: auto;
    `;

    el.appendChild(inner);
    document.body.appendChild(el);

    // Auto-hide after 20 seconds (increased for better visibility)
    setTimeout(() => {
      el.classList.add("fade-out");
      setTimeout(() => el.remove(), 450);
    }, 20000);
  }

  function getMode() {
    try {
      if (window.FocusNudgeRules && typeof window.FocusNudgeRules.classifyLinkedIn === 'function') {
        return window.FocusNudgeRules.classifyLinkedIn();
      }
      return { site: "linkedin", mode: "UNKNOWN", confidence: 0.1 };
    } catch {
      return { site: "linkedin", mode: "UNKNOWN", confidence: 0.1 };
    }
  }

  function getBehavior() {
    resetIfNeeded();
    return {
      scrollPerMin: scrollCount,
      keyPerMin: keyCount,
      clickPerMin: clickCount
    };
  }

  // ---- Messaging with background ----
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "FOCUS_NUDGE_GET_STATE") {
      sendResponse({
        mode: getMode(),
        behavior: getBehavior(),
        url: location.href
      });
      return true;
    }

    if (msg?.type === "FOCUS_NUDGE_SHOW_OVERLAY") {
      // Show overlay
      const now = Date.now();
      showOverlay(msg.message || "Hey. 👀");
      
      // Record nudge shown
      chrome.runtime.sendMessage({
        type: "NUDGE_SHOWN",
        ts_ms: now
      }).catch(() => {}); // Ignore errors
      
      sendResponse({ ok: true });
      return true;
    }
  });
})();
