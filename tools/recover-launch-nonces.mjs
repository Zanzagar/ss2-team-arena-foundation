/**
 * Report which committed observation records would gain a `capture.launchNonce`
 * if they were re-ingested from their archived raw trace.
 *
 * REPORT ONLY. This tool has no write path, deliberately.
 *
 * WHY NO --apply. `campaign.mjs ingest-round` refuses to overwrite a committed
 * observation ("refusing to overwrite committed evidence"), and that guard is
 * correct: a record is evidence, and silently rewriting evidence is the failure
 * this repository exists to prevent. Recovering a dropped nonce is a deliberate
 * corpus operation with a blast radius (every affected digest changes, and every
 * golden citing one must be re-promoted), so it belongs to a session that has
 * decided to do it, not to a tool that can do it by accident.
 *
 * WHAT THIS IS FOR. Measured 2026-09-01: nothing in the repository can tell a
 * recovered nonce from an invented one. A verifier resealed one record's digest
 * with its true nonce, a fabricated nonce, a nonce stolen from another record,
 * and no nonce at all -- all four matched with zero differences and passed
 * `validateSs2Observation`, because `SS2_PAIRWISE_EXCLUDED_KEYS` excludes
 * `capture` wholesale. So the assurance cannot come from a check after the fact.
 * It has to come from the operation being REPRODUCIBLE: anyone can re-run this
 * against the archive and get the same tokens, or not.
 *
 * That is why the report prints the archive path, its own resolution rule, and a
 * per-record token. Re-run it and diff the output; a token that does not
 * reproduce was not recovered from a trace.
 *
 * USAGE
 *   node tools/recover-launch-nonces.mjs --archive <dir> [--json]
 *
 * The archive lives outside the repo and its location is not derivable: this
 * clone's own `captures/` holds a README and nothing else. Three copies existed
 * on 2026-09-01 and they DISAGREED in file counts, so the path is required
 * rather than guessed, and it is echoed in the report.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ingestSs2CaptureTrace } from "../src/golden/capture-ingest.js";
import { SS2_PRE_NONCE_OBSERVATION_DIGESTS } from "../src/golden/pre-nonce-observations.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OBSERVATION_DIR = path.join(ROOT, "test", "observations", "ss2-1v1");
const FIXTURE_DIR = path.join(ROOT, "test", "fixtures", "ss2-1v1");
const GOLDEN_DIR = path.join(ROOT, "test", "fixtures", "ss2-1v1-golden");

/** The only diffs a nonce recovery may produce. Anything else is a finding. */
const RECOVERY_PATHS = new Set(["/capture/launchNonce", "/capture/overdraw", "/digest"]);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") options.json = true;
    else if (argv[i] === "--archive") options.archive = argv[++i];
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!options.archive) {
    throw new Error(
      "--archive <dir> is required. This clone's captures/ holds only a README, and three archive " +
      "copies existed on 2026-09-01 with DIFFERENT file counts, so the path is never guessed."
    );
  }
  return options;
}

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

/**
 * Diff two records structurally, returning JSON-pointer-ish paths.
 * Absence is reported, not skipped: a key that appears on one side only is the
 * whole point of this report.
 */
function diff(before, after, at = "", out = []) {
  if (before === after) return out;
  const kind = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
  if (kind(before) !== kind(after)) {
    out.push({ path: at, before, after });
    return out;
  }
  if (kind(before) === "object") {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!Object.hasOwn(before, key)) out.push({ path: `${at}/${key}`, before: undefined, after: after[key] });
      else if (!Object.hasOwn(after, key)) out.push({ path: `${at}/${key}`, before: before[key], after: undefined });
      else diff(before[key], after[key], `${at}/${key}`, out);
    }
    return out;
  }
  if (kind(before) === "array") {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i++) diff(before[i], after[i], `${at}[${i}]`, out);
    return out;
  }
  out.push({ path: at, before, after });
  return out;
}

/**
 * Resolve a record to its trace by the record's OWN sessionId and observationId.
 *
 * NEVER by file name. Three committed records are named after something other
 * than the id they carry — obs-20260830-auto1.json holds `obs-diag`, auto2 holds
 * `obs-nav6`, auto3 holds `obs-gold3` — so a filename key silently mis-pairs a
 * record with a different session's trace, which reads as a successful match.
 */
