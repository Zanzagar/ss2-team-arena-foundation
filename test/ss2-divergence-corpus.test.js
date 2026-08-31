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

/**
 * The archive layout `captures/README.md` documents, and the one the raw-trace
 * check below derives.
 *
 * Pinned against the committed README rather than restated here alone, so a
 * layout change has to move both, and so `CAPTURES_DIR` can be anchored on a
 * file whose CONTENT identifies it. Existence alone is not enough: a
 * `CAPTURES_DIR` that accidentally resolved to the repository root would find a
 * `README.md` there too.
 */
const ARCHIVE_LAYOUT = "captures/<session-id>/<observation-id>.jsonl";

/**
 * Directories under `captures/` that hold tool output rather than session
 * evidence, with the tool that writes each:
 *
 * - `vehicle-check/` — `tools/runtime-capture/validate-vehicle.ps1:35`, which
 *   HANDOFF.md mandates after ANY wrapper edit. A fresh clone therefore
 *   acquires `.jsonl` files here BEFORE it acquires any capture evidence, which
 *   is why "captures/ holds no .jsonl at all" is the wrong emptiness test.
 * - `wrapper/` — the same gate's earlier output location.
 * - `simulated/` — `tools/capture-session.mjs:191`, the `--simulate` dry run,
 *   which needs no licensed build and can be run anywhere.
 *
 * This set is an accommodation and is kept narrow and visible on purpose. It is
 * held honest by an assertion below: no name here may collide with a committed
 * report's `sessionId`, so it can never swallow real evidence.
 */
