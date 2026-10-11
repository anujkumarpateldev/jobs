/*
 * LinkedIn Job Capture: content script and pure parser.
 *
 * parseJob(doc, url) has no side effects and is what the tests exercise.
 * The chrome.runtime listener at the bottom only runs inside the extension.
 * Keep this a classic script (no import/export): content scripts cannot be ES modules.
 */

const JOB_ID_RE = /\/jobs\/view\/(\d+)/;

// LinkedIn switched to obfuscated gfl* CSS classes (late 2025).
// All selectors now use aria-labels, semantic HTML, and document.title — not class names.

function firstText(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const text = el && el.textContent.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return null;
}

// Title: LinkedIn sets <title> to "Job Title | Company | LinkedIn"
// Older format was "Job Title - Company | LinkedIn" — handle both.
function titleFromPage(doc) {
  let t = (doc.title || "").replace(/^\(\d+\)\s*/, "");  // strip notification count prefix
  t = t.replace(/\s*\|\s*LinkedIn\s*$/i, "");             // strip " | LinkedIn" suffix
  // "Title | Company" → take everything before the first " | "
  const pipe = t.indexOf(" | ");
  if (pipe > 0) return t.slice(0, pipe).trim();
  // Older "Title - Company" format
  const dash = t.lastIndexOf(" - ");
  if (dash > 0) return t.slice(0, dash).trim();
  return t.trim() || null;
}

// Company: LinkedIn reliably puts aria-label="Company, NAME." on a wrapper element
function companyFromAria(doc) {
  const el = doc.querySelector('[aria-label^="Company, "]');
  if (!el) return null;
  const label = el.getAttribute("aria-label") || "";
  const name = label.replace(/^Company,\s*/, "").replace(/\.$/, "").trim();
  return name || el.textContent.replace(/\s+/g, " ").trim() || null;
}

// Description: split primary section's innerText at "About the job" and take everything after,
// stopping at the first LinkedIn UI section that follows the actual job content.
const DESCRIPTION_END_MARKERS = [
  /exclusive job seeker insights/i,
  /set alert for similar jobs/i,
  /put your best foot forward/i,
  /about the company/i,
  /similar jobs/i,
  /more jobs/i,
];

function descriptionFromPage(doc) {
  const primary = doc.querySelector('section[aria-label="Primary content"]');
  if (!primary) return null;
  const text = primary.innerText || primary.textContent || "";
  const start = text.search(/about the job\b/i);
  if (start === -1) return null;
  let after = text.slice(start).replace(/^about the job\s*/i, "").trim();

  // Truncate at the first LinkedIn UI section header
  for (const marker of DESCRIPTION_END_MARKERS) {
    const cut = after.search(marker);
    if (cut > 0) after = after.slice(0, cut).trim();
  }

  return after.length > 50 ? after : null;
}

