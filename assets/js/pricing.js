/* assets/js/pricing.js
   Fourthwall/iframe-safe Stripe Checkout redirect.
   Keeps your existing server response contract and ONLY fixes iframe redirect.

   Accepts response shapes like:
     { url: "https://checkout.stripe.com/..." }
     { checkoutUrl: "..." }
     { sessionUrl: "..." }
     { ok:true, url:"..." }
     { data:{ url:"..." } }
*/

(function () {
  "use strict";

  function redirectOutOfIframe(url) {
    if (!url) return;
    try {
      if (window.top && window.top !== window) window.top.location.href = url;
      else window.location.href = url;
    } catch (e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function extractUrl(payload) {
    if (!payload) return null;
    if (typeof payload === "string") return payload;

    const direct =
      payload.url ||
      payload.checkoutUrl ||
      payload.sessionUrl ||
      payload.redirectUrl ||
      payload.checkout_url ||
      payload.session_url;

    if (direct) return direct;

    if (payload.data) {
      const nested =
        payload.data.url ||
        payload.data.checkoutUrl ||
        payload.data.sessionUrl ||
        payload.data.redirectUrl;
      if (nested) return nested;
    }

    if (payload.session && payload.session.url) return payload.session.url;
    return null;
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {}),
    });

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }

    return { res, text, json };
  }

  async function buySku(sku) {
    if (!sku) return;

    const { res, text, json } = await postJson("/api/billing/create-checkout-session", { sku });

    const payload = json || text;
    const checkoutUrl = extractUrl(payload);

    if (!res.ok || !checkoutUrl) {
      const msg =
        (json && (json.message || json.error)) ||
        (typeof text === "string" ? text.slice(0, 160) : "") ||
        "Erreur checkout.";
      alert(msg);
      return;
    }

    redirectOutOfIframe(checkoutUrl);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sku]");
    if (!btn) return;
    e.preventDefault();
    buySku(btn.getAttribute("data-sku"));
  });

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

  window.EVEY_BILLING = { buySku };
})();
