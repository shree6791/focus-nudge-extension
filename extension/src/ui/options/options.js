// Options page: Plan settings, Pro settings, Weekly summary

// Constants
const POLLING_INTERVAL_MS = 1000; // 1 second between polling attempts
const MAX_POLLING_ATTEMPTS = 15; // Poll for up to 15 seconds
const SAVE_CONFIRMATION_DURATION_MS = 300;

// DOM elements
const planStatusEl = document.getElementById('planStatus');
const proSettings = document.getElementById('proSettings');
const toneSelect = document.getElementById('tone');
const driftThresholdInput = document.getElementById('driftThreshold');
const cooldownInput = document.getElementById('cooldown');
const weeklySummaryEl = document.getElementById('weeklySummary');
const resetSummaryBtn = document.getElementById('resetSummary');
const upgradeSection = document.getElementById('upgradeSection');
const upgradeButton = document.getElementById('upgradeButton');
const manageSubscriptionSection = document.getElementById('manageSubscriptionSection');
const manageButton = document.getElementById('manageButton');

// Extract from global scope (loaded via script tags)
const { getPlan, getEffectiveSettings, setLicenseKey, getApiBaseUrl, getUserId, getLicenseKey } = self.FocusNudgePlan;
const { getWeeklySummary, resetWeeklySummary } = self.FocusNudgeMetrics;
const { getSettings, saveSettings } = self.FocusNudgeSettings;

