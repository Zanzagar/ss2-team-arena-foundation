/**
 * Census: where does ICU collation disagree with `byCodeUnit`, over the ids
 * this repository actually commits?
 *
 * This is the measurement `src/common/stable-order.js` cites. It exists so the
 * table in that module's header is re-derivable rather than asserted — the
 * whole reason `localeCompare` was replaced is that nobody had measured it.
 *
 * REPORT ONLY. It reads committed fixtures and writes nothing.
 *
 *   node tools/stable-order-locale-census.mjs
 *   node tools/stable-order-locale-census.mjs --dir /mnt/c/ss2-capture/captures
 *
 * A non-zero count for a locale means: a capture or promotion run on a machine
 * in that locale would have ordered those ids differently, and any digest that
 * covers the order would have differed for identical evidence.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { byCodeUnit } from "../src/common/stable-order.js";

/** Locales chosen to span the collations that actually reorder ASCII. */
const LOCALES = Object.freeze([
  "en-US", "en-GB", "cs-CZ", "sk-SK", "az-AZ", "haw-US", "lt-LT",
  "et-EE", "da-DK", "sv-SE", "tr-TR", "de-DE", "fr-FR", "ig-NG", "sq-AL"
]);

/** Every `sessionId` string in the committed fixture tree. */
function committedSessionIds(root) {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) {
        for (const match of readFileSync(full, "utf8").matchAll(/"sessionId"\s*:\s*"([^"]+)"/g)) {
          found.add(match[1]);
        }
      }
    }
  };
  walk(root);
  return [...found].sort(byCodeUnit);
}

/** Directory names under a raw-capture archive, when one is reachable. */
function archiveNames(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(byCodeUnit);
}

function census(label, names) {
  const counts = new Map(LOCALES.map((locale) => [locale, 0]));
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const plain = byCodeUnit(names[i], names[j]);
      for (const locale of LOCALES) {
        if (Math.sign(names[i].localeCompare(names[j], locale)) !== plain) {
          counts.set(locale, counts.get(locale) + 1);
        }
      }
    }
  }
  const pairs = (names.length * (names.length - 1)) / 2;
  console.log(`\n${label}: ${names.length} names, ${pairs} pairs`);
  for (const locale of LOCALES) {
    const n = counts.get(locale);
    console.log(`  ${locale.padEnd(7)} ${String(n).padStart(6)}${n > 0 ? "  <-- would reorder" : ""}`);
  }
  return counts;
}

function main(argv) {
  const dirFlag = argv.indexOf("--dir");
  const root = path.resolve(new URL("..", import.meta.url).pathname);
  const ids = committedSessionIds(path.join(root, "test/fixtures"));
  census("committed sessionIds", ids);

  if (dirFlag !== -1 && argv[dirFlag + 1]) {
    census(`archive directory names (${argv[dirFlag + 1]})`, archiveNames(argv[dirFlag + 1]));
  }

  console.log(
    "\nA zero row for en-US is what makes replacing localeCompare digest-neutral:\n" +
    "every committed manifest was minted under it."
  );
}

main(process.argv.slice(2));
