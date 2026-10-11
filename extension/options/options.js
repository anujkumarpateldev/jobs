import { DESTINATIONS } from "../adapters/index.js";

const form = document.querySelector("#form");
const statusEl = document.querySelector("#status");
const destinationSelect = form.elements.namedItem("destination");

for (const d of DESTINATIONS) {
  destinationSelect.add(new Option(d.label, d.id));
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function field(name) {
  return form.elements.namedItem(name);
}

async function load() {
  const { config = {} } = await chrome.storage.local.get("config");
  destinationSelect.value = config.destination || "download";

  const gh = config.github || {};
  field("github.owner").value = gh.owner || "";
  field("github.repo").value = gh.repo || "";
  field("github.branch").value = gh.branch || "";
  field("github.pathPrefix").value = gh.pathPrefix || "";
  field("github.token").value = gh.token || "";

  const s3 = config.s3 || {};
  field("s3.presignEndpoint").value = s3.presignEndpoint || "";
  field("s3.apiKey").value = s3.apiKey || "";
  field("s3.prefix").value = s3.prefix || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const val = (name) => field(name).value.trim();

  const config = {
    destination: destinationSelect.value,
    github: {
      owner: val("github.owner"),
      repo: val("github.repo"),
      branch: val("github.branch") || "main",
      pathPrefix: val("github.pathPrefix") || "linkedin-jobs",
      token: val("github.token"),
    },
    s3: {
      presignEndpoint: val("s3.presignEndpoint"),
      apiKey: val("s3.apiKey"),
      prefix: val("s3.prefix") || "linkedin-jobs",
    },
  };

  if (config.s3.presignEndpoint) {
    let origin;
    try {
      origin = new URL(config.s3.presignEndpoint).origin + "/*";
    } catch {
      setStatus("The presign endpoint is not a valid URL.", true);
      return;
    }
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      setStatus("Permission to reach the S3 endpoint was denied. Settings not saved.", true);
      return;
    }
  }

  await chrome.storage.local.set({ config });
  setStatus("Saved.");
});

load();
