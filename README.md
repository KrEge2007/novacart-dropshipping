# Waggle & Co. — Pet Bestseller Store

A warm, playful pet-supplies storefront built for one strategy: **a fixed
catalog of proven bestsellers, marketed with AI-generated video ads.**
No weekly rotation gimmick — the products are hand-picked winners (grooming
vacuum, paw cleaner, calming bed, smart ball, …) chosen because pet content
is the easiest niche to make high-performing AI video for.

- Storefront: static HTML/CSS/JS, deployable on GitHub Pages
- Catalog: `data/products.json` — pinned, curated, never rotated
- Automation (backend only): a daily GitHub Action refreshes prices, supplier
  photos, SKUs, and variants for the pinned picks from the CJdropshipping API
- Ads: see **[ADS.md](ADS.md)** for the AI-video ad playbook (hooks, formats,
  and per-product angles)

## How the pipeline works now

```
GitHub Actions cron (daily 05:00 UTC)
        │
        ▼
scripts/fetch-products.mjs
  · WINNERS[] pins the catalog: one CJ search query per hand-picked product
  · first run: matches each winner to a live CJ listing, stores its pid (cjPid)
  · every run: refreshes supplier cost -> retail price (~2.4×), real product
    photos (quality-scored, best first), SKU, and variants for that pid
  · curated storefront copy (name, blurb, benefits, rating, badge) always wins
  · any failure = that product's existing entry is kept untouched
        │
        ▼
commits data/products.json  →  GitHub Pages redeploys
```

**The selection never changes on its own.** To swap a product: edit `WINNERS`
in [scripts/fetch-products.mjs](scripts/fetch-products.mjs) *and* add/remove
the matching entry in [data/products.json](data/products.json) (id must match).

**Before credentials are added**, the site runs on the seed catalog with
placeholder Unsplash pet photos, so it always looks complete. Real supplier
product photos arrive with the first successful pipeline run.

## Setup: connect CJdropshipping (one-time, ~5 min)

1. Create a free account at [cjdropshipping.com](https://cjdropshipping.com).
2. Generate an API key: <https://www.cjdropshipping.com/my.html#/authorize/API>
   (Personal center → Authorization → API). On the **API** tab click **Add
   API**, choose Type **API Key**, confirm, and copy the full key from the
   **API Key & MCP Token** column (looks like `1234567@api@xxxxxxxx…`).
3. In this GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, add `CJ_API_KEY` with that value.
4. Trigger the first run: **Actions → Refresh catalog prices → Run workflow**.
5. Review the matches it made (the run log prints each one). If a match is
   wrong, tighten that winner's `mustInclude`/`blocklist` and delete its
   `cjPid` from `data/products.json` to force a re-match.

To test locally: `CJ_API_KEY=... node scripts/fetch-products.mjs`

## Run locally

```bash
npx serve .
```

(The catalog is loaded with `fetch()`, so opening `index.html` directly from
the file system won't work — it needs any static server.)

## Taking real orders

The storefront is complete up to checkout. To accept payments, the lightest
path is [Snipcart](https://snipcart.com) or
[Stripe Payment Links](https://stripe.com/payments/payment-links) wired to the
checkout button in [store.js](store.js). Fulfillment then happens through CJ's
dashboard or their order API (`/shopping/order/createOrder`) — the `sku` and
variant ids needed for that are stored on every catalog entry once the
pipeline has run.

Also before going live: replace the placeholder contact email in the footer,
add real privacy/terms pages, replace the seeded review copy with real
reviews as they come in, and adjust the pricing multiplier in
[scripts/fetch-products.mjs](scripts/fetch-products.mjs) to your margin
strategy.

## Structure

```
index.html                              storefront (hero, filterable grid,
                                        featured spotlight, reviews, FAQ)
product.html / product.js               product page (gallery, variants,
                                        benefits, sticky mobile buy bar)
styles.css                              design system (warm & playful)
store.js                                shared: catalog, cart, product cards
app.js                                  home page rendering + filters
data/products.json                      the pinned catalog (bot-refreshed)
scripts/fetch-products.mjs              CJ match + daily price/photo refresh
.github/workflows/refresh-catalog.yml   the cron job
ADS.md                                  AI-video ad playbook
```

To switch suppliers later (Spocket, Zendrop, AliExpress), only
`scripts/fetch-products.mjs` needs replacing — everything downstream just
reads `data/products.json`.
