/**
 * Structural integrity of the committed divergence corpus.
 *
 * Why this suite exists
 * ---------------------
 * Sixty-nine probe divergence reports were once deleted as "direction-lottery
 * noise". They were not noise — they are the broadest replication evidence the
 * capture campaign produced — and nothing in the suite noticed they had gone,
 * because nothing in the suite had ever looked at the divergence directory.
 * This file looks at it.
 *
 * What it can and cannot check
 * ----------------------------
 * A divergence report is a digest of an observation that is NOT committed
 * anywhere else: that is the point of preserving it. So this suite cannot
 * re-derive a report from its raw trace — the traces live under the ignored
 * `captures/` tree and are absent from a fresh clone. What it can check, and
 * does, is that every report is a valid report, that its file name is the one
 * its own ids imply, that it names a fixture the repo actually holds, that it
 * names an observation the repo can account for, and — the invariant that
 * matters most — that no preserved divergence contradicts a promotion by
 * naming an observation a golden cites as matching evidence.
 *
 * Re-deriving the corpus from the raw traces is
 * `tools/runtime-capture/regenerate-divergences.mjs --check`, which is an
 * operator gate on a machine that has the captures tree, not a unit test.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateSs2DivergenceReport } from "../src/golden/promote-1v1-golden.js";
import { validateSs2Observation } from "../src/golden/observation.js";
import { validateSs2OneVsOneFixture } from "../src/golden/run-1v1-fixture.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TEST_DIR, "..");
const DIVERGENCE_DIR = path.join(TEST_DIR, "fixtures", "ss2-1v1-divergences");
const FIXTURE_DIR = path.join(TEST_DIR, "fixtures", "ss2-1v1");
const GOLDEN_DIR = path.join(TEST_DIR, "fixtures", "ss2-1v1-golden");
const OBSERVATION_DIR = path.join(TEST_DIR, "observations", "ss2-1v1");
const CAPTURES_DIR = path.join(REPO_ROOT, "captures");

/** Mirrors the id token rule `promote-1v1-golden.js` applies to manifests. */
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** The JSON-pointer roots `matchSs2ObservationToFixture` can report against. */
const COMPARISON_ROOTS = Object.freeze([
  "/build",
  "/target",
  "/scenario",
  "/samples",
  "/mutationTrace",
  "/events",
  "/resultEvent",
  "/finalState"
]);

const PROBE_FIXTURE_PREFIX = "candidate-probe-";

/**
 * The one report whose fixtureId names no committed fixture.
 *
 * `provisional-prisoner-kill` is a provisional fixture that
 * `tools/runtime-capture/gen-provisional-prisoner.mjs` writes into the ignored
 * `captures/` tree; it was never a repository fixture. The report is real
 * evidence and is kept, but a reader holding only the repo cannot resolve what
 * it diverged from. Pinned here by name so the exception stays visible and
 * cannot quietly grow into a habit.
 */
const FIXTURELESS_REPORTS = Object.freeze(new Set(["provisional-prisoner-kill"]));

/**
 * The probe arms that have NO divergent round.
 *
 * `armour-removal-gate-above` ran twice, both at attack direction 5, and both
 * matched — so the "one extra draw above the gate" arm has no cross-direction
 * replication at all, while its partner arm below the gate has ten divergent
 * rounds across four directions. That asymmetry is the weakest point in the
 * replication claim and it is asserted here so it cannot be forgotten. If a
 * later campaign captures a divergent above-the-gate round this assertion
 * fails, and the right response is to update it AND
 * docs/integration/ss2-probe-replication.md together.
 */
const PROBE_ARMS_WITHOUT_DIVERGENCE = Object.freeze(new Set([
  "candidate-probe-armour-removal-gate-above"
]));

/** The four-direction band an attack-direction belongs to. */
function bandOf(direction) {
  if (direction >= 1 && direction <= 4) return "quick";
  if (direction >= 5 && direction <= 8) return "normal";
  if (direction >= 9 && direction <= 12) return "power";
  return "other";
}

function safeFileToken(value) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

/** The name `tools/capture-session.mjs` gives a report; re-derived, not trusted. */
function expectedReportFileName(fixtureId, observationId) {
  const suffix = createHash("sha256")
    .update(`${fixtureId}\n${observationId}`, "utf8")
    .digest("hex")
    .slice(0, 8);
  return `${safeFileToken(fixtureId)}--${safeFileToken(observationId)}-${suffix}.json`;
}

