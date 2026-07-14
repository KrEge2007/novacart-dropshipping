# NovaCart — AI-Powered Dropshipping Storefront 🛒

A professional, dependency-free dropshipping storefront with an **auto-shuffling, AI-weighted product grid**, a built-in **AI shopping assistant**, cart, and a polished responsive design. Pure HTML/CSS/JS — no build step, deploys anywhere (GitHub Pages ready).

## ✨ Features

- **🔀 Automatic product shuffling** — the catalog re-ranks itself every 8 seconds using a trend-score-weighted shuffle (Efraimidis–Spirakis weighted sampling), animated with the FLIP technique so cards glide smoothly to their new positions. Pause/resume and manual shuffle controls included.
- **🤖 AI shopping assistant ("Nova")** — a chat widget that answers questions about trending products, gift ideas within a budget, shipping, returns, and the user's cart. Runs fully client-side as a demo (see *Upgrading to a real LLM* below).
- **📈 AI trend scoring** — every product carries a trend score that drives ranking, 🔥 badges, and the assistant's recommendations.
- **🛍️ Cart** — quantity controls, localStorage persistence, slide-out drawer.
- **🏷️ Category filters**, testimonials, newsletter capture, marquee, and a fully responsive dark UI with reduced-motion support.

## 🚀 Run locally

No install needed — just open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## 🌐 Deployment

The site is deployed with **GitHub Pages** from the `main` branch (root). Every push to `main` updates the live site automatically.

## 🧠 Upgrading the demo AI to a real LLM

`askNova()` in [app.js](app.js) is a client-side rule engine so the demo works with zero backend. To make it a real AI assistant:

1. Create a small serverless endpoint (Cloudflare Workers / Vercel / Netlify Functions) that calls the Claude API with the product catalog as context. **Never put an API key in client-side code.**
2. Replace the body of `sendChat()` to `fetch()` your endpoint instead of calling `askNova()`.

## 📦 Going live as a real store

This is a demo storefront. Before taking real orders:

1. **Products** — replace the static catalog in [products.js](products.js) with a fetch from your supplier API (CJ Dropshipping, Spocket, Zendrop, AliExpress) and swap the emoji art for real product photos.
2. **Checkout** — wire the checkout button to Stripe Checkout, Shopify Buy Button, or Snipcart.
3. **Trend scores** — feed real signals (orders, click-through, Google Trends) into `trendScore` via a scheduled job.
4. **Legal** — add real privacy/returns/terms pages and remove the placeholder testimonials.

## 🗂️ Structure

```
index.html    # Page structure: hero, catalog, features, cart drawer, chat widget
styles.css    # Full design system (dark theme, responsive)
products.js   # Product catalog (swap for your supplier API)
app.js        # Shuffle engine, cart, filters, AI assistant
```
