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

// What we search for on CJ, per storefront category, with how many products
// each category gets in the published catalog.
//
// CJ keyword search is loose (a "yoga mat" search returns car dash mats),
// so every search carries `require`: the product NAME must contain at least
// one of these phrases or it is discarded.
const CATEGORY_PLAN = [
  {
    category: "training",
    quota: 5,
    searches: [
      { keyword: "resistance bands set", require: ["resistance band"] },
      { keyword: "kettlebell", require: ["kettlebell"] },
      { keyword: "jump rope fitness", require: ["jump rope", "skipping rope"] },
      { keyword: "dumbbell set", require: ["dumbbell"] },
    ],
  },
  {
    category: "yoga",
    quota: 4,
    searches: [
      { keyword: "yoga mat", require: ["yoga mat"] },
      { keyword: "yoga", require: ["yoga mat", "yoga block", "yoga brick", "yoga wheel", "yoga strap", "yoga ball", "yoga bag"] },
      { keyword: "pilates ring", require: ["pilates"] },
    ],
  },
  {
    category: "recovery",
    quota: 4,
    searches: [
      { keyword: "massage gun muscle", require: ["massage gun", "fascia gun"] },
      { keyword: "foam roller muscle", require: ["foam roller", "muscle roller"] },
      { keyword: "acupressure mat", require: ["acupressure"] },
    ],
  },
  {
    category: "hydration",
    quota: 3,
    searches: [
      { keyword: "insulated sports water bottle", require: ["water bottle", "sports bottle"] },
      { keyword: "protein shaker", require: ["shaker"] },
    ],
  },
];

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

async function searchProducts(token, keyword) {
  const data = await cjRequest(
    `/product/list?pageNum=1&pageSize=60&productNameEn=${encodeURIComponent(keyword)}`,
    { token }
  );
  return data?.list ?? [];
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
  text = text.replace(/^product information:?\s*/i, "");
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

function normalize(raw, category, requirePhrases) {
  const cost = parseCost(raw.sellPrice);
  const name = String(raw.productNameEn ?? "").trim();
  const image = String(raw.productImage ?? "").trim();
  if (!raw.pid || !name || name.length > 160 || !image.startsWith("http") || !(cost > 0)) {
    return null;
  }
  const lower = name.toLowerCase();
  const kind = requirePhrases.find((phrase) => lower.includes(phrase));
  if (!kind) return null;
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
  const selected = [];
  const seen = new Set();

  for (const plan of CATEGORY_PLAN) {
    const pool = [];
    for (const { keyword, require } of plan.searches) {
      try {
        const results = await searchProducts(token, keyword);
        for (const raw of results) {
          const p = normalize(raw, plan.category, require);
          if (p && !seen.has(p.id)) {
            seen.add(p.id);
            pool.push(p);
          }
        }
        // CJ rate limit: 1 req/sec on most plans
        await new Promise((r) => setTimeout(r, 1100));
      } catch (err) {
        console.warn(`  search "${keyword}" failed: ${err.message}`);
      }
    }
    const picks = pickDiverse(pool, plan.quota, rand);
    console.log(`  ${plan.category}: pool ${pool.length}, publishing ${picks.length}`);
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
