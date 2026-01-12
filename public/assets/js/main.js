// StreamerHub - ES Module entrypoint (single HTML page)

import "./core/app-bootstrap.js";
import "./modules/player/ambilight-vibe.js";
import "./modules/layout/sidepanel-dock-fix.js";
import "./modules/market/market-overlay.js";
import "./modules/ui/sidepanel-tabs.js";
import "./modules/ui/help-tooltips.js";
import { bindActions } from "./modules/ui/bind-actions.js";

// Bind UI actions once the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => bindActions(), { once: true });
} else {
  bindActions();
}
