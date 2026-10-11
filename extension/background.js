// Service worker: receives SAVE_JOB from the popup, adds capture metadata,
// and hands the record to the destination adapter chosen in the options page.

import { getAdapter } from "./adapters/index.js";

const SCHEMA_VERSION = 1;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "SAVE_JOB") return false;

  (async () => {
    const { config = {} } = await chrome.storage.local.get("config");
    const destinationId = config.destination || "download";
    const adapter = getAdapter(destinationId);

    const record = {
      ...msg.job,
      schemaVersion: SCHEMA_VERSION,
      capturedAt: new Date().toISOString(),
    };

    const result = await adapter.save(record, config[destinationId] || {});
    sendResponse({ ok: true, destination: destinationId, ...result });
  })().catch((err) => {
    sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
  });

  return true; // keep the message channel open for the async response
});
