// Popup controller — handles main view, settings panel, diagnostics.

const $ = id => document.getElementById(id);

let currentJob = null;
let editOpen   = false;
let descOpen   = false;

// ── View router ───────────────────────────────────────────────

let activeView = 'main'; // 'main' | 'settings'
let diagOpen   = false;

function showView(view) {
  activeView = view;
  $('view-main').hidden     = view !== 'main';
  $('view-settings').hidden = view !== 'settings';
  $('btn-settings').classList.toggle('active', view === 'settings');
}

// ── Main view states ──────────────────────────────────────────

function showLoading() {
  $('loading').hidden    = false;
  $('error-view').hidden = true;
  $('job-view').hidden   = true;
}

function showError(msg) {
  $('loading').hidden    = true;
  $('error-view').hidden = false;
  $('job-view').hidden   = true;
  $('error-text').textContent = msg;
}

function showJob(job) {
  $('loading').hidden    = true;
  $('error-view').hidden = true;
  $('job-view').hidden   = false;
  $('result-banner').hidden = true;

  $('disp-title').textContent      = job.title         || '(no title)';
  $('disp-company').textContent    = job.company        || '';
  $('disp-location').textContent   = job.location       || '';
  $('disp-workplace').textContent  = job.workplaceType  || '';
  $('disp-employment').textContent = job.employmentType || '';
  $('disp-date').textContent       = job.datePosted     || '';

  const toggle = $('desc-toggle');
  if (job.description) {
    toggle.classList.add('visible');
    $('desc-panel').textContent = job.description;
  } else {
    toggle.classList.remove('visible');
    $('desc-panel').hidden = true;
  }

  $('f-jobid').value        = job.jobId          || '';
  $('f-title').value        = job.title          || '';
  $('f-company').value      = job.company        || '';
  $('f-location').value     = job.location       || '';
  $('f-workplace').value    = job.workplaceType  || '';
  $('f-employment').value   = job.employmentType || '';
  $('f-date').value         = job.datePosted     || '';
  $('f-description').value  = job.description    || '';
}

function showResult(text, isError = false) {
  const el = $('result-banner');
  el.textContent = text;
  el.className   = 'alert ' + (isError ? 'error' : 'success');
  el.hidden      = false;
}

// ── Extract ───────────────────────────────────────────────────

async function extract() {
  showLoading();
  setDescOpen(false);
  setEditOpen(false);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://www.linkedin.com/jobs/')) {
    showError('Open a LinkedIn job page first.');
    return;
  }

  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB' });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/extract.js'],
      });
      res = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB' });
    } catch {
      showError('Could not reach the page. Reload the LinkedIn tab and try again.');
      return;
    }
  }

  if (!res?.ok) {
    showError(res?.error || 'Extraction failed.');
    return;
  }

  currentJob = res.job;
  showJob(currentJob);
}

// ── Save job ──────────────────────────────────────────────────

async function saveJob() {
  if (!currentJob) return;

  const job = {
    ...currentJob,
    title:          $('f-title').value.trim()       || null,
    company:        $('f-company').value.trim()     || null,
    location:       $('f-location').value.trim()    || null,
    workplaceType:  $('f-workplace').value.trim()   || null,
    employmentType: $('f-employment').value.trim()  || null,
    datePosted:     $('f-date').value.trim()        || null,
    description:    $('f-description').value.trim() || null,
  };

  if (!job.title) { showResult('Title is required.', true); return; }

  $('btn-save').disabled    = true;
  $('btn-save').textContent = 'Saving…';

  const res = await chrome.runtime.sendMessage({ type: 'SAVE_JOB', job });

  $('btn-save').disabled    = false;
  $('btn-save').textContent = 'Save job';

  if (res?.ok) {
    showResult((res.updated ? 'Updated' : 'Saved') + ': ' + res.location);
  } else {
    showResult('Failed: ' + (res?.error || 'unknown error'), true);
  }
}

// ── Toggles ───────────────────────────────────────────────────

function setDescOpen(open) {
  descOpen = open;
  $('desc-panel').hidden       = !open;
  $('desc-toggle').textContent = open ? 'Hide description' : 'Description';
}

function setEditOpen(open) {
  editOpen = open;
  $('edit-panel').hidden     = !open;
  $('btn-edit').textContent  = open ? 'Done' : 'Edit fields';
}

function setDiagOpen(open) {
  diagOpen = open;
  $('view-diag').hidden = !open;
  $('btn-diag').classList.toggle('active', open);
  if (open) runDiagnostic();
}

$('desc-toggle').addEventListener('click', () => setDescOpen(!descOpen));
$('btn-edit').addEventListener('click',    () => setEditOpen(!editOpen));
$('btn-save').addEventListener('click',    saveJob);
$('reextract').addEventListener('click',   extract);
$('btn-diag').addEventListener('click',    () => setDiagOpen(!diagOpen));

$('btn-settings').addEventListener('click', () => {
  if (activeView === 'settings') { showView('main'); }
  else { loadSettings(); showView('settings'); }
});

