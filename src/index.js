const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
}


const STOCK_RETAILERS = [
  { id: "memoryexpress", name: "Memory Express", mode: "automatic" },
  { id: "canadacomputers", name: "Canada Computers", mode: "automatic" },
  { id: "newegg", name: "Newegg Canada", mode: "link_only" },
  { id: "amazon", name: "Amazon Canada", mode: "link_only" },
  { id: "bestbuy", name: "Best Buy Canada", mode: "link_only" }
];

function supplierSearchUrl(id, term) {
  const q = encodeURIComponent(term);
  const urls = {
    memoryexpress: "https://www.memoryexpress.com/Search/Products?Search=" + q,
    canadacomputers: "https://www.canadacomputers.com/en/search?search=" + q,
    newegg: "https://www.newegg.ca/p/pl?d=" + q,
    amazon: "https://www.amazon.ca/s?k=" + q,
    bestbuy: "https://www.bestbuy.ca/en-ca/search?search=" + q
  };
  return urls[id];
}

function stockStatus(item) {
  const boolKeys = ["inStock", "isInStock", "available", "isAvailable", "onlineAvailable"];
  for (const key of boolKeys) {
    if (typeof item[key] === "boolean") return item[key] ? "in_stock" : "out_of_stock";
  }
  const numericKeys = ["availableQuantity", "quantityAvailable", "stockQuantity", "quantity", "inventory"];
  for (const key of numericKeys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? "in_stock" : "out_of_stock";
    if (typeof value === "string" && /^\d+\+?$/.test(value.trim())) return Number(value.replace("+", "")) > 0 ? "in_stock" : "out_of_stock";
  }
  if (Array.isArray(item.stores) && item.stores.length) {
    let known = false, found = false;
    for (const store of item.stores) {
      const quantity = store.availableQuantity ?? store.quantityAvailable ?? store.stockQuantity ??
        store.quantity ?? store.inventory ?? store.qty ?? store.stock;
      if (typeof quantity === "number" && Number.isFinite(quantity)) {
        known = true; if (quantity > 0) found = true;
      } else if (typeof quantity === "string" && /^\d+\+?$/.test(quantity.trim())) {
        known = true; if (Number(quantity.replace("+", "")) > 0) found = true;
      }
      const statusText = String(store.availability || store.stockStatus || store.status || "").toLowerCase();
      if (/out of stock|sold out|unavailable|not available/.test(statusText)) known = true;
      if (/in stock|available now|available for pickup|available online/.test(statusText)) { known = true; found = true; }
    }
    if (known) return found ? "in_stock" : "out_of_stock";
  }
  const textKeys = ["availability", "availabilityText", "stockStatus", "stock_status", "inventoryStatus", "status", "stock"];
  for (const key of textKeys) {
    const value = item[key];
    if (typeof value === "string") {
      const s = value.toLowerCase();
      if (/out of stock|sold out|unavailable|back.?order|not available/.test(s)) return "out_of_stock";
      if (/in stock|available now|available for pickup|available online|ships? .*days|ready for pickup/.test(s)) return "in_stock";
    }
  }
  return "unknown";
}

