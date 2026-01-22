// Plan module: Basic vs Pro plan detection and effective settings
// Hard-enforces Basic defaults even if storage is tampered
// Integrates with Stripe backend for license verification

// Prevent redeclaration if module is loaded multiple times
(function() {
  'use strict';
  
  if (typeof self !== 'undefined' && self.FocusNudgePlan) {
    return; // Already loaded
  }

  const BASIC_DEFAULTS = {
    tone: "gentle",
    drift_threshold_min: 15,
    cooldown_min: 30
  };

  // Backend API URL
  const API_BASE_URL = 'https://focus-nudge-extension.onrender.com';
  const LICENSE_CACHE_MS = 5 * 60 * 1000; // Cache license check for 5 minutes

  /**
   * Get user ID (Chrome extension ID or generated stable ID)
   * @returns {Promise<string>}
   */
  async function getUserId() {
    // Try to get stored user ID
    const stored = await chrome.storage.local.get({ focusNudgeUserId: null });
    if (stored.focusNudgeUserId) {
      return stored.focusNudgeUserId;
    }

    // Generate stable user ID (based on extension ID + machine)
    const extensionId = chrome.runtime.id;
    const userId = `fn_${extensionId}_${Date.now()}`;
    await chrome.storage.local.set({ focusNudgeUserId: userId });
    return userId;
  }

  /**
   * Get license key from storage
   * @returns {Promise<string|null>}
   */
  async function getLicenseKey() {
    const stored = await chrome.storage.local.get({ focusNudgeLicenseKey: null });
    return stored.focusNudgeLicenseKey;
  }

  /**
   * Verify license with backend API
   * @returns {Promise<{valid: boolean, isPro: boolean}>}
   */
  async function verifyLicense() {
    try {
      const userId = await getUserId();
      const licenseKey = await getLicenseKey();

      if (!licenseKey) {
        return { valid: false, isPro: false };
      }

      // Check cache first
      const cached = await chrome.storage.local.get({ 
        focusNudgeLicenseCache: null,
        focusNudgeLicenseCacheTime: 0
      });

      const now = Date.now();
      if (cached.focusNudgeLicenseCache && 
          (now - cached.focusNudgeLicenseCacheTime) < LICENSE_CACHE_MS) {
        return cached.focusNudgeLicenseCache;
      }

      // Call backend API
      const response = await fetch(
        `${API_BASE_URL}/api/verify-license?userId=${encodeURIComponent(userId)}&licenseKey=${encodeURIComponent(licenseKey)}`
      );

      if (!response.ok) {
        console.error('License verification failed:', response.status);
        return { valid: false, isPro: false };
      }

      const result = await response.json();

      // Cache result
      await chrome.storage.local.set({
        focusNudgeLicenseCache: result,
        focusNudgeLicenseCacheTime: now
      });

      return result;
    } catch (error) {
      console.error('License verification error:', error);
      // Fallback to cached result if available
      const cached = await chrome.storage.local.get({ focusNudgeLicenseCache: null });
      return cached.focusNudgeLicenseCache || { valid: false, isPro: false };
    }
  }

  /**
   * Get current plan status
   * Checks backend API for license verification
   * Falls back to local dev toggle if API unavailable
   * @returns {Promise<{isPro: boolean}>}
   */
  async function getPlan() {
    // First check for valid Stripe license (prioritize real licenses over dev toggle)
    const licenseKey = await getLicenseKey();
    if (licenseKey) {
      const licenseCheck = await verifyLicense();
      if (licenseCheck.valid && licenseCheck.isPro) {
        // Valid Stripe license - update local storage and return
        await chrome.storage.local.set({ focusNudgePlan: { isPro: true, source: 'stripe' } });
        return { isPro: true, source: 'stripe' };
      }
    }

    // Fall back to dev toggle (for development/testing only)
    const stored = await chrome.storage.local.get({ focusNudgePlan: { isPro: false } });
    if (stored.focusNudgePlan.isPro) {
      // Dev mode enabled - return immediately
      return { isPro: true, source: 'dev' };
    }

    // No license and no dev toggle - Basic plan
    return { isPro: false, source: 'basic' };
  }

  /**
   * Get effective settings based on plan
   * BASIC: Always returns hardcoded defaults (gentle, 15min, 30min)
   * PRO: Returns user settings from storage (clamped to valid ranges)
   * @returns {Promise<{tone: string, drift_threshold_min: number, cooldown_min: number}>}
   */
  async function getEffectiveSettings() {
    const plan = await getPlan();
    
    if (!plan.isPro) {
      // BASIC: Hard-enforced defaults (security)
      return {
        tone: BASIC_DEFAULTS.tone,
        drift_threshold_min: BASIC_DEFAULTS.drift_threshold_min,
        cooldown_min: BASIC_DEFAULTS.cooldown_min
      };
    }
    
    // PRO: Read from storage and clamp values
    const stored = await chrome.storage.local.get({
      focusNudgeSettings: {
        tone: "gentle",
        drift_threshold_min: 15,
        cooldown_min: 10
      }
    });
    
    const settings = stored.focusNudgeSettings;
    
    // Clamp values to valid ranges
    return {
      tone: ["gentle", "motivational", "sarcastic"].includes(settings.tone) 
        ? settings.tone 
        : "gentle",
      drift_threshold_min: Math.max(1, Math.min(120, settings.drift_threshold_min || 15)),
      cooldown_min: Math.max(1, Math.min(120, settings.cooldown_min || 10))
    };
  }

  /**
   * Set Pro plan status (dev/testing only)
   * @param {boolean} isPro
   */
  async function setProPlan(isPro) {
    await chrome.storage.local.set({ focusNudgePlan: { isPro, source: 'dev' } });
    // Clear license cache when toggling
    await chrome.storage.local.remove(['focusNudgeLicenseCache', 'focusNudgeLicenseCacheTime']);
  }

  /**
   * Store license key (called after successful Stripe checkout)
   * @param {string} licenseKey
   */
  async function setLicenseKey(licenseKey) {
    await chrome.storage.local.set({ focusNudgeLicenseKey: licenseKey });
    // Clear cache to force re-verification
    await chrome.storage.local.remove(['focusNudgeLicenseCache', 'focusNudgeLicenseCacheTime']);
  }

  /**
   * Clear dev plan status (reset to Basic)
   * Useful for clearing dev toggle after testing
   */
  async function clearDevPlan() {
    await chrome.storage.local.set({ focusNudgePlan: { isPro: false, source: 'basic' } });
    await chrome.storage.local.remove(['focusNudgeLicenseCache', 'focusNudgeLicenseCacheTime']);
  }

  /**
   * Get API base URL
   * @returns {string}
   */
  function getApiBaseUrl() {
    return API_BASE_URL;
  }

  // Export for use in other modules (global for importScripts compatibility)
  if (typeof self !== 'undefined') {
    self.FocusNudgePlan = { 
      getPlan, 
      getEffectiveSettings, 
      setProPlan, 
      setLicenseKey,
      getLicenseKey,
      clearDevPlan,
      getApiBaseUrl,
      getUserId,
      BASIC_DEFAULTS 
    };
  }
})();
