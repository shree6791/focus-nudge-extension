// Options page: Plan toggle, Pro settings, Weekly summary

// Check if dev build (for dev toggle visibility)
// Always show in development - can be hidden for production builds
const isDevBuild = true; // Set to false for production builds
// Alternative: const isDevBuild = chrome.runtime.getManifest().version.includes('dev') || 
//                            chrome.runtime.getManifest().name.includes('Dev');

// DOM elements
const planStatusEl = document.getElementById('planStatus');
const devToggleContainer = document.getElementById('devToggleContainer');
const devProToggle = document.getElementById('devProToggle');
const proSettings = document.getElementById('proSettings');
const toneSelect = document.getElementById('tone');
const driftThresholdInput = document.getElementById('driftThreshold');
const cooldownInput = document.getElementById('cooldown');
const weeklySummaryEl = document.getElementById('weeklySummary');
const resetSummaryBtn = document.getElementById('resetSummary');

// Extract from global scope (loaded via script tags)
const { getPlan, getEffectiveSettings, setProPlan, setLicenseKey, getApiBaseUrl, getUserId } = self.FocusNudgePlan;
const { getWeeklySummary, resetWeeklySummary } = self.FocusNudgeMetrics;
const { getSettings, saveSettings } = self.FocusNudgeSettings;

// Stripe configuration (get from backend or manifest)
let stripe = null;
let stripePublishableKey = null;

// DOM elements for Stripe
const upgradeSection = document.getElementById('upgradeSection');
const upgradeButton = document.getElementById('upgradeButton');
const manageSubscriptionSection = document.getElementById('manageSubscriptionSection');
const manageButton = document.getElementById('manageButton');

// Initialize Stripe
async function initStripe() {
  try {
    // Get publishable key from backend (or store in manifest)
    const apiUrl = getApiBaseUrl();
    // For now, you'll need to set this in the extension
    // TODO: Add API endpoint to get publishable key, or store in manifest
    stripePublishableKey = 'pk_test_...'; // TODO: Replace with your Stripe publishable key
    
    if (stripePublishableKey && stripePublishableKey !== 'pk_test_...') {
      stripe = Stripe(stripePublishableKey);
    }
  } catch (error) {
    console.error('Stripe initialization error:', error);
  }
}

// Load and display current state
async function loadState() {
  // Load plan
  const plan = await getPlan();
  planStatusEl.textContent = plan.isPro ? 'Pro' : 'Basic';
  
  // Show dev toggle only in dev builds
  if (isDevBuild) {
    devToggleContainer.style.display = 'flex';
    devProToggle.checked = plan.isPro && plan.source === 'dev';
  }
  
  // Show upgrade/manage buttons based on plan
  if (plan.isPro) {
    upgradeSection.style.display = 'none';
    if (plan.source === 'stripe') {
      manageSubscriptionSection.style.display = 'block';
    } else {
      manageSubscriptionSection.style.display = 'none';
    }
  } else {
    upgradeSection.style.display = 'block';
    manageSubscriptionSection.style.display = 'none';
  }
  
  // Load effective settings
  const effectiveSettings = await getEffectiveSettings();
  
  // Load user settings (for Pro)
  const userSettings = await getSettings();
  
  // Update UI
  toneSelect.value = effectiveSettings.tone;
  driftThresholdInput.value = effectiveSettings.drift_threshold_min;
  cooldownInput.value = effectiveSettings.cooldown_min;
  
  // Enable/disable based on plan
  const isPro = plan.isPro;
  toneSelect.disabled = !isPro;
  driftThresholdInput.disabled = !isPro;
  cooldownInput.disabled = !isPro;
  proSettings.classList.toggle('locked', !isPro);
  
  // Load weekly summary
  await loadWeeklySummary();
}

