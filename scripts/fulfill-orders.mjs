/**
 * Order fulfillment — Waggle & Co.
 *
 * Bridges paid Stripe checkouts to CJdropshipping orders:
 *
 *   1. Lists recent Stripe Checkout Sessions (paid + complete).
 *   2. Maps each session's line item (Stripe price id) to the CJ variant id
 *      stored in data/products.json (variant ids ARE CJ vids; variantless
 *      products carry `cjVid`).
 *   3. Picks the cheapest shipping option via CJ freightCalculate, then
 *      creates the CJ order with the customer's shipping address.
 *   4. Stamps the Stripe PaymentIntent with `cj_order_id` metadata — that
 *      stamp is the "already processed" state, so nothing is ever stored
 *      in this (public!) repo and orders are never created twice.
 *
 * The CJ order is created but NOT paid — you review and pay it in the CJ
 * dashboard (Orders → Confirm & Pay). Money never moves automatically.
 *
 * Safety: with a test-mode Stripe key (sk_test_…) this is a DRY RUN — it
 * logs the CJ order it would create and stamps the session, but does not
 * call CJ's order API. Live keys do the real thing.
 *
 * Env vars: STRIPE_SECRET_KEY, CJ_API_KEY
 */

import { readFile } from "node:fs/promises";

const CATALOG = new URL("../data/products.json", import.meta.url);
const CJ_API = "https://developers.cjdropshipping.com/api2.0/v1";
const LOOKBACK_DAYS = 30;
const FALLBACK_LOGISTIC = "CJPacket Ordinary";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Stripe REST ---------- */

function formEncode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}

async function stripe(path, { method = "GET", params } = {}) {
  const body = method === "GET" ? undefined : params ? formEncode(params) : undefined;
  const url = method === "GET" && params ? `${path}?${formEncode(params)}` : path;
  const res = await fetch(`https://api.stripe.com/v1${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} -> ${json.error?.message ?? res.status}`);
  return json;
}

/* ---------- CJ REST ---------- */

async function cjRequest(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${CJ_API}${path}`, {
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

async function cjToken() {
  const data = await cjRequest("/authentication/getAccessToken", {
    method: "POST",
    body: { apiKey: process.env.CJ_API_KEY },
  });
  return data.accessToken;
}

// Cheapest available shipping option for this vid/destination.
async function pickLogistic(token, vid, quantity, countryCode) {
  try {
    const options = await cjRequest("/logistic/freightCalculate", {
      method: "POST",
      token,
      body: {
        startCountryCode: "CN",
        endCountryCode: countryCode,
        products: [{ vid, quantity }],
      },
    });
    const list = (options ?? []).filter((o) => o.logisticName);
    if (!list.length) return FALLBACK_LOGISTIC;
    list.sort((a, b) => Number(a.logisticPrice) - Number(b.logisticPrice));
    return list[0].logisticName;
  } catch (err) {
    console.warn(`    freight lookup failed (${err.message}) — using ${FALLBACK_LOGISTIC}`);
    return FALLBACK_LOGISTIC;
  }
}

/* ---------- mapping ---------- */

// Stripe price id -> { label, vid } straight from the committed catalog.
async function buildPriceMap() {
  const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
  const map = new Map();
  for (const p of catalog.products) {
    if (p.variants?.length) {
      for (const v of p.variants) {
        if (v.stripe?.priceId) {
          map.set(v.stripe.priceId, { label: `${p.name} — ${v.name}`, vid: v.id });
        }
      }
    } else if (p.stripe?.priceId) {
      map.set(p.stripe.priceId, { label: p.name, vid: p.cjVid ?? null });
    }
  }
  return map;
}

/* ---------- main ---------- */

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.log("STRIPE_SECRET_KEY not set — nothing to do.");
    return;
  }
  const dryRun = stripeKey.startsWith("sk_test");
  if (dryRun) console.log("Test-mode Stripe key: DRY RUN — no CJ orders will be created.\n");

  const priceMap = await buildPriceMap();
  const createdAfter = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;

  const sessions = await stripe("/checkout/sessions", {
    params: { limit: 100, created: { gte: createdAfter }, expand: { 0: "data.payment_intent" } },
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let token = null;

  for (const session of sessions.data ?? []) {
    if (session.status !== "complete" || session.payment_status !== "paid") continue;
    const pi = session.payment_intent;
    if (!pi || typeof pi === "string") continue; // needs the expanded object
    if (pi.metadata?.cj_order_id) {
      skipped++;
      continue;
    }

    try {
      const items = await stripe(`/checkout/sessions/${session.id}/line_items`, {
        params: { limit: 10 },
      });
      const item = items.data?.[0];
      const unit = item && priceMap.get(item.price?.id);
      if (!unit) {
        console.warn(`  ${session.id}: line item not in catalog (${item?.price?.id}) — skipping`);
        continue;
      }
      if (!unit.vid) {
        console.warn(`  ${session.id}: ${unit.label} has no CJ vid yet (run the catalog refresh) — skipping`);
        continue;
      }

      // API-version tolerant: newer Stripe versions moved shipping details.
      const shipping =
        session.collected_information?.shipping_details ?? session.shipping_details ?? null;
      const addr = shipping?.address;
      if (!addr?.line1 || !addr?.country) {
        console.warn(`  ${session.id}: no shipping address on session — skipping`);
        continue;
      }

      const order = {
        orderNumber: `waggle-${session.id.slice(-24)}`,
        shippingCustomerName: shipping.name ?? session.customer_details?.name ?? "",
        shippingAddress: [addr.line1, addr.line2].filter(Boolean).join(", "),
        shippingCity: addr.city ?? "",
        shippingProvince: addr.state ?? "",
        shippingZip: addr.postal_code ?? "",
        shippingCountryCode: addr.country,
        shippingPhone: session.customer_details?.phone ?? "",
        email: session.customer_details?.email ?? "",
        remark: "Auto-created from Stripe checkout",
        fromCountryCode: "CN",
        products: [{ vid: unit.vid, quantity: item.quantity ?? 1 }],
      };

      console.log(
        `  ${session.id}: ${unit.label} ×${item.quantity} -> ${addr.country} (${order.shippingCustomerName})`
      );

      if (dryRun) {
        await stripe(`/payment_intents/${pi.id}`, {
          method: "POST",
          params: { metadata: { cj_order_id: "dry_run" } },
        });
        console.log("    dry run — stamped, no CJ order created");
        processed++;
        continue;
      }

      token ??= await cjToken();
      order.logisticName = await pickLogistic(
        token,
        unit.vid,
        item.quantity ?? 1,
        addr.country
      );
      await sleep(1100);
      const created = await cjRequest("/shopping/order/createOrder", {
        method: "POST",
        token,
        body: order,
      });
      const cjOrderId = created?.orderId ?? created ?? "created";

      await stripe(`/payment_intents/${pi.id}`, {
        method: "POST",
        params: {
          metadata: { cj_order_id: String(cjOrderId), cj_order_number: order.orderNumber },
        },
      });
      console.log(`    CJ order ${cjOrderId} created — review & pay it in the CJ dashboard`);
      processed++;
      await sleep(1100);
    } catch (err) {
      failed++;
      console.warn(`  ${session.id}: fulfillment failed (${err.message}) — will retry next run`);
    }
  }

  console.log(
    `\nDone: ${processed} order(s) ${dryRun ? "dry-run " : ""}processed, ${skipped} already handled, ${failed} failed.`
  );
  if (failed && !processed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
