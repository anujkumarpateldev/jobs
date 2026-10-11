// Destination registry. To add a destination: create adapters/<id>.js exporting
// { id, label, save(record, config) }, then import it and add it to ADAPTERS below.

import * as download    from "./download.js";
import * as github      from "./github.js";
import * as s3          from "./s3.js";
import * as cloudflare  from "./cloudflare.js";

const ADAPTERS = { download, github, s3, cloudflare };

export function getAdapter(id) {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`Unknown destination: ${id}`);
  return adapter;
}

export const DESTINATIONS = Object.values(ADAPTERS).map((a) => ({ id: a.id, label: a.label }));