// Handle Stripe Checkout
async function handleUpgrade() {
  try {
    upgradeButton.disabled = true;
    upgradeButton.textContent = 'Loading...';

    const userId = await getUserId();
    const apiUrl = getApiBaseUrl();
    const returnUrl = chrome.runtime.getURL('src/ui/options/options.html');

    // Create checkout session
    const response = await fetch(`${apiUrl}/api/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        returnUrl: returnUrl
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const { sessionId, url } = await response.json();

    // Redirect to Stripe Checkout
    if (stripe && sessionId) {
      // Use Stripe.js redirect
      const result = await stripe.redirectToCheckout({ sessionId });
      if (result.error) {
        throw new Error(result.error.message);
      }
    } else if (url) {
      // Fallback to direct URL redirect
      window.location.href = url;
    }
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Error starting checkout: ' + error.message);
    upgradeButton.disabled = false;
    upgradeButton.textContent = 'Upgrade to Pro - $9.99/month';
  }
}

// Handle subscription management
async function handleManageSubscription() {
  try {
    manageButton.disabled = true;
    manageButton.textContent = 'Loading...';

    const userId = await getUserId();
    const apiUrl = getApiBaseUrl();
    const returnUrl = chrome.runtime.getURL('src/ui/options/options.html');

    const response = await fetch(`${apiUrl}/api/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        returnUrl: returnUrl
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create portal session');
    }

    const { url } = await response.json();
    window.location.href = url;
  } catch (error) {
    console.error('Portal error:', error);
    alert('Error opening subscription management: ' + error.message);
    manageButton.disabled = false;
    manageButton.textContent = 'Manage Subscription';
  }
}


// Check for Stripe redirect (after checkout)
async function handleStripeRedirect() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  
  if (sessionId) {
    // Checkout completed - get license key from backend
    try {
      const userId = await getUserId();
      const apiUrl = getApiBaseUrl();
      
      // Poll for license key (webhook might take a moment)
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        const response = await fetch(`${apiUrl}/api/get-license?userId=${encodeURIComponent(userId)}`);
        
        if (response.ok) {
          const { licenseKey } = await response.json();
          
          // Store license key
          await setLicenseKey(licenseKey);
          
          // Reload state to show Pro
          await loadState();
          
          // Show success message
          alert('Payment successful! Pro features are now active.');
          
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      // If we get here, license wasn't found
      alert('Payment received, but license activation is pending. Please refresh in a moment.');
    } catch (error) {
      console.error('License activation error:', error);
      alert('Payment received, but license activation failed. Please contact support.');
    }
  }
}

async function loadWeeklySummary() {
  const summary = await getWeeklySummary();
  const plan = await getPlan();
  const planLabel = plan.isPro ? ' (Pro)' : '';
  
  weeklySummaryEl.innerHTML = `
    <p><strong>This week${planLabel}:</strong> Nudges ${summary.nudges} | Early exits ${summary.early_exits} | Est. time reclaimed ~${summary.estimated_minutes} min</p>
    <p class="footnote">*Estimated based on early exits × 5 minutes</p>
  `;
}

// Event listeners
devProToggle.addEventListener('change', async (e) => {
  await setProPlan(e.target.checked);
  await loadState();
});

toneSelect.addEventListener('change', async (e) => {
  const settings = await getSettings();
  settings.tone = e.target.value;
  await saveSettings(settings);
});

driftThresholdInput.addEventListener('change', async (e) => {
  const value = Math.max(1, Math.min(120, parseInt(e.target.value) || 15));
  e.target.value = value;
  const settings = await getSettings();
  settings.drift_threshold_min = value;
  await saveSettings(settings);
});

cooldownInput.addEventListener('change', async (e) => {
  const value = Math.max(1, Math.min(120, parseInt(e.target.value) || 10));
  e.target.value = value;
  const settings = await getSettings();
  settings.cooldown_min = value;
  await saveSettings(settings);
});

resetSummaryBtn.addEventListener('click', async () => {
  if (confirm('Reset this week\'s summary?')) {
    await resetWeeklySummary();
    await loadWeeklySummary();
  }
});

// Event listeners
upgradeButton.addEventListener('click', handleUpgrade);
manageButton.addEventListener('click', handleManageSubscription);

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  await initStripe();
  await handleStripeRedirect(); // Check for Stripe redirect
  await loadState();
});
