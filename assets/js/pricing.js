/* assets/js/pricing.js
Stripe Checkout (Redirect) — compatible embeds (Fourthwall/iframe)
Backend: POST /api/billing/create-checkout-session { sku }
Expected JSON:
  - success: { ok:true, url:"https://checkout.stripe.com/..." }
  - error:   { ok:false, error:"CODE", message?:"...", details?:... }
*/

(function () {
  "use strict";

  function $(sel){ return document.querySelector(sel); }

  function setStatus(msg, type){
    const el = $("#pricing-status");
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.type = type || "";
  }

  function redirectToCheckout(url){
    if (!url) return;
    try{
      if (window.top && window.top !== window) window.top.location.href = url;
      else window.location.href = url;
    }catch(e){
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function readResponse(res){
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    let json = null;
    if (ct.includes("application/json")) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    return { ct, text, json };
  }

  function prettyError(res, payload){
    if (res.status === 401) return "Connexion Twitch requise (401).";
    if (res.status === 404) return "Endpoint billing introuvable (404). Vérifie /api/billing/create-checkout-session.";
    if (payload?.json?.error) return `${payload.json.error}${payload.json.message ? " — " + payload.json.message : ""}`;
    if (payload?.json && payload.json.ok === false) return "Checkout refusé par le serveur (ok:false).";
    if (payload?.ct && !payload.ct.includes("application/json")) return `Réponse non-JSON (${res.status}). Souvent une page HTML d’erreur/proxy.`;
    return `Erreur checkout (${res.status}).`;
  }

  async function buySku(sku){
    if (!sku) { alert("SKU manquant."); return; }

    setStatus("Ouverture du paiement…", "loading");

    let res;
    try{
      res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sku }),
      });
    }catch(e){
      setStatus("", "");
      alert("Erreur réseau (fetch).");
      return;
    }

    const payload = await readResponse(res);

    console.log("[BILLING] HTTP", res.status, res.statusText);
    console.log("[BILLING] content-type:", payload.ct);
    console.log("[BILLING] body (first 500):", (payload.text || "").slice(0, 500));
    if (payload.json) console.log("[BILLING] json:", payload.json);

    if (!res.ok){
      setStatus("", "");
      alert(prettyError(res, payload));
      return;
    }

    const data = payload.json;
    if (!data || data.ok !== true || !data.url){
      setStatus("", "");
      const msg = data?.error
        ? `${data.error}${data.message ? " — " + data.message : ""}`
        : "Réponse inattendue du serveur (pas de url). Regarde la console Network.";
      alert(msg);
      return;
    }

    setStatus("Redirection…", "loading");
    redirectToCheckout(data.url);
  }

  function wireButtons(){
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