function tracePathFor(record, archive) {
  return path.join(archive, record.capture.sessionId, `${record.observationId}.jsonl`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const archive = path.resolve(options.archive);

  const recordFiles = (await readdir(OBSERVATION_DIR)).filter((name) => name.endsWith(".json")).sort();
  const goldens = [];
  for (const name of (await readdir(GOLDEN_DIR)).filter((n) => n.endsWith(".json"))) {
    goldens.push(await readJson(path.join(GOLDEN_DIR, name)));
  }
  const citedBy = new Map();
  for (const golden of goldens) {
    for (const digest of golden.provenance?.observationDigests ?? []) {
      if (!citedBy.has(digest)) citedBy.set(digest, []);
      citedBy.get(digest).push(golden.fixtureId);
    }
  }

  const rows = [];
  for (const file of recordFiles) {
    const record = await readJson(path.join(OBSERVATION_DIR, file));
    const row = { file, observationId: record.observationId, sessionId: record.capture.sessionId };
    row.hadNonce = Object.hasOwn(record.capture, "launchNonce");
    row.waived = SS2_PRE_NONCE_OBSERVATION_DIGESTS.has(record.digest);
    row.citedBy = citedBy.get(record.digest) ?? [];

    let raw;
    try {
      raw = await readFile(tracePathFor(record, archive), "utf8");
    } catch {
      row.status = "NO-TRACE";
      rows.push(row);
      continue;
    }
    const fixture = await readJson(path.join(FIXTURE_DIR, `${record.target.fixtureId}.json`));

    let fresh;
    try {
      // The trace's own attestation is honoured when present; the null
      // placeholder is carried forward from the COMMITTED record rather than
      // asserted fresh, because a re-ingest today measures nothing about a
      // session that ran days ago.
      fresh = ingestSs2CaptureTrace(raw, fixture, {
        installHashVerifiedAfter: record.capture.installHashVerifiedAfter === true
      });
    } catch (error) {
      row.status = "INGEST-REFUSED";
      row.error = error.message;
      rows.push(row);
      continue;
    }

    const differences = diff(record, fresh);
    row.differences = differences.map((d) => d.path);
    row.recoveredNonce = fresh.capture.launchNonce;
    row.newDigest = fresh.digest;
    if (differences.length === 0) row.status = "IDENTICAL";
    else if (differences.every((d) => RECOVERY_PATHS.has(d.path))) {
      row.status = Object.hasOwn(fresh.capture, "launchNonce") && !row.hadNonce ? "WOULD-RECOVER" : "COSMETIC";
    } else row.status = "DIFFERS-IN-SUBSTANCE";
    rows.push(row);
  }

  if (options.json) {
    console.log(JSON.stringify({ archive, generatedFrom: recordFiles.length, rows }, null, 2));
    return 0;
  }

  const byStatus = new Map();
  for (const row of rows) byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);

  console.log(`Archive read: ${archive}`);
  console.log("Traces resolved by the record's OWN capture.sessionId + observationId, never by file name.");
  console.log(`Records examined: ${rows.length}`);
  for (const [status, count] of [...byStatus].sort()) console.log(`  ${status}: ${count}`);

  const substance = rows.filter((r) => r.status === "DIFFERS-IN-SUBSTANCE");
  if (substance.length > 0) {
    console.log("\nDIFFERS IN SUBSTANCE — this outranks every count above:");
    for (const row of substance) console.log(`  ${row.observationId}: ${row.differences.join(", ")}`);
  }

  const recover = rows.filter((r) => r.status === "WOULD-RECOVER");
  console.log(`\nWould recover a nonce: ${recover.length}`);
  for (const row of recover) {
    const cited = row.citedBy.length > 0 ? `  cited by ${row.citedBy.join(", ")}` : "  cited by nothing";
    console.log(`  ${row.observationId.padEnd(38)} ${row.recoveredNonce}${cited}`);
  }

  const affectedGoldens = new Set(recover.flatMap((r) => r.citedBy));
  console.log(`\nWaiver today: ${SS2_PRE_NONCE_OBSERVATION_DIGESTS.size}`);
  console.log(`Waiver if every recovery landed: ${SS2_PRE_NONCE_OBSERVATION_DIGESTS.size - recover.length}`);
  console.log(`Goldens that would need re-promotion: ${affectedGoldens.size} of ${goldens.length}`);
  console.log(
    "\nRE-RUN THIS AND DIFF THE OUTPUT. Nothing downstream can tell a recovered nonce from an invented\n" +
    "one -- a fabricated nonce, a stolen nonce and no nonce all match with zero differences and pass\n" +
    "validation. Reproducibility against the archive is the only assurance on offer."
  );
  return 0;
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
