/* ============================================================
   Haqua-Q — Landing (v3, post red-team 08/07/2026)
   1) Capture GCLID -> sessionStorage (RIEN en cookie avant consentement)
   2) Consentement RGPD (Consent Mode v2 + Clarity) + beacon de mesure du taux
   3) Validation stricte des champs (un POST ne part JAMAIS vide)
   4) Soumission -> connecteur Apps Script -> merci.html (GCLID + lid propagés)
   5) Tracking clics tel: et WhatsApp (conversions secondaires)
   ============================================================ */

const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbx6_3zuQB1ClDu_HpQQQwu4naeGpc6NjILEOkv2iq_aKuXy7g0ZsXszzl03z-bGbL7I/exec";
const ENVOI_REEL = true;
const CONV_TEL = "AW-18269579591/Ct0YCPjE-cscEMfSzodE";       // action secondaire « Clic appel (landing) »
const CONV_WA  = "AW-18269579591/ae2tCPvE-cscEMfSzodE";       // action secondaire « Contact WhatsApp (landing) »
const T0 = Date.now();                                        // anti-bot : délai minimal de soumission

/* ---------- 1) Identifiants publicitaires (sessionStorage, pas de cookie pré-consentement) ---------- */
function getParam(n){ return new URLSearchParams(window.location.search).get(n); }
function captureClickIds(){
  ["gclid","gbraid","wbraid"].forEach(function(k){
    const v = getParam(k);
    if (v){ try{ sessionStorage.setItem("hq_"+k, v); }catch(e){} }
  });
}
function storedId(k){ try{ return sessionStorage.getItem("hq_"+k) || ""; }catch(e){ return ""; } }
function fillHiddenFields(){
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.value=val||""; };
  set("gclid",  getParam("gclid")  || storedId("gclid"));
  set("gbraid", getParam("gbraid") || storedId("gbraid"));
  set("wbraid", getParam("wbraid") || storedId("wbraid"));
  set("utm_source",   getParam("utm_source"));
  set("utm_medium",   getParam("utm_medium"));
  set("utm_campaign", getParam("utm_campaign"));
  set("utm_term",     getParam("utm_term"));
  set("utm_content",  getParam("utm_content"));
  set("utm_adgroup",  getParam("utm_adgroup"));
  set("page_origine", window.location.href);
  set("referrer",     document.referrer);
  const c = document.getElementById("consent_ads");
  if (c) c.value = localStorage.getItem("damac_consent") || "unset";
}

/* ---------- 2) Consentement + beacon ---------- */
function appliquerConsentement(accord){
  if (typeof gtag === "function"){
    gtag('consent','update',{
      ad_storage:        accord ? 'granted':'denied',
      ad_user_data:      accord ? 'granted':'denied',
      ad_personalization:accord ? 'granted':'denied',
      analytics_storage: accord ? 'granted':'denied'
    });
  }
  if (typeof clarity === "function"){
    clarity('consentv2', { ad_Storage: accord?'granted':'denied', analytics_Storage: accord?'granted':'denied' });
  }
  const c = document.getElementById("consent_ads");
  if (c) c.value = accord ? "granted" : "denied";
}
function beaconConsent(v){
  // mesure du taux de consentement (facteur de correction du CPL) — fire & forget
  try{ fetch(FORM_ENDPOINT + "?evt=consent&v=" + v, {method:"GET", mode:"no-cors", keepalive:true}); }catch(e){}
}
function gererBandeauCookies(){
  const choix = localStorage.getItem("damac_consent");
  const banniere = document.getElementById("cookie");
  if (choix === "granted"){ appliquerConsentement(true); return; }
  if (choix === "denied"){ appliquerConsentement(false); return; }
  if (banniere) banniere.style.display = "block";
  const ok = document.getElementById("cookie-ok");
  const no = document.getElementById("cookie-no");
  if (ok) ok.onclick = function(){ localStorage.setItem("damac_consent","granted"); appliquerConsentement(true); beaconConsent("granted"); banniere.style.display="none"; };
  if (no) no.onclick = function(){ localStorage.setItem("damac_consent","denied");  appliquerConsentement(false); beaconConsent("denied");  banniere.style.display="none"; };
}

/* ---------- 3) Validation ---------- */
function validerFormulaire(form, err){
  const nom = (form.querySelector("#nom")||{}).value || "";
  const tel = ((form.querySelector("#tel")||{}).value || "").replace(/[\s.\/-]/g,"");
  const cp  = (form.querySelector("#cp")||{}).value || "";
  const msg = (t)=>{ if(err){ err.textContent=t; err.style.display="block"; } return false; };
  if (nom.trim().length < 2) return msg("Merci d'indiquer votre nom.");
  // BE fixe/mobile (+32 ou 0…, 8-9 chiffres après préfixe) ou Luxembourg (+352…)
  if (!(/^(\+32\d{8,9}|0\d{8,9}|\+352\d{6,9})$/.test(tel))) return msg("Merci de vérifier votre numéro de téléphone (ex. 0484 12 34 56).");
  if (!/^\d{4}$/.test(cp.trim())) return msg("Merci d'indiquer un code postal à 4 chiffres.");
  const consent = form.querySelector("#consent");
  if (consent && !consent.checked) return msg("Merci d'accepter d'être recontacté(e) pour traiter votre demande.");
  // anti-bot : honeypot rempli ou soumission < 3 s après chargement
  const hp = form.querySelector("#website");
  if ((hp && hp.value) || (Date.now() - T0 < 3000)) return msg("Merci de réessayer dans un instant.");
  if (err) err.style.display = "none";
  return true;
}

