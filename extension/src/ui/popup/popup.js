// Minimal popup: Show status and link to options

async function loadPlan() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PLAN" });
    const plan = response || { isPro: false };
    const badge = document.getElementById("planBadge");
    badge.textContent = plan.isPro ? "Pro" : "Basic";
    badge.className = `plan-badge ${plan.isPro ? "pro" : "basic"}`;
  } catch (err) {
    console.error("Error loading plan:", err);
  }
}

document.getElementById("optionsLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Load plan status
loadPlan();
