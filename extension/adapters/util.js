// Shared helpers for all destination adapters.

// Convert a string to a URL-safe slug: lowercase, only alphanumeric + hyphens, max 60 chars.
function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")  // non-alphanumeric runs → single hyphen
    .replace(/^-+|-+$/g, "")      // trim leading/trailing hyphens
    .slice(0, 60)
    .replace(/-+$/, "");          // trim again after slice
}

// Storage key: jobs/{YYYY}/{MM}/{company}-{date}-{city}-{title}.json
// YYYY/MM and the date segment both come from datePosted; fall back to capturedAt.
export function storageKey(record) {
  const company = slugify(record.company);
  const title   = slugify(record.title);

  if (!company && !title) {
    throw new Error("Cannot build a filename: both company and title are missing.");
  }

  const hasPostedDate = /^\d{4}-\d{2}-\d{2}/.test(record.datePosted || "");
  const dateBase      = hasPostedDate ? record.datePosted : record.capturedAt;

  const dateSegment = hasPostedDate ? record.datePosted.slice(0, 10) : "";
  const city        = slugify(record.location ? record.location.split(",")[0] : "");

  const stem = [company, dateSegment, city, title].filter(Boolean).join("-");

  const d    = new Date(dateBase);
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");

  return `jobs/${yyyy}/${mm}/${stem}.json`;
}

export function jsonText(record) {
  return JSON.stringify(record, null, 2) + "\n";
}

// btoa only handles Latin-1, so encode UTF-8 bytes first. Needed for data URLs and the GitHub API.
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
