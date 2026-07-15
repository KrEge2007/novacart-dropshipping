/* ============================================================
   Waggle & Co. — home page
   Renders the bestseller grid with filter pills and the featured
   product spotlight. Requires store.js to be loaded first.
   ============================================================ */

"use strict";

let activeFilter = "all";

const PET_FILTERS = new Set(["dog", "cat"]);

function matchesFilter(p, filter) {
  if (filter === "all") return true;
  if (PET_FILTERS.has(filter)) return p.petType === filter || p.petType === "both";
  return p.category === filter;
}

/* Non-product tiles that break up the grid so it reads hand-arranged.
   Claims here must be product-category facts or our own policies — never
   invented customers. */

const QUOTE_TILE = `
  <figure class="grid-tile tile-quote reveal" aria-label="Did you know">
    <div class="review-stars" aria-hidden="true">🐶</div>
    <blockquote>“10 minutes of sniffing tires a dog like a 30-minute walk.”</blockquote>
    <figcaption>— why trainers love snuffle mats</figcaption>
  </figure>`;

const STAT_TILE = `
  <div class="grid-tile tile-stat reveal">
    <strong>30 days</strong>
    <p>to change your pet's mind</p>
    <span>💛 refund or replacement — no return postage</span>
  </div>`;

function renderGrid() {
  const grid = $("#product-grid");
  const items = store.products.filter((p) => matchesFilter(p, activeFilter));

  // Bento rhythm: lead with a wide feature card, drop another mid-grid,
  // and (on the full view) slip editorial tiles between products.
  const cells = [];
  items.forEach((p, i) => {
    const feature = items.length > 4 && (i === 0 || i === 7);
    cells.push(cardHTML(p, i, feature));
    if (activeFilter === "all") {
      if (i === 3) cells.push(QUOTE_TILE);
      if (i === 10) cells.push(STAT_TILE);
    }
  });

  grid.innerHTML = cells.length
    ? cells.join("")
    : `<p class="grid-empty">Nothing in this corner yet — check the other filters.</p>`;
  observeReveals();
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll(".filter-pill").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filter);
  });
  renderGrid();
}

$("#filters").addEventListener("click", (e) => {
  const pill = e.target.closest(".filter-pill");
  if (pill) setFilter(pill.dataset.filter);
});

// Header/footer/tile links like "Dogs" jump to the grid pre-filtered.
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-filter-link]");
  if (link) setFilter(link.dataset.filterLink);
});

/* ---------- featured spotlight ---------- */

function renderFeatured() {
  const p = store.products.find((x) => x.featured) ?? store.products[0];
  const host = $("#featured");
  if (!p || !host) return;
  const pct = discountPct(p);
  host.innerHTML = `
    <div class="featured-inner">
      <figure class="featured-media reveal">
        <img class="${imgFit(p.images?.[1] || p.image).trim()}" src="${esc(p.images?.[1] || p.image)}" alt="${esc(p.name)}" loading="lazy" />
        ${pct ? `<span class="sticker sticker-deal" aria-hidden="true">Save ${pct}%</span>` : ""}
      </figure>
      <div class="featured-copy">
        <p class="eyebrow reveal">Trending right now</p>
        <h2 class="reveal" style="--d:90ms">${esc(p.name)}</h2>
        <div class="reveal" style="--d:150ms">${starsHTML(p.rating, p.reviews)}</div>
        <p class="featured-blurb reveal" style="--d:210ms">${esc(p.blurb || "")}</p>
        ${
          p.benefits?.length
            ? `<ul class="featured-benefits reveal" style="--d:270ms">
                 ${p.benefits.slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join("")}
               </ul>`
            : ""
        }
        <div class="featured-buy reveal" style="--d:330ms">
          <span class="featured-price">${money(p.price)}${
            p.compareAt > p.price ? ` <s>${money(p.compareAt)}</s>` : ""
          }</span>
          <a class="button" href="product.html?id=${encodeURIComponent(p.id)}">See it in action</a>
        </div>
      </div>
    </div>`;
}

/* ---------- reviews: real ones replace the founding block ---------- */

function renderReviews() {
  if (!store.reviews.length) return; // keep the honest "we just opened" block
  $("#reviews-sub").textContent = "Real pets, verified against real orders.";
  $("#review-row").innerHTML = store.reviews
    .slice(0, 6)
    .map((r, i) => reviewCardHTML(r, i))
    .join("");
}

/* ---------- newsletter ---------- */

$("#newsletter-form").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#newsletter-note").textContent = "Welcome to the pack! 🐾";
  e.target.reset();
});

/* ---------- init ---------- */

(async () => {
  try {
    await loadCatalog();
    renderGrid();
    renderFeatured();
    renderReviews();
    // Back from a completed Stripe checkout: thank the buyer.
    if (new URLSearchParams(location.search).get("paid")) {
      history.replaceState(null, "", location.pathname);
      toast("Order received — thank you! 🐾 Confirmation is on its way to your inbox.");
    }
    observeReveals();
  } catch (err) {
    $("#product-grid").innerHTML =
      `<p class="grid-empty">Couldn't load the catalog. Please refresh the page.</p>`;
    console.error("Catalog load failed:", err);
  }
})();
