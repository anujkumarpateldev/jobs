// Sends the job record directly to a Cloudflare Worker, which writes it to R2.
// Config: { workerUrl, apiKey }
// The Worker (worker/index.js in this repo) derives the R2 key from the record fields.

export const id    = "cloudflare";
export const label = "Cloudflare R2";

export async function save(record, config) {
  const { workerUrl, apiKey } = config;
  if (!workerUrl) {
    throw new Error("Cloudflare is not configured. Set the Worker URL in settings.");
  }

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(workerUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(record),
  });

  if (!res.ok) {
    throw new Error(`Worker error: HTTP ${res.status} — ${await res.text()}`);
  }

  const data = await res.json();
  return { location: data.location };
}
