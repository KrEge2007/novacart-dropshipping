/**
 * Catalog refresh script — Waggle & Co.
 *
 * The catalog is a FIXED list of hand-picked bestsellers (WINNERS below).
 * The selection never rotates. What this script automates:
 *
 *   1. Match each winner to a live CJdropshipping listing (once — the
 *      matched pid is stored in data/products.json as `cjPid` and reused
 *      on every later run).
 *   2. Refresh supplier cost -> retail price, real product photos, SKU,
 *      and variants daily so the storefront never goes stale.
 *
 * Curated storefront copy (name, blurb, benefits, badge, rating, category,
 * petType) is always kept — supplier listing names and descriptions are not
 * customer-facing quality.
 *
 * If a winner can't be matched or the API fails, its existing entry is kept
 * untouched, so the site never shows a hole.
 *
 * Env vars:
 *   CJ_API_KEY   CJdropshipping API key (repo secret). Generate it at
 *                https://www.cjdropshipping.com/my.html#/authorize/API
 *                (API tab -> Add API -> Type "API Key") and copy the value
 *                from the "API Key & MCP Token" column.
 *
 * Without credentials the script exits 0 and leaves the catalog untouched.
 */

import { readFile, writeFile } from "node:fs/promises";

const API = "https://developers.cjdropshipping.com/api2.0/v1";
const OUT = new URL("../data/products.json", import.meta.url);

/**
 * CJ's pet subcategory ids (from the --categories dump, 2026-07-15).
 * Winners are matched by browsing these pools — CJ's keyword search
 * endpoint returns unrelated products and must not be used.
 */
const CAT = {
  chaseToys: "2410110339311602900",
  trainingToys: "2410110340031614900",
  soundToys: "2410110340161623400",
  toySets: "2410110340411608400",
  plushToys: "2410110340531618900",
  bowls: "2410110341061612000",
  drinkingTools: "2410110341331606800",
  feedingTools: "2410110341451628800",
  outdoorBags: "2410110342571606700",
  seatBelts: "2410110343091603200",
  carMats: "2410110343211625200",
  apparelBags: "2410110351121613900",
  collars: "2410110352331629800",
  harnesses: "2410110352591600400",
  harnessSets: "2410110353301600600",
  hairRemovers: "2410110354491625800",
  showerProducts: "2410110355151622300",
  beds: "2410110358051626100",
  nests: "2410110357511615700",
  petMats: "2410110357391611900",
};

/**
 * The pinned catalog. `id` must match the product id in data/products.json.
 * A candidate's name (lowercase) must contain ALL `mustInclude` terms and
 * at least one `mustAny` term (if set), and none of `blocklist`. `nice`
 * terms only affect ranking.
 */
