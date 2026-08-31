#!/usr/bin/env node
/**
 * Regenerate the probe divergence corpus from the archived raw traces.
 *
 * Why this tool exists
 * --------------------
 * Sixty-nine divergence reports from the probe campaign were deleted as
 * "direction-lottery noise". That was a misjudgement. A divergent probe trace
 * is not noise: it is one more independent observation of the very thing the
 * probe pair was built to measure, taken at an attack direction the game chose
 * on its own. Deleting them threw away the broadest replication evidence the
 * project has. The raw traces survived under the ignored `captures/` tree, so
 * the reports can be rebuilt — and this tool rebuilds them, deterministically,
 * from that raw evidence.
 *
 * Nothing here is hand-authored. Every committed report is the return value of
 * `buildSs2DivergenceReport` applied to an observation that
 * `ingestSs2CaptureTrace` produced from an archived raw trace and that
 * `matchSs2ObservationToFixture` found to disagree with its candidate. The
 * tool owns the file names and the iteration order and nothing else.
 *
 * Usage
 * -----
 *   node tools/runtime-capture/regenerate-divergences.mjs            write the corpus
 *   node tools/runtime-capture/regenerate-divergences.mjs --check    verify, write nothing
 *   node tools/runtime-capture/regenerate-divergences.mjs --json     machine-readable summary
 *
 *   --captures <dir>   archived raw traces (default: ./captures)
 *   --fixtures <dir>   candidate fixtures  (default: ./test/fixtures/ss2-1v1)
 *   --out <dir>        report destination  (default: ./test/fixtures/ss2-1v1-divergences)
 *
 * Determinism
 * -----------
 * `buildSs2DivergenceReport` stamps `recordedAt` with the wall clock unless it
 * is given one. A wall-clock stamp would make every re-run rewrite every file,
 * so this tool supplies the observation's own `capture.observedAt` instead.
 * That value comes out of the raw trace's meta line, so it is evidence rather
 * than invention, and it makes the corpus byte-stable across runs: `--check`
 * is a meaningful drift gate precisely because of this choice. The trade-off is
 * stated plainly in docs/integration/ss2-probe-replication.md — `recordedAt` on
 * these reports is when the trace was *observed*, not when the file was
 * written, which for regenerated evidence is the more useful of the two.
 *
 * The over-draw escape hatch
 * --------------------------
 * `overdraw` is mandatory at ingest for `injected-tape-runtime` traces. Some
 * archived traces predate the field and could not have recorded it. Ingest
 * offers exactly one escape hatch for re-reading archived evidence,
 * `{ allowMissingOverdraw: true }`, and this tool passes it unconditionally
 * because every trace it reads is archived by definition. A record ingested
 * that way carries no `capture.overdraw` and so claims nothing on that point
 * rather than claiming zero. The summary reports how many regenerated reports
 * came from traces that carry no over-draw assurance, because that is a
 * property of the evidence a reader must be told about. The live capture path
 * must never pass this option, and does not.
 *
 * Boundary
 * --------
 * Reads `captures/` and the installed SWFs; writes only into the divergence
 * report directory. Never launches the game, never writes to the installation,
 * and copies no game asset or extracted script into the repository.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ingestSs2CaptureTrace } from "../../src/golden/capture-ingest.js";
import { matchSs2ObservationToFixture } from "../../src/golden/observation.js";
import { buildSs2DivergenceReport } from "../../src/golden/promote-1v1-golden.js";
import { validateSs2OneVsOneFixture } from "../../src/golden/run-1v1-fixture.js";
import { verifyInstallAgainstFingerprint } from "../capture-session.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(SCRIPT_DIR, "..", "..");

const DEFAULT_CAPTURES_DIR = path.join(REPO_ROOT, "captures");
const DEFAULT_FIXTURES_DIR = path.join(REPO_ROOT, "test", "fixtures", "ss2-1v1");
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, "test", "fixtures", "ss2-1v1-divergences");

/**
 * How a probe trace is identified, stated once.
 *
 * NOT by directory name and NOT by file name: both are operator-chosen and a
 * renamed directory would silently change the corpus. The trace's own meta
 * line carries the observation id the wrapper stamped, and the probe campaign
 * stamped every one of its rounds `obs-pr-<probe>-<round>`. So the rule is:
 * read every archived trace's meta line, keep the ones whose `observationId`
 * matches this pattern AND whose `<probe>` resolves to exactly one committed
 * `candidate-probe-*` fixture. A trace that looks like a probe round but names
 * no such fixture is an error, not a silent exclusion.
 */
