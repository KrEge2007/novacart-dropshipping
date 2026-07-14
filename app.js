/* ============================================================
   Kinetic — home page (catalog grid, filters, newsletter)
   Requires store.js to be loaded first.
   ============================================================ */

"use strict";

let activeFilter = "all";

function renderRefreshNote() {
  const note = $("#refresh-note");
  if (!store.meta?.updatedAt) {
    note.textContent = "";
    return;
  }
  const date = new Date(store.meta.updatedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const cadence = store.meta.rotation === "daily" ? "daily" : "every Monday";
  note.textContent = `${store.products.length} products · refreshed ${date} · rotates ${cadence}`;
}

function renderFilters() {
  const cats = [...new Set(store.products.map((p) => p.category))];
  $("#filters").innerHTML =
    `<button class="active" data-filter="all">All</button>` +
    cats.map((c) => `<button data-filter="${esc(c)}">${esc(c)}</button>`).join("");
}

function renderGrid() {
  const items = store.products.filter(
    (p) => activeFilter === "all" || p.category === activeFilter
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

$("#filters").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  activeFilter = btn.dataset.filter;
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

document.addEventListener("click", (e) => {
  const add = e.target.closest(".card-add");
  if (add) addToCart(add.dataset.id);
});

$("#newsletter-form").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#newsletter-note").textContent = "Thanks — you're on the list.";
  e.target.reset();
});

/* ---------- init ---------- */

(async () => {
  try {
    await loadCatalog();
    renderRefreshNote();
    renderFilters();
    renderGrid();
    renderCart();
  } catch (err) {
    $("#refresh-note").textContent = "Couldn't load the catalog. Please refresh the page.";
    console.error("Catalog load failed:", err);
  }
})();