function normaliseActorItems(items, parts) {
  const rows = Array.isArray(items) ? items : [];
  const out = parts.map(part => {
    const wanted = String(part.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const tokens = wanted.split(/\s+/).filter(t => t.length > 2 && !["with","the","and","for","amd","intel","nvidia"].includes(t));
    const matches = rows.map(item => {
      const title = String(item.productName || item.productTitle || item.title || item.name || item.product_name || item.itemName || item.model || "");
      const hay = title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
      const score = tokens.length ? tokens.filter(t => hay.includes(t)).length / tokens.length : 0;
      const url = String(item.url || item.productUrl || item.product_url || item.link || "");
      const source = String(item.retailer || item.store || item.source || item.website || item.retailerName || "").toLowerCase();
      let retailer = /memory.?express/.test(source + " " + url) ? "memoryexpress" :
        /canada.?computers/.test(source + " " + url) ? "canadacomputers" : "";
      if (!retailer && item.stores && item.manufacturerPartNumber) retailer = "memoryexpress";
      if (!retailer && item.upc && (item.storeInventory || item.stores)) retailer = "canadacomputers";
      return { item, title, url, retailer, score };
    }).filter(x => x.retailer && x.score >= 0.5).sort((a,b) => b.score-a.score);
    const providers = STOCK_RETAILERS.map(provider => {
      if (provider.mode === "link_only") return {
        retailer: provider.id, name: provider.name, status: "manual_required",
        searchUrl: supplierSearchUrl(provider.id, part.name),
        note: "No approved live consumer-stock connection is configured."
      };
      const hit = matches.find(x => x.retailer === provider.id);
      if (!hit) return {
        retailer: provider.id, name: provider.name, status: "not_found",
        searchUrl: supplierSearchUrl(provider.id, part.name),
        note: "No confidently matched listing was returned."
      };
      const item = hit.item;
      return {
        retailer: provider.id, name: provider.name, status: stockStatus(item),
        productName: hit.title,
        price: item.price ?? item.currentPrice ?? item.salePrice ?? null,
        productUrl: hit.url || supplierSearchUrl(provider.id, part.name),
        note: stockStatus(item) === "unknown" ? "Product matched, but the returned data did not confirm stock." : "Supplier listing data; verify again before purchase."
      };
    });
    return { label: part.label, name: part.name, providers };
  });
  return out;
}

async function startAvailability(request, env) {
  if (request.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ success: false, message: "Invalid request." }, 400); }
  const parts = Array.isArray(body.parts) ? body.parts.slice(0, 20).map(p => ({
    label: String(p.label || "Part").slice(0, 80),
    name: String(p.name || "").trim().slice(0, 180)
  })).filter(p => p.name) : [];
  if (!parts.length) return json({ success: false, message: "No parts supplied." }, 400);

  const manualProviders = STOCK_RETAILERS.filter(p => p.mode === "link_only");
  if (!env.APIFY_API_TOKEN) {
    return json({
      success: true, ready: true, configured: false,
      message: "Automatic checks for Memory Express and Canada Computers need the APIFY_API_TOKEN secret. Other retailers currently provide search links only.",
      results: parts.map(part => ({ ...part, providers: STOCK_RETAILERS.map(p => ({
        retailer: p.id, name: p.name,
        status: p.mode === "link_only" ? "manual_required" : "setup_required",
        searchUrl: supplierSearchUrl(p.id, part.name),
        note: p.mode === "link_only" ? "Live consumer inventory connection is not available in this integration." : "Configure APIFY_API_TOKEN to enable this supplier check."
      })) }))
    });
  }

  const input = {
    searchTerms: parts.map(p => p.name),
    retailers: ["canadacomputers", "memoryexpress"],
    maxItemsPerQuery: 8,
    maxItems: 80,
    includeStoreInventory: true,
    memoryExpressStoreInventory: true,
    maxMemoryExpressProductPages: 30,
    storeFilter: ["Winnipeg", "MB"],
    outputMode: "product",
    concurrency: 3
  };
  try {
    const response = await fetch("https://api.apify.com/v2/acts/yugenox~canada-pc-parts-stock-scraper/runs?token=" + encodeURIComponent(env.APIFY_API_TOKEN), {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(input)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.data || !result.data.id) {
      return json({ success: false, message: "The supplier stock-check service could not start. Check the Apify token and account limits." }, 502);
    }
    return json({
      success: true, ready: false, configured: true,
      runId: result.data.id,
      message: "Checking Memory Express and Canada Computers. Winnipeg-area store inventory is requested where the supplier provides it.",
      manualProviders
    });
  } catch {
    return json({ success: false, message: "Unable to contact the stock-check service." }, 502);
  }
}

