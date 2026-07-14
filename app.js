/* ============================================================
   NovaCart storefront logic
   - AI-weighted auto-shuffling product grid (FLIP animation)
   - Category filters
   - Cart with localStorage persistence
   - "Nova" AI shopping assistant widget
   ============================================================ */

"use strict";

/* ----------------------- helpers ----------------------- */

const $ = (sel) => document.querySelector(sel);
const money = (n) => `$${n.toFixed(2)}`;

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* ============================================================
   SHUFFLE ENGINE
   AI-weighted shuffle: higher trendScore = more likely to land
   near the top, but with randomness so the grid stays fresh.
   Uses the FLIP technique so cards visibly glide to new spots.
   ============================================================ */

const SHUFFLE_INTERVAL = 8; // seconds between auto-shuffles

const shuffleState = {
  running: true,
  countdown: SHUFFLE_INTERVAL,
  filter: "all",
  order: PRODUCTS.map((p) => p.id),
};

// Weighted shuffle: sort by trendScore * random jitter (efraimidis-spirakis style)
function aiWeightedShuffle(products) {
  return [...products]
    .map((p) => ({ p, key: Math.pow(Math.random(), 100 / (p.trendScore + 1)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ p }) => p);
}

function visibleProducts() {
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const ordered = shuffleState.order.map((id) => byId[id]);
  return shuffleState.filter === "all"
    ? ordered
    : ordered.filter((p) => p.category === shuffleState.filter);
}

function productCardHTML(p) {
  const discount = Math.round((1 - p.price / p.compareAt) * 100);
  const hot = p.trendScore >= 85;
  return `
    <article class="product-card" data-id="${p.id}">
      <div class="product-media" style="--hue:${p.hue}">
        <span class="product-emoji">${p.emoji}</span>
        ${hot ? '<span class="badge badge-hot">🔥 Trending</span>' : ""}
        <span class="badge badge-off">-${discount}%</span>
      </div>
      <div class="product-body">
        <div class="product-meta">
          <span class="product-cat">${p.category}</span>
          <span class="product-rating">★ ${p.rating} <em>(${p.reviews.toLocaleString()})</em></span>
        </div>
        <h3 class="product-name">${p.name}</h3>
        <p class="product-desc">${p.desc}</p>
        <div class="product-foot">
          <div class="price">
            <strong>${money(p.price)}</strong>
            <s>${money(p.compareAt)}</s>
          </div>
          <button class="btn btn-primary btn-sm add-to-cart" data-id="${p.id}">Add</button>
        </div>
        <div class="trend-bar" title="AI trend score: ${p.trendScore}/100">
          <div class="trend-fill" style="width:${p.trendScore}%"></div>
          <span>AI trend score ${p.trendScore}</span>
        </div>
      </div>
    </article>`;
}

function renderGrid() {
  $("#product-grid").innerHTML = visibleProducts().map(productCardHTML).join("");
}

// FLIP: capture positions, reorder DOM, then animate from old -> new position
function shuffleGrid() {
  const grid = $("#product-grid");
  const first = {};
  grid.querySelectorAll(".product-card").forEach((el) => {
    first[el.dataset.id] = el.getBoundingClientRect();
  });

  shuffleState.order = aiWeightedShuffle(PRODUCTS).map((p) => p.id);
  renderGrid();

  grid.querySelectorAll(".product-card").forEach((el) => {
    const prev = first[el.dataset.id];
    if (!prev) {
      el.animate(
        [{ opacity: 0, transform: "scale(0.92)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: 450, easing: "ease-out" }
      );
      return;
    }
    const now = el.getBoundingClientRect();
    const dx = prev.left - now.left;
    const dy = prev.top - now.top;
    if (dx || dy) {
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    }
  });

  shuffleState.countdown = SHUFFLE_INTERVAL;
}

function tickShuffle() {
  if (!shuffleState.running) return;
  shuffleState.countdown -= 1;
  if (shuffleState.countdown <= 0) shuffleGrid();
  $("#shuffle-countdown").textContent = Math.max(shuffleState.countdown, 0);
}

/* ----------------------- filters ----------------------- */

$("#filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  shuffleState.filter = chip.dataset.filter;
  renderGrid();
});

/* ----------------------- shuffle controls ----------------------- */

$("#shuffle-now").addEventListener("click", () => {
  shuffleGrid();
  showToast("🔀 AI re-ranked the catalog");
});

$("#shuffle-toggle").addEventListener("click", (e) => {
  shuffleState.running = !shuffleState.running;
  e.currentTarget.textContent = shuffleState.running ? "⏸ Pause" : "▶ Resume";
  e.currentTarget.setAttribute("aria-pressed", String(shuffleState.running));
  showToast(shuffleState.running ? "Auto-rotation resumed" : "Auto-rotation paused");
});

/* ============================================================
   CART
   ============================================================ */

const cart = JSON.parse(localStorage.getItem("novacart") || "{}");

function saveCart() {
  localStorage.setItem("novacart", JSON.stringify(cart));
}

function cartCount() {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = PRODUCTS.find((x) => x.id === id);
    return p ? sum + p.price * qty : sum;
  }, 0);
}

