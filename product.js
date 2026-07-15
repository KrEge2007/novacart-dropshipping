/* ============================================================
   Waggle & Co. — product detail page
   Conversion layout: thumbnail gallery on the left, buy panel
   on the right (rating, benefit checklist, variants, Buy now).
   Buy now goes straight to the selection's hosted Stripe
   checkout (quantity is adjusted there). A sticky bar appears
   on mobile once the buy panel scrolls away.
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
  // Gallery photos first, then each variant's own photo — CJ often ships
  // variant shots that aren't in the main image set, and options must be
  // browsable even before they're selected.
  const imgs = [
    ...(Array.isArray(p.images) && p.images.length ? p.images : [p.image]),
    ...(p.variants ?? []).map((v) => v.image),
  ];
  return [...new Set(imgs.filter(Boolean))].slice(0, 12);
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

  $("#product-page").innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="index.html#shop">Bestsellers</a> <span>/</span>
      <span>${esc(CATEGORY_LABELS[p.category] ?? p.category)}</span> <span>/</span>
      <span>${esc(p.name)}</span>
    </nav>
    <div class="pd">
      <div class="pd-gallery${imgs.length > 1 ? "" : " pd-gallery--solo"}">
        ${
          imgs.length > 1
            ? `<div class="pd-rail" id="pd-thumbs">
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
        <figure class="pd-main" id="pd-main" title="Click to zoom">
          <img id="pd-main-img" class="${imgFit(imgs[0]).trim()}" src="${esc(imgs[0])}" alt="${esc(p.name)}"
               style="view-transition-name: product-hero" />
          ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ""}
        </figure>
        <span class="pd-seal" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <defs><path id="seal-circle" d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" fill="none"/></defs>
            <text><textPath href="#seal-circle">30-day wag guarantee · 30-day wag guarantee ·&#160;</textPath></text>
          </svg>
          <span class="pd-seal-paw">🐾</span>
        </span>
      </div>

      <aside class="pd-panel">
        <h1>${esc(p.name)}</h1>
        ${p.rating ? `<div class="pd-rating">${starsHTML(p.rating, p.reviews)}<span class="pd-rating-note">from real customers</span></div>` : ""}
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
          <p class="product-price" id="pd-price"></p>
          <button class="button buy-btn" id="buy-btn">Buy now</button>
        </div>
        <p class="pd-reassure" id="pd-shipnote"></p>
        <p class="pd-secure">🔒 Secure Stripe checkout · 📦 Tracked shipping</p>
        <div class="product-meta-notes">
          ${
            p.description
              ? `<details open><summary>Why pets love it</summary><p>${esc(p.description)}</p></details>`
              : ""
          }
          <details>
            <summary>Shipping</summary>
            <p>Dispatched within 1–3 business days; tracked delivery in 7–15 business days, free on orders over $50. Orders not delivered within 45 days (US) / 60 days elsewhere are refunded or resent in full.</p>
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
      <button class="button" id="stickybar-buy">Buy now</button>
    </div>

    <div class="lightbox" id="lightbox" hidden role="dialog" aria-label="Image viewer">
      <button class="lb-btn lb-close" id="lb-close" aria-label="Close viewer">✕</button>
      <button class="lb-btn lb-prev" id="lb-prev" aria-label="Previous image">‹</button>
      <figure class="lb-stage"><img id="lb-img" alt="${esc(p.name)} — enlarged view" /></figure>
      <button class="lb-btn lb-next" id="lb-next" aria-label="Next image">›</button>
      <div class="lb-count" id="lb-count"></div>
    </div>`;

  /* ---------- gallery ---------- */

  const mainImg = $("#pd-main-img");

  // Swap the hero image directly — never via a thumbnail, because variant
  // photos may not have one. Thumb highlighting follows the shown image;
  // a dead URL falls back to the lead photo.
  function swapMain(src) {
    if (!src) return;
    document
      .querySelectorAll(".pd-thumb")
      .forEach((t) => t.classList.toggle("active", t.dataset.src === src));
    if (mainImg.src === src) return;
    mainImg.classList.add("swapping");
    setTimeout(() => {
      mainImg.onload = () => mainImg.classList.remove("swapping");
      mainImg.onerror = () => {
        mainImg.classList.remove("swapping");
        if (src !== imgs[0]) swapMain(imgs[0]);
      };
      mainImg.classList.toggle("img-contain", !!imgFit(src).trim());
      mainImg.src = src;
    }, 150);
  }

  document.getElementById("pd-thumbs")?.addEventListener("click", (e) => {
    const thumb = e.target.closest(".pd-thumb");
    if (thumb) swapMain(thumb.dataset.src);
  });

  /* ---------- lightbox: browse + zoom ---------- */

  const lb = $("#lightbox");
  const lbImg = $("#lb-img");
  let lbIndex = 0;

  function lbShow(i) {
    lbIndex = (i + imgs.length) % imgs.length;
    lbImg.classList.remove("zoomed");
    lbImg.style.transformOrigin = "";
    lbImg.src = imgs[lbIndex];
    $("#lb-count").textContent = `${lbIndex + 1} / ${imgs.length}`;
  }
  function lbOpen(i) {
    lbShow(i);
    lb.hidden = false;
    document.body.classList.add("lb-open");
  }
  function lbClose() {
    lb.hidden = true;
    document.body.classList.remove("lb-open");
    swapMain(imgs[lbIndex]); // the page follows where you browsed to
  }

  $("#pd-main").addEventListener("click", () => {
    const current = imgs.indexOf(mainImg.src);
    lbOpen(current === -1 ? 0 : current);
  });
  $("#lb-close").addEventListener("click", lbClose);
  $("#lb-prev").addEventListener("click", (e) => { e.stopPropagation(); lbShow(lbIndex - 1); });
  $("#lb-next").addEventListener("click", (e) => { e.stopPropagation(); lbShow(lbIndex + 1); });
  lb.addEventListener("click", (e) => {
    if (e.target === lb) lbClose(); // backdrop closes
  });

  // Click to zoom in at that spot; while zoomed, the image pans with the
  // cursor; click again to zoom out.
  function lbSetOrigin(e) {
    const r = lbImg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    lbImg.style.transformOrigin = `${x}% ${y}%`;
  }
  lbImg.addEventListener("click", (e) => {
    e.stopPropagation();
    if (lbImg.classList.contains("zoomed")) {
      lbImg.classList.remove("zoomed");
    } else {
      lbSetOrigin(e);
      lbImg.classList.add("zoomed");
    }
  });
  lbImg.addEventListener("mousemove", (e) => {
    if (lbImg.classList.contains("zoomed")) lbSetOrigin(e);
  });

  // Keyboard: Esc closes, arrows browse.
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") lbClose();
    else if (e.key === "ArrowLeft") lbShow(lbIndex - 1);
    else if (e.key === "ArrowRight") lbShow(lbIndex + 1);
  });

  // Touch: horizontal swipe browses (when not zoomed).
  let touchX = null;
  lb.addEventListener("pointerdown", (e) => { touchX = e.clientX; }, { passive: true });
  lb.addEventListener("pointerup", (e) => {
    if (touchX === null || lbImg.classList.contains("zoomed")) return (touchX = null);
    const dx = e.clientX - touchX;
    if (Math.abs(dx) > 45) lbShow(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ---------- variant -> live price & Buy now target ---------- */

  let selected = p.variants?.[0] ?? null;

  // Hosted Stripe checkout URL for the current selection. Generated by
  // scripts/sync-stripe.mjs in the pipeline; absent until that has run.
  const stripeLink = () => (selected ?? p).stripe?.link ?? null;

  function updatePrice() {
    const unit = selected ?? p;
    const off = discountPct(unit);
    const el = $("#pd-price");
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    el.innerHTML =
      money(unit.price) +
      (off ? `<s>${money(unit.compareAt)}</s><span class="save-pill">save ${off}%</span>` : "");
    $("#stickybar-price").textContent = money(unit.price);

    const buyBtn = $("#buy-btn");
    buyBtn.textContent = stripeLink() ? "Buy now" : "Coming soon";
    buyBtn.disabled = !stripeLink();

    const ship = $("#pd-shipnote");
    if (unit.price >= FREE_SHIPPING_AT) {
      ship.classList.add("free");
      ship.textContent = "✓ Ships free";
    } else {
      ship.classList.remove("free");
      ship.textContent = `Free shipping on orders over ${money(FREE_SHIPPING_AT)} — quantity can be adjusted at checkout`;
    }
  }

  function applyVariant(v) {
    selected = v;
    $("#variant-name").textContent = `— ${v.name}`;
    // Show the option's own photo; options without one show the lead photo
    // so the image never silently stays on a different variant's shot.
    swapMain(v.image || imgs[0]);
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

  const doBuy = () => {
    const link = stripeLink();
    if (link) location.href = link; // quantity is adjustable on the Stripe page
  };
  $("#buy-btn").addEventListener("click", doBuy);
  $("#stickybar-buy").addEventListener("click", doBuy);

  if (selected) applyVariant(selected);
  else updatePrice();

  /* ---------- mobile sticky buy bar ---------- */

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

// Real reviews for this product, appended below the buy panel. Nothing
// renders until data/reviews.json has entries for it.
function renderProductReviews(p) {
  const list = reviewsFor(p.id);
  if (!list.length) return;
  const block = document.createElement("div");
  block.className = "pd-reviews";
  block.innerHTML = `
    <h2>From the pack</h2>
    <div class="review-row">${list.slice(0, 6).map((r, i) => reviewCardHTML(r, i)).join("")}</div>`;
  $("#product-page").appendChild(block);
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
    const id = new URLSearchParams(location.search).get("id");
    const product = store.products.find((p) => p.id === id);
    if (!product) return renderNotFound();
    renderProduct(product);
    renderProductReviews(product);
    renderRelated(product);
    observeReveals();
  } catch (err) {
    $("#product-page").innerHTML =
      `<p class="grid-empty">Couldn't load the catalog. Please refresh the page.</p>`;
    console.error("Catalog load failed:", err);
  }
})();