const PROBE_OBSERVATION_PATTERN = /^obs-pr-(.+)-(\d+)$/;
const PROBE_FIXTURE_PREFIX = "candidate-probe-";

export class RegenerationError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

function parseArgs(argv) {
  const options = {
    capturesDir: DEFAULT_CAPTURES_DIR,
    fixturesDir: DEFAULT_FIXTURES_DIR,
    outDir: DEFAULT_OUT_DIR,
    check: false,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new RegenerationError(`${flag} needs a value.`);
      return argv[index];
    };
    switch (flag) {
      case "--captures": options.capturesDir = path.resolve(next()); break;
      case "--fixtures": options.fixturesDir = path.resolve(next()); break;
      case "--out": options.outDir = path.resolve(next()); break;
      case "--check": options.check = true; break;
      case "--json": options.json = true; break;
      default: throw new RegenerationError(`Unknown option: ${flag}`);
    }
  }
  return options;
}

function readJsonText(text) {
  // Windows editors and PowerShell 5.1 redirection often write a UTF-8 BOM.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** Byte-for-byte the serialization `tools/capture-session.mjs` writes. */
function serializeReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function safeFileToken(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

/**
 * The report file name, reproduced from `tools/capture-session.mjs`.
 *
 * That module does not export it, and this tool must not edit that module, so
 * the convention is duplicated here deliberately rather than approximated. The
 * short digest of the raw ids is what stops two distinct id pairs that sanitize
 * identically from overwriting each other's preserved evidence.
 */
function divergenceReportPath(directory, fixtureId, observationId) {
  const suffix = createHash("sha256")
    .update(`${fixtureId}\n${observationId}`, "utf8")
    .digest("hex")
    .slice(0, 8);
  return path.join(
    directory,
    `${safeFileToken(fixtureId)}--${safeFileToken(observationId)}-${suffix}.json`
  );
}

/** Every committed `candidate-probe-*` fixture, keyed by its probe name. */
async function loadProbeFixtures(fixturesDir) {
  let fileNames;
  try {
    fileNames = (await readdir(fixturesDir)).filter((name) => name.endsWith(".json")).sort();
  } catch (cause) {
    throw new RegenerationError(`Cannot read the fixture directory ${fixturesDir}: ${cause.message}`, { cause });
  }
  const byProbe = new Map();
  for (const fileName of fileNames) {
    const fixtureId = fileName.slice(0, -".json".length);
    if (!fixtureId.startsWith(PROBE_FIXTURE_PREFIX)) continue;
    const fixture = validateSs2OneVsOneFixture(
      readJsonText(await readFile(path.join(fixturesDir, fileName), "utf8"))
    );
    if (fixture.fixtureId !== fixtureId) {
      throw new RegenerationError(`${fileName} declares fixtureId ${fixture.fixtureId}.`);
    }
    byProbe.set(fixtureId.slice(PROBE_FIXTURE_PREFIX.length), fixture);
  }
  if (byProbe.size === 0) {
    throw new RegenerationError(`No ${PROBE_FIXTURE_PREFIX}* fixtures found under ${fixturesDir}.`);
  }
  return byProbe;
}

/** Every `*.jsonl` under the captures tree, recursively, in a stable order. */
async function walkArchivedTraces(capturesDir) {
  const found = [];
  const walk = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (cause) {
      throw new RegenerationError(`Cannot read ${directory}: ${cause.message}`, { cause });
    }
    for (const entry of [...entries].sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full);
    }
  };
  await walk(capturesDir);
  return found;
}

const SCAN_ATTEMPTS = 4;

/**
 * The captures tree, scanned until two consecutive scans agree.
 *
 * This is not defensive padding. `captures/` is a live working directory:
 * `validate-vehicle.ps1` drops a fresh `vehicle-check/stubcheck-*.jsonl` on
 * every wrapper validation, and a `readdir` that races a directory being
 * mutated can return an inconsistent snapshot that silently omits unrelated
 * entries — observed here as a run that saw 87 of the 89 probe rounds and would
 * have written a corpus two reports short. A short corpus is exactly the
 * failure this tool exists to undo, so an unstable scan must abort loudly
 * rather than quietly produce less evidence.
 */
