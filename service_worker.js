const DEFAULTS = {
  enabled: true,
  driftMinutes: 15,
  cooldownMinutes: 10,
  tone: "sarcastic"
};

const MESSAGES = {
  sarcastic: [
    "Bold of you to call this \"networking.\"",
    "You've been marinating in the feed. Want to do the thing you came for?",
    "Your future self just cleared their throat.",
    "If scrolling paid bills, you'd be a billionaire."
  ],
  motivational: [
    "Quick reset: what's the one thing you want to finish next?",
    "Small step now. Big relief later.",
    "Choose progress for 5 minutes. Just 5."
  ],
  gentle: [
    "Tiny nudge: do you want to stay here a bit longer?",
    "If this isn't serving you, it's okay to step away."
  ]
};

function pickMessage(tone) {
  const arr = MESSAGES[tone] || MESSAGES.sarcastic;
  return arr[Math.floor(Math.random() * arr.length)];
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

function nowMs() {
  return Date.now();
}

// State per tab
const tabState = new Map();
// tabId -> { driftMs, lastNudgeMs, lastUrl, lastMode, lastTickMs }

async function tick() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!active?.id || !active.url?.startsWith("https://www.linkedin.com/")) return;

  const tabId = active.id;

  const state = tabState.get(tabId) || {
    driftMs: 0,
    lastNudgeMs: 0,
    lastUrl: "",
    lastMode: "UNKNOWN",
    lastTickMs: nowMs()
  };

  const delta = nowMs() - state.lastTickMs;
  state.lastTickMs = nowMs();

  // Ask content script for mode + behavior
  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tabId, { type: "FOCUS_NUDGE_GET_STATE" });
  } catch (err) {
    // Content script might not be loaded yet - this is normal on page load
    // Silently skip - content script will be ready on next tick
    tabState.set(tabId, state);
    return;
  }

  const mode = resp?.mode?.mode || "UNKNOWN";
  const behavior = resp?.behavior || { scrollPerMin: 0, keyPerMin: 0, clickPerMin: 0 };

  // Passive heuristic: scrolling a lot, little typing
  const passive = behavior.scrollPerMin >= 5 && behavior.keyPerMin <= 2;

  // Accumulate drift time only when in DRIFT mode AND passive
  if (mode === "DRIFT" && passive) {
    state.driftMs += delta;
  } else {
    // decay drift when user becomes active or changes mode
    state.driftMs = Math.max(0, state.driftMs - delta * 2);
  }

  const driftThresholdMs = settings.driftMinutes * 60_000;
  const cooldownMs = settings.cooldownMinutes * 60_000;

  const canNudge = nowMs() - state.lastNudgeMs >= cooldownMs;

  if (state.driftMs >= driftThresholdMs && canNudge) {
    const msg = pickMessage(settings.tone);
    await chrome.tabs.sendMessage(tabId, { type: "FOCUS_NUDGE_SHOW_OVERLAY", message: msg });
    state.lastNudgeMs = nowMs();
    // slight reset so it doesn't spam if they ignore
    state.driftMs = driftThresholdMs * 0.6;
  }

  state.lastMode = mode;
  state.lastUrl = resp?.url || active.url;

  tabState.set(tabId, state);
}

// Run every 5 seconds
setInterval(tick, 5000);

// Cleanup when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});
