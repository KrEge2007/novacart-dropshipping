/* ============================================================
   Kinetic — shared store logic (catalog loading, cart, toast)
   Used by both the home page (app.js) and product pages
   (product.js). Loaded first.
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

const FREE_SHIPPING_AT = 60;

const store = {
  products: [],
  meta: null,
  cart: JSON.parse(localStorage.getItem("kinetic-cart") || "{}"),
};

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

/* ---------- scroll reveals (shared) ---------- */

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
  document
    .querySelectorAll(".reveal:not(.in), .reveal-line:not(.in)")
    .forEach((el) => io.observe(el));
}

/* ---------- smart header ---------- */
// Frosted when scrolled; hides on scroll down, returns on scroll up.

(() => {
  const header = document.querySelector(".header");
  if (!header) return;
  let lastY = window.scrollY;
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      header.classList.toggle("header--scrolled", y > 8);
      if (y > 160 && y > lastY + 4) header.classList.add("header--hidden");
      else if (y < lastY - 4 || y <= 160) header.classList.remove("header--hidden");
      lastY = y;
    },
    { passive: true }
  );
})();

/* ---------- view transitions (card image morphs into product hero) ----------
   Chromium-only progressive enhancement; a no-op elsewhere. The clicked
   card's image gets the shared view-transition-name just before navigation,
   pairing it with the product page's first image. */

document.addEventListener("click", (e) => {
  const link = e.target.closest(".card-link");
  if (!link) return;
  const img = link.parentElement?.querySelector(".card-media img");
  if (img) img.style.viewTransitionName = "product-hero";
});

// Clear stale names when a page is restored from the back/forward cache,
// so two cards never share the transition name.
window.addEventListener("pageshow", () => {
  document.querySelectorAll(".card-media img").forEach((el) => {
    el.style.viewTransitionName = "";
  });
});

/* ---------- cart ---------- */

function saveCart() {
  localStorage.setItem("kinetic-cart", JSON.stringify(store.cart));
}

function addToCart(id, qty = 1) {
  store.cart[id] = (store.cart[id] || 0) + qty;
  saveCart();
  renderCart();
  const badge = $("#cart-count");
  badge.classList.remove("pop");
  void badge.offsetWidth; // restart the animation
  badge.classList.add("pop");
  toast("Added to cart");
}

function cartEntries() {
  return Object.entries(store.cart)
    .map(([id, qty]) => ({ product: store.products.find((p) => p.id === id), qty }))
    .filter((e) => e.product && e.qty > 0);
}

function renderCart() {
  const entries = cartEntries();
  const count = entries.reduce((n, e) => n + e.qty, 0);
  const total = entries.reduce((n, e) => n + e.product.price * e.qty, 0);

  $("#cart-count").textContent = count;
  $("#cart-total").textContent = money(total);

  const ship = $("#cart-shipnote");
  if (!count) ship.textContent = "";
  else if (total >= FREE_SHIPPING_AT) ship.textContent = "Free shipping unlocked.";
  else ship.textContent = `${money(FREE_SHIPPING_AT - total)} away from free shipping.`;

  const body = $("#cart-items");
  if (!entries.length) {
    body.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
    return;
  }
  body.innerHTML = entries
    .map(
      ({ product: p, qty }, i) => `
    <div class="cart-line" style="--i:${i}">
      <img src="${esc(p.image)}" alt="" />
      <div class="cart-line-info">
        <strong>${esc(p.name)}</strong>
        <span class="muted">${money(p.price)}</span>
        <div class="qty">
          <button data-id="${esc(p.id)}" data-d="-1" aria-label="Decrease quantity">−</button>
          <span>${qty}</span>
          <button data-id="${esc(p.id)}" data-d="1" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <span class="cart-line-price">${money(p.price * qty)}</span>
    </div>`
    )
    .join("");
}

document.addEventListener("click", (e) => {
  const qty = e.target.closest(".qty button");
  if (qty) {
    const id = qty.dataset.id;
    store.cart[id] = (store.cart[id] || 0) + Number(qty.dataset.d);
    if (store.cart[id] <= 0) delete store.cart[id];
    saveCart();
    renderCart();
  }
});

function openCart(open) {
  const cart = $("#cart");
  cart.classList.toggle("open", open);
  $("#scrim").classList.toggle("show", open);
  // Stagger the line items only on open, not on every qty re-render.
  if (open) {
    cart.classList.add("cart--fresh");
    clearTimeout(openCart._t);
    openCart._t = setTimeout(() => cart.classList.remove("cart--fresh"), 900);
  }
}

$("#cart-btn").addEventListener("click", () => openCart(true));
$("#cart-close").addEventListener("click", () => openCart(false));
$("#scrim").addEventListener("click", () => openCart(false));

$("#checkout-btn").addEventListener("click", () => {
  if (!cartEntries().length) return toast("Your cart is empty");
  toast("Demo store — connect Stripe or Snipcart to accept orders (see README)");
});
