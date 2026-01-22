// Options page: Plan settings, Pro settings, Weekly summary

// DOM elements
const planStatusEl = document.getElementById('planStatus');
const proSettings = document.getElementById('proSettings');
const toneSelect = document.getElementById('tone');
const driftThresholdInput = document.getElementById('driftThreshold');
const cooldownInput = document.getElementById('cooldown');
const weeklySummaryEl = document.getElementById('weeklySummary');
const resetSummaryBtn = document.getElementById('resetSummary');

// Extract from global scope (loaded via script tags)
const { getPlan, getEffectiveSettings, setLicenseKey, getApiBaseUrl, getUserId } = self.FocusNudgePlan;
const { getWeeklySummary, resetWeeklySummary } = self.FocusNudgeMetrics;
const { getSettings, saveSettings } = self.FocusNudgeSettings;

// DOM elements for Stripe
const upgradeSection = document.getElementById('upgradeSection');
const upgradeButton = document.getElementById('upgradeButton');
const manageSubscriptionSection = document.getElementById('manageSubscriptionSection');
const manageButton = document.getElementById('manageButton');

// Load and display current state
async function loadState() {
  // Load plan
  const plan = await getPlan();
  planStatusEl.textContent = plan.isPro ? 'Pro' : 'Basic';
  
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
    // Don't send chrome-extension URL - backend will use web URL instead
    // const returnUrl = chrome.runtime.getURL('src/ui/options/options.html');

    // Get extension ID for redirect
    const extensionId = chrome.runtime.id;
    const extensionOptionsUrl = chrome.runtime.getURL('src/ui/options/options.html');
    
    // Create checkout session
    const response = await fetch(`${apiUrl}/api/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        extensionId: extensionId,
        extensionOptionsUrl: extensionOptionsUrl
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const { sessionId, url } = await response.json();

    // Redirect directly to Stripe Checkout URL
    // (Manifest V3 doesn't allow external scripts, so we use direct redirect)
    if (url) {
      window.location.href = url;
    } else {
      throw new Error('No checkout URL received from server');
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


// Check for license activation (after payment or on page load)
async function checkLicenseActivation(forceCheck = false) {
  const plan = await getPlan();
  
  // If already Pro and not forced, skip
  if (plan.isPro && !forceCheck) {
    return;
  }
  
  // Check for payment indicators in URL (from Stripe redirect)
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  const paymentSuccess = urlParams.get('payment_success');
  
  // Only poll if we have payment indicators or are forcing a check
  if (!sessionId && !paymentSuccess && !forceCheck) {
    return;
  }
  
  await pollForLicenseActivation();
}

/**
 * Poll backend for license activation
 * Tries webhook first, then auto-create fallback if sessionId available
 */
async function pollForLicenseActivation() {
  try {
    const userId = await getUserId();
    const apiUrl = getApiBaseUrl();
    
    // Get session ID from URL if available
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    // Show loading indicator
    if (planStatusEl) {
      planStatusEl.textContent = 'Activating...';
    }
    
    // First, try waiting for webhook (faster if it works)
    const licenseKey = await pollForLicense(userId, apiUrl, 10); // 10 seconds for webhook
    
    if (licenseKey) {
      await activateLicense(licenseKey);
      return;
    }
    
    // Webhook didn't fire - try auto-create fallback (if we have sessionId)
    if (sessionId && sessionId.startsWith('cs_')) {
      console.log('[Focus Nudge] Webhook delayed, trying auto-create fallback...');
      const fallbackLicenseKey = await tryAutoCreateLicense(userId, sessionId, apiUrl);
      
      if (fallbackLicenseKey) {
        await activateLicense(fallbackLicenseKey);
        return;
      }
    }
    
    // License not found yet
    if (planStatusEl) {
      planStatusEl.textContent = 'Basic';
    }
    alert('Payment received, but license activation is pending. Please refresh this page in 10-20 seconds.');
  } catch (error) {
    console.error('[Focus Nudge] License activation error:', error);
    if (planStatusEl) {
      planStatusEl.textContent = 'Basic';
    }
    alert('Payment received, but license activation failed. Please contact support.');
  }
}

/**
 * Poll backend for license key
 * @param {string} userId - User ID
 * @param {string} apiUrl - Backend API URL
 * @param {number} maxAttempts - Maximum polling attempts
 * @returns {Promise<string|null>} License key if found, null otherwise
 */
async function pollForLicense(userId, apiUrl, maxAttempts = 10) {
  console.log(`[Focus Nudge] Polling for license - userId: ${userId}, maxAttempts: ${maxAttempts}`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const url = `${apiUrl}/api/get-license?userId=${encodeURIComponent(userId)}`;
      console.log(`[Focus Nudge] Poll attempt ${attempt + 1}/${maxAttempts}: ${url}`);
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[Focus Nudge] ✅ License found!`, data);
        return data.licenseKey;
      } else {
        const errorText = await response.text();
        console.log(`[Focus Nudge] Poll attempt ${attempt + 1} failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.warn(`[Focus Nudge] Poll attempt ${attempt + 1} error:`, error);
    }
    
    // Wait before retrying (except on last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`[Focus Nudge] ❌ License not found after ${maxAttempts} attempts`);
  return null;
}

/**
 * Try auto-create license fallback
 * @param {string} userId - User ID
 * @param {string} sessionId - Stripe session ID
 * @param {string} apiUrl - Backend API URL
 * @returns {Promise<string|null>} License key if created, null otherwise
 */
async function tryAutoCreateLicense(userId, sessionId, apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/api/auto-create-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, userId })
    });
    
    if (response.ok) {
      const { licenseKey } = await response.json();
      return licenseKey;
    }
  } catch (error) {
    console.warn('[Focus Nudge] Auto-create fallback failed:', error);
  }
  
  return null;
}

/**
 * Activate license and update UI
 * @param {string} licenseKey - License key to activate
 */
async function activateLicense(licenseKey) {
  await setLicenseKey(licenseKey);
  await loadState();
  alert('✅ Payment successful! Pro features are now active.');
  
  // Clean URL
  window.history.replaceState({}, document.title, window.location.pathname);
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
  await loadState(); // Load current state first
  
  // Always check for license activation if Basic (webhook might have fired)
  const plan = await getPlan();
  if (!plan.isPro) {
    // Check URL params for payment success indicators
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const paymentSuccess = urlParams.get('payment_success');
    
    console.log('[Focus Nudge] Options page loaded. Plan:', plan);
    console.log('[Focus Nudge] URL params - session_id:', sessionId, 'payment_success:', paymentSuccess);
    
    if (sessionId || paymentSuccess) {
      // Has payment indicators, check for license activation with loading
      console.log('[Focus Nudge] Payment detected, checking for license activation...');
      await checkLicenseActivation();
    } else {
      // No payment indicators, but check once anyway (webhook might have fired)
      console.log('[Focus Nudge] No payment indicators, checking silently for license...');
      checkLicenseActivation(false).catch((err) => {
        console.log('[Focus Nudge] Silent license check failed (this is OK):', err);
      });
    }
  } else {
    console.log('[Focus Nudge] Already Pro, skipping license check');
  }
});