function renderCart() {
  $("#cart-count").textContent = cartCount();
  $("#cart-total").textContent = money(cartTotal());
  const box = $("#cart-items");
  const entries = Object.entries(cart).filter(([, q]) => q > 0);
  if (!entries.length) {
    box.innerHTML = `<p class="cart-empty">Your cart is empty.<br/>Ask Nova 🤖 for a recommendation!</p>`;
    return;
  }
  box.innerHTML = entries
    .map(([id, qty]) => {
      const p = PRODUCTS.find((x) => x.id === id);
      if (!p) return "";
      return `
        <div class="cart-item">
          <div class="cart-thumb" style="--hue:${p.hue}">${p.emoji}</div>
          <div class="cart-item-info">
            <strong>${p.name}</strong>
            <span>${money(p.price)} × ${qty}</span>
          </div>
          <div class="qty-controls">
            <button data-id="${id}" data-d="-1" aria-label="Decrease">−</button>
            <span>${qty}</span>
            <button data-id="${id}" data-d="1" aria-label="Increase">+</button>
          </div>
        </div>`;
    })
    .join("");
}

document.addEventListener("click", (e) => {
  const add = e.target.closest(".add-to-cart");
  if (add) {
    cart[add.dataset.id] = (cart[add.dataset.id] || 0) + 1;
    saveCart();
    renderCart();
    const p = PRODUCTS.find((x) => x.id === add.dataset.id);
    showToast(`✅ Added ${p.name} to cart`);
    return;
  }
  const qty = e.target.closest(".qty-controls button");
  if (qty) {
    const id = qty.dataset.id;
    cart[id] = (cart[id] || 0) + Number(qty.dataset.d);
    if (cart[id] <= 0) delete cart[id];
    saveCart();
    renderCart();
  }
});

function openCart(open) {
  $("#cart-drawer").classList.toggle("open", open);
  $("#drawer-backdrop").classList.toggle("show", open);
}

$("#cart-btn").addEventListener("click", () => openCart(true));
$("#cart-close").addEventListener("click", () => openCart(false));
$("#drawer-backdrop").addEventListener("click", () => openCart(false));

$("#checkout-btn").addEventListener("click", () => {
  if (!cartCount()) return showToast("Your cart is empty");
  showToast("🔒 Demo store — connect Stripe/Shopify checkout to go live (see README)");
});

/* ============================================================
   "NOVA" — AI SHOPPING ASSISTANT
   Runs fully client-side as a demo. To upgrade it to a real
   LLM assistant, point askNova() at a small serverless
   endpoint that calls the Claude API — see README.md.
   ============================================================ */

const chatEl = {
  panel: $("#chat-panel"),
  messages: $("#chat-messages"),
  suggestions: $("#chat-suggestions"),
  form: $("#chat-form"),
  input: $("#chat-input"),
};

const SUGGESTIONS = [
  "What's trending right now?",
  "Gift ideas under $30",
  "How fast is shipping?",
  "Best product for pets?",
];

function addMsg(text, who) {
  const div = document.createElement("div");
  div.className = `msg msg-${who}`;
  div.innerHTML = text;
  chatEl.messages.appendChild(div);
  chatEl.messages.scrollTop = chatEl.messages.scrollHeight;
}

function productLine(p) {
  return `<strong>${p.emoji} ${p.name}</strong> — ${money(p.price)} (★ ${p.rating}, trend ${p.trendScore})`;
}

function topTrending(n = 3, cat = null) {
  return [...PRODUCTS]
    .filter((p) => !cat || p.category === cat)
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, n);
}

