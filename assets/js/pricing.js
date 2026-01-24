/* assets/js/pricing.js
Stripe Checkout (Redirect) — compatible embeds (Fourthwall/iframe)
Backend: POST /api/billing/create-checkout-session { sku }
*/

(function () {
  "use strict";

  function $(sel) {
    return document.querySelector(sel);
  }

  function setStatus(msg, type) {
    const el = $("#pricing-status");
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "";
  }

  function redirectToCheckout(url) {
    if (!url) return;
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url; // break out of iframe (Fourthwall)
      } else {
        window.location.href = url;
      }
    } catch (e) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function safeJson(res) {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    if (ct.includes("application/json")) {
      try { return JSON.parse(text); } catch { return { ok:false, error:"INVALID_JSON_RESPONSE" }; }
    }
    return { ok:false, error:`NON_JSON_RESPONSE_HTTP_${res.status}`, details:text.slice(0,200) };
  }

  async function buySku(sku) {
    setStatus("Redirection vers Stripe…", "loading");
    let res;
    try {
      res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sku }),
      });
    } catch {
      setStatus("", "");
      alert("Erreur réseau.");
      return;
    }

    const data = await safeJson(res);
    const ok = !!(data && (data.ok === true || data.success === true));
    if (!data || !ok) {
      setStatus("", "");
      if (res.status === 401 || data?.error === "TWITCH_AUTH_REQUIRED") {
        alert("Connexion Twitch requise.");
        return;
      }
      const msg = (data?.error || data?.message || "");
      if (msg && /No such price/i.test(msg)) {
        alert(msg + "\n\n👉 Mismatch TEST/LIVE : tes price_ existent en test mais tu utilises une clé live (ou l'inverse). Mets STRIPE_SECRET_KEY et STRIPE_PRICE_* dans le même mode.");
        return;
      }
      alert(msg || "Erreur checkout.");
      return;
    }
      alert(data?.error || data?.message || "Erreur checkout.");
      return;
    }
    redirectToCheckout(extractUrl(data));
  }

  function wireButtons() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sku]");
      if (!btn) return;
      e.preventDefault();
      buySku(btn.getAttribute("data-sku"));
    });
  }

  window.EVEY_BILLING = { buySku };
  wireButtons();
})();