async function pollAvailability(request, env) {
  if (request.method !== "GET") return json({ success: false, message: "Method not allowed" }, 405);
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") {
    return json({ success: true, configured: Boolean(env.APIFY_API_TOKEN), service: "part-availability" });
  }
  if (!env.APIFY_API_TOKEN) return json({ success: false, message: "Stock-check service is not configured." }, 503);
  const runId = String(url.searchParams.get("runId") || "");
  if (!/^[A-Za-z0-9_-]{5,80}$/.test(runId)) return json({ success: false, message: "Invalid stock-check run." }, 400);
  try {
    const runResponse = await fetch("https://api.apify.com/v2/actor-runs/" + encodeURIComponent(runId) + "?token=" + encodeURIComponent(env.APIFY_API_TOKEN));
    const runData = await runResponse.json().catch(() => ({}));
    if (!runResponse.ok || !runData.data) return json({ success: false, message: "Could not read the supplier stock-check status." }, 502);
    const state = String(runData.data.status || "UNKNOWN");
    if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(state)) {
      return json({ success: true, ready: false, status: state });
    }
    if (state !== "SUCCEEDED") return json({ success: false, ready: true, message: "Supplier scan ended with status " + state + ". Please use the supplier links to verify stock." }, 502);
    const datasetId = String(runData.data.defaultDatasetId || "");
    if (!/^[A-Za-z0-9_-]{5,100}$/.test(datasetId)) return json({ success: false, message: "The supplier scan returned no dataset." }, 502);
    const dataResponse = await fetch("https://api.apify.com/v2/datasets/" + encodeURIComponent(datasetId) + "/items?clean=true&token=" + encodeURIComponent(env.APIFY_API_TOKEN));
    const items = await dataResponse.json().catch(() => null);
    if (!dataResponse.ok || !Array.isArray(items)) return json({ success: false, message: "Could not read supplier stock results." }, 502);
    return json({ success: true, ready: true, status: state, items });
  } catch {
    return json({ success: false, message: "Unable to retrieve supplier stock results." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/availability") {
      return request.method === "GET" ? pollAvailability(request, env) : startAvailability(request, env);
    }

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ success: false, message: "Method not allowed" }, 405);
      }

      if (!env.WEB3FORMS_ACCESS_KEY) {
        return json({ success: false, message: "Contact form is not configured yet." }, 503);
      }

      let form;
      try {
        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > 20_000) return json({ success: false, message: "Request too large." }, 413);
        form = await request.json();
      } catch {
        return json({ success: false, message: "Invalid request." }, 400);
      }

      const name = String(form.name || "").trim().slice(0, 120);
      const email = String(form.email || "").trim().slice(0, 254);
      const phone = String(form.phone || "").trim().slice(0, 50);
      const service = String(form.service || "").trim().slice(0, 120);
      const machine = String(form.machine || "").trim().slice(0, 200);
      const message = String(form.message || "").trim().slice(0, 5000);

      // Honeypot: silently accept bot submissions without forwarding them.
      if (String(form.botcheck || "").trim()) {
        return json({ success: true });
      }

      if (!name || !message || (!validEmail(email) && phone.replace(/\D/g, "").length < 7)) {
        return json({ success: false, message: "Please provide your name, message, and a valid email or phone number." }, 400);
      }
      if (email && !validEmail(email)) {
        return json({ success: false, message: "Please provide a valid email address." }, 400);
      }

      const payload = {
        access_key: env.WEB3FORMS_ACCESS_KEY,
        subject: `Website request: ${service || "General"} from ${name}`,
        from_name: "Powered Computers website",
        name,
        service,
        machine,
        message,
        botcheck: ""
      };
      if (email) payload.email = email;
      if (phone) payload.phone = phone;

      try {
        const upstream = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "accept": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const result = await upstream.json().catch(() => ({}));
        if (!upstream.ok || result.success === false) {
          return json({ success: false, message: "The email service could not accept the request." }, 502);
        }
        return json({ success: true });
      } catch {
        return json({ success: false, message: "Unable to contact the email service." }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