/* ---------- 4) Soumission ---------- */
function gererFormulaire(){
  const form = document.getElementById("lead-form");
  if (!form) return;
  let started = false;
  form.addEventListener("focusin", function(){
    if (!started){ started = true; if (typeof clarity === "function") clarity("event","form_start"); }
  });
  form.addEventListener("submit", function(e){
    e.preventDefault();
    const err = document.getElementById("form-err");
    if (!validerFormulaire(form, err)) return;

    const produit = form.getAttribute("data-produit") || "";
    const lid = "hq-" + Date.now() + "-" + Math.random().toString(36).slice(2,8);
    const qs = new URLSearchParams({ produit: produit, lid: lid });
    ["gclid","gbraid","wbraid"].forEach(function(k){
      const v = getParam(k) || storedId(k); if (v) qs.set(k, v);
    });
    const destination = "merci.html?" + qs.toString();
    try{ sessionStorage.setItem("hq_lead_ok", String(Date.now())); sessionStorage.setItem("hq_lid", lid); }catch(e){}

    if (!ENVOI_REEL){ window.location.href = destination; return; }
    const payload = new URLSearchParams(new FormData(form));
    payload.set("lid", lid);
    const btn = form.querySelector("button[type=submit]");
    if(btn){ btn.disabled=true; btn.textContent="Envoi en cours…"; }
    fetch(FORM_ENDPOINT, { method:"POST", mode:"no-cors", body:payload, keepalive:true })
      .then(function(){ window.location.href = destination; })
      .catch(function(){
        if(err){ err.textContent="Une erreur est survenue. Appelez-nous au 0484 78 61 54 ou réessayez."; err.style.display="block"; }
        if(btn){ btn.disabled=false; btn.textContent="Recevoir mon devis gratuit"; }
      });
  });
}

/* ---------- 5) Tracking clics tel / WhatsApp (conversions secondaires) ---------- */
function trackContacts(){
  document.querySelectorAll('a[href^="tel:"]').forEach(function(a){
    a.addEventListener("click", function(){
      if (typeof gtag === "function") gtag('event','conversion',{ send_to: CONV_TEL });
      if (typeof clarity === "function") clarity("event","tel_click");
    });
  });
  document.querySelectorAll('a[href*="wa.me"]').forEach(function(a){
    a.addEventListener("click", function(){
      if (typeof gtag === "function") gtag('event','conversion',{ send_to: CONV_WA });
      if (typeof clarity === "function") clarity("event","whatsapp_click");
    });
  });
}


/* ---------- 6) Message-match dynamique (H1/lede selon le groupe d annonces, via utm_adgroup) ----------
   Positionnement NEUTRE uniquement (jamais de comparaison negative — interdit client). */
function messageMatch(){
  var ag = getParam("utm_adgroup") || "";
  var h1 = document.querySelector(".hero h1");
  var lede = document.querySelector(".lede");
  if (!h1 || !ag) return;
  var MAP = {
    "199131608818": { // HQ1 Conquete Osmose
      h1: "L’alternative belge à l’osmoseur : vos minéraux conservés.",
      lede: "<b>Haqua-Q, le système d’ultrafiltration complet</b> : une eau plus saine dans <b>toute la maison</b> — sans déminéraliser, sans produits chimiques."
    },
    "196843700526": { // HQ4 Filtre Robinet
      h1: "Bien plus qu’un filtre robinet : l’eau pure dans toute la maison.",
      lede: "<b>Haqua-Q s’installe après votre compteur</b> : boisson, cuisson et douche purifiées par une seule installation — sans produits chimiques."
    },
    "201206850154": { // HQ2 Systeme/Maison
      h1: "Le système de filtration d’eau complet pour la maison.",
      lede: "<b>Haqua-Q, ultrafiltration belge</b> : microplastiques, PFAS et chlore réduits, minéraux conservés — dans <b>toute la maison</b>."
    }
  };
  var v = MAP[ag];
  if (v){ h1.innerHTML = v.h1; if (lede) lede.innerHTML = v.lede; }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", function(){
  captureClickIds();
  messageMatch();
  fillHiddenFields();
  gererBandeauCookies();
  gererFormulaire();
  trackContacts();
});