const NON_SESSION_CAPTURE_DIRS = Object.freeze(new Set([
  "simulated",
  "vehicle-check",
  "wrapper"
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

async function loadTextIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function directoryExists(dirPath) {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/** The file's size in bytes, or `null` when nothing readable is at that path. */
async function fileSizeIfPresent(filePath) {
  try {
    const stats = await stat(filePath);
    return stats.isFile() ? stats.size : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Every `.jsonl` under `captures/`, as `{ relative, top }`.
 *
 * Deliberately NO ENOENT tolerance. The two helpers above swallow ENOENT, and
 * copying that idiom here would make this scan blind to exactly the fault it
 * exists to detect: a wrong `CAPTURES_DIR` would list nothing, "the archive is
 * empty" would be satisfied, and the guard would skip for the same reason it
 * always did. The caller anchors `CAPTURES_DIR` on the committed README first,
 * so a root that cannot be listed here is a real fault and must be loud.
 */
async function archivedTraceFiles(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const relative = path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name));
      return { relative, top: relative.split(path.sep)[0] };
    })
    .sort((left, right) => (left.relative < right.relative ? -1 : 1));
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
  //
  // Which reports MUST resolve to a record is derived from a LISTING of the
  // observation directory, independently of the per-report lookup below, so the
  // two disagree if `OBSERVATION_DIR` is wrong. The line this replaces was
  // `withRecord + (reports.length - withRecord) === reports.length` — an
  // algebraic identity that holds for every integer, and which an audit
  // confirmed still passed with the entire observation directory moved aside.
  // Every substantive assertion in this loop sits behind `if (!record)`, so
  // that identity was the only thing closing a test whose name claims the repo
  // can account for every report.
  const committedRecordIds = new Set(
    (await readdir(OBSERVATION_DIR))
      .filter((fileName) => fileName.endsWith(".json"))
      .map((fileName) => fileName.slice(0, -".json".length))
  );
  assert.ok(
    committedRecordIds.size > 0,
    "no committed observation records were listed, so OBSERVATION_DIR is wrong or the records are gone"
  );
  const expectRecord = reports
    .filter(({ report }) => committedRecordIds.has(report.observationId))
    .map(({ report }) => report.observationId)
    .sort();
  assert.ok(
    expectRecord.length > 0,
    "no committed observation record shares an id with any divergence report, so every per-report " +
    "assertion below is skipped and this test constrains nothing"
  );

  const resolved = [];
  let sameTarget = 0;
  for (const { fileName, report } of reports) {
    const record = await loadJsonIfPresent(path.join(OBSERVATION_DIR, `${report.observationId}.json`));
    if (!record) continue;
    resolved.push(report.observationId);
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
  assert.deepEqual(
    resolved.sort(),
    expectRecord,
    "the reports that resolved to a committed observation record are not the ones a listing of " +
    `${path.relative(REPO_ROOT, OBSERVATION_DIR)} says should have resolved. Either the per-report ` +
    "path derivation is wrong, or a record was added or removed while this ran"
  );
  assert.equal(
    sameTarget,
    0,
    "a committed observation record now targets the very fixture a divergence report says it " +
    "diverged from. That pair should not be able to exist — a report is written BECAUSE the " +
    "observation did not match that fixture — which is why the digest equality above has never " +
    "once executed against the committed corpus. This assertion replaces a tautology " +
    "(`sameTarget <= withRecord`, guaranteed because sameTarget only increments inside the " +
    "withRecord branch) so the dead branch is visible rather than hidden. If this line fails the " +
    "branch finally has teeth: read the pair, then update this assertion deliberately"
  );
});

test("no preserved divergence contradicts a promotion", async () => {
  // The corpus and the goldens read the same evidence. If a golden cites an
  // observation as one of its two matching repetitions, no report may claim
  // that same observation diverged from the candidate it was promoted from.
  //
  // As above, which reports SHOULD be checked is derived from a listing of the
  // golden directory rather than from the per-report lookup, so a wrong
  // `GOLDEN_DIR` fails instead of quietly reducing the loop to nothing. The
  // floor this replaces was `checked > 0`, which one surviving golden satisfies.
  const goldenIds = new Set(
    (await readdir(GOLDEN_DIR))
      .filter((fileName) => fileName.endsWith(".json"))
      .map((fileName) => fileName.slice(0, -".json".length))
  );
  assert.ok(
    goldenIds.size > 0,
    "no promoted goldens were listed, so GOLDEN_DIR is wrong or the goldens are gone"
  );
  const goldenIdFor = (fixtureId) => `golden-${fixtureId.slice("candidate-".length)}`;
  const expectChecked = reports
    .filter(({ report }) => report.fixtureId.startsWith("candidate-") && goldenIds.has(goldenIdFor(report.fixtureId)))
    .map(({ fileName }) => fileName)
    .sort();
  assert.ok(
    expectChecked.length > 0,
    "no committed golden shares a candidate id with any divergence report, so this test would " +
    "compare nothing against a promotion"
  );

  const checked = [];
  for (const { fileName, report } of reports) {
    if (!report.fixtureId.startsWith("candidate-")) continue;
    const goldenId = goldenIdFor(report.fixtureId);
    const golden = await loadJsonIfPresent(path.join(GOLDEN_DIR, `${goldenId}.json`));
    if (!golden) continue;
    checked.push(fileName);
    assert.ok(
      !golden.provenance.observationIds.includes(report.observationId),
      `${fileName}: ${goldenId} cites ${report.observationId} as MATCHING evidence, but this report ` +
      "preserves it as a divergence — one of the two is wrong"
    );
  }
  assert.deepEqual(
    checked.sort(),
    expectChecked,
    "the reports checked against a promoted golden are not the ones a listing of " +
    `${path.relative(REPO_ROOT, GOLDEN_DIR)} says should have been checked`
  );
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
  //
  // Why the skip guard is three checks and not one
  // ----------------------------------------------
  // This guard used to be `if (found === 0) t.skip()`, where `found` counted
  // successful lookups of `CAPTURES_DIR/<sessionId>/<observationId>.jsonl`. Every
  // component of that path is a constant the guard never validated, so ANY error
  // in deriving it drove `found` to 0 — the same value a fresh clone produces.
  // An audit reproduced it three times with one-character edits on this
  // capture-bearing machine (`captures` -> `capture`, `".."` -> `"."`, `.jsonl`
  // -> `.json`); each drove `found` to 0 and took the skip branch, which exits 0
  // and reports the same "583 passed / 1 skipped" HANDOFF.md documents as the
  // expected FRESH-CLONE profile. The only thing separating a broken lookup from
  // an absent archive was a human remembering which machine they were on.
  //
  // It is also not enough to scan `captures/` for `.jsonl` before skipping. That
  // scan uses the same root, so a wrong `CAPTURES_DIR` blinds the fix exactly as
  // it blinded the guard; and `captures/` is a live working directory, so "holds
  // no .jsonl at all" is false on a fresh clone the moment someone runs
  // `validate-vehicle.ps1`, which HANDOFF.md mandates after any wrapper edit.
  //
  // So: anchor the root on committed content, then census the archive two ways
  // that fail differently, and refuse to skip unless both say the archive is
  // genuinely absent.
  assert.ok(probeReports.length > 0, "there are no probe reports whose raw trace could be checked");

  // 1. Anchor. `captures/README.md` is the ONLY path under captures/ that git
  //    tracks (`.gitignore`: `captures/*`, `!captures/README.md`), so it is
  //    present in a fresh clone AND on an operator machine — precisely the
  //    discrimination this test needs. Its absence is a derivation fault, never
  //    an empty archive. Content is checked too, so a CAPTURES_DIR that landed
  //    on some other directory holding a README cannot satisfy this.
  const readmePath = path.join(CAPTURES_DIR, "README.md");
  const readmeRelative = path.relative(REPO_ROOT, readmePath);
  const readme = await loadTextIfPresent(readmePath);
  assert.ok(
    readme !== null,
    `${readmeRelative} does not resolve, so CAPTURES_DIR is derived wrongly. That file is committed ` +
    "and therefore present in every clone, so its absence cannot mean 'this machine has no archive'"
  );
  assert.ok(
    readme.includes(ARCHIVE_LAYOUT),
    `${readmeRelative} no longer documents the layout '${ARCHIVE_LAYOUT}', which is the layout this ` +
    "test derives. Either CAPTURES_DIR resolves to the wrong directory, or the archive layout moved " +
    "and this test's path derivation has to move with it"
  );

  // The exempt working directories may never shadow a real session directory.
  const shadowed = probeReports
    .map(({ report }) => report.sessionId)
    .filter((sessionId) => NON_SESSION_CAPTURE_DIRS.has(sessionId))
    .sort();
  assert.deepEqual(
    shadowed,
    [],
    "a probe report's sessionId collides with a directory NON_SESSION_CAPTURE_DIRS exempts from the " +
    "evidence census, so that report's traces would be discounted as tool output"
  );

  // 2. Two censuses over the same reports, derived differently. The session
  //    directory census uses only CAPTURES_DIR + `report.sessionId`; the trace
  //    census adds `<observationId>.jsonl`. A fault in the filename half moves
  //    one and not the other.
  let found = 0;
  let sessionDirsFound = 0;
  const missing = [];
  const unresolved = [];
  for (const { report } of probeReports) {
    const sessionDir = path.join(CAPTURES_DIR, report.sessionId);
    const tracePath = path.join(sessionDir, `${report.observationId}.jsonl`);
    const relative = path.relative(REPO_ROOT, tracePath);
    if (await directoryExists(sessionDir)) sessionDirsFound += 1;
    // A zero-byte trace satisfies existence and regenerates nothing, so size is
    // the check, not existence.
    const size = await fileSizeIfPresent(tracePath);
    if (size === null) {
      missing.push(relative);
      unresolved.push(relative);
    } else if (size === 0) {
      missing.push(`${relative} (present but empty, so it regenerates nothing)`);
    } else {
      found += 1;
    }
  }

  // 3. Whole-tree `.jsonl` census, run unconditionally so it is exercised on
  //    the operator machine rather than only on the path that skips.
  const archived = await archivedTraceFiles(CAPTURES_DIR);
  const evidence = archived.filter((entry) => !NON_SESSION_CAPTURE_DIRS.has(entry.top));
  const exemptNames = [...NON_SESSION_CAPTURE_DIRS].sort().join(", ");

  if (found === 0) {
    const suspects = [];
    if (sessionDirsFound > 0) {
      suspects.push(
        `${sessionDirsFound} of the ${probeReports.length} expected probe SESSION DIRECTORIES do ` +
        "exist under captures/, so the archive is on this machine and the <observation-id>.jsonl " +
        "half of the derived path is what failed"
      );
    }
    if (evidence.length > 0) {
      suspects.push(
        `captures/ holds ${evidence.length} .jsonl file(s) outside the non-session working ` +
        `directories (${exemptNames}), so this machine has capture evidence and the expected ` +
        "probe traces should have resolved"
      );
    }
    const sample = (items) => (items.length === 0 ? "    (none)" : `    ${items.slice(0, 5).join("\n    ")}`);
    assert.deepEqual(
      suspects,
      [],
      "None of the expected probe raw traces resolved, but captures/ is not an empty archive. The " +
      "PATH DERIVATION is the suspect, not evidence retention:\n" +
      `  derived layout: ${ARCHIVE_LAYOUT}\n` +
      `  expected, did not resolve (${unresolved.length} of ${probeReports.length}; first 5):\n` +
      `${sample(unresolved)}\n` +
      `  .jsonl actually present under captures/ (${archived.length}; first 5):\n` +
      `${sample(archived.map((entry) => path.join("captures", entry.relative)))}\n` +
      "  why this is not an absent archive:\n" +
      `    ${suspects.join("\n    ")}`
    );
    // Say what was positively verified, so the skip line is self-evidencing
    // rather than an assertion of ignorance a reader has to take on trust.
    t.skip(
      `${readmeRelative} resolved and documents '${ARCHIVE_LAYOUT}', so CAPTURES_DIR is right; ` +
      `0 of ${probeReports.length} probe session directories and 0 of ${probeReports.length} probe ` +
      `raw traces are present; captures/ holds ${archived.length} .jsonl file(s), none of them ` +
      `capture evidence (anything present is tool output under ${exemptNames}). This clone has no ` +
      "probe archive, so raw-trace retention cannot be checked here"
    );
    return;
  }

  assert.deepEqual(
    missing,
    [],
    "a preserved probe divergence has no surviving raw trace, so it can no longer be regenerated"
  );
  assert.equal(found, probeReports.length);
  assert.equal(
    sessionDirsFound,
    probeReports.length,
    "every probe raw trace resolved, but the independently derived session-directory census " +
    "disagrees about how many session directories exist — the two derivations must agree"
  );
});
