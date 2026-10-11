const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { parseJob } = require("../extension/content/extract.js");

const JOB_URL = "https://www.linkedin.com/jobs/view/3812345678/";

function loadFixture(name) {
  const html = fs.readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
  return new JSDOM(html).window.document;
}

test("prefers JSON-LD fields when present", () => {
  const job = parseJob(loadFixture("job-jsonld.html"), JOB_URL);

  assert.equal(job.schemaVersion, 1);
  assert.equal(job.jobId, "3812345678");
  assert.equal(job.sourceUrl, JOB_URL);
  assert.equal(job.title, "Senior Backend Engineer");
  assert.equal(job.company, "Example BV");
  assert.equal(job.location, "Rotterdam, South Holland, Netherlands");
  assert.equal(job.employmentType, "FULL_TIME");
  assert.equal(job.datePosted, "2026-10-08");
  assert.equal(job.workplaceType, null);
  assert.equal(job.applicants, null);
  assert.match(job.description, /Build and operate our job data services\./);
  assert.match(job.description, /Node\.js or Python/);
  assert.equal(job.extraction.title, "jsonld");
  assert.equal(job.extraction.company, "jsonld");
});

test("falls back to DOM when JSON-LD is absent", () => {
  const job = parseJob(loadFixture("job-dom-only.html"), JOB_URL);

  assert.equal(job.title, "Frontend Developer");
  assert.equal(job.company, "Sample Co");
  assert.equal(job.location, "Utrecht, Utrecht, Netherlands");
  assert.equal(job.description, "Work on our web app.");
  assert.equal(job.datePosted, null);
  assert.equal(job.extraction.title, "dom");
  assert.equal(job.extraction.datePosted === undefined, true);
});

test("returns nulls instead of throwing on an empty page", () => {
  const doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  const job = parseJob(doc, JOB_URL);

  assert.equal(job.jobId, "3812345678");
  assert.equal(job.title, null);
  assert.equal(job.company, null);
  assert.equal(job.description, null);
  assert.equal(job.extraction.title, null);
});

test("extracts jobId only from job view URLs", () => {
  const doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  assert.equal(parseJob(doc, "https://www.linkedin.com/jobs/search/?keywords=x").jobId, null);
  assert.equal(parseJob(doc, "https://www.linkedin.com/jobs/view/42/").jobId, "42");
});