const WINNERS = [
  { id: "wg-grooming-vacuum", categories: [CAT.hairRemovers, CAT.showerProducts],
    mustInclude: ["vacuum"], mustAny: [], nice: ["kit", "in 1", "groom", "brush", "suction"], blocklist: ["robot"] },
  { id: "wg-paw-cleaner", categories: [CAT.showerProducts, CAT.hairRemovers],
    mustInclude: ["paw"], mustAny: ["clean", "wash"], nice: ["cup", "portable", "silicone"], blocklist: ["balm", "wax", "sock", "wipe"] },
  { id: "wg-smart-ball", categories: [CAT.chaseToys, CAT.trainingToys, CAT.toySets],
    mustInclude: ["ball"], mustAny: ["smart", "automatic", "rolling", "self-moving", "self moving", "jumping"], nice: ["usb", "rechargeable", "interactive", "electric"], blocklist: ["launcher", "tennis", "wool", "feather", "stick", "tease", "wand"] },
  { id: "wg-donut-bed", categories: [CAT.beds, CAT.nests],
    mustInclude: ["bed"], mustAny: [], nice: ["donut", "calming", "plush", "round", "anxiety", "washable"], blocklist: ["car", "cooling", "stairs"] },
  { id: "wg-car-hammock", categories: [CAT.carMats, CAT.seatBelts],
    mustInclude: ["car"], mustAny: ["hammock", "seat cover", "back seat", "rear seat"], nice: ["waterproof", "dog"], blocklist: ["dash", "front", "trunk"] },
  { id: "wg-water-fountain", categories: [CAT.drinkingTools, CAT.bowls],
    mustInclude: ["fountain"], mustAny: [], nice: ["water", "automatic", "filter", "quiet", "cat"], blocklist: ["solar", "garden"] },
  { id: "wg-harness", categories: [CAT.harnesses, CAT.harnessSets],
    mustInclude: ["harness"], mustAny: [], nice: ["no pull", "no-pull", "reflective", "adjustable", "dog", "breathable"], blocklist: ["car", "seat", "cat", "bird", "rabbit", "tactical", "boobs", "service"] },
  { id: "wg-hair-roller", categories: [CAT.hairRemovers],
    mustInclude: ["hair"], mustAny: ["roller", "remover", "removal"], nice: ["reusable", "self-cleaning", "sofa", "lint"], blocklist: ["bow", "dye", "clipper", "trimmer"] },
  { id: "wg-snuffle-mat", categories: [CAT.trainingToys, CAT.petMats, CAT.feedingTools],
    mustInclude: ["mat"], mustAny: ["snuffle", "sniff", "foraging", "nose"], nice: ["dog", "washable"], blocklist: [] },
  { id: "wg-lick-mat", categories: [CAT.feedingTools, CAT.bowls],
    mustInclude: [], mustAny: ["lick mat", "licking mat", "lick pad", "slow feeder"], nice: ["suction", "silicone", "set"], blocklist: [] },
  { id: "wg-led-collar", categories: [CAT.collars],
    mustInclude: ["collar"], mustAny: ["led", "light", "glow", "luminous"], nice: ["rechargeable", "usb", "dog"], blocklist: ["cat", "rhinestone", "pearl", "leather"] },
  { id: "wg-carrier-backpack", categories: [CAT.outdoorBags, CAT.apparelBags],
    mustInclude: [], mustAny: ["backpack", "carrier"], nice: ["space", "capsule", "bubble", "window", "breathable", "transparent"], blocklist: ["waste", "poop", "treat", "stroller"] },
  { id: "wg-water-bottle", categories: [CAT.drinkingTools],
    mustInclude: ["bottle"], mustAny: ["portable", "travel", "walking", "outdoor", "dog"], nice: ["leak", "bowl", "one-hand"], blocklist: ["nursing", "milk", "feeding", "glass"] },
  { id: "wg-corner-brush", categories: [CAT.hairRemovers, CAT.showerProducts, CAT.trainingToys],
    mustInclude: ["cat"], mustAny: ["corner", "wall", "arch"], nice: ["groom", "brush", "massage", "comb", "catnip"], blocklist: ["board", "paper", "cardboard"] },
  { id: "wg-flopping-fish", categories: [CAT.plushToys, CAT.soundToys, CAT.chaseToys, CAT.trainingToys, CAT.toySets],
    mustInclude: ["fish"], mustAny: ["flop", "electric", "moving", "kicker", "wiggle", "dancing", "jumping"], nice: ["electric", "flopping", "usb", "rechargeable", "simulation"], blocklist: ["tank", "aquarium", "wall", "feeder"] },
  { id: "wg-heartbeat-pup", categories: [CAT.plushToys],
    mustInclude: [], mustAny: ["heartbeat", "heart beat"], nice: ["puppy", "dog", "anxiety", "calm", "sleep"], blocklist: ["cap", "hat", "shirt"] },
];

// Supplier-cost sanity band: excludes trinkets and heavy-freight surprises.
const MIN_COST = 2;
const MAX_COST = 70;

// Retail pricing: supplier cost -> customer price with margin, .95 endings.
const retailPrice = (cost) => Math.max(Math.ceil(cost * 2.4) - 0.05, 9.95);
const compareAtPrice = (retail) => Math.ceil(retail * 1.35) - 0.05;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); // CJ: ~1 req/sec

/* ---------- parsing helpers ---------- */

