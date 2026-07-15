/**
 * Stripe sync — Waggle & Co.
 *
 * Creates/refreshes a Stripe Product, Price, and hosted Payment Link for
 * every sellable unit in data/products.json (the product itself, or each
 * of its variants), and writes the checkout URL back into the catalog as
 * `stripe: { productId, priceId, link, amount }`.
 *
 * The storefront is static (GitHub Pages), so this runs in GitHub Actions
 * where STRIPE_SECRET_KEY lives — the key never reaches the browser. The
 * site only ever sees the public buy.stripe.com URLs.
 *
 * Idempotent: Stripe ids are stored in products.json. When a unit's price
 * changes (e.g. after the daily CJ refresh), a new Price and Payment Link
 * are created and the old link is deactivated.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY   repo secret (sk_live_… or sk_test_…)
 *   SITE_URL            checkout success redirect
 *                       (default: the GitHub Pages URL)
 *
 * Without the key the script exits 0 and changes nothing.
 */

import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../data/products.json", import.meta.url);
const SITE_URL = process.env.SITE_URL || "https://krege2007.github.io/novacart-dropshipping/";

const SHIPPING_COUNTRIES = [
  "US", "CA", "GB", "IE", "AU", "NZ",
  "NO", "SE", "DK", "FI", "DE", "FR",
  "NL", "BE", "AT", "CH", "ES", "IT", "PT",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Stripe REST (form-encoded, no SDK) ---------- */

function formEncode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}

async function stripe(path, params, { method = "POST" } = {}) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? formEncode(params) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path} -> ${json.error?.message ?? res.status}`);
  }
  return json;
}

/* ---------- sync one sellable unit ---------- */

const toCents = (n) => Math.round(n * 100);

async function syncUnit({ key, name, image, amount, holder }) {
  let cur = holder.stripe ?? {};
  // Test-mode ids are invisible to a live key (and vice versa). If the key
  // mode doesn't match the stored link's mode, start that unit from scratch
  // so switching to live keys just regenerates everything on the next run.
  const liveKey = process.env.STRIPE_SECRET_KEY.startsWith("sk_live");
  const linkIsTest = (cur.link ?? "").includes("buy.stripe.com/test_");
  if (cur.link && liveKey === linkIsTest) cur = {};
  const cents = toCents(amount);
  let changed = false;

  let productId = cur.productId;
  if (!productId) {
    const product = await stripe("/products", {
      name,
      ...(image && image.startsWith("http") ? { images: { 0: image } } : {}),
      metadata: { waggle_key: key },
    });
    productId = product.id;
    changed = true;
  }

  let priceId = cur.priceId;
  if (!priceId || cur.amount !== amount) {
    const price = await stripe("/prices", {
      product: productId,
      currency: "usd",
      unit_amount: cents,
      nickname: key,
    });
    priceId = price.id;
    changed = true;
  }

  let link = cur.link;
  if (!link || changed) {
    const countries = Object.fromEntries(SHIPPING_COUNTRIES.map((c, i) => [i, c]));
    const paymentLink = await stripe("/payment_links", {
      line_items: {
        0: {
          price: priceId,
          quantity: 1,
          adjustable_quantity: { enabled: true, minimum: 1, maximum: 10 },
        },
      },
      shipping_address_collection: { allowed_countries: countries },
      // CJ logistics require a contact phone on the order.
      phone_number_collection: { enabled: true },
      after_completion: {
        type: "redirect",
        redirect: { url: `${SITE_URL}?paid=1` },
      },
      metadata: { waggle_key: key },
    });
    // Old link (if any) should stop accepting payments.
    if (cur.link && cur.linkId) {
      await stripe(`/payment_links/${cur.linkId}`, { active: false }).catch(() => {});
    }
    holder.stripe = {
      productId, priceId, linkId: paymentLink.id, link: paymentLink.url, amount, phone: true,
    };
    return true;
  }

  // One-time retrofit: links created before phone collection existed.
  if (!cur.phone && cur.linkId) {
    await stripe(`/payment_links/${cur.linkId}`, { phone_number_collection: { enabled: true } });
    holder.stripe = { ...cur, productId, priceId, amount, phone: true };
    return true;
  }

  holder.stripe = { ...cur, productId, priceId, amount };
  return changed;
}

/* ---------- main ---------- */

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log(
      "STRIPE_SECRET_KEY not set — skipping Stripe sync.\n" +
        "Add it as a GitHub repo secret to generate hosted checkout links."
    );
    return;
  }

  const catalog = JSON.parse(await readFile(OUT, "utf8"));
  let synced = 0;
  let failed = 0;

  for (const p of catalog.products) {
    const units = p.variants?.length
      ? p.variants.map((v) => ({
          key: `${p.id}::${v.id}`,
          name: `${p.name} — ${v.name}`,
          image: v.image || p.image,
          amount: v.price,
          holder: v,
        }))
      : [{ key: p.id, name: p.name, image: p.image, amount: p.price, holder: p }];

    for (const unit of units) {
      try {
        const changed = await syncUnit(unit);
        if (changed) {
          synced++;
          console.log(`  ${unit.key}: link ready ($${unit.amount})`);
        }
        await sleep(150);
      } catch (err) {
        failed++;
        console.warn(`  ${unit.key}: Stripe sync failed (${err.message})`);
      }
    }
  }

  await writeFile(OUT, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Stripe sync done: ${synced} links created/updated, ${failed} failures.`);
  if (failed && !synced) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
