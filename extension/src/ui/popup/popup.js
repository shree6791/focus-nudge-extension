// Minimal popup: Show status and link to options

async function loadPlan() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PLAN" });
    const plan = response || { isPro: false };
    const badge = document.getElementById("planBadge");
    badge.textContent = plan.isPro ? "Pro" : "Basic";
    badge.className = `plan-badge ${plan.isPro ? "pro" : "basic"}`;
  } catch (err) {
    // Silently fail - user can still access options
  }
}

document.getElementById("optionsLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Load plan status
loadPlan();