// Date posted: LinkedIn shows "Posted X days/weeks/months ago" — no <time> element.
// Calculate the approximate actual date by subtracting from today.
function datePostedFromPage(doc) {
  const timeEl = doc.querySelector("time[datetime]");
  if (timeEl) {
    const dt = timeEl.getAttribute("datetime") || "";
    if (/^\d{4}-\d{2}-\d{2}/.test(dt)) return dt.slice(0, 10);
  }
  const all = [...doc.querySelectorAll("span,div,li,p")];
  for (const el of all) {
    const t = el.textContent || "";
    if (t.length > 120) continue;
    const m = t.match(/Posted\s+(\d+)\s+(days?|weeks?|months?)\s+ago/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const d = new Date();
    if (unit.startsWith("day"))   d.setDate(d.getDate() - n);
    if (unit.startsWith("week"))  d.setDate(d.getDate() - n * 7);
    if (unit.startsWith("month")) d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// Workplace type and employment type: scan top-card lines for known LinkedIn values.
const WORKPLACE_TYPES  = ["remote", "hybrid", "on-site"];
const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "temporary", "internship", "volunteer", "other"];

function topCardMetaFromPage(doc) {
  const primary = doc.querySelector('section[aria-label="Primary content"]');
  if (!primary) return { workplaceType: null, employmentType: null };
  const rawText = primary.innerText || primary.textContent || "";
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  let workplaceType = null;
  let employmentType = null;

  for (const line of lines) {
    if (/about the job/i.test(line)) break;
    const lower = line.toLowerCase();
    if (!workplaceType  && WORKPLACE_TYPES.some((v) => lower === v))  workplaceType  = line;
    if (!employmentType && EMPLOYMENT_TYPES.some((v) => lower === v)) employmentType = line;
  }
  return { workplaceType, employmentType };
}

// Location: scan primary section lines (before "About the job"), split each by "·",
// return the first part that looks like "City, Region, Country".
function locationFromTopCard(doc, company) {
  const primary = doc.querySelector('section[aria-label="Primary content"]');
  if (!primary) return null;
  const rawText = primary.innerText || primary.textContent || "";
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const companyLower = (company || "").toLowerCase();

  for (const line of lines) {
    if (/about the job/i.test(line)) break;            // stop before description
    if (companyLower && line.toLowerCase() === companyLower) continue;
    // Line may be "City, Region · metadata · more" — split by · and check each part
    for (const part of line.split("·").map((p) => p.trim())) {
      if (/,/.test(part) && part.length < 80 && !/^\d/.test(part) && !/^https?:/.test(part)) {
        return part;
      }
    }
  }
  return null;
}

function htmlToText(doc, html) {
  if (!html) return null;
  // Insert line breaks before stripping tags. Use an inert document so no scripts or
  // event handlers in the HTML can run.
  const withBreaks = html.replace(/<br\s*\/?>|<\/(p|li|div|h[1-6])>/gi, "\n");
  const inert = doc.implementation.createHTMLDocument("");
  const div = inert.createElement("div");
  div.innerHTML = withBreaks;
  const text = div.textContent
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text || null;
}

function findJobPosting(doc) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const items = Array.isArray(data) ? data : [data];
    const posting = items.find((item) => item && item["@type"] === "JobPosting");
    if (posting) return posting;
  }
  return null;
}

function extractJobId(url) {
  // Try /jobs/view/<id> path first (dedicated job page)
  const pathMatch = url.match(JOB_ID_RE);
  if (pathMatch) return pathMatch[1];
  // Fall back to ?currentJobId=<id> (search results page with job panel open)
  try {
    const param = new URL(url).searchParams.get("currentJobId");
    if (param && /^\d+$/.test(param)) return param;
  } catch {}
  return null;
}

function parseJob(doc, url) {
  const rawUrl = url || (doc.location && doc.location.href) || "";
  const jobId = extractJobId(rawUrl);
  // Use canonical /jobs/view/<id> URL when we have the ID, so storage keys are stable
  const sourceUrl = jobId
    ? `https://www.linkedin.com/jobs/view/${jobId}/`
    : rawUrl;

  const ld = findJobPosting(doc) || {};
  const place = Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation;
  const address = place && place.address;
  const ldLocation = address
    ? [address.addressLocality, address.addressRegion, address.addressCountry]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const extraction = {};
  const pick = (field, fromJsonLd, fromDom) => {
    if (fromJsonLd) {
      extraction[field] = "jsonld";
      return fromJsonLd;
    }
    if (fromDom) {
      extraction[field] = "dom";
      return fromDom;
    }
    extraction[field] = null;
    return null;
  };

  const title = pick("title", ld.title, titleFromPage(doc));
  const company = pick(
    "company",
    ld.hiringOrganization && ld.hiringOrganization.name,
    companyFromAria(doc)
  );
  const location = pick("location", ldLocation, locationFromTopCard(doc, company));
  const description = pick(
    "description",
    htmlToText(doc, ld.description),
    descriptionFromPage(doc)
  );
  const datePosted = pick("datePosted", ld.datePosted || null, datePostedFromPage(doc));

  const meta = topCardMetaFromPage(doc);
  const workplaceType = pick(
    "workplaceType",
    ld.jobLocationType === "TELECOMMUTE" ? "Remote" : null,
    meta.workplaceType
  );
  const employmentType = pick(
    "employmentType",
    Array.isArray(ld.employmentType) ? ld.employmentType.join(", ") : ld.employmentType,
    meta.employmentType
  );

  return {
    schemaVersion: 1,
    jobId,
    sourceUrl,
    title,
    company,
    location,
    workplaceType,
    employmentType,
    datePosted,
    description,
    applicants: null,
    extraction,
  };
}

// Extension messaging. Guarded so the file can also be loaded by Node tests.
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "EXTRACT_JOB") {
      try {
        sendResponse({ ok: true, job: parseJob(document, location.href) });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    }
    return false;
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseJob, htmlToText };
}
