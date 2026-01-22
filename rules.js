// Simple LinkedIn mode classifier (MVP)
// GOOD: jobs, messaging, search, articles
// DRIFT: feed, notifications

window.FocusNudgeRules = {
  classifyLinkedIn() {
    const path = location.pathname || "";
    const href = location.href || "";

    // "Good" intent areas
    const goodPaths = [
      "/jobs",
      "/messaging",
      "/learning",
      "/pulse",
      "/search"
    ];

    if (goodPaths.some((p) => path.startsWith(p))) {
      return { site: "linkedin", mode: "GOOD", confidence: 0.9 };
    }

    // Drift-prone areas
    const driftPaths = ["/feed", "/notifications"];
    if (driftPaths.some((p) => path.startsWith(p))) {
      return { site: "linkedin", mode: "DRIFT", confidence: 0.9 };
    }

    // Heuristic fallback: feed-like UI
    // Look for repeated reaction bars ("Like", "Comment", "Repost")
    const bodyText = document.body?.innerText || "";
    const looksLikeFeed =
      bodyText.includes("Repost") && bodyText.includes("Comment") && bodyText.includes("Like");

    if (looksLikeFeed && href.includes("linkedin.com")) {
      return { site: "linkedin", mode: "DRIFT", confidence: 0.6 };
    }

    return { site: "linkedin", mode: "UNKNOWN", confidence: 0.4 };
  }
};