// CJ sellPrice can be "3.50" or a range like "3.50 -- 5.20"; take the low end.
function parseCost(sellPrice) {
  const m = String(sellPrice ?? "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

// productImageSet may be an array, a JSON-encoded string, or absent.
function parseImages(value) {
  const clean = (arr) => arr.filter((u) => typeof u === "string" && u.startsWith("http"));
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

/* ---------- image quality scoring ----------
   Supplier photos range from clean studio shots to loud marketing collages.
   Sample each image's border pixels: bright + unsaturated + uniform borders
   = clean product shot. Gallery is reordered best-first. Decoders are
   optional deps — without them, the original order is kept. */

async function importOptional(name) {
  try {
    const mod = await import(name);
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function scoreImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000 || buf.length > 15_000_000) return null;

    let px, w, h;
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      const jpeg = await importOptional("jpeg-js");
      if (!jpeg) return null;
      ({ data: px, width: w, height: h } = jpeg.decode(buf, {
        maxMemoryUsageInMB: 256,
        formatAsRGBA: true,
      }));
    } else if (buf[0] === 0x89 && buf[1] === 0x50) {
      const pngjs = await importOptional("pngjs");
      if (!pngjs?.PNG) return null;
      const png = pngjs.PNG.sync.read(buf);
      ({ data: px, width: w, height: h } = png);
    } else {
      return null; // webp/other: no decoder, skip
    }

    const pts = [];
    const sx = Math.max(1, Math.floor(w / 32));
    for (let x = 0; x < w; x += sx) pts.push([x, 0], [x, h - 1]);
    const sy = Math.max(1, Math.floor(h / 32));
    for (let y = 0; y < h; y += sy) pts.push([0, y], [w - 1, y]);

    let sumL = 0;
    let sumS = 0;
    const lums = [];
    for (const [x, y] of pts) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const lum = (mx + mn) / 510;
      sumL += lum;
      sumS += mx === 0 ? 0 : (mx - mn) / mx;
      lums.push(lum);
    }
    const n = pts.length;
    const meanL = sumL / n;
    const meanS = sumS / n;
    const stdL = Math.sqrt(lums.reduce((a, l) => a + (l - meanL) ** 2, 0) / n);
    return meanL * 2 - meanS * 1.6 - stdL * 2.2;
  } catch {
    return null;
  }
}

async function orderImagesByQuality(images) {
  const scored = await Promise.all(
    images.map(async (url) => ({ url, score: await scoreImage(url) }))
  );
  if (!scored.some((s) => s.score !== null)) return images;
  scored.sort((a, b) => (b.score ?? -99) - (a.score ?? -99));
  return scored.map((s) => s.url);
}

/* ---------- variants ---------- */

