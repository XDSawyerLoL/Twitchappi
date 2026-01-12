// StreamerHub UI bindings (no inline onclick)
//
// HTML uses: data-action="..." and optional data-arg="...".
// This module dispatches clicks and calls functions (mostly attached to window).

function callWindowFn(name, ...args) {
  const fn = window[name];
  if (typeof fn === "function") return fn(...args);
  console.warn(`[bind-actions] Missing window.${name}()`);
  return undefined;
}

export function bindActions() {
  // Stop propagation for modal cards etc.
  document.querySelectorAll('[data-stop-prop="true"]').forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  // Generic click dispatcher using event delegation
  document.addEventListener("click", (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;

    const action = el.dataset.action;
    const arg = el.dataset.arg;

    switch (action) {
      case "cycle":
        return callWindowFn("cycle", arg);
      case "openTab":
        return callWindowFn("openTab", e, arg);
      case "toggleChatMode":
        return callWindowFn("toggleChatMode", arg);
      case "setTwitFlixView":
        return callWindowFn("setTwitFlixView", arg);
      case "closeMosaic":
        return callWindowFn("closeMosaic", e);
      case "closeFantasy":
        return callWindowFn("closeFantasy", e);
      case "hideMktEditModal": {
        const modal = document.getElementById("mkt-edit-modal");
        if (modal) modal.classList.add("hidden");
        return;
      }
      default:
        return callWindowFn(action);
    }
  });
}
