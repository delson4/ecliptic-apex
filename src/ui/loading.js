/**
 * Loading overlay: show/hide a "please wait" screen during heavy operations.
 */

const overlay = document.getElementById("loading-overlay");
const textEl = document.getElementById("loading-text");
const controlsPanel = document.getElementById("controls-panel");

/**
 * Show the loading overlay with an optional message.
 * @param {string} [message="Please wait..."]
 */
export function showLoading(message = "Please wait...") {
  if (textEl) textEl.textContent = message;
  if (overlay) overlay.classList.remove("hidden");
  if (controlsPanel) controlsPanel.classList.add("disabled");
}

/**
 * Hide the loading overlay and re-enable controls.
 */
export function hideLoading() {
  if (overlay) overlay.classList.add("hidden");
  if (controlsPanel) controlsPanel.classList.remove("disabled");
}
