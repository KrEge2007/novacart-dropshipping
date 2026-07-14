/**
 * Catalog refresh script — pulls live products from the CJdropshipping API
 * and writes data/products.json for the storefront.
 *
 * Runs on a schedule via .github/workflows/refresh-catalog.yml.
 *
 * Env vars:
 *   CJ_API_KEY     CJdropshipping API key (repo secret). Generate it at
 *                  https://www.cjdropshipping.com/my.html#/authorize/API
 *                  (API tab -> Add API -> Type "API Key") and copy the full
 *                  value from the "API Key & MCP Token" column; it looks
 *                  like "1234567@api@xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".
 *   ROTATION       "weekly" (default) or "daily" — how often the product
 *                  *selection* changes. The job can run daily either way;
 *                  with weekly rotation, daily runs only refresh prices/stock.
 *   PRODUCT_COUNT  total products to publish (default 16)
 *
 * Without credentials the script exits 0 and leaves the existing catalog
 * untouched, so the site keeps working before secrets are configured.
 */

import { writeFile } from "node:fs/promises";

const API = "https://developers.cjdropshipping.com/api2.0/v1";
const OUT = new URL("../data/products.json", import.meta.url);

const ROTATION = process.env.ROTATION === "daily" ? "daily" : "weekly";
const PRODUCT_COUNT = Number(process.env.PRODUCT_COUNT) || 16;

// Sourcing: instead of CJ's loose keyword search (a "yoga mat" search
// returns car dash mats), we browse real CJ categories and classify each
// product into a storefront category by phrases in its name. Products that
// match no phrase are discarded.
const SOURCES = [
  {
    name: "Fitness & Bodybuilding",
    categoryId: "C20B25A2-348C-48C8-A2C8-FE33749A40DE",
    pages: 3,
    categories: ["training", "yoga", "recovery", "hydration"],
  },
  {
    name: "Drinkware",
    categoryId: "CF330457-0E5B-4FAF-9BAE-7D2C247BD8DE",
    pages: 1,
    categories: ["hydration"],
  },
];

// Order matters: first match wins, so specific gear (yoga/recovery) is
// claimed before generic training phrases.
const KIND_MAP = [
  { category: "yoga", phrases: ["yoga mat", "yoga block", "yoga brick", "yoga wheel", "yoga strap", "yoga ball", "pilates"] },
  { category: "recovery", phrases: ["massage gun", "fascia gun", "foam roller", "muscle roller", "acupressure", "massager", "muscle relax"] },
  { category: "hydration", phrases: ["water bottle", "sports bottle", "shaker bottle", "protein shaker", "insulated bottle", "water cup"] },
  { category: "training", phrases: ["kettlebell", "dumbbell", "resistance band", "jump rope", "skipping rope", "barbell", "pull up bar", "push up", "ab roller", "weight bench", "hand grip", "grip strength", "exercise mat", "ankle weight", "gym ball", "exercise wheel"] },
];

const QUOTAS = { training: 5, yoga: 4, recovery: 4, hydration: 3 };

// Discard anything whose name hits one of these, whatever it matched on.
const NAME_BLOCKLIST = [
  "car ", " dash", "dashboard", "kitchen", "bathroom", "rust", "ornament",
  "bonsai", "sunshade", "mosquito", "curtain", "wallpaper", "sticker",
  "mop", "floor cleaning", "cleaning", "pet ", "dog ", "cat ", "cocktail",
  // non-English listings look broken next to the rest of the catalog
  "hanteln", "kurzhantel", "langhantel",
];

// Supplier-cost sanity band: excludes $0.50 trinkets and heavy freight items.
const MIN_COST = 3;
const MAX_COST = 65;

// Retail pricing: supplier cost -> customer price with margin, .95 endings.
const retailPrice = (cost) => Math.max(Math.ceil(cost * 2.4) - 0.05, 9.95);
const compareAtPrice = (retail) => Math.ceil(retail * 1.3) - 0.05;