async function findArchivedTraces(capturesDir) {
  let previous = await walkArchivedTraces(capturesDir);
  for (let attempt = 1; attempt < SCAN_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    const current = await walkArchivedTraces(capturesDir);
    if (current.length === previous.length && current.every((item, index) => item === previous[index])) {
      return current;
    }
    previous = current;
  }
  throw new RegenerationError(
    `The captures tree under ${capturesDir} kept changing across ${SCAN_ATTEMPTS} scans, so the ` +
    "corpus boundary cannot be determined. Something is writing into captures/ right now " +
    "(validate-vehicle.ps1 and the campaign driver both do). Re-run when it is idle."
  );
}

/** The trace's own meta line — the identity that decides whether it is a probe round. */
function readTraceMeta(rawText, tracePath) {
  const firstLine = rawText.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) throw new RegenerationError(`${tracePath} is empty.`);
  let meta;
  try {
    meta = JSON.parse(firstLine);
  } catch (cause) {
    throw new RegenerationError(`${tracePath}: the first line is not valid JSON.`, { cause });
  }
  if (!meta || typeof meta !== "object" || meta.t !== "meta") {
    throw new RegenerationError(`${tracePath}: the first line is not a meta line.`);
  }
  return meta;
}

/** Whether the trace's end line carries the `overdraw` assurance at all. */
function traceCarriesOverdraw(rawText) {
  const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  try {
    return Object.hasOwn(JSON.parse(lines[lines.length - 1]), "overdraw");
  } catch {
    return false;
  }
}

/**
 * Select the probe rounds out of the whole captures tree.
 *
 * Returns the selected traces plus a census of everything skipped and why, so
 * the corpus boundary is reported rather than assumed.
 */
async function selectProbeTraces(capturesDir, probeFixtures) {
  const tracePaths = await findArchivedTraces(capturesDir);
  const selected = [];
  const skipped = [];
  for (const tracePath of tracePaths) {
    const rawText = await readFile(tracePath, "utf8");
    const meta = readTraceMeta(rawText, tracePath);
    const observationId = meta.observationId;
    const match = typeof observationId === "string" ? PROBE_OBSERVATION_PATTERN.exec(observationId) : null;
    if (!match) {
      skipped.push({ tracePath, observationId: observationId ?? null, reason: "not-a-probe-observation-id" });
      continue;
    }
    const probe = match[1];
    const fixture = probeFixtures.get(probe);
    if (!fixture) {
      // Deliberately fatal: an id shaped exactly like a probe round that names
      // no probe fixture means the corpus boundary has drifted, and silently
      // dropping it is how evidence gets lost the first time.
      throw new RegenerationError(
        `${tracePath} declares observationId ${observationId}, which implies the probe ` +
        `"${probe}", but no ${PROBE_FIXTURE_PREFIX}${probe} fixture is committed.`
      );
    }
    selected.push({
      tracePath,
      rawText,
      meta,
      observationId,
      probe,
      fixture,
      carriesOverdraw: traceCarriesOverdraw(rawText)
    });
  }
  selected.sort((left, right) => (left.observationId < right.observationId ? -1 : 1));
  const seen = new Set();
  for (const trace of selected) {
    if (seen.has(trace.observationId)) {
      throw new RegenerationError(`Two archived traces both declare observationId ${trace.observationId}.`);
    }
    seen.add(trace.observationId);
  }
  return { selected, skipped, totalTraces: tracePaths.length };
}

/**
 * Ingest one archived trace exactly as the live pipeline would, minus the two
 * concessions archived evidence requires.
 *
 * `verifyInstalled` is called at most once per run and only when a trace
 * actually carries the wrapper's `null` after-attestation placeholder — the
 * same condition `tools/capture-session.mjs ingest` uses. A failed or
 * unavailable check aborts the run; it is never stubbed, because a stubbed
 * attestation would turn every regenerated report into a claim nobody made.
 */
function ingestArchivedTrace(trace, installHashVerifiedAfter) {
  return ingestSs2CaptureTrace(trace.rawText, trace.fixture, {
    // Today this is what lets an archived pre-`overdraw` trace be re-read at
    // all; the option is honoured by ingest and the live path never passes it.
    allowMissingOverdraw: true,
    ...(installHashVerifiedAfter ? { installHashVerifiedAfter: true } : {})
  });
}

const PLACEHOLDER_ATTESTATION = /null after-attestation placeholder/;

