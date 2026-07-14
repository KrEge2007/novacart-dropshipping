/* ============================================================
   Kinetic — product detail page
   Editorial "image story" layout: a sticky buy panel on the
   right while every product photo scrolls past on the left in
   varied sizes, revealed with the product category's animation
   personality. Pull-quotes from the description sit between
   images. Requires store.js to be loaded first.
   ============================================================ */

"use strict";

const CATEGORY_LABELS = {
  training: "01 · Training",
  yoga: "02 · Yoga & Mobility",
  recovery: "03 · Recovery",
  hydration: "04 · Hydration",
};

function productImages(p) {
  const imgs = Array.isArray(p.images) && p.images.length ? p.images : [p.image];
  return [...new Set(imgs.filter(Boolean))];
}

// Split a description into a short lead, a pull-quote, and body text.
function splitStory(desc) {
  if (!desc) return { lead: "", quote: "", body: "" };
  const clean = desc.replace(/^description:?\s*/i, "").trim();
  let sentences =
    clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()) ?? [clean];
  // Drop a trailing fragment cut off mid-sentence by the feed's length cap.
  if (sentences.length > 1 && !/[.!?]["')\]]*$/.test(sentences[sentences.length - 1])) {
    sentences = sentences.slice(0, -1);
  }
  const lead = sentences.slice(0, 2).join(" ");
  const quote = sentences[2] ?? "";
  const body = sentences.slice(3).join(" ");
  return { lead, quote, body };
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

// Image block size/placement cycles for the scrolling story.
const IMG_VARIANTS = ["hero", "left", "right", "full", "center"];

function imageBlock(src, i, total, name) {
  const variant = IMG_VARIANTS[i % IMG_VARIANTS.length];
  const num = String(i + 1).padStart(2, "0");
  return `
    <figure class="pd-block pd-img pd-img--${variant} reveal" style="--d:${(i % 2) * 120}ms">
      <div class="pd-img-frame">
        <img src="${esc(src)}" alt="${esc(name)} — view ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}" />
      </div>
      <figcaption class="pd-cap">${num} / ${String(total).padStart(2, "0")}</figcaption>
    </figure>`;
}

function renderProduct(p) {
  document.title = `${p.name} — Kinetic`;
  const imgs = productImages(p);
  const story = splitStory(
    p.description ||
      "Part of this week's curated edit — chosen for build quality, everyday usefulness, and honest pricing."
  );

  // Assemble the scrolling media column: images with a pull-quote after
  // the second block and body text after the fourth.
  const media = [];
  imgs.forEach((src, i) => {
    media.push(imageBlock(src, i, imgs.length, p.name));
    if (i === 1 && story.quote) {
      media.push(`
        <blockquote class="pd-block pd-quote reveal">
          <p>${esc(story.quote)}</p>
        </blockquote>`);
    }
    if (i === 3 && story.body) {
      media.push(`
        <div class="pd-block pd-body reveal">
          <p>${esc(story.body)}</p>
        </div>`);
    }
  });
  // Short galleries: make sure remaining story text still appears.
  if (imgs.length <= 2 && story.quote && !media.some((m) => m.includes("pd-quote"))) {
    media.push(`<blockquote class="pd-block pd-quote reveal"><p>${esc(story.quote)}</p></blockquote>`);
  }
  if (imgs.length <= 4 && story.body && !media.some((m) => m.includes("pd-body"))) {
    media.push(`<div class="pd-block pd-body reveal"><p>${esc(story.body)}</p></div>`);
  }

  $("#product-page").innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="index.html#shop">Shop</a> <span>/</span>
      <a href="index.html#chapter-${esc(p.category)}" class="crumb-cat">${esc(p.category)}</a> <span>/</span>
      <span>${esc(p.name)}</span>
    </nav>
    <div class="pd chapter--${esc(p.category)}">
      <div class="pd-media">${media.join("")}</div>
      <aside class="pd-side">
        <div class="pd-side-inner reveal">
          <p class="eyebrow">${esc(CATEGORY_LABELS[p.category] ?? p.category)}</p>
          <h1>${esc(p.name)}</h1>
          <p class="product-price">
            ${money(p.price)}
            ${p.compareAt > p.price ? `<s>${money(p.compareAt)}</s>` : ""}
          </p>
          ${story.lead ? `<p class="product-desc">${esc(story.lead)}</p>` : ""}
          <div class="buy-row">
            <div class="qty qty-lg">
              <button id="qty-minus" aria-label="Decrease quantity">−</button>
              <span id="qty-value">1</span>
              <button id="qty-plus" aria-label="Increase quantity">+</button>
            </div>
            <button class="button buy-btn" id="add-btn">Add to cart</button>
          </div>
          <p class="pd-reassure">Free shipping over $60 · 30-day returns</p>
          <div class="product-meta-notes">
            <details>
              <summary>Shipping</summary>
              <p>Tracked delivery in 5–9 business days, free on orders over $60. Ships from the nearest supplier warehouse.</p>
            </details>
            <details>
              <summary>Returns</summary>
              <p>30-day money-back guarantee. If it arrives damaged, reply to your order confirmation with a photo and we'll replace or refund it.</p>
            </details>
            <details>
              <summary>This week only</summary>
              <p>The catalog rotates every Monday. When this edit ends, this piece may not return — the price you see is the price it stays.</p>
            </details>
          </div>
        </div>
      </aside>
    </div>`;

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
  // The chapter class gives related cards the category's reveal animation.
  $("#related-section").classList.add(`chapter--${current.category}`);
  $("#related-grid").innerHTML = related
    .map(
      (p, i) => `
    <article class="card reveal" style="--d:${i * 110}ms">
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

/* ---------- scroll nudge ----------
   A slow ~300px downward drift shortly after load, hinting that the
   image story continues below. Any interaction cancels it instantly;
   skipped entirely for reduced-motion users or if already scrolled. */

function nudgeScroll() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.scrollY > 40) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const distance = Math.min(300, max - window.scrollY);
  if (distance < 80) return;

  let raf;
  let cancelled = false;
  const cancelEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
  const stop = () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    cancelEvents.forEach((t) => window.removeEventListener(t, stop));
  };
  cancelEvents.forEach((t) => window.addEventListener(t, stop, { passive: true }));

  const startY = window.scrollY;
  const duration = 1800;
  const t0 = performance.now();
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const step = (now) => {
    if (cancelled) return;
    const k = Math.min((now - t0) / duration, 1);
    window.scrollTo(0, startY + distance * ease(k));
    if (k < 1) raf = requestAnimationFrame(step);
    else stop();
  };
  raf = requestAnimationFrame(step);
}

/* ---------- init ---------- */

(async () => {
  try {
    await loadCatalog();
    renderCart();
    const id = new URLSearchParams(location.search).get("id");
    const product = store.products.find((p) => p.id === id);
    if (!product) return renderNotFound();
    document.body.classList.add("anim-ready");
    renderProduct(product);
    renderRelated(product);
    observeReveals();
    setTimeout(nudgeScroll, 1500);
  } catch (err) {
    $("#product-page").innerHTML =
      `<p class="grid-empty">Couldn't load the catalog. Please refresh the page.</p>`;
    console.error("Catalog load failed:", err);
  }
})();
