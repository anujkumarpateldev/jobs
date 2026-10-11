# LinkedIn Job Capture

A personal Chrome extension. Open a job on LinkedIn, click the extension icon, check the extracted
fields, and save the job as JSON to one of these destinations:

- **Local download** (default): your Downloads folder, under `LinkedInJobs/`
- **GitHub**: one file per job in a repository you choose
- **Amazon S3**: through a presigned-URL endpoint you run

Capture is manual, one job at a time. There is no background crawling.

## Setup

```bash
npm install
npm test
```

Load the extension in Chrome:

1. Open `chrome://extensions` and turn on Developer mode.
2. Click "Load unpacked" and select the `extension/` folder.
3. Open a job at `linkedin.com/jobs/view/<id>` and click the extension icon.

Choose a destination and enter its settings in the extension's options page.

## Project memory

`.claude/` holds notes for working on this project with Claude Code. Start with `.claude/CLAUDE.md`.

## Record format

Each saved file is JSON with `schemaVersion`, `jobId`, `sourceUrl`, `title`, `company`, `location`,
`workplaceType`, `employmentType`, `datePosted`, `description`, `applicants`, `extraction`, and
`capturedAt`. Missing values are `null`. `extraction` shows whether each field came from JSON-LD,
the page DOM, or was not found.

## Limits

LinkedIn changes its markup without notice. If fields go missing, see `.claude/linkedin-selectors.md`.
Using automated access may conflict with LinkedIn's User Agreement. This tool is meant for saving the
jobs you are looking at, for personal use.