export async function regenerateDivergenceCorpus(options) {
  const probeFixtures = await loadProbeFixtures(options.fixturesDir);
  const { selected, skipped, totalTraces } = await selectProbeTraces(options.capturesDir, probeFixtures);

  // The reports already on disk before this run. Any planned path that lands on
  // one of these AND names a different (fixtureId, observationId) pair is a
  // real collision: report it, never overwrite it.
  const preExisting = new Map();
  let outDirEntries = [];
  try {
    outDirEntries = (await readdir(options.outDir)).filter((name) => name.endsWith(".json")).sort();
  } catch (cause) {
    if (cause.code !== "ENOENT") throw cause;
  }
  for (const fileName of outDirEntries) {
    const full = path.join(options.outDir, fileName);
    const text = await readFile(full, "utf8");
    let parsed = null;
    try {
      parsed = readJsonText(text);
    } catch { /* an unparseable neighbour is still a name that is taken */ }
    preExisting.set(full, { text, fixtureId: parsed?.fixtureId ?? null, observationId: parsed?.observationId ?? null });
  }

  let installVerified = null;
  const verifyInstalledOnce = async () => {
    if (installVerified !== null) return installVerified;
    let result;
    try {
      result = await verifyInstallAgainstFingerprint({});
    } catch (cause) {
      throw new RegenerationError(
        "The archived traces carry the wrapper's null post-session attestation, so ingest needs a " +
        "live installed-hash verification, and that check could not run here: " +
        `${cause.message}. Run this tool on the machine with the licensed build installed. ` +
        "The check is NOT stubbed out: a stubbed attestation would make every regenerated report " +
        "assert a verification nobody performed.",
        { cause }
      );
    }
    if (!result.ok) {
      throw new RegenerationError(
        "Post-session hash verification FAILED: the installed build no longer matches the pinned " +
        "fingerprint, so these archived traces cannot be re-ingested as evidence."
      );
    }
    installVerified = true;
    return true;
  };

  const reports = [];
  const matched = [];
  const collisions = [];
  const written = [];
  const unchanged = [];
  const drifted = [];

  for (const trace of selected) {
    let observation;
    try {
      observation = ingestArchivedTrace(trace, false);
    } catch (error) {
      if (!PLACEHOLDER_ATTESTATION.test(error.message)) {
        throw new RegenerationError(
          `${trace.tracePath} could not be ingested against ${trace.fixture.fixtureId}: ${error.message}`,
          { cause: error }
        );
      }
      await verifyInstalledOnce();
      observation = ingestArchivedTrace(trace, true);
    }

    const comparison = matchSs2ObservationToFixture(trace.fixture, observation);
    if (comparison.match) {
      matched.push({
        observationId: observation.observationId,
        sessionId: observation.capture.sessionId,
        fixtureId: trace.fixture.fixtureId,
        probe: trace.probe,
        attackDirection: observation.scenario.attackDirection,
        digest: observation.digest,
        carriesOverdraw: trace.carriesOverdraw,
        drawCount: observation.samples.length
      });
      continue;
    }

    // The only hand-written thing in a report is nothing: this call is the
    // report. `recordedAt` is pinned to the observation's own observedAt so the
    // corpus is byte-stable across runs.
    const report = buildSs2DivergenceReport(
      trace.fixture,
      observation,
      comparison.differences,
      { recordedAt: new Date(observation.capture.observedAt).toISOString() }
    );
    const reportPath = divergenceReportPath(options.outDir, report.fixtureId, report.observationId);
    const existing = preExisting.get(reportPath);
    if (
      existing &&
      (existing.fixtureId !== report.fixtureId || existing.observationId !== report.observationId)
    ) {
      collisions.push({
        reportPath,
        planned: { fixtureId: report.fixtureId, observationId: report.observationId },
        existing: { fixtureId: existing.fixtureId, observationId: existing.observationId }
      });
      continue;
    }
    reports.push({
      report,
      reportPath,
      text: serializeReport(report),
      probe: trace.probe,
      attackDirection: observation.scenario.attackDirection,
      fixtureDirection: trace.fixture.scenario.attackDirection,
      sessionId: observation.capture.sessionId,
      differencePaths: comparison.differences.map((difference) => difference.path),
      drawCount: observation.samples.length,
      events: observation.events.map((event) => event.type + (event.method ? `:${event.method}` : "")),
      carriesOverdraw: trace.carriesOverdraw
    });
  }

  for (const entry of reports) {
    const existing = preExisting.get(entry.reportPath);
    if (existing && existing.text === entry.text) {
      unchanged.push(entry.reportPath);
      continue;
    }
    if (existing) drifted.push(entry.reportPath);
    if (!options.check) {
      await mkdir(path.dirname(entry.reportPath), { recursive: true });
      await writeFile(entry.reportPath, entry.text, "utf8");
      written.push(entry.reportPath);
    }
  }

  // Reports on disk for a probe fixture that this run did not produce: either
  // stale evidence from a narrower captures tree, or a report someone wrote by
  // hand. Named, never silently deleted — this tool deletes nothing.
  const plannedPaths = new Set(reports.map((entry) => entry.reportPath));
  const orphans = [...preExisting.entries()]
    .filter(([full, value]) =>
      !plannedPaths.has(full) &&
      typeof value.fixtureId === "string" &&
      value.fixtureId.startsWith(PROBE_FIXTURE_PREFIX))
    .map(([full]) => full);

  return {
    totalTraces,
    skipped,
    selected,
    reports,
    matched,
    collisions,
    written,
    unchanged,
    drifted,
    orphans,
    installVerified: installVerified === true
  };
}

