// Settings module: User settings storage helpers

// Prevent redeclaration if module is loaded multiple times
(function() {
  'use strict';
  
  if (typeof self !== 'undefined' && self.FocusNudgeSettings) {
    return; // Already loaded
  }

  const SETTINGS_KEY = "focusNudgeSettings";
  const DEFAULT_SETTINGS = {
    tone: "gentle",
    drift_threshold_min: 15,
    cooldown_min: 10
  };

  /**
   * Get user settings
   * @returns {Promise<{tone: string, drift_threshold_min: number, cooldown_min: number}>}
   */
  async function getSettings() {
    const stored = await chrome.storage.local.get({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    return stored[SETTINGS_KEY];
  }

  /**
   * Save user settings
   * @param {Object} settings
   * @returns {Promise<void>}
   */
  async function saveSettings(settings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }

  /**
   * Get default settings
   * @returns {Object}
   */
  function getDefaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  // Export for use in other modules (global for importScripts compatibility)
  if (typeof self !== 'undefined') {
    self.FocusNudgeSettings = { getSettings, saveSettings, getDefaultSettings, DEFAULT_SETTINGS };
  }
})();
