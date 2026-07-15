/* ============================================================
   Waggle & Co. — product detail page
   Conversion layout: thumbnail gallery on the left, buy panel
   on the right (rating, benefit checklist, variants, quantity,
   live free-shipping meter, trust accordion). A sticky add-to-
   cart bar appears on mobile once the buy panel scrolls away.
   Requires store.js to be loaded first.
   ============================================================ */

"use strict";

const CATEGORY_LABELS = {
  grooming: "✨ Grooming",
  play: "🎾 Play",
  comfort: "😴 Comfort",
  travel: "🚗 Out & about",
  mealtime: "🍖 Mealtime",
};

function productImages(p) {
  const imgs = Array.isArray(p.images) && p.images.length ? p.images : [p.image];
  return [...new Set(imgs.filter(Boolean))];
}

function renderNotFound() {
  document.title = "Waggle & Co. — Product not found";
  $("#product-page").innerHTML = `
    <div class="product-missing">
      <span aria-hidden="true" style="font-size:3rem">🐾</span>
      <h1>We couldn't dig that one up</h1>
      <p>This product isn't in the store — but the bestsellers are all still here.</p>
      <a class="button" href="index.html#shop">Back to the good stuff</a>
    </div>`;
}

function renderProduct(p) {
  document.title = `${p.name} — Waggle & Co.`;
  const imgs = productImages(p);
  const pct = discountPct(p);

  $("#product-page").innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="index.html#shop">Bestsellers</a> <span>/</span>
      <span>${esc(CATEGORY_LABELS[p.category] ?? p.category)}</span> <span>/</span>
      <span>${esc(p.name)}</span>
    </nav>
    <div class="pd">
      <div class="pd-gallery">
        <figure class="pd-main">
          <img id="pd-main-img" class="${imgFit(imgs[0]).trim()}" src="${esc(imgs[0])}" alt="${esc(p.name)}"
               style="view-transition-name: product-hero" />
          ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ""}
          ${pct ? `<span class="card-off">−${pct}%</span>` : ""}
        </figure>
        ${
          imgs.length > 1
            ? `<div class="pd-thumbs" id="pd-thumbs">
                 ${imgs
                   .map(
                     (src, i) =>
                       `<button class="pd-thumb${i === 0 ? " active" : ""}" data-src="${esc(src)}" aria-label="View image ${i + 1}">
                          <img class="${imgFit(src).trim()}" src="${esc(src)}" alt="" loading="lazy" /></button>`
                   )
                   .join("")}
               </div>`
            : ""
        }
      </div>

      <aside class="pd-panel">
        <p class="eyebrow">${esc(CATEGORY_LABELS[p.category] ?? p.category)}</p>
        <h1>${esc(p.name)}</h1>
        <div class="pd-rating">${starsHTML(p.rating, p.reviews)}${
          p.reviews ? `<span class="pd-rating-note">verified reviews</span>` : ""
        }</div>
        <p class="product-price" id="pd-price"></p>
        ${p.blurb ? `<p class="product-desc">${esc(p.blurb)}</p>` : ""}
        ${
          p.benefits?.length
            ? `<ul class="pd-benefits">${p.benefits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
            : ""
        }
        ${
          p.variants?.length
            ? `<div class="variants">
                 <p class="variants-label">Choose an option <span id="variant-name"></span></p>
                 <div class="variant-chips" id="variant-chips">
                   ${p.variants
                     .map(
                       (v, i) =>
                         `<button type="button" class="variant-chip${i === 0 ? " active" : ""}"
                            data-vid="${esc(v.id)}" title="${esc(v.name)}">${esc(v.name)}</button>`
                     )
                     .join("")}
                 </div>
               </div>`
            : ""
        }
        <div class="buy-row">
          <div class="qty qty-lg">
            <button id="qty-minus" aria-label="Decrease quantity">−</button>
            <span id="qty-value">1</span>
            <button id="qty-plus" aria-label="Increase quantity">+</button>
          </div>
          <button class="button buy-btn" id="buy-btn" hidden>Buy now</button>
          <button class="button button-plain buy-btn" id="add-btn">Add to cart</button>
        </div>
        <p class="pd-reassure" id="pd-shipnote"></p>
        <div class="pd-trust">
          <span>💛 30-day wag-guarantee</span>
          <span>📦 Ships in 24h</span>
          <span>🔒 Delivery guarantee</span>
        </div>
        <div class="product-meta-notes">
          ${
            p.description
              ? `<details open><summary>Why pets love it</summary><p>${esc(p.description)}</p></details>`
              : ""
          }
          <details>
            <summary>Shipping</summary>
            <p>Ships within 24 hours; tracked delivery in 7–15 business days, free on orders over $50. Orders not delivered within 45 days (US) / 60 days elsewhere are refunded or resent in full.</p>
          </details>
          <details>
            <summary>Guarantee &amp; refunds</summary>
            <p>Pet not impressed? Contact us within 30 days for a refund or replacement. Arrives damaged or wrong? Send a photo within 7 days of delivery and we'll fix it — you never pay return postage.</p>
          </details>
        </div>
      </aside>
    </div>

    <div class="stickybar" id="stickybar" aria-hidden="true">
      <img src="${esc(imgs[0])}" alt="" />
      <div class="stickybar-info">
        <strong>${esc(p.name)}</strong>
        <span id="stickybar-price"></span>
      </div>
      <button class="button" id="stickybar-add">Add to cart</button>
    </div>`;

  /* ---------- gallery ---------- */

  const mainImg = $("#pd-main-img");
  document.getElementById("pd-thumbs")?.addEventListener("click", (e) => {
    const thumb = e.target.closest(".pd-thumb");
    if (!thumb) return;
    document.querySelectorAll(".pd-thumb").forEach((t) => t.classList.remove("active"));
    thumb.classList.add("active");
    mainImg.classList.add("swapping");
    setTimeout(() => {
      mainImg.onload = () => mainImg.classList.remove("swapping");
      mainImg.onerror = () => mainImg.classList.remove("swapping");
      mainImg.classList.toggle("img-contain", !!imgFit(thumb.dataset.src).trim());
      mainImg.src = thumb.dataset.src;
    }, 150);
  });

  /* ---------- variant + quantity -> live price & shipping meter ---------- */

  let selected = p.variants?.[0] ?? null;
  let qty = 1;

  // Hosted Stripe checkout URL for the current selection. Generated by
  // scripts/sync-stripe.mjs in the pipeline; absent until that has run.
  const stripeLink = () => (selected ?? p).stripe?.link ?? null;

  function updatePrice() {
    const unit = selected ?? p;
    const total = unit.price * qty;
    const compare = (unit.compareAt ?? 0) * qty;
    const el = $("#pd-price");
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    el.innerHTML =
      money(total) +
      (compare > total ? `<s>${money(compare)}</s>` : "") +
      (qty > 1 ? `<span class="unit-note">${money(unit.price)} each</span>` : "");
    $("#stickybar-price").textContent = money(total);

    // With a checkout link, Buy now is the hero action and shows the total;
    // without one (Stripe not synced yet), Add to cart carries the total.
    const buyBtn = $("#buy-btn");
    const addBtn = $("#add-btn");
    if (stripeLink()) {
      buyBtn.hidden = false;
      buyBtn.textContent = `Buy now · ${money(total)}`;
      addBtn.classList.add("button-plain");
      addBtn.textContent = "Add to cart";
      $("#stickybar-add").textContent = "Buy now";
    } else {
      buyBtn.hidden = true;
      addBtn.classList.remove("button-plain");
      addBtn.textContent = `Add to cart · ${money(total)}`;
      $("#stickybar-add").textContent = "Add to cart";
    }

    const inCart = cartEntries().reduce((n, e) => n + e.price * e.qty, 0);
    const combined = inCart + total;
    const ship = $("#pd-shipnote");
    if (combined >= FREE_SHIPPING_AT) {
      ship.classList.add("free");
      ship.textContent = "✓ This order ships free";
    } else {
      ship.classList.remove("free");
      const gap = FREE_SHIPPING_AT - combined;
      const more = Math.ceil(gap / unit.price);
      ship.textContent =
        `${money(gap)} away from free shipping` +
        (more <= 6 ? ` — add ${more} more to unlock` : ` (free over ${money(FREE_SHIPPING_AT)})`);
    }
  }

  function applyVariant(v) {
    selected = v;
    $("#variant-name").textContent = `— ${v.name}`;
    if (v.image) {
      document.querySelector(`.pd-thumb[data-src="${CSS.escape(v.image)}"]`)?.click();
    }
    updatePrice();
  }

  if (p.variants?.length) {
    $("#variant-chips").addEventListener("click", (e) => {
      const chip = e.target.closest(".variant-chip");
      if (!chip) return;
      document.querySelectorAll(".variant-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const v = p.variants.find((x) => x.id === chip.dataset.vid);
      if (v) applyVariant(v);
    });
  }

  $("#qty-minus").addEventListener("click", () => {
    qty = Math.max(1, qty - 1);
    $("#qty-value").textContent = qty;
    updatePrice();
  });
  $("#qty-plus").addEventListener("click", () => {
    qty += 1;
    $("#qty-value").textContent = qty;
    updatePrice();
  });

  const doAdd = () => {
    addToCart(selected ? `${p.id}::${selected.id}` : p.id, qty);
    updatePrice(); // cart total changed — refresh the free-shipping line
  };
  const doBuy = () => {
    const link = stripeLink();
    if (link) location.href = link; // quantity is adjustable on the Stripe page
  };
  $("#add-btn").addEventListener("click", doAdd);
  $("#buy-btn").addEventListener("click", doBuy);
  $("#stickybar-add").addEventListener("click", () => (stripeLink() ? doBuy() : doAdd()));

  if (selected) applyVariant(selected);
  else updatePrice();

  /* ---------- mobile sticky add-to-cart bar ---------- */

  const stickybar = $("#stickybar");
  const buyRow = document.querySelector(".buy-row");
  if ("IntersectionObserver" in window && buyRow) {
    new IntersectionObserver(
      ([entry]) => {
        const show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        stickybar.classList.toggle("show", show);
        stickybar.setAttribute("aria-hidden", String(!show));
      },
      { threshold: 0 }
    ).observe(buyRow);
  }
}

function renderRelated(current) {
  const related = store.products
    .filter((p) => p.id !== current.id)
    .sort((a, b) => {
      const score = (p) =>
        (p.category === current.category ? 2 : 0) +
        (p.petType === current.petType || p.petType === "both" ? 1 : 0);
      return score(b) - score(a);
    })
    .slice(0, 4);
  if (!related.length) return;

  $("#related-section").hidden = false;
  $("#related-grid").innerHTML = related.map((p, i) => cardHTML(p, i)).join("");
}

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
    observeReveals();
  } catch (err) {
    $("#product-page").innerHTML =
      `<p class="grid-empty">Couldn't load the catalog. Please refresh the page.</p>`;
    console.error("Catalog load failed:", err);
  }
})();
