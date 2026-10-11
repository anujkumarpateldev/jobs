/**
 * Cloudflare Worker — LinkedIn Job Capture upload endpoint.
 *
 * Receives a job JSON from the extension, derives an R2 key, and stores it.
 *
 * Environment bindings (set in wrangler.toml or Cloudflare dashboard):
 *   JOBS_BUCKET  — R2 bucket binding
 *   API_KEY      — secret string; requests must send this as x-api-key header
 *
 * Deploy:
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler deploy
 */

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "POST required" }, 405);
    }

    // Auth
    const key = request.headers.get("x-api-key") || "";
    if (env.API_KEY && key !== env.API_KEY) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    let record;
    try {
      record = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    if (!record.jobId) {
      return json({ ok: false, error: "Missing jobId" }, 400);
    }

    const r2Key  = storageKey(record);
    const body   = JSON.stringify(record, null, 2) + "\n";

    await env.JOBS_BUCKET.put(r2Key, body, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: {
        jobId:     String(record.jobId),
        company:   String(record.company   || ""),
        title:     String(record.title     || ""),
        location:  String(record.location  || ""),
        datePosted: String(record.datePosted || ""),
        capturedAt: String(record.capturedAt || ""),
      },
    });

    return json({ ok: true, location: r2Key }, 200);
  },
};

// ── Path logic (mirrors adapters/util.js storageKey) ─────────
// Kept here so path structure can be updated server-side without
// an extension release. Format: jobs/YYYY/MM/DD/{stem}.json
function storageKey(record) {
  const company     = slugify(record.company);
  const title       = slugify(record.title);
  const hasDate     = /^\d{4}-\d{2}-\d{2}/.test(record.datePosted || "");
  const dateBase    = hasDate ? record.datePosted : record.capturedAt;
  const dateSegment = hasDate ? record.datePosted.slice(0, 10) : "";
  const city        = slugify(record.location ? record.location.split(",")[0] : "");
  const stem        = [company, dateSegment, city, title].filter(Boolean).join("-");

  const d    = new Date(dateBase);
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(d.getUTCDate()).padStart(2, "0");

  return `jobs/${yyyy}/${mm}/${dd}/${stem}.json`;
}

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  };
}