const parseJson = (text) => JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function loadJsonIfPresent(filePath) {
  try {
    return parseJson(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const reportFileNames = (await readdir(DIVERGENCE_DIR))
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

const reports = await Promise.all(reportFileNames.map(async (fileName) => ({
  fileName,
  report: parseJson(await readFile(path.join(DIVERGENCE_DIR, fileName), "utf8"))
})));

const probeReports = reports.filter(({ report }) => report.fixtureId.startsWith(PROBE_FIXTURE_PREFIX));

test("the divergence directory is not empty and holds only reports and its README", async () => {
  const onDisk = (await readdir(DIVERGENCE_DIR)).sort();
  assert.ok(reports.length > 0, "the divergence corpus is empty — preserved evidence has been deleted");
  const unexpected = onDisk.filter((name) => name !== "README.md" && !name.endsWith(".json"));
  assert.deepEqual(unexpected, [], "the divergence directory holds a file that is neither a report nor its README");
  assert.ok(onDisk.includes("README.md"), "the corpus must keep the README that states why reports are preserved");
});

test("every committed report validates as an ss2-1v1-divergence", () => {
  for (const { fileName, report } of reports) {
    // The real validator, not a local re-implementation: schema version, kind,
    // exact key set, pinned build, digest shape, and difference shape.
    assert.equal(validateSs2DivergenceReport(report), report, fileName);
    assert.ok(TOKEN_PATTERN.test(report.fixtureId), `${fileName}: fixtureId is not a valid token`);
    assert.ok(TOKEN_PATTERN.test(report.observationId), `${fileName}: observationId is not a valid token`);
    assert.ok(TOKEN_PATTERN.test(report.sessionId), `${fileName}: sessionId is not a valid token`);
  }
});

test("each report's file name is the one its own ids imply, and each pair appears once", () => {
  const seenPairs = new Set();
  for (const { fileName, report } of reports) {
    assert.equal(
      fileName,
      expectedReportFileName(report.fixtureId, report.observationId),
      `${fileName} does not match the name its fixtureId and observationId imply; ` +
      "a hand-renamed report can shadow or be shadowed by a generated one"
    );
    const pair = `${report.fixtureId}\n${report.observationId}`;
    assert.ok(!seenPairs.has(pair), `two reports preserve the same (fixture, observation) pair: ${pair}`);
    seenPairs.add(pair);
  }
});

test("every difference is a well-formed pointer into the comparison projection", () => {
  for (const { fileName, report } of reports) {
    assert.ok(report.differences.length > 0, `${fileName} has no differences`);
    for (const difference of report.differences) {
      assert.ok(
        COMPARISON_ROOTS.some((root) => difference.path === root || difference.path.startsWith(`${root}/`)),
        `${fileName}: ${difference.path} is not a pointer into the observation comparison projection`
      );
      assert.notDeepEqual(
        difference.expected ?? null,
        difference.actual ?? null,
        `${fileName}: ${difference.path} records a difference between equal values`
      );
    }
  }
});

test("every report names a fixture that exists, bar one recorded exception", async () => {
  let resolved = 0;
  for (const { fileName, report } of reports) {
    if (FIXTURELESS_REPORTS.has(report.fixtureId)) {
      assert.ok(
        !report.fixtureId.startsWith("candidate-"),
        `${fileName}: only a provisional (non-candidate) fixture id may go unresolved in the repo`
      );
      assert.equal(
        await exists(path.join(FIXTURE_DIR, `${report.fixtureId}.json`)),
        false,
        `${fileName}: ${report.fixtureId} now exists, so remove it from FIXTURELESS_REPORTS`
      );
      continue;
    }
    const fixture = await loadJsonIfPresent(path.join(FIXTURE_DIR, `${report.fixtureId}.json`));
    assert.ok(fixture, `${fileName}: names fixture ${report.fixtureId}, which is not committed`);
    assert.equal(validateSs2OneVsOneFixture(fixture), fixture, report.fixtureId);
    assert.equal(fixture.fixtureId, report.fixtureId, `${report.fixtureId}.json declares a different id`);
    resolved += 1;
  }
  assert.ok(resolved > 0, "no report resolved to a committed fixture");
});

test("every report names an observation the repo can account for", async () => {
  // A divergent observation is not committed as a record — the report IS its
  // preserved form. Where a record with the same id does exist, the two must
  // agree on the session, and must agree on the digest exactly when the record
  // was ingested against this report's fixture: an observation record is
  // fixture-relative (its scenario projection and `target.fixtureId` come from
  // the fixture), so the same raw trace ingested against two fixtures yields
  // two different digests, and requiring equality across them would be wrong.
  let withRecord = 0;
  let sameTarget = 0;
  for (const { fileName, report } of reports) {
    const record = await loadJsonIfPresent(path.join(OBSERVATION_DIR, `${report.observationId}.json`));
    if (!record) continue;
    withRecord += 1;
    assert.equal(validateSs2Observation(record), record, report.observationId);
    assert.equal(
      record.capture.sessionId,
      report.sessionId,
      `${fileName}: the committed record for ${report.observationId} names a different session`
    );
    if (record.target.fixtureId === report.fixtureId) {
      sameTarget += 1;
      assert.equal(
        record.digest,
        report.observationDigest,
        `${fileName}: the committed record targets this very fixture, so the digests must be equal`
      );
    }
  }
  assert.equal(
    withRecord + (reports.length - withRecord),
    reports.length,
    "every report is either backed by a committed record or preserved only as a report"
  );
  assert.ok(
    sameTarget <= withRecord,
    "internal: same-target records are a subset of records"
  );
});

test("no preserved divergence contradicts a promotion", async () => {
  // The corpus and the goldens read the same evidence. If a golden cites an
  // observation as one of its two matching repetitions, no report may claim
  // that same observation diverged from the candidate it was promoted from.
  let checked = 0;
  for (const { fileName, report } of reports) {
    if (!report.fixtureId.startsWith("candidate-")) continue;
    const goldenId = `golden-${report.fixtureId.slice("candidate-".length)}`;
    const golden = await loadJsonIfPresent(path.join(GOLDEN_DIR, `${goldenId}.json`));
    if (!golden) continue;
    checked += 1;
    assert.ok(
      !golden.provenance.observationIds.includes(report.observationId),
      `${fileName}: ${goldenId} cites ${report.observationId} as MATCHING evidence, but this report ` +
      "preserves it as a divergence — one of the two is wrong"
    );
  }
  assert.ok(checked > 0, "no report was checked against a promoted golden");
});

test("the probe corpus is the direction lottery and nothing else", () => {
  assert.ok(probeReports.length > 0, "the probe divergence corpus is empty");
  for (const { fileName, report } of probeReports) {
    // Every probe report must differ from its candidate in exactly one place:
    // the attack direction the game drew before the recording window opened.
    // A second difference would mean the round contradicted the measurement
    // rather than merely landing on another direction, and that is a finding
    // that must never be absorbed silently into this corpus.
    assert.equal(
      report.differences.length,
      1,
      `${fileName} carries ${report.differences.length} differences; a probe round that disagrees ` +
      "anywhere but the attack direction CONTRADICTS the measurement and must be read, not filed"
    );
    const [difference] = report.differences;
    assert.equal(difference.path, "/scenario/attackDirection", fileName);
    assert.ok(Number.isInteger(difference.expected), `${fileName}: expected direction is not an integer`);
    assert.ok(Number.isInteger(difference.actual), `${fileName}: observed direction is not an integer`);
    assert.notEqual(difference.expected, difference.actual, fileName);
    assert.equal(
      bandOf(difference.actual),
      bandOf(difference.expected),
      `${fileName}: the observed direction ${difference.actual} is outside the band of the staged ` +
      `direction ${difference.expected}. Direction is only orthogonal to the measurement WITHIN a ` +
      "band — the knockback gate turns on directions 5-12 — so a cross-band round changes the draw " +
      "count and is not a lottery result"
    );
  }
});

test("every probe candidate is represented, and the arms with no divergence are the known ones", async () => {
  const probeFixtureIds = (await readdir(FIXTURE_DIR))
    .filter((fileName) => fileName.startsWith(PROBE_FIXTURE_PREFIX) && fileName.endsWith(".json"))
    .map((fileName) => fileName.slice(0, -".json".length))
    .sort();
  assert.ok(probeFixtureIds.length > 0, "no probe candidate fixtures are committed");

  const covered = new Set(probeReports.map(({ report }) => report.fixtureId));
  for (const fixtureId of covered) {
    assert.ok(
      probeFixtureIds.includes(fixtureId),
      `a probe report names ${fixtureId}, which is not a committed probe candidate`
    );
  }
  const uncovered = probeFixtureIds.filter((fixtureId) => !covered.has(fixtureId)).sort();
  assert.deepEqual(
    uncovered,
    [...PROBE_ARMS_WITHOUT_DIVERGENCE].sort(),
    "the set of probe arms with NO divergent round has changed. That set is the weakest point of " +
    "the replication claim (an arm with no divergence has no cross-direction evidence at all), so " +
    "update this assertion and docs/integration/ss2-probe-replication.md in the same change"
  );
});

test("each probe report's raw trace is still archived", async (t) => {
  // The strongest existence check available, and it only runs where the
  // evidence is. Raw trace entries under `captures/` are gitignored, but the
  // directory itself contains a committed README, so directory existence does
  // not distinguish an operator archive from a fresh clone.
  let found = 0;
  const missing = [];
  for (const { report } of probeReports) {
    const tracePath = path.join(CAPTURES_DIR, report.sessionId, `${report.observationId}.jsonl`);
    if (await exists(tracePath)) found += 1;
    else missing.push(path.relative(REPO_ROOT, tracePath));
  }
  if (found === 0) {
    t.skip(
      "none of the expected ignored probe raw traces are present; " +
      "raw-trace existence cannot be checked from this clone"
    );
    return;
  }
  assert.deepEqual(
    missing,
    [],
    "a preserved probe divergence has no surviving raw trace, so it can no longer be regenerated"
  );
  assert.equal(found, probeReports.length);
});
