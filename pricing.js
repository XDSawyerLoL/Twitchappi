/* assets/js/pricing.js
   Minimal fix for embedded contexts (Fourthwall/iframe):
   - Keeps the existing backend contract: POST /api/billing/create-checkout-session { sku }
   - Only change: redirect uses window.top (break out of iframe), with safe fallback.
*/

(function () {
  "use strict";

  function redirectOutOfIframe(url) {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url; // ✅ break out of iframe
      } else {
        window.location.href = url;
      }
    } catch (e) {
      // If iframe sandbox/cross-origin blocks access to window.top
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function buySku(sku) {
    if (!sku) return;

    const res = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sku }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || data.ok !== true || !data.url) {
      // Keep behavior minimal; show a simple message
      alert((data && (data.error || data.message)) || "Erreur checkout.");
      return;
    }

    redirectOutOfIframe(data.url);
  }

  // Buttons: <button data-sku="credits_500">...</button>
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sku]");
    if (!btn) return;
    e.preventDefault();
    buySku(btn.getAttribute("data-sku"));
  });

  // Optional legacy IDs (won't hurt if absent)
  const legacy = [
    ["buy-credits-500", "credits_500"],
    ["buy-credits-1250", "credits_1250"],
    ["buy-premium", "premium_monthly"],
  ];
  legacy.forEach(([id, sku]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      buySku(sku);
    });
  });

  // Expose for manual testing in console:
  // EVEY_BILLING.buySku('credits_500')
  window.EVEY_BILLING = { buySku };
})();
