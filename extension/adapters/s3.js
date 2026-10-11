// Writes to S3 through a presigned-URL endpoint you control (for example, the Lambda from the
// original design, with a POST /presign route). No AWS keys live in the extension.
//
// Contract with the endpoint:
//   request:  POST presignEndpoint  body { key, contentType }  (+ x-api-key header if apiKey set)
//   response: { url, location? }    url is a short-lived PUT URL for that key
//
// Config: { presignEndpoint, apiKey, prefix }

import { storageKey, jsonText } from "./util.js";

export const id = "s3";
export const label = "Amazon S3 (via presigned URL endpoint)";

export async function save(record, config) {
  const { presignEndpoint, apiKey, prefix = "" } = config;
  if (!presignEndpoint) {
    throw new Error("S3 is not configured. Set the presign endpoint in the options page.");
  }

  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const key = [cleanPrefix, storageKey(record)].filter(Boolean).join("/");

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const presign = await fetch(presignEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ key, contentType: "application/json" }),
  });
  if (!presign.ok) throw new Error(`Presign request failed: HTTP ${presign.status}`);
  const { url, location } = await presign.json();

  const put = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonText(record),
  });
  if (!put.ok) throw new Error(`S3 upload failed: HTTP ${put.status}`);

  return { location: location || `s3://${key}` };
}
