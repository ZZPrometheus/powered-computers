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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
