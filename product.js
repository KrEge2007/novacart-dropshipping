/* ============================================================
   Kinetic — product detail page
   Renders the product identified by ?id=… from the catalog.
   Requires store.js to be loaded first.
   ============================================================ */

"use strict";

function productImages(p) {
  const imgs = Array.isArray(p.images) && p.images.length ? p.images : [p.image];
  return imgs.filter(Boolean);
}

function renderNotFound() {
  document.title = "Kinetic — Product not found";
  $("#product-page").innerHTML = `
    <div class="product-missing">
      <h1>This product has rotated out</h1>
      <p>Our catalog changes every week, and this item isn't part of the current edit.</p>
      <a class="button" href="index.html#shop">Browse this week's edit</a>
    </div>`;
}

function renderProduct(p) {
  document.title = `${p.name} — Kinetic`;
  const imgs = productImages(p);
  const description =
    p.description ||
    "Part of this week's curated edit — chosen for build quality, everyday usefulness, and honest pricing.";

  $("#product-page").innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="index.html#shop">Shop</a> <span>/</span>
      <span class="crumb-cat">${esc(p.category)}</span> <span>/</span>
      <span>${esc(p.name)}</span>
    </nav>
    <div class="product-layout">
      <div class="gallery">
        <div class="gallery-main">
          <img id="gallery-main-img" src="${esc(imgs[0])}" alt="${esc(p.name)}" />
        </div>
        ${
          imgs.length > 1
            ? `<div class="gallery-thumbs">${imgs
                .map(
                  (src, i) =>
                    `<button class="thumb${i === 0 ? " active" : ""}" data-src="${esc(src)}">
                       <img src="${esc(src)}" alt="" loading="lazy" />
                     </button>`
                )
                .join("")}</div>`
            : ""
        }
      </div>
      <div class="product-info">
        <p class="eyebrow">${esc(p.category)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="product-price">
          ${money(p.price)}
          ${p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ""}
        </p>
        <p class="product-desc">${esc(description)}</p>
        <div class="buy-row">
          <div class="qty qty-lg">
            <button id="qty-minus" aria-label="Decrease quantity">−</button>
            <span id="qty-value">1</span>
            <button id="qty-plus" aria-label="Increase quantity">+</button>
          </div>
          <button class="button buy-btn" id="add-btn">Add to cart</button>
        </div>
        <div class="product-meta-notes">
          <details>
            <summary>Shipping</summary>
            <p>Tracked delivery in 5–9 business days, free on orders over $60. Ships from the nearest supplier warehouse.</p>
          </details>
          <details>
            <summary>Returns</summary>
            <p>30-day money-back guarantee. If it arrives damaged, reply to your order confirmation with a photo and we'll replace or refund it.</p>
          </details>
        </div>
      </div>
    </div>`;

  // gallery thumbs
  document.querySelectorAll(".thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("#gallery-main-img").src = btn.dataset.src;
      document.querySelectorAll(".thumb").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // quantity + add
  let qty = 1;
  $("#qty-minus").addEventListener("click", () => {
    qty = Math.max(1, qty - 1);
    $("#qty-value").textContent = qty;
  });
  $("#qty-plus").addEventListener("click", () => {
    qty += 1;
    $("#qty-value").textContent = qty;
  });
  $("#add-btn").addEventListener("click", () => addToCart(p.id, qty));
}

function renderRelated(current) {
  const related = store.products
    .filter((p) => p.id !== current.id)
    .sort((a, b) => {
      const aSame = a.category === current.category ? 0 : 1;
      const bSame = b.category === current.category ? 0 : 1;
      return aSame - bSame;
    })
    .slice(0, 4);
  if (!related.length) return;

  $("#related-section").hidden = false;
  $("#related-grid").innerHTML = related
    .map(
      (p) => `
    <article class="card">
      <a class="card-link" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.name)}"></a>
      <div class="card-media">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
        <button class="card-add" data-id="${esc(p.id)}">Add to cart</button>
      </div>
      <div class="card-info">
        <p class="card-cat">${esc(p.category)}</p>
        <h3 class="card-name">${esc(p.name)}</h3>
        <p class="card-price">${money(p.price)}${
        p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ""
      }</p>
      </div>
    </article>`
    )
    .join("");
}

document.addEventListener("click", (e) => {
  const add = e.target.closest(".card-add");
  if (add) addToCart(add.dataset.id);
});

/* ---------- init ---------- */

(async () => {
  try {
    await loadCatalog();
    renderCart();
    const id = new URLSearchParams(location.search).get("id");
    const product = store.products.find((p) => p.id === id);
    if (!product) return renderNotFound();
    renderProduct(product);
    renderRelated(product);
  } catch (err) {
    $("#product-page").innerHTML =
      `<p class="grid-empty">Couldn't load the catalog. Please refresh the page.</p>`;
    console.error("Catalog load failed:", err);
  }
})();
