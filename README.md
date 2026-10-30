# Powered Computers — Cloudflare Worker + Static Assets

This project is prepared for deployment from GitHub using **Cloudflare Workers Builds**. It serves the website from `public/` and handles the repair-request form through a Worker endpoint.

## Project layout

- `public/index.html` — website and PC configurator
- `public/data/parts_owner.csv` — full owner-maintained parts/pricing CSV
- `src/index.js` — Worker; serves static assets and proxies contact form submissions
- `wrangler.jsonc` — Cloudflare Worker and static-assets configuration

The configurator uses the same 125 part IDs as the supplied CSV. Its embedded catalog is regenerated from the CSV columns the existing configurator expects, while the complete original CSV is also kept at `public/data/parts_owner.csv`.

## Before deploying: configure the contact form secret

The Web3Forms access key is deliberately **not** stored in the public HTML or Git repository. The original uploaded HTML contained a client-side access key, so treat that old key as exposed: regenerate/rotate it in Web3Forms before production use, then store the new key only as the Cloudflare Worker secret.

1. In Cloudflare, open **Workers & Pages** and create/open the Worker named `powered-computers`.
2. Open **Settings → Variables and Secrets**.
3. Add a secret named `WEB3FORMS_ACCESS_KEY` with the access key from your Web3Forms account.
4. Save and redeploy.

You can also set it locally with Wrangler:

```bash
npx wrangler secret put WEB3FORMS_ACCESS_KEY
```

If you do not configure this secret, the website still loads, but the email form returns a setup message. The copy-message fallback remains available.

## Connect GitHub

1. Push this folder's contents to the root of a GitHub repository.
2. In Cloudflare, choose **Workers & Pages → Create → Workers → Import a repository** (wording may vary).
3. Select the GitHub repository and use the detected `wrangler.jsonc` configuration.
4. Build command: leave blank unless Cloudflare asks for one.
5. Deploy command: `npx wrangler deploy` if a command is required.
6. Add `WEB3FORMS_ACCESS_KEY` as a Worker secret in the dashboard, then redeploy.

Because `wrangler.jsonc` points at `public/`, the site files are published as static assets and the Worker handles `/api/contact`.

## Local preview

Requires Node.js:

```bash
npm install --save-dev wrangler
npm install
npm run dev
```

Open the local URL Wrangler prints.

## Updating the parts catalog

Edit `public/data/parts_owner.csv`. The current HTML configurator also contains an embedded copy of the columns it consumes. When the CSV changes, regenerate that embedded block from the CSV using the same columns as the `<script id="parts-csv">` header, or ask for the catalog loader to be changed to fetch the CSV dynamically. Keep the part `id` values stable because the build presets refer to them.


## Automatic part availability checks

The order review page starts a supplier scan automatically and includes the results in the order-request email. The current integration uses the Apify actor **Canada Computers & Memory Express Stock & Price Scraper** for Canada Computers and Memory Express. It requests Winnipeg-area store inventory where available. The actor is a third-party paid service (published pricing starts at US$3 per 1,000 products); create an Apify account and check its current pricing/terms before enabling it.

1. Create an account at https://apify.com/ and open **Settings → Integrations** to copy an API token.
2. In Cloudflare, open **Workers & Pages → powered-computers → Settings → Variables and Secrets**.
3. Add a Worker secret named \`APIFY_API_TOKEN\` with the Apify token. Do not put this token in GitHub, HTML, or browser JavaScript.
4. Redeploy the Worker, then submit a test build request.

The other selected retailers (Amazon Canada, Newegg Canada, and Best Buy Canada) currently appear as direct search links and are explicitly marked **Live check unavailable**. Their public documentation does not provide a general consumer inventory endpoint that this site can safely use for anonymous product stock checks. Newegg's documented inventory endpoint is for marketplace sellers' own items; Amazon's product data access is subject to its Associates/API licence; Best Buy's documented store inventory API describes US/Puerto Rico stores. Do not interpret a search result or product page as confirmed stock.

All availability results are indicative, can change at any time, and do not reserve inventory. Confirm stock and final price with the retailer before accepting payment. If the Apify secret is not configured, the order sheet will show setup-required states and supplier search links rather than inventing stock results.
