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
  document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
}

/* ---------- cart ---------- */

function saveCart() {
  localStorage.setItem("kinetic-cart", JSON.stringify(store.cart));
}

function addToCart(id, qty = 1) {
  store.cart[id] = (store.cart[id] || 0) + qty;
  saveCart();
  renderCart();
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
      ({ product: p, qty }) => `
    <div class="cart-line">
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
  $("#cart").classList.toggle("open", open);
  $("#scrim").classList.toggle("show", open);
}

$("#cart-btn").addEventListener("click", () => openCart(true));
$("#cart-close").addEventListener("click", () => openCart(false));
$("#scrim").addEventListener("click", () => openCart(false));

$("#checkout-btn").addEventListener("click", () => {
  if (!cartEntries().length) return toast("Your cart is empty");
  toast("Demo store — connect Stripe or Snipcart to accept orders (see README)");
});
