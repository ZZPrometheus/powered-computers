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