/* ---------- deterministic rotation ---------- */
// The selection is seeded by date (or ISO week), so every run within the
// same period publishes the same products, and the catalog rotates when
// the period changes.

function rotationSeed() {
  const now = new Date();
  if (ROTATION === "daily") return now.toISOString().slice(0, 10);
  // ISO week number
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- CJ API ---------- */

async function cjRequest(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "CJ-Access-Token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`CJ API ${path} -> HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200 || json.result === false) {
    throw new Error(`CJ API ${path} -> ${json.code}: ${json.message}`);
  }
  return json.data;
}

async function getAccessToken(apiKey) {
  const data = await cjRequest("/authentication/getAccessToken", {
    method: "POST",
    body: { apiKey },
  });
  return data.accessToken;
}

async function listByCategory(token, categoryId, pageNum) {
  const data = await cjRequest(
    `/product/list?pageNum=${pageNum}&pageSize=100&categoryId=${encodeURIComponent(categoryId)}`,
    { token }
  );
  return data?.list ?? [];
}

// First matching phrase in KIND_MAP decides the storefront category.
function classify(name, allowedCategories) {
  const lower = name.toLowerCase();
  for (const entry of KIND_MAP) {
    if (!allowedCategories.includes(entry.category)) continue;
    const phrase = entry.phrases.find((p) => lower.includes(p));
    if (phrase) return { category: entry.category, kind: phrase };
  }
  return null;
}

// CJ sellPrice can be "3.50" or a range like "3.50 -- 5.20"; take the low end.
function parseCost(sellPrice) {
  const m = String(sellPrice ?? "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// productImageSet may be an array, a JSON-encoded string, or absent.
function parseImages(value) {
  const clean = (arr) =>
    arr.filter((u) => typeof u === "string" && u.startsWith("http"));
  if (Array.isArray(value)) return clean(value);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return clean(parsed);
    } catch {
      /* not JSON */
    }
    if (value.startsWith("http")) return [value];
  }
  return [];
}

// CJ descriptions are HTML full of boilerplate; reduce to clean plain text.
function stripHtml(html) {
  let text = String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Drop leading spec-sheet prefix and trailing disclaimer boilerplate.
  text = text.replace(/^(product information|description|product description)[.:]?\s*/i, "");
  for (const marker of ["Note:", "Packing list:", "Package includes:", "Product Image:", "1.Please allow", "Please allow"]) {
    const idx = text.indexOf(marker);
    if (idx > 120) text = text.slice(0, idx);
  }
  return text.trim().slice(0, 900);
}

// Enrich a selected product with gallery images + description for its
// product page. Failures are non-fatal — the card image alone still works.
async function fetchDetails(token, product) {
  try {
    const data = await cjRequest(`/product/query?pid=${encodeURIComponent(product.id)}`, { token });
    const images = parseImages(data?.productImageSet).slice(0, 5);
    const description = stripHtml(data?.description);
    return {
      ...product,
      images: images.length ? images : [product.image],
      description: description || null,
    };
  } catch (err) {
    console.warn(`  details for ${product.id} failed: ${err.message}`);
    return { ...product, images: [product.image], description: null };
  }
}

function normalize(raw, allowedCategories) {
  const cost = parseCost(raw.sellPrice);
  const name = String(raw.productNameEn ?? "").trim();
  const image = String(raw.productImage ?? "").trim();
  if (!raw.pid || !name || name.length > 160 || !image.startsWith("http") || !(cost > 0)) {
    return null;
  }
  const lower = name.toLowerCase();
  const match = classify(name, allowedCategories);
  if (!match) return null;
  const { category, kind } = match;
  if (NAME_BLOCKLIST.some((term) => lower.includes(term))) return null;
  if (cost < MIN_COST || cost > MAX_COST) return null;
  const price = retailPrice(cost);
  return {
    id: String(raw.pid),
    sku: raw.productSku ?? null,
    name,
    category,
    kind,
    price,
    compareAt: compareAtPrice(price),
    supplierCost: cost,
    image,
  };
}