// ── Settings ──────────────────────────────────────────────────

let currentDest = 'download';

function setDest(dest) {
  currentDest = dest;
  document.querySelectorAll('.dest-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dest === dest);
  });
  $('sect-cloudflare').hidden = dest !== 'cloudflare';
  $('sect-s3').hidden         = dest !== 's3';
  $('sect-github').hidden     = dest !== 'github';
}

document.querySelectorAll('.dest-btn').forEach(btn => {
  btn.addEventListener('click', () => setDest(btn.dataset.dest));
});

async function loadSettings() {
  const { config = {} } = await chrome.storage.local.get('config');
  setDest(config.destination || 'download');

  const cf = config.cloudflare || {};
  $('cf-url').value    = cf.workerUrl || '';
  $('cf-apikey').value = cf.apiKey    || '';

  const gh = config.github || {};
  $('gh-owner').value  = gh.owner      || '';
  $('gh-repo').value   = gh.repo       || '';
  $('gh-branch').value = gh.branch     || '';
  $('gh-prefix').value = gh.pathPrefix || '';
  $('gh-token').value  = gh.token      || '';

  const s3 = config.s3 || {};
  $('s3-endpoint').value = s3.presignEndpoint || '';
  $('s3-apikey').value   = s3.apiKey          || '';
  $('s3-prefix').value   = s3.prefix          || '';
}

function showSettingsResult(text, isError = false) {
  const el = $('settings-result');
  el.textContent = text;
  el.className   = 'alert ' + (isError ? 'error' : 'success');
  el.hidden      = false;
}

$('btn-save-settings').addEventListener('click', async () => {
  const config = {
    destination: currentDest,
    cloudflare: {
      workerUrl: $('cf-url').value.trim(),
      apiKey:    $('cf-apikey').value.trim(),
    },
    github: {
      owner:      $('gh-owner').value.trim(),
      repo:       $('gh-repo').value.trim(),
      branch:     $('gh-branch').value.trim()  || 'main',
      pathPrefix: $('gh-prefix').value.trim()  || 'linkedin-jobs',
      token:      $('gh-token').value.trim(),
    },
    s3: {
      presignEndpoint: $('s3-endpoint').value.trim(),
      apiKey:          $('s3-apikey').value.trim(),
      prefix:          $('s3-prefix').value.trim() || 'linkedin-jobs',
    },
  };

  if (currentDest === 's3' && config.s3.presignEndpoint) {
    let origin;
    try { origin = new URL(config.s3.presignEndpoint).origin + '/*'; }
    catch { showSettingsResult('Presign endpoint is not a valid URL.', true); return; }
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) { showSettingsResult('Permission to reach the S3 endpoint was denied.', true); return; }
  }

  await chrome.storage.local.set({ config });
  $('dest-badge').textContent = DEST_LABELS[currentDest] || currentDest;
  showSettingsResult('Settings saved.');
});

// ── Diagnostics ───────────────────────────────────────────────

async function runDiagnostic() {
  const out = $('diag-out');
  out.textContent = 'Scanning…';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { out.textContent = 'No active tab.'; return; }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const lines = [];
        lines.push(`JSON-LD: ${document.querySelectorAll('script[type="application/ld+json"]').length} blocks`);
        lines.push(`Title: ${document.title}`);
        const primary = document.querySelector('section[aria-label="Primary content"]');
        lines.push(`Primary section: ${!!primary}`);
        if (primary) {
          primary.innerText.split('\n').map(l => l.trim()).filter(Boolean)
            .slice(0, 12).forEach((l, i) => lines.push(`  [${i}] ${l.slice(0, 90)}`));
        }
        const co = document.querySelector('[aria-label^="Company, "]');
        lines.push(`Company: ${co ? co.getAttribute('aria-label') : 'NOT FOUND'}`);
        const h2 = [...document.querySelectorAll('h2')].find(h => /about the job/i.test(h.textContent));
        lines.push(`"About the job" H2: ${h2 ? 'found' : 'NOT FOUND'}`);
        const els = [...document.querySelectorAll('span,div,li,p')];
        const posted = els.find(el => /Posted\s+\d+\s+(days?|weeks?|months?)/i.test(el.textContent) && el.textContent.length < 120);
        lines.push(`Posted element: ${posted ? posted.textContent.trim().slice(0, 70) : 'NOT FOUND'}`);
        return lines.join('\n');
      },
    });
    out.textContent = result;
  } catch (err) {
    out.textContent = 'Error: ' + err.message;
  }
}

// ── Init ──────────────────────────────────────────────────────

const DEST_LABELS = { download: 'Local', github: 'GitHub', s3: 'S3', cloudflare: 'Cloudflare' };

async function init() {
  // Load saved destination and reflect it in the badge + settings panel
  const { config = {} } = await chrome.storage.local.get('config');
  const dest = config.destination || 'download';
  $('dest-badge').textContent = DEST_LABELS[dest] || dest;
  currentDest = dest; // so settings panel is pre-set if user opens it
  extract();
}

init();