/**
 * Replication counts, derived from the corpus rather than typed by hand.
 *
 * Per probe ARM: how many independent sessions and how many distinct attack
 * directions carry it, split into the promoted (matching) observations and the
 * divergent ones. A divergent probe observation whose ONLY difference is
 * `/scenario/attackDirection` agreed with its candidate on every observed
 * channel, so it replicates the arm at a direction the candidate does not
 * name; that is the distinction the whole corpus turns on, so it is counted
 * separately from any other kind of difference.
 */
export function summarizeReplication(result) {
  const arms = new Map();
  const armFor = (probe, fixtureId) => {
    if (!arms.has(probe)) {
      arms.set(probe, {
        probe,
        fixtureId,
        fixtureDirection: null,
        matchedSessions: [],
        divergentSessions: [],
        directionsMatched: new Set(),
        directionsDivergent: new Set(),
        directionOnlyDivergences: 0,
        otherDivergences: 0,
        otherDifferencePaths: new Set(),
        drawCounts: new Set(),
        eventShapes: new Set(),
        tracesWithoutOverdraw: 0
      });
    }
    return arms.get(probe);
  };

  for (const entry of result.matched) {
    const arm = armFor(entry.probe, entry.fixtureId);
    arm.matchedSessions.push(entry.sessionId);
    arm.directionsMatched.add(entry.attackDirection);
    arm.drawCounts.add(entry.drawCount);
    if (!entry.carriesOverdraw) arm.tracesWithoutOverdraw += 1;
  }
  for (const entry of result.reports) {
    const arm = armFor(entry.probe, entry.report.fixtureId);
    arm.fixtureDirection = entry.fixtureDirection;
    arm.divergentSessions.push(entry.sessionId);
    arm.directionsDivergent.add(entry.attackDirection);
    arm.drawCounts.add(entry.drawCount);
    arm.eventShapes.add(entry.events.join(","));
    if (!entry.carriesOverdraw) arm.tracesWithoutOverdraw += 1;
    const unique = [...new Set(entry.differencePaths)];
    if (unique.length === 1 && unique[0] === "/scenario/attackDirection") arm.directionOnlyDivergences += 1;
    else {
      arm.otherDivergences += 1;
      for (const p of unique) arm.otherDifferencePaths.add(p);
    }
  }

  return [...arms.values()]
    .sort((left, right) => (left.probe < right.probe ? -1 : 1))
    .map((arm) => ({
      probe: arm.probe,
      fixtureId: arm.fixtureId,
      fixtureDirection: arm.fixtureDirection,
      sessions: arm.matchedSessions.length + arm.divergentSessions.length,
      matchedSessions: arm.matchedSessions.length,
      divergentSessions: arm.divergentSessions.length,
      directions: [...new Set([...arm.directionsMatched, ...arm.directionsDivergent])].sort((a, b) => a - b),
      directionOnlyDivergences: arm.directionOnlyDivergences,
      otherDivergences: arm.otherDivergences,
      otherDifferencePaths: [...arm.otherDifferencePaths].sort(),
      drawCounts: [...arm.drawCounts].sort((a, b) => a - b),
      eventShapes: [...arm.eventShapes].sort(),
      tracesWithoutOverdraw: arm.tracesWithoutOverdraw
    }));
}

