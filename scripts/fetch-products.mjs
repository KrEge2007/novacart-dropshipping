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
const CATEGORY_PLAN = [
  { category: "training", quota: 5, keywords: ["resistance bands set", "kettlebell", "jump rope fitness", "adjustable dumbbell"] },
  { category: "yoga", quota: 4, keywords: ["yoga mat", "yoga block set", "pilates ring"] },
  { category: "recovery", quota: 4, keywords: ["massage gun", "foam roller muscle", "acupressure mat"] },
  { category: "hydration", quota: 3, keywords: ["insulated water bottle", "protein shaker bottle"] },
];

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

function normalize(raw, category) {
  const cost = parseCost(raw.sellPrice);
  const name = String(raw.productNameEn ?? "").trim();
  const image = String(raw.productImage ?? "").trim();
  if (!raw.pid || !name || name.length > 160 || !image.startsWith("http") || !(cost > 0)) {
    return null;
  }
  const price = retailPrice(cost);
  return {
    id: String(raw.pid),
    sku: raw.productSku ?? null,
    name,
    category,
    price,
    compareAt: compareAtPrice(price),
    supplierCost: cost,
    image,
  };
}

/* ---------- main ---------- */

async function main() {
  const apiKey = process.env.CJ_API_KEY;

  if (!apiKey) {
    console.log(
      "CJ_API_KEY not set — keeping existing catalog.\n" +
        "Add it as a GitHub repo secret (Settings → Secrets → Actions) to enable live product rotation."
    );
    return;
  }

  console.log(`Rotation mode: ${ROTATION} (seed: ${rotationSeed()})`);
  const token = await getAccessToken(apiKey);

  const rand = seededRandom(rotationSeed());
  const selected = [];
  const seen = new Set();

  for (const plan of CATEGORY_PLAN) {
    const pool = [];
    for (const keyword of plan.keywords) {
      try {
        const results = await searchProducts(token, keyword);
        for (const raw of results) {
          const p = normalize(raw, plan.category);
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
    const picks = seededShuffle(pool, rand).slice(0, plan.quota);
    console.log(`  ${plan.category}: pool ${pool.length}, publishing ${picks.length}`);
    selected.push(...picks);
  }

  const catalog = selected.slice(0, PRODUCT_COUNT);

  // Safety valve: never publish a broken/empty catalog.
  if (catalog.length < 8) {
    console.error(`Only ${catalog.length} valid products fetched — keeping existing catalog.`);
    process.exit(1);
  }

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