// Round-robin across product kinds so one dominant search (e.g. kettlebells)
// can't fill a whole category's quota by itself.
function pickDiverse(pool, quota, rand) {
  const groups = new Map();
  for (const p of pool) {
    if (!groups.has(p.kind)) groups.set(p.kind, []);
    groups.get(p.kind).push(p);
  }
  const shuffledGroups = [...groups.values()].map((g) => seededShuffle(g, rand));
  const picks = [];
  while (picks.length < quota && shuffledGroups.some((g) => g.length)) {
    for (const g of shuffledGroups) {
      if (picks.length >= quota) break;
      const p = g.shift();
      if (p) picks.push(p);
    }
  }
  return picks;
}

/* ---------- main ---------- */

// One-off helper: `node fetch-products.mjs --categories` prints CJ's
// category tree (id + name) so CATEGORY_PLAN can target real categoryIds.
async function dumpCategories(token) {
  const data = await cjRequest("/product/getCategory", { token });
  for (const first of data ?? []) {
    console.log(`# ${first.categoryFirstName}`);
    for (const second of first.categoryFirstList ?? []) {
      console.log(`  ## ${second.categorySecondName}`);
      for (const third of second.categorySecondList ?? []) {
        console.log(`    ${third.categoryId}  ${third.categoryName}`);
      }
    }
  }
}

async function main() {
  const apiKey = process.env.CJ_API_KEY;

  if (!apiKey) {
    console.log(
      "CJ_API_KEY not set — keeping existing catalog.\n" +
        "Add it as a GitHub repo secret (Settings → Secrets → Actions) to enable live product rotation."
    );
    return;
  }

  const token = await getAccessToken(apiKey);

  if (process.argv.includes("--categories")) {
    await dumpCategories(token);
    return;
  }

  console.log(`Rotation mode: ${ROTATION} (seed: ${rotationSeed()})`);

  const rand = seededRandom(rotationSeed());
  const seen = new Set();
  const pools = Object.fromEntries(Object.keys(QUOTAS).map((c) => [c, []]));

  for (const source of SOURCES) {
    for (let page = 1; page <= source.pages; page++) {
      try {
        const results = await listByCategory(token, source.categoryId, page);
        for (const raw of results) {
          const p = normalize(raw, source.categories);
          if (p && !seen.has(p.id)) {
            seen.add(p.id);
            pools[p.category].push(p);
          }
        }
        console.log(`  ${source.name} page ${page}: ${results.length} scanned`);
        if (results.length < 100) break; // last page
        // CJ rate limit: 1 req/sec on most plans
        await new Promise((r) => setTimeout(r, 1100));
      } catch (err) {
        console.warn(`  ${source.name} page ${page} failed: ${err.message}`);
      }
    }
  }

  const selected = [];
  for (const [category, quota] of Object.entries(QUOTAS)) {
    const picks = pickDiverse(pools[category], quota, rand);
    console.log(`  ${category}: pool ${pools[category].length}, publishing ${picks.length}`);
    selected.push(...picks);
  }

  let catalog = selected.slice(0, PRODUCT_COUNT);

  // Safety valve: never publish a broken/empty catalog.
  if (catalog.length < 8) {
    console.error(`Only ${catalog.length} valid products fetched — keeping existing catalog.`);
    process.exit(1);
  }

  console.log("Fetching product details (description + gallery)...");
  const enriched = [];
  for (const product of catalog) {
    enriched.push(await fetchDetails(token, product));
    await new Promise((r) => setTimeout(r, 1100));
  }
  catalog = enriched;

  const out = {
    meta: {
      updatedAt: new Date().toISOString(),
      source: "cjdropshipping",
      rotation: ROTATION,
      rotationSeed: rotationSeed(),
    },
    products: catalog,
  };

  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${catalog.length} products to data/products.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