function normalizeVariants(data) {
  const list = Array.isArray(data?.variants) ? data.variants : [];
  const productName = String(data?.productNameEn ?? "").trim().toLowerCase();
  const out = [];
  const seen = new Set();
  for (const v of list) {
    const rawName = String(v.variantNameEn ?? "").trim();
    const cost = parseCost(v.variantSellPrice);
    if (!v.vid || !(cost > 0)) continue;

    let label = String(v.variantKey ?? "").trim() || rawName;
    if (productName && label.toLowerCase().startsWith(productName)) {
      label = label.slice(productName.length);
    }
    label = label.replace(/^[\s\-–—_:·,]+/, "").trim();
    if (!label) label = `Option ${out.length + 1}`;
    if (label.length > 60) label = label.slice(0, 57) + "…";

    const dedupe = label.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const image = String(v.variantImage ?? "").trim();
    out.push({
      id: String(v.vid),
      sku: v.variantSku ?? null,
      name: label,
      price: retailPrice(cost),
      compareAt: compareAtPrice(retailPrice(cost)),
      image: image.startsWith("http") ? image : null,
    });
    if (out.length >= 12) break;
  }
  if (out.length < 2) return null;

  // Strip a shared label prefix so the differing part shows.
  let prefix = out[0].name;
  for (const v of out) {
    while (prefix && !v.name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const cut = Math.max(prefix.lastIndexOf("-"), prefix.lastIndexOf(" ")) + 1;
  if (cut >= 6 && out.every((v) => v.name.length > cut)) {
    for (const v of out) {
      v.name = v.name.slice(cut).replace(/^[\s\-–—_:·,]+/, "").trim() || v.name;
    }
  }
  return out;
}

/* ---------- matching a winner to a CJ listing ----------
   Candidates come from browsing the winner's pet categories (pooled and
   cached across winners), then get filtered by name terms and ranked by
   `nice`-term hits and CJ's listedNum popularity signal. */

const PAGES_PER_CATEGORY = 3;
const poolCache = new Map(); // categoryId -> raw listings

async function categoryPool(token, categoryId) {
  if (poolCache.has(categoryId)) return poolCache.get(categoryId);
  const pool = [];
  for (let page = 1; page <= PAGES_PER_CATEGORY; page++) {
    await sleep(1100);
    try {
      const data = await cjRequest(
        `/product/list?pageNum=${page}&pageSize=100&categoryId=${encodeURIComponent(categoryId)}`,
        { token }
      );
      const list = data?.list ?? [];
      pool.push(...list);
      if (list.length < 100) break; // last page
    } catch (err) {
      console.warn(`    category ${categoryId} page ${page} failed: ${err.message}`);
      break;
    }
  }
  poolCache.set(categoryId, pool);
  return pool;
}

function candidateOk(raw, winner) {
  const name = String(raw.productNameEn ?? "").toLowerCase();
  const cost = parseCost(raw.sellPrice);
  if (!raw.pid || !name || !(cost >= MIN_COST && cost <= MAX_COST)) return false;
  if (!String(raw.productImage ?? "").startsWith("http")) return false;
  if (!winner.mustInclude.every((t) => name.includes(t))) return false;
  if (winner.mustAny.length && !winner.mustAny.some((t) => name.includes(t))) return false;
  if (winner.blocklist.some((t) => name.includes(t))) return false;
  return true;
}

async function findListing(token, winner) {
  const seen = new Set();
  const candidates = [];
  for (const categoryId of winner.categories) {
    for (const raw of await categoryPool(token, categoryId)) {
      if (seen.has(raw.pid)) continue;
      seen.add(raw.pid);
      if (candidateOk(raw, winner)) candidates.push(raw);
    }
  }
  if (!candidates.length) return null;
  const score = (r) => {
    const name = String(r.productNameEn).toLowerCase();
    return winner.nice.filter((t) => name.includes(t)).length;
  };
  const popularity = (r) => Number(r.listedNum) || 0;
  candidates.sort(
    (a, b) => score(b) - score(a) || popularity(b) - popularity(a) ||
      parseCost(a.sellPrice) - parseCost(b.sellPrice)
  );
  console.log(`    ${winner.id}: ${candidates.length} candidates`);
  return candidates[0];
}

// Pull live details for a pid and merge them into the curated entry.
async function refreshEntry(token, entry, pid) {
  const data = await cjRequest(`/product/query?pid=${encodeURIComponent(pid)}`, { token });
  const cost = parseCost(data?.sellPrice);
  if (!(cost > 0)) throw new Error("no valid cost");

  let images = parseImages(data?.productImageSet).slice(0, 6);
  if (!images.length && String(data?.productImage ?? "").startsWith("http")) {
    images = [data.productImage];
  }
  if (images.length) images = await orderImagesByQuality(images);

  const variants = normalizeVariants(data);
  const price = variants ? Math.min(...variants.map((v) => v.price)) : retailPrice(cost);

  return {
    ...entry, // curated copy (name, blurb, benefits, rating, badge, …) wins
    cjPid: String(pid),
    sku: data?.productSku ?? entry.sku ?? null,
    supplierCost: cost,
    price,
    compareAt: compareAtPrice(price),
    ...(images.length ? { image: images[0], images } : {}),
    ...(variants ? { variants } : {}),
  };
}

/* ---------- main ---------- */

// One-off helper: `node fetch-products.mjs --categories` (or the workflow's
// mode=categories) prints CJ's category tree so PET_CATEGORIES can target
// real categoryIds. Keyword search is NOT used for matching — it returns
// unrelated products (verified 2026-07-15: "heartbeat puppy toy" -> baseball
// cap) — so winners are matched against category-browsed pools instead.
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
  const catalog = JSON.parse(await readFile(OUT, "utf8"));

  if (!apiKey) {
    console.log(
      "CJ_API_KEY not set — keeping existing catalog (with placeholder images).\n" +
        "Add it as a GitHub repo secret (Settings → Secrets → Actions) to pull real " +
        "supplier photos, prices, and SKUs for the pinned bestsellers."
    );
    return;
  }

  const token = await getAccessToken(apiKey);

  if (process.argv.includes("--categories")) {
    await dumpCategories(token);
    return;
  }

  let refreshed = 0;

  for (const winner of WINNERS) {
    const idx = catalog.products.findIndex((p) => p.id === winner.id);
    if (idx === -1) {
      console.warn(`  ${winner.id}: not in products.json — skipping`);
      continue;
    }
    const entry = catalog.products[idx];
    try {
      let pid = entry.cjPid;
      if (!pid) {
        await sleep(1100);
        const listing = await findListing(token, winner);
        if (!listing) {
          console.warn(`  ${winner.id}: no CJ match in its categories — keeping current entry`);
          continue;
        }
        pid = listing.pid;
        console.log(`  ${winner.id}: matched "${listing.productNameEn}" (${pid})`);
      }
      await sleep(1100);
      catalog.products[idx] = await refreshEntry(token, entry, pid);
      refreshed++;
      console.log(`  ${winner.id}: refreshed (cost $${catalog.products[idx].supplierCost} -> $${catalog.products[idx].price})`);
    } catch (err) {
      console.warn(`  ${winner.id}: refresh failed (${err.message}) — keeping current entry`);
    }
  }

  catalog.meta = {
    ...catalog.meta,
    updatedAt: new Date().toISOString(),
    source: refreshed ? "cjdropshipping" : catalog.meta?.source ?? "seed",
  };

  await writeFile(OUT, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Refreshed ${refreshed}/${WINNERS.length} products in data/products.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