// Load and display current state
async function loadState() {
  // Load plan
  const plan = await getPlan();
  planStatusEl.textContent = plan.isPro ? 'Pro' : 'Basic';
  
  // Show upgrade/manage buttons based on plan
  if (plan.isPro) {
    upgradeSection.style.display = 'none';
    // Show manage subscription for Stripe users (not dev mode)
    // Check if user has a license key (indicates Stripe subscription)
    const hasLicenseKey = await getLicenseKey();
    if (plan.source === 'stripe' || (hasLicenseKey && plan.source !== 'dev')) {
      manageSubscriptionSection.style.display = 'block';
    } else {
      // Dev plan or no license key - don't show manage subscription
      manageSubscriptionSection.style.display = 'none';
    }
  } else {
    upgradeSection.style.display = 'block';
    manageSubscriptionSection.style.display = 'none';
  }
  
  // Load effective settings
  const effectiveSettings = await getEffectiveSettings();
  
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
    
    // Create checkout session (Stripe Checkout will handle coupon codes natively)
    const response = await fetch(`${apiUrl}/api/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to create checkout session' }));
      const errorMessage = errorData.details || errorData.error || 'Failed to create checkout session';
      throw new Error(errorMessage);
    }

    const { sessionId, url } = await response.json();

    // Redirect to Stripe Checkout
    if (!url) {
      throw new Error('No checkout URL received from server');
    }
    window.location.href = url;
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Error starting checkout: ' + error.message);
    upgradeButton.disabled = false;
    upgradeButton.textContent = 'Upgrade to Pro - $0.99/month';
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
  
  // If we have payment indicators or are forcing, show loading
  // Otherwise, check silently (webhook might have fired, but user didn't come from payment page)
  const showLoading = !!(sessionId || paymentSuccess || forceCheck);
  
  // Always poll if Basic (webhook might have fired even without URL params)
  await pollForLicenseActivation(showLoading);
}

/**
 * Poll backend for license activation
 * Tries webhook first, then auto-create fallback if sessionId available
 * @param {boolean} showLoading - Whether to show "Activating..." status
 */
async function pollForLicenseActivation(showLoading = true) {
  try {
    const userId = await getUserId();
    const apiUrl = getApiBaseUrl();
    
    // Log activation attempt (reduced logging for production)
    if (showLoading) {
      console.log('[Focus Nudge] Checking for license activation...', { userId, apiUrl });
    }
    
    // Get session ID from URL if available
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    // Show loading indicator only if requested
    if (showLoading && planStatusEl) {
      planStatusEl.textContent = 'Activating...';
    }
    
    // Poll for license (webhook might take a moment)
    const licenseKey = await pollForLicense(userId, apiUrl, MAX_POLLING_ATTEMPTS);
    
    if (licenseKey) {
      await activateLicense(licenseKey);
      return;
    }
    
    // Webhook didn't fire - try auto-create fallback (if we have sessionId)
    if (sessionId?.startsWith('cs_')) {
      const fallbackLicenseKey = await tryAutoCreateLicense(userId, sessionId, apiUrl);
      if (fallbackLicenseKey) {
        await activateLicense(fallbackLicenseKey);
        return;
      }
    }
    
    // License not found - reset status if showing loading
    if (planStatusEl && showLoading) {
      planStatusEl.textContent = 'Basic';
    }
    
    // Show alert only if user has payment indicators
    if (showLoading) {
      alert('Payment received, but license activation is pending.\n\nPlease wait 10-20 seconds for the webhook to process, then refresh this page. Your Pro features will activate automatically.');
    }
  } catch (error) {
    console.error('[Focus Nudge] License activation error:', error);
    if (planStatusEl && showLoading) {
      planStatusEl.textContent = 'Basic';
    }
    
    // Only show alert if we were showing loading
    if (showLoading) {
      alert('Payment received, but license activation failed. Please contact support.');
    }
  }
}

/**
 * Poll backend for license key
 * @param {string} userId - User ID
 * @param {string} apiUrl - Backend API URL
 * @param {number} maxAttempts - Maximum polling attempts
 * @returns {Promise<string|null>} License key if found, null otherwise
 */
async function pollForLicense(userId, apiUrl, maxAttempts = MAX_POLLING_ATTEMPTS) {
  const url = `${apiUrl}/api/get-license?userId=${encodeURIComponent(userId)}`;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        const { licenseKey } = await response.json();
        console.log('[Focus Nudge] ✅ License found');
        return licenseKey;
      }
    } catch (error) {
      // Only log errors on last attempt to reduce console noise
      if (attempt === maxAttempts - 1) {
        console.warn('[Focus Nudge] License polling error:', error);
      }
    }
    
    // Wait before retrying (except on last attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
    }
  }
  
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

/**
 * Show visual confirmation when setting is saved
 * @param {HTMLElement} element - Element to highlight
 */
function showSaveConfirmation(element) {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#4CAF50';
  element.style.transition = 'background-color 0.3s';
  setTimeout(() => {
    element.style.backgroundColor = originalBg;
  }, SAVE_CONFIRMATION_DURATION_MS);
}

/**
 * Save setting with validation and visual feedback
 * @param {string} key - Setting key
 * @param {number|string} value - Setting value
 * @param {HTMLElement} element - Input element
 * @param {number} min - Minimum value (for numbers)
 * @param {number} max - Maximum value (for numbers)
 */
async function saveSetting(key, value, element, min = null, max = null) {
  let finalValue = value;
  
  // Validate and clamp numeric values
  if (typeof value === 'number' && min !== null && max !== null) {
    finalValue = Math.max(min, Math.min(max, value));
    element.value = finalValue;
  }
  
  const settings = await getSettings();
  settings[key] = finalValue;
  await saveSettings(settings);
  showSaveConfirmation(element);
}

// Settings event listeners
toneSelect.addEventListener('change', async (e) => {
  await saveSetting('tone', e.target.value, e.target);
});

driftThresholdInput.addEventListener('change', async (e) => {
  await saveSetting('drift_threshold_min', parseInt(e.target.value) || 15, e.target, 1, 120);
});

cooldownInput.addEventListener('change', async (e) => {
  await saveSetting('cooldown_min', parseInt(e.target.value) || 10, e.target, 1, 120);
});

resetSummaryBtn.addEventListener('click', async () => {
  if (confirm('Reset this week\'s summary?')) {
    await resetWeeklySummary();
    await loadWeeklySummary();
  }
});


// Stripe action listeners
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
    
    // Check localStorage for payment info (from success page)
    let localStorageSessionId = null;
    try {
      const storedSessionId = localStorage.getItem('focusNudgePaymentSessionId');
      const storedTime = localStorage.getItem('focusNudgePaymentTime');
      // Only use if stored within last 5 minutes
      if (storedSessionId && storedTime && (Date.now() - parseInt(storedTime)) < 5 * 60 * 1000) {
        localStorageSessionId = storedSessionId;
        // Clear after reading
        localStorage.removeItem('focusNudgePaymentSessionId');
        localStorage.removeItem('focusNudgePaymentTime');
        localStorage.removeItem('focusNudgePaymentUserId');
      }
    } catch(e) {}
    
    // Check for payment indicators in URL or localStorage
    if (sessionId || paymentSuccess || localStorageSessionId) {
      // Has payment indicators - check with loading indicator
      // Use sessionId from URL or localStorage
      if (localStorageSessionId && !sessionId) {
        // Add sessionId to URL for the activation logic
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('session_id', localStorageSessionId);
        window.history.replaceState({}, '', newUrl);
      }
      await checkLicenseActivation(true);
    } else {
      // No payment indicators - check silently (webhook might have fired)
      checkLicenseActivation(false).catch(() => {
        // Silent check failed - this is OK if payment not completed
      });
    }
  }
});
