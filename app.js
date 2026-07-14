/* ============================================================
   Kinetic storefront
   Loads data/products.json (kept fresh by the scheduled
   refresh-catalog workflow) and renders the catalog + cart.
   ============================================================ */

"use strict";

const $ = (sel) => document.querySelector(sel);
const money = (n) => `$${n.toFixed(2)}`;

const state = {
  products: [],
  filter: "all",
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
  try {
    const res = await fetch("data/products.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.products = data.products || [];
    renderRefreshNote(data.meta);
    renderFilters();
    renderGrid();
    renderCart();
  } catch (err) {
    $("#refresh-note").textContent = "Couldn't load the catalog. Please refresh the page.";
    console.error("Catalog load failed:", err);
  }
}

function renderRefreshNote(meta) {
  const note = $("#refresh-note");
  if (!meta?.updatedAt) {
    note.textContent = "";
    return;
  }
  const date = new Date(meta.updatedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const cadence = meta.rotation === "daily" ? "daily" : "every Monday";
  note.textContent = `${state.products.length} products · refreshed ${date} · rotates ${cadence}`;
}

function renderFilters() {
  const cats = [...new Set(state.products.map((p) => p.category))];
  $("#filters").innerHTML =
    `<button class="active" data-filter="all">All</button>` +
    cats.map((c) => `<button data-filter="${c}">${c}</button>`).join("");
}

function renderGrid() {
  const items = state.products.filter(
    (p) => state.filter === "all" || p.category === state.filter
  );
  const grid = $("#product-grid");
  if (!items.length) {
    grid.innerHTML = `<p class="grid-empty">Nothing in this category this week — check back Monday.</p>`;
    return;
  }
  grid.innerHTML = items
    .map(
      (p) => `
    <article class="card">
      <div class="card-media">
        <img src="${p.image}" alt="${p.name}" loading="lazy" />
        <button class="card-add" data-id="${p.id}">Add to cart</button>
      </div>
      <div class="card-info">
        <p class="card-cat">${p.category}</p>
        <h3 class="card-name">${p.name}</h3>
        <p class="card-price">${money(p.price)}${
        p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ""
      }</p>
      </div>
    </article>`
    )
    .join("");
}

$("#filters").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  state.filter = btn.dataset.filter;
  document.querySelectorAll("#filters button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderGrid();
});

// Category tiles double as filters
document.querySelectorAll(".tile[data-filter]").forEach((tile) => {
  tile.addEventListener("click", () => {
    const target = tile.dataset.filter;
    const btn = document.querySelector(`#filters button[data-filter="${target}"]`);
    (btn || document.querySelector('#filters button[data-filter="all"]'))?.click();
  });
});

/* ---------- cart ---------- */

const FREE_SHIPPING_AT = 60;

function saveCart() {
  localStorage.setItem("kinetic-cart", JSON.stringify(state.cart));
}

function cartEntries() {
  return Object.entries(state.cart)
    .map(([id, qty]) => ({ product: state.products.find((p) => p.id === id), qty }))
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
      <img src="${p.image}" alt="" />
      <div class="cart-line-info">
        <strong>${p.name}</strong>
        <span class="muted">${money(p.price)}</span>
        <div class="qty">
          <button data-id="${p.id}" data-d="-1" aria-label="Decrease quantity">−</button>
          <span>${qty}</span>
          <button data-id="${p.id}" data-d="1" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <span class="cart-line-price">${money(p.price * qty)}</span>
    </div>`
    )
    .join("");
}

document.addEventListener("click", (e) => {
  const add = e.target.closest(".card-add");
  if (add) {
    state.cart[add.dataset.id] = (state.cart[add.dataset.id] || 0) + 1;
    saveCart();
    renderCart();
    toast("Added to cart");
    return;
  }
  const qty = e.target.closest(".qty button");
  if (qty) {
    const id = qty.dataset.id;
    state.cart[id] = (state.cart[id] || 0) + Number(qty.dataset.d);
    if (state.cart[id] <= 0) delete state.cart[id];
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

/* ---------- newsletter ---------- */

$("#newsletter-form").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#newsletter-note").textContent = "Thanks — you're on the list.";
  e.target.reset();
});

/* ---------- init ---------- */

loadCatalog();
