/* ============================================================
   Kinetic — home page
   Renders the weekly edit as numbered category "chapters", each
   with its own scroll-reveal animation (see styles.css):
     training  — rises with weight
     yoga      — sways in softly
     recovery  — blurs into focus
     hydration — pours in (liquid clip reveal)
   Requires store.js to be loaded first.
   ============================================================ */

"use strict";

const CHAPTERS = [
  {
    key: "training",
    num: "01",
    title: "Training",
    tag: "Iron, tension, repetition — strength you can keep at home.",
  },
  {
    key: "yoga",
    num: "02",
    title: "Yoga & Mobility",
    tag: "Slow strength. Balance, breath, and range of motion.",
  },
  {
    key: "recovery",
    num: "03",
    title: "Recovery",
    tag: "The work between workouts: release, restore, repeat.",
  },
  {
    key: "hydration",
    num: "04",
    title: "Hydration",
    tag: "Cold water within reach, from first set to last stretch.",
  },
];

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

function cardHTML(p, i, feature) {
  return `
    <article class="card reveal${feature ? " card--feature" : ""}" style="--d:${i * 110}ms">
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
    </article>`;
}

function renderChapters() {
  const wrap = $("#chapters");
  const sections = [];
  for (const ch of CHAPTERS) {
    const items = store.products.filter((p) => p.category === ch.key);
    if (!items.length) continue;
    sections.push(`
      <section class="chapter chapter--${ch.key}" id="chapter-${ch.key}">
        <header class="chapter-head reveal-line">
          <span class="chapter-num reveal" aria-hidden="true">${ch.num}</span>
          <div class="chapter-head-text">
            <h3 class="reveal" style="--d:90ms">
              <span class="mask"><span class="tline" style="--d:90ms">${esc(ch.title)}</span></span>
            </h3>
            <p class="reveal" style="--d:180ms">${esc(ch.tag)}</p>
          </div>
          <span class="chapter-count reveal" style="--d:270ms">
            ${items.length} ${items.length === 1 ? "piece" : "pieces"} this week
          </span>
        </header>
        <div class="chapter-grid">
          ${items.map((p, i) => cardHTML(p, i, i === 0)).join("")}
        </div>
      </section>`);
  }

  // Anything in a category we don't have a chapter for still gets shown.
  const known = new Set(CHAPTERS.map((c) => c.key));
  const rest = store.products.filter((p) => !known.has(p.category));
  if (rest.length) {
    sections.push(`
      <section class="chapter chapter--training" id="chapter-more">
        <header class="chapter-head">
          <span class="chapter-num reveal" aria-hidden="true">+</span>
          <div class="chapter-head-text"><h3 class="reveal" style="--d:90ms">Also this week</h3></div>
        </header>
        <div class="chapter-grid">${rest.map((p, i) => cardHTML(p, i, false)).join("")}</div>
      </section>`);
  }

  wrap.innerHTML = sections.length
    ? sections.join("")
    : `<p class="grid-empty">The catalog is being refreshed — check back shortly.</p>`;

  observeReveals();
}

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
    // Only hide/animate content once we know JS is running and the
    // catalog is loaded — without JS the page never blanks out.
    document.body.classList.add("anim-ready");
    renderRefreshNote();
    renderChapters();
    renderCart();
  } catch (err) {
    $("#refresh-note").textContent = "Couldn't load the catalog. Please refresh the page.";
    console.error("Catalog load failed:", err);
  }
})();
