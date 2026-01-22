const DEFAULTS = {
  enabled: true,
  driftMinutes: 15,
  cooldownMinutes: 10,
  tone: "sarcastic"
};

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById("enabled").checked = !!s.enabled;
  document.getElementById("tone").value = s.tone;
  document.getElementById("driftMinutes").value = s.driftMinutes;
  document.getElementById("cooldownMinutes").value = s.cooldownMinutes;
}

async function save() {
  const enabled = document.getElementById("enabled").checked;
  const tone = document.getElementById("tone").value;
  const driftMinutes = Number(document.getElementById("driftMinutes").value || 15);
  const cooldownMinutes = Number(document.getElementById("cooldownMinutes").value || 10);

  await chrome.storage.sync.set({ enabled, tone, driftMinutes, cooldownMinutes });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  ["enabled", "tone", "driftMinutes", "cooldownMinutes"].forEach((id) => {
    document.getElementById(id).addEventListener("change", save);
  });
});