function renderSummary(result, replication, options) {
  const lines = [];
  const mode = options.check ? "CHECK" : "WRITE";
  lines.push(`[${mode}] archived traces scanned: ${result.totalTraces}`);
  lines.push(`        probe rounds selected:    ${result.selected.length}`);
  lines.push(`        non-probe traces skipped: ${result.skipped.length}`);
  lines.push(`        matched (promotion evidence, no report): ${result.matched.length}`);
  lines.push(`        divergent (reports):      ${result.reports.length}`);
  lines.push(`        sessions represented:     ${new Set([
    ...result.matched.map((entry) => entry.sessionId),
    ...result.reports.map((entry) => entry.sessionId)
  ]).size}`);
  lines.push(
    `        live install-hash check:  ${result.installVerified ? "PASSED (ran once)" : "not needed"}`
  );
  const withoutOverdraw = [...result.reports, ...result.matched]
    .filter((entry) => !entry.carriesOverdraw).length;
  lines.push(`        traces with NO over-draw assurance: ${withoutOverdraw}`);
  lines.push("");
  lines.push("per-arm replication (sessions = independent captures; each session is one round)");
  lines.push(
    "  arm".padEnd(40) +
    "sess".padStart(5) + "  " + "match".padStart(5) + "  " + "diverge".padStart(7) +
    "  " + "dir-only".padStart(8) + "  " + "other".padStart(5) + "  directions"
  );
  for (const arm of replication) {
    lines.push(
      `  ${arm.probe}`.padEnd(40) +
      String(arm.sessions).padStart(5) + "  " +
      String(arm.matchedSessions).padStart(5) + "  " +
      String(arm.divergentSessions).padStart(7) + "  " +
      String(arm.directionOnlyDivergences).padStart(8) + "  " +
      String(arm.otherDivergences).padStart(5) + "  [" + arm.directions.join(",") + "]" +
      (arm.otherDifferencePaths.length > 0 ? `  !! ${arm.otherDifferencePaths.join(" ")}` : "")
    );
  }
  lines.push("");
  if (result.collisions.length > 0) {
    lines.push("FILENAME COLLISIONS (nothing was overwritten):");
    for (const collision of result.collisions) {
      lines.push(
        `  ${collision.reportPath}\n` +
        `    planned  ${collision.planned.fixtureId} / ${collision.planned.observationId}\n` +
        `    on disk  ${collision.existing.fixtureId} / ${collision.existing.observationId}`
      );
    }
    lines.push("");
  }
  if (result.orphans.length > 0) {
    lines.push("PROBE REPORTS ON DISK THAT THIS RUN DID NOT PRODUCE (not deleted):");
    for (const orphan of result.orphans) lines.push(`  ${orphan}`);
    lines.push("");
  }
  if (options.check) {
    lines.push(`unchanged: ${result.unchanged.length}`);
    lines.push(`drifted:   ${result.drifted.length}`);
    const missing = result.reports.length - result.unchanged.length - result.drifted.length;
    lines.push(`missing:   ${missing}`);
    for (const p of result.drifted) lines.push(`  DRIFT   ${p}`);
  } else {
    lines.push(`written:   ${result.written.length}`);
    lines.push(`unchanged: ${result.unchanged.length}`);
  }
  return lines.join("\n");
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    result = await regenerateDivergenceCorpus(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const replication = summarizeReplication(result);
  if (options.json) {
    console.log(JSON.stringify({
      totalTraces: result.totalTraces,
      selected: result.selected.length,
      matched: result.matched.length,
      divergent: result.reports.length,
      sessions: new Set([
        ...result.matched.map((entry) => entry.sessionId),
        ...result.reports.map((entry) => entry.sessionId)
      ]).size,
      installVerified: result.installVerified,
      collisions: result.collisions,
      orphans: result.orphans,
      written: result.written.length,
      unchanged: result.unchanged.length,
      drifted: result.drifted,
      replication,
      matchedDetail: result.matched,
      divergentDetail: result.reports.map((entry) => ({
        fixtureId: entry.report.fixtureId,
        observationId: entry.report.observationId,
        sessionId: entry.sessionId,
        probe: entry.probe,
        fixtureDirection: entry.fixtureDirection,
        attackDirection: entry.attackDirection,
        differencePaths: entry.differencePaths,
        drawCount: entry.drawCount,
        events: entry.events,
        carriesOverdraw: entry.carriesOverdraw
      }))
    }, null, 2));
  } else {
    console.log(renderSummary(result, replication, options));
  }
  const failed =
    result.collisions.length > 0 ||
    (options.check && (result.drifted.length > 0 || result.unchanged.length !== result.reports.length));
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
