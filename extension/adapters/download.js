// Saves the record as a JSON file in the browser's Downloads folder.
// Needs no credentials, so it works on day one. Sync the folder to Drive or Dropbox if you want cloud copies.

import { storageKey, jsonText, utf8ToBase64 } from "./util.js";

export const id = "download";
export const label = "Local download (JSON file)";

export async function save(record) {
  const key = storageKey(record);
  const url = "data:application/json;base64," + utf8ToBase64(jsonText(record));
  const downloadId = await chrome.downloads.download({
    url,
    filename: `LinkedInJobs/${key}`,
    saveAs: false,
    conflictAction: "overwrite",
  });
  return { location: `Downloads/LinkedInJobs/${key}`, downloadId };
}
