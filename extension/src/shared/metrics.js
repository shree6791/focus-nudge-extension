// Metrics module: Weekly counters, early exit detection

// Prevent redeclaration if module is loaded multiple times
(function() {
  'use strict';
  
  if (typeof self !== 'undefined' && self.FocusNudgeMetrics) {
    return; // Already loaded
  }

  const EARLY_EXIT_WINDOW_MS = 120000; // 2 minutes

  const METRICS_KEY = "focusNudgeMetrics";

  /**
   * Get Monday 00:00 in local timezone for current week
   * @returns {number} Timestamp in milliseconds
   */
  function getCurrentWeekStartMs() {
    const now = new Date();
    const day = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const daysToMonday = day === 0 ? 6 : day - 1; // Days to subtract to get Monday
    
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);
    
    return monday.getTime();
  }

  /**
   * Ensure week is initialized, reset counters if week changed
   * @returns {Promise<void>}
   */
  async function ensureWeekInitialized() {
    const currentWeekStart = getCurrentWeekStartMs();
    const stored = await chrome.storage.local.get({ [METRICS_KEY]: {} });
    const metrics = stored[METRICS_KEY] || {};
    
    if (!metrics.week_start_ms || metrics.week_start_ms !== currentWeekStart) {
      // Week changed or first time - reset counters
      await chrome.storage.local.set({
        [METRICS_KEY]: {
          week_start_ms: currentWeekStart,
          nudges_fired_weekly: 0,
          early_exits_weekly: 0,
          last_nudge_shown_ms: null
        }
      });
    }
  }

  /**
   * Record that a nudge was shown
   * @param {number} tsMs Timestamp when nudge was shown
   * @returns {Promise<void>}
   */
  async function recordNudgeShown(tsMs) {
    await ensureWeekInitialized();
    
    const stored = await chrome.storage.local.get({ [METRICS_KEY]: {} });
    const metrics = stored[METRICS_KEY] || {};
    
    await chrome.storage.local.set({
      [METRICS_KEY]: {
        ...metrics,
        nudges_fired_weekly: (metrics.nudges_fired_weekly || 0) + 1,
        last_nudge_shown_ms: tsMs
      }
    });
  }

  /**
   * Check if early exit should be recorded and record it
   * @param {number} exitTsMs Timestamp when user left LinkedIn
   * @returns {Promise<boolean>} True if early exit was recorded
   */
  async function maybeRecordEarlyExit(exitTsMs) {
    await ensureWeekInitialized();
    
    const stored = await chrome.storage.local.get({ [METRICS_KEY]: {} });
    const metrics = stored[METRICS_KEY] || {};
    
    if (!metrics.last_nudge_shown_ms) {
      return false; // No nudge was shown
    }
    
    const timeSinceNudge = exitTsMs - metrics.last_nudge_shown_ms;
    
    if (timeSinceNudge > 0 && timeSinceNudge <= EARLY_EXIT_WINDOW_MS) {
      // Early exit detected
      await chrome.storage.local.set({
        [METRICS_KEY]: {
          ...metrics,
          early_exits_weekly: (metrics.early_exits_weekly || 0) + 1,
          last_nudge_shown_ms: null // Clear after recording
        }
      });
      return true;
    }
    
    return false;
  }

  /**
   * Get weekly summary
   * @returns {Promise<{nudges: number, early_exits: number, estimated_minutes: number}>}
   */
  async function getWeeklySummary() {
    await ensureWeekInitialized();
    
    const stored = await chrome.storage.local.get({ [METRICS_KEY]: {} });
    const metrics = stored[METRICS_KEY] || {};
    
    const nudges = metrics.nudges_fired_weekly || 0;
    const earlyExits = metrics.early_exits_weekly || 0;
    const estimatedMinutes = earlyExits * 5; // Rough estimate
    
    return {
      nudges,
      early_exits: earlyExits,
      estimated_minutes: estimatedMinutes
    };
  }

  /**
   * Reset weekly summary for current week
   * @returns {Promise<void>}
   */
  async function resetWeeklySummary() {
    const currentWeekStart = getCurrentWeekStartMs();
    await chrome.storage.local.set({
      [METRICS_KEY]: {
        week_start_ms: currentWeekStart,
        nudges_fired_weekly: 0,
        early_exits_weekly: 0,
        last_nudge_shown_ms: null
      }
    });
  }

  // Export for use in other modules (global for importScripts compatibility)
  if (typeof self !== 'undefined') {
    self.FocusNudgeMetrics = {
      getCurrentWeekStartMs,
      ensureWeekInitialized,
      recordNudgeShown,
      maybeRecordEarlyExit,
      getWeeklySummary,
      resetWeeklySummary,
      EARLY_EXIT_WINDOW_MS
    };
  }
})();
