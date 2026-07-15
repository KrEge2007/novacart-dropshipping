/* ============================================================
   Waggle & Co. — shared store logic
   Catalog loading, cart drawer, toast, ratings, scroll reveals.
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

const FREE_SHIPPING_AT = 50;

// CJ supplier photos are square studio shots (often with baked-in text):
// they need object-fit: contain on white, while lifestyle placeholders
// look best cropped with cover. Decided per image URL.
const imgFit = (src) => (/cjdropshipping\.com/.test(String(src)) ? " img-contain" : "");

const store = {
  products: [],
  meta: null,
  cart: JSON.parse(localStorage.getItem("waggle-cart") || "{}"),
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

/* ---------- toast ---------- */

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2400);
}

/* ---------- catalog ---------- */

async function loadCatalog() {
  const res = await fetch("data/products.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  store.products = data.products || [];
  store.meta = data.meta || null;
  return data;
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

/* ---------- cart ---------- */

function saveCart() {
  localStorage.setItem("waggle-cart", JSON.stringify(store.cart));
}

function addToCart(id, qty = 1) {
  store.cart[id] = (store.cart[id] || 0) + qty;
  saveCart();
  renderCart();
  const badge = $("#cart-count");
  badge.classList.remove("pop");
  void badge.offsetWidth; // restart the animation
  badge.classList.add("pop");
  toast("Added to cart 🐾");
}

// Cart keys are "pid" or "pid::vid" (product variant).
function resolveCartKey(key) {
  const [pid, vid] = String(key).split("::");
  const product = store.products.find((p) => p.id === pid);
  if (!product) return null;
  const variant = vid ? (product.variants || []).find((v) => v.id === vid) : null;
  if (vid && !variant) return null;
  return {
    key,
    product,
    variant,
    price: variant?.price ?? product.price,
    image: variant?.image ?? product.image,
    label: variant ? `${product.name} · ${variant.name}` : product.name,
  };
}

function cartEntries() {
  return Object.entries(store.cart)
    .map(([key, qty]) => ({ ...resolveCartKey(key), qty }))
    .filter((e) => e.product && e.qty > 0);
}

function renderCart() {
  const entries = cartEntries();
  const count = entries.reduce((n, e) => n + e.qty, 0);
  const total = entries.reduce((n, e) => n + e.price * e.qty, 0);

  $("#cart-count").textContent = count;
  $("#cart-total").textContent = money(total);

  const ship = $("#cart-shipnote");
  const bar = $("#cart-shipbar");
  if (!count) {
    ship.textContent = "";
    if (bar) bar.style.setProperty("--fill", "0%");
  } else if (total >= FREE_SHIPPING_AT) {
    ship.textContent = "🎉 Free shipping unlocked!";
    if (bar) bar.style.setProperty("--fill", "100%");
  } else {
    ship.textContent = `${money(FREE_SHIPPING_AT - total)} away from free shipping`;
    if (bar) bar.style.setProperty("--fill", `${Math.min(100, (total / FREE_SHIPPING_AT) * 100)}%`);
  }

  const body = $("#cart-items");
  if (!entries.length) {
    body.innerHTML = `<div class="cart-empty">
      <span class="cart-empty-icon" aria-hidden="true">🐾</span>
      <p>Your cart is empty.</p>
      <a class="button button-small" href="index.html#shop">Shop bestsellers</a>
    </div>`;
    return;
  }
  body.innerHTML = entries
    .map(
      ({ key, label, image, price, qty }, i) => `
    <div class="cart-line" style="--i:${i}">
      <img src="${esc(image)}" alt="" />
      <div class="cart-line-info">
        <strong>${esc(label)}</strong>
        <span class="muted">${money(price)}</span>
        <div class="qty">
          <button data-id="${esc(key)}" data-d="-1" aria-label="Decrease quantity">−</button>
          <span>${qty}</span>
          <button data-id="${esc(key)}" data-d="1" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <span class="cart-line-price">${money(price * qty)}</span>
    </div>`
    )
    .join("");
}

document.addEventListener("click", (e) => {
  const qty = e.target.closest(".qty button");
  if (qty && qty.dataset.id) {
    const id = qty.dataset.id;
    store.cart[id] = (store.cart[id] || 0) + Number(qty.dataset.d);
    if (store.cart[id] <= 0) delete store.cart[id];
    saveCart();
    renderCart();
  }
  // Quick-add buttons on product cards (home, related, anywhere)
  const add = e.target.closest(".card-add");
  if (add) addToCart(add.dataset.id);
});

function openCart(open) {
  const cart = $("#cart");
  cart.classList.toggle("open", open);
  $("#scrim").classList.toggle("show", open);
  if (open) {
    cart.classList.add("cart--fresh");
    clearTimeout(openCart._t);
    openCart._t = setTimeout(() => cart.classList.remove("cart--fresh"), 900);
  }
}

$("#cart-btn").addEventListener("click", () => openCart(true));
$("#cart-close").addEventListener("click", () => openCart(false));
$("#scrim").addEventListener("click", () => openCart(false));

/* Checkout goes through Stripe-hosted Payment Links (one per product/
   variant, generated by scripts/sync-stripe.mjs). A payment link covers a
   single product, so a one-line cart redirects straight to Stripe; mixed
   carts check out per item via each product's Buy now for the time being. */
$("#checkout-btn").addEventListener("click", () => {
  const entries = cartEntries();
  if (!entries.length) return toast("Your cart is empty");
  const links = entries.map((e) => e.variant?.stripe?.link ?? e.product.stripe?.link);
  if (!links[0]) {
    return toast("Checkout isn't connected yet — check back soon");
  }
  if (entries.length === 1) {
    location.href = links[0];
    return;
  }
  toast("Checkout handles one product at a time for now — open a product and hit Buy now");
});

/* ---------- shared product card ---------- */

function cardHTML(p, i = 0) {
  const pct = discountPct(p);
  const fromPrice = p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.price;
  return `
    <article class="card reveal" style="--d:${(i % 4) * 90}ms" data-pet="${esc(p.petType || "both")}" data-cat="${esc(p.category)}">
      <a class="card-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}"></a>
      <div class="card-media">
        <img class="${imgFit(p.image).trim()}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
        ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ""}
        ${pct ? `<span class="card-off">−${pct}%</span>` : ""}
        <button class="card-add" data-id="${esc(p.id)}" aria-label="Add ${esc(p.name)} to cart">Add to cart</button>
      </div>
      <div class="card-info">
        ${starsHTML(p.rating, p.reviews)}
        <h3 class="card-name">${esc(p.name)}</h3>
        <p class="card-blurb">${esc(p.blurb || "")}</p>
        <p class="card-price">
          ${p.variants?.length ? `<span class="from">from</span> ` : ""}${money(fromPrice)}
          ${p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ""}
        </p>
      </div>
    </article>`;
}
