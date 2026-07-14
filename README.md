# Kinetic — Curated Dropshipping Store

A professional fitness & recovery storefront whose **product catalog rotates automatically in the backend** — a scheduled GitHub Action pulls fresh products from the CJdropshipping API, commits an updated `data/products.json`, and GitHub Pages redeploys the site. The front end is a clean, static store; all the "AI/automation" lives in the pipeline where it belongs.

## How the automatic rotation works

```
GitHub Actions cron (daily 05:00 UTC)
        │
        ▼
scripts/fetch-products.mjs
  · authenticates against the CJdropshipping API
  · searches curated keywords per category (training / yoga / recovery / hydration)
  · validates products (image, name, price) and applies retail pricing (~2.4× cost)
  · picks the week's selection with a date-seeded shuffle
        │
        ▼
commits data/products.json  →  GitHub Pages redeploys  →  live site shows the new edit
```

- **Selection rotates weekly** (ISO-week seed) while **prices/stock refresh daily**. Set `ROTATION: daily` in [.github/workflows/refresh-catalog.yml](.github/workflows/refresh-catalog.yml) to rotate the selection every day instead.
- **Safety valve:** if the API returns fewer than 8 valid products, the script exits nonzero and the old catalog is kept — the site never shows a broken page.
- **Before credentials are added**, the site runs on the seed catalog in [data/products.json](data/products.json), so it always looks complete.

## Setup: connect CJdropshipping (one-time, ~5 min)

1. Create a free account at [cjdropshipping.com](https://cjdropshipping.com).
2. Generate an API key: while logged in, open <https://www.cjdropshipping.com/my.html#/authorize/API> (Personal center → Authorization → API). On the **API** tab click **Add API**, give it a name, choose Type **API Key**, and confirm. Then copy the full key from the **API Key & MCP Token** column (it looks like `1234567@api@xxxxxxxx…`).
3. In this GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, add `CJ_API_KEY` with that value.
4. Trigger the first run: **Actions → Refresh product catalog → Run workflow** (or wait for the nightly cron).

To test locally: `CJ_API_KEY=... node scripts/fetch-products.mjs`

## Run locally

```bash
npx serve .
```

(The catalog is loaded with `fetch()`, so opening `index.html` directly from the file system won't work — it needs any static server.)

## Taking real orders

The storefront is complete up to checkout. To accept payments, the lightest path is [Snipcart](https://snipcart.com) or [Stripe Payment Links](https://stripe.com/payments/payment-links) wired to the checkout button in [app.js](app.js). Order fulfillment then happens through CJ's dashboard or their order API (`/shopping/order/createOrder`) — the product `sku` needed for that is already stored on every catalog entry.

Also before going live: replace the placeholder contact email in the footer, add real privacy/terms pages, and adjust the pricing multiplier in [scripts/fetch-products.mjs](scripts/fetch-products.mjs) to your margin strategy.

## Structure

```
index.html                              storefront
styles.css                              design system (light, editorial)
app.js                                  catalog rendering + cart
data/products.json                      current catalog (auto-committed by the bot)
scripts/fetch-products.mjs              CJdropshipping fetch + rotation logic
.github/workflows/refresh-catalog.yml   the cron job
```

To switch suppliers later (Spocket, Zendrop, AliExpress), only `scripts/fetch-products.mjs` needs replacing — everything downstream just reads `data/products.json`.
