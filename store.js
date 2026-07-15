/* ============================================================
   Waggle & Co. — shared store logic
   Catalog loading, toast, ratings, product cards, scroll reveals.
   Checkout is Buy-now only: every product/variant carries a hosted
   Stripe Payment Link (stripe.link), so there is no local cart.
   Loaded before app.js (home) and product.js (product page).
   ============================================================ */

"use strict";

const $ = (sel) => document.querySelector(sel);
const money = (n) => `$${n.toFixed(2)}`;

// Escape user/API-supplied text before injecting into HTML.
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const store = {
  products: [],
  meta: null,
  reviews: [],
};

/* ---------- shared render helpers ---------- */

// ★★★★☆-style rating row with count, e.g. starsHTML(4.8, 2314)
function starsHTML(rating, reviews) {
  if (!rating) return "";
  const full = Math.round(rating);
  const stars = "★".repeat(full) + "☆".repeat(5 - full);
  return `<span class="stars" aria-label="Rated ${rating} out of 5">
    <span class="stars-glyphs">${stars}</span>
    <span class="stars-meta">${rating}${reviews ? ` · ${reviews.toLocaleString("en-US")}` : ""}</span>
  </span>`;
}

function discountPct(p) {
  if (!p.compareAt || p.compareAt <= p.price) return 0;
  return Math.round((1 - p.price / p.compareAt) * 100);
}

// CJ supplier photos are square studio shots (often with baked-in text):
// they need object-fit: contain on white, while lifestyle placeholders
// look best cropped with cover. Decided per image URL.
const imgFit = (src) => (/cjdropshipping\.com/.test(String(src)) ? " img-contain" : "");

/* ---------- toast ---------- */

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ---------- catalog ---------- */

async function loadCatalog() {
  const res = await fetch("data/products.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  store.products = data.products || [];
  store.meta = data.meta || null;

  // Real reviews only (data/reviews.json, curated by hand). Product ratings
  // are DERIVED from them — no reviews, no stars, anywhere on the site.
  try {
    const rres = await fetch("data/reviews.json", { cache: "no-cache" });
    store.reviews = rres.ok ? (await rres.json()).reviews || [] : [];
  } catch {
    store.reviews = [];
  }
  const byProduct = new Map();
  for (const r of store.reviews) {
    if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
    byProduct.get(r.productId).push(r);
  }
  for (const p of store.products) {
    const list = byProduct.get(p.id);
    if (list?.length) {
      p.rating = Math.round((list.reduce((n, r) => n + r.rating, 0) / list.length) * 10) / 10;
      p.reviews = list.length;
    }
  }
  return data;
}

function reviewsFor(productId) {
  return store.reviews.filter((r) => r.productId === productId);
}

function reviewCardHTML(r, i = 0) {
  return `
    <figure class="review-card reveal" style="--d:${(i % 3) * 120}ms">
      <div class="review-stars" aria-label="${r.rating} out of 5 stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
      <blockquote>“${esc(r.text)}”</blockquote>
      <figcaption>${esc(r.name)} <span>&amp; ${esc(r.pet)}${r.verified ? " · verified buyer" : ""}${
        r.incentivized ? " · received a discount for reviewing" : ""
      }</span></figcaption>
    </figure>`;
}

/* ---------- scroll reveals ---------- */

function observeReveals() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.05, rootMargin: "0px 0px -6% 0px" }
  );
  document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
}

/* ---------- header: solid once scrolled ---------- */

(() => {
  const header = document.querySelector(".header");
  if (!header) return;
  window.addEventListener(
    "scroll",
    () => header.classList.toggle("header--scrolled", window.scrollY > 12),
    { passive: true }
  );
})();

/* ---------- view transitions (card image morphs into product gallery) ----------
   Chromium-only progressive enhancement; a no-op elsewhere. */

document.addEventListener("click", (e) => {
  const link = e.target.closest(".card-link");
  if (!link) return;
  const img = link.closest(".card")?.querySelector(".card-media img");
  if (img) img.style.viewTransitionName = "product-hero";
});

window.addEventListener("pageshow", () => {
  document.querySelectorAll(".card-media img").forEach((el) => {
    el.style.viewTransitionName = "";
  });
});

/* ---------- shared product card ---------- */

// `feature` renders the wide bento variant: spans two grid columns with a
// side-by-side image/info layout and roomier typography.
function cardHTML(p, i = 0, feature = false) {
  const pct = discountPct(p);
  const fromPrice = p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.price;
  return `
    <article class="card reveal${feature ? " card--feature" : ""}" style="--d:${(i % 4) * 90}ms" data-pet="${esc(p.petType || "both")}" data-cat="${esc(p.category)}">
      <a class="card-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}"></a>
      <div class="card-media">
        <img class="${imgFit(p.image).trim()}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
        ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ""}
        ${pct ? `<span class="card-off">−${pct}%</span>` : ""}
        <span class="card-view" aria-hidden="true">View product</span>
      </div>
      <div class="card-info">
        ${starsHTML(p.rating, p.reviews)}
        <h3 class="card-name">${esc(p.name)}</h3>
        <p class="card-blurb">${esc(p.blurb || "")}</p>
        ${
          feature && p.benefits?.length
            ? `<ul class="card-benefits">${p.benefits
                .slice(0, 2)
                .map((b) => `<li>${esc(b)}</li>`)
                .join("")}</ul>`
            : ""
        }
        <p class="card-price">
          ${p.variants?.length ? `<span class="from">from</span> ` : ""}${money(fromPrice)}
          ${p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ""}
        </p>
      </div>
    </article>`;
}
