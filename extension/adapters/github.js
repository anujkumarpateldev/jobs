// Writes one JSON file per job through the GitHub Contents API.
// Config: { owner, repo, branch, pathPrefix, token }. Token must be a fine-grained PAT with
// "Contents: read and write" on that one repository.

import { storageKey, jsonText, utf8ToBase64 } from "./util.js";

export const id = "github";
export const label = "GitHub repository";

const API = "https://api.github.com";

export async function save(record, config) {
  const { owner, repo, token, branch = "main", pathPrefix = "linkedin-jobs" } = config;
  if (!owner || !repo || !token) {
    throw new Error("GitHub is not configured. Set owner, repo and token in the options page.");
  }

  const path = [pathPrefix, storageKey(record)].filter(Boolean).join("/");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${API}/repos/${owner}/${repo}/contents/${encodedPath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  // Updating an existing file requires its current blob sha.
  let sha;
  const existing = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.status === 200) {
    sha = (await existing.json()).sha;
  } else if (existing.status !== 404) {
    throw new Error(`GitHub lookup failed: HTTP ${existing.status}`);
  }

  const filename = path.split("/").pop();
  const body = {
    message: filename,
    content: utf8ToBase64(jsonText(record)),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    throw new Error(`GitHub save failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { location: data.content?.html_url || path, updated: Boolean(sha) };
}