function askNova(q) {
  const t = q.toLowerCase();

  if (/trend|hot|popular|best ?sell|what's (good|new)/.test(t)) {
    return `Right now the AI engine's hottest picks are:<br/>` +
      topTrending(3).map((p) => `• ${productLine(p)}`).join("<br/>") +
      `<br/>The grid re-ranks every ${SHUFFLE_INTERVAL} seconds, so check back!`;
  }

  const catMatch = ["tech", "home", "fitness", "beauty", "pets", "pet"].find((c) => t.includes(c));
  if (catMatch) {
    const cat = catMatch === "pet" ? "pets" : catMatch;
    return `Top ${cat} picks by AI trend score:<br/>` +
      topTrending(3, cat).map((p) => `• ${productLine(p)}`).join("<br/>");
  }

  const budget = t.match(/under \$?(\d+)|less than \$?(\d+)|\$(\d+) or less/);
  if (budget || /gift|present/.test(t)) {
    const max = budget ? Number(budget[1] || budget[2] || budget[3]) : 35;
    const picks = [...PRODUCTS]
      .filter((p) => p.price <= max)
      .sort((a, b) => b.trendScore - a.trendScore)
      .slice(0, 3);
    return picks.length
      ? `Great gifts under ${money(max)}:<br/>` + picks.map((p) => `• ${productLine(p)}`).join("<br/>")
      : `Nothing under ${money(max)} right now — our cheapest item is ${productLine([...PRODUCTS].sort((a, b) => a.price - b.price)[0])}.`;
  }

  if (/ship|deliver|arrive|how long/.test(t)) {
    return `🚚 Standard shipping is <strong>free on orders over $50</strong> and takes 5–9 business days to most countries (90+ supported). Express options appear at checkout. Every order includes live tracking.`;
  }

  if (/return|refund|money ?back|warranty/.test(t)) {
    return `↩️ Everything ships with a <strong>30-day money-back guarantee</strong> — no questions asked. Start a return from the link in your order confirmation email.`;
  }

  if (/cart|checkout|pay/.test(t)) {
    return `You currently have <strong>${cartCount()} item(s)</strong> in your cart totalling <strong>${money(cartTotal())}</strong>. Click the 🛍️ icon up top to review and check out.`;
  }

  if (/hi|hello|hey|hei|hallo/.test(t)) {
    return `Hey! 👋 I'm Nova, this store's AI assistant. Ask me what's trending, for gift ideas within a budget, or about shipping & returns.`;
  }

  // Fuzzy product search
  const hit = PRODUCTS.find((p) => p.name.toLowerCase().split(" ").some((w) => w.length > 3 && t.includes(w)));
  if (hit) {
    return `${productLine(hit)}<br/>${hit.desc}<br/>Want it? Hit <em>Add</em> on its card in the catalog.`;
  }

  return `I can help with: 🔥 what's trending, 🎁 gift ideas ("gifts under $30"), 📦 shipping & returns, or 🛍️ your cart. What would you like?`;
}

function renderSuggestions() {
  chatEl.suggestions.innerHTML = SUGGESTIONS
    .map((s) => `<button type="button" class="chip chip-sm">${s}</button>`)
    .join("");
}

chatEl.suggestions.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) sendChat(btn.textContent);
});

function sendChat(text) {
  addMsg(text, "user");
  const typing = document.createElement("div");
  typing.className = "msg msg-bot typing";
  typing.textContent = "…";
  chatEl.messages.appendChild(typing);
  chatEl.messages.scrollTop = chatEl.messages.scrollHeight;
  setTimeout(() => {
    typing.remove();
    addMsg(askNova(text), "bot");
  }, 500 + Math.random() * 500);
}

chatEl.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatEl.input.value.trim();
  if (!text) return;
  chatEl.input.value = "";
  sendChat(text);
});

function openChat(open) {
  chatEl.panel.classList.toggle("open", open);
  if (open) chatEl.input.focus();
}

$("#chat-fab").addEventListener("click", () => openChat(!chatEl.panel.classList.contains("open")));
$("#chat-close").addEventListener("click", () => openChat(false));

/* ----------------------- misc UI ----------------------- */

$("#nav-cta").addEventListener("click", () => {
  document.getElementById("products").scrollIntoView({ behavior: "smooth" });
});

$("#newsletter-form").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#newsletter-note").textContent = "✅ You're on the list! First trend report lands next Monday.";
  e.target.reset();
});

window.addEventListener("scroll", () => {
  $("#navbar").classList.toggle("scrolled", window.scrollY > 12);
});

/* ----------------------- init ----------------------- */

shuffleState.order = aiWeightedShuffle(PRODUCTS).map((p) => p.id);
renderGrid();
renderCart();
renderSuggestions();
addMsg("Hi! 👋 I'm <strong>Nova</strong>, your AI shopping assistant. Ask me what's trending or for gift ideas!", "bot");
setInterval(tickShuffle, 1000);
