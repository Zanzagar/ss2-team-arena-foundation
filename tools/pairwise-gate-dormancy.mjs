/**
 * Does the promotion gate's pairwise agreement check have teeth, or is it dormant?
 *
 *   node tools/pairwise-gate-dormancy.mjs            # human-readable report
 *   node tools/pairwise-gate-dormancy.mjs --json     # same data, machine-readable
 *
 * It takes about a minute. It re-digests, re-validates, re-matches and
 * re-compares a copy of a committed record once per candidate value per leaf.
 *
 * THE CLAIM THIS SETTLES, quoted from the comment it was written into
 * (`src/golden/promote-1v1-golden.js`, the block above the pairwise loop):
 *
 *   "probing all 162 leaves of a committed observation, perturbing each one and
 *    re-digesting, ZERO can differ between two records while both still match
 *    their candidate. So this loop cannot currently refuse anything."
 *
 * That sentence was never backed by a committed script — no leaf prober has
 * ever existed in this repository — so it has been re-argued from memory three
 * times and retracted once. This file is the measurement, committed, so the
 * next reader re-runs it instead of re-litigating it.
 *
 * OPERATIONAL RESTATEMENT. For every committed observation record R in
 * test/observations/ss2-1v1/, against the candidate fixture F that
 * `R.target.fixtureId` names, and for every leaf path P in R:
 *
 *   1. perturb R at P to a different value chosen to respect the schema,
 *   2. recompute `digest` so the copy validates,
 *   3. classify:
 *      REFUSED_BY_VALIDATION      `validateSs2Observation` throws. The forgery
 *                                 is impossible for a reason that is NOT the
 *                                 gate, and must never be scored as a catch.
 *      CAUGHT_BY_MATCHER          valid, but `matchSs2ObservationToFixture`
 *                                 no longer matches. The candidate pins this
 *                                 leaf; the gate is redundant here.
 *      FREE_CAUGHT_BY_PAIRWISE    valid, still matches F, and
 *                                 `ss2ObservationsMatch(R, R')` reports a
 *                                 difference. THE GATE HAS TEETH HERE.
 *      FREE_CAUGHT_BY_NOTHING     valid, still matches F, and the gate is
 *                                 silent. A hole neither check closes.
 *
 * The headline is the FREE count. If it is not zero the gate is not dormant.
 *
 * THE ANSWER, as measured on 2026-08-31, so a reader gets it without a minute
 * of CPU — but re-run it rather than quoting these numbers, which is the entire
 * reason this file exists:
 *
 *   751 of 11,121 single-leaf perturbations are FREE. NOT ZERO. The quoted
 *   claim is false, and it is false on what is almost certainly its own record:
 *   obs-qk1 carries 163 full-record leaves, 162 of them probeable — the 163rd
 *   is /digest, which step 2 rewrites — and TEN of those 162 are free, not
 *   zero. So "162" was never an unreproducible number, as HANDOFF.md's own
 *   correction claims; it reproduces exactly, and 142 is that same record's
 *   matcher projection. Only the conclusion drawn from it was wrong.
 *
 *   407 of the 751 the gate catches, every one at /samples/*&#47;callSite.
 *   The other 344 are identity and capture metadata the pairwise projection
 *   excludes deliberately, because two honest records MUST differ there.
 *
 * AND THE PART THAT MATTERS MORE THAN THE HEADLINE. "HAS TEETH" describes the
 * FUNCTION, not this corpus. This tool does not run the promotion path at all,
 * so it cannot answer whether the gate is REACHED — read its answer as a fact
 * about the matcher and the projection, nothing more.
 *
 * WHAT THIS HEADER USED TO ADD, AND WHY IT IS RETRACTED. It said the gate
 * still refused nothing on the promotion path, because zero of the observation
 * ids cited by the promoted goldens carried a `capture.launchNonce`, so the
 * NONCE gate refused every forgery about forty lines earlier and excising the
 * pairwise loop changed zero verdicts. That was measured and true of the
 * corpus as it then stood. Re-promoting the four self-citing normal-band
 * goldens off their transcription sources changed it: 9 nonce-bearing records
 * are now cited, across 4 goldens, and a forgery on one of those reaches the
 * pairwise loop. `test/capture-campaign.test.js` measures which gate refuses
 * which forgery, record by record; take the answer from there, not from here.
 *
 * The real functions are imported from src/golden/observation.js and called
 * unmodified. A measurement of a reimplemented matcher would measure the
 * reimplementation.
 *
 * ---------------------------------------------------------------------------
 * PERTURBATION TABLE, and why each entry is the one it is.
 *
 * Perturbation choice IS the measurement: a candidate value the schema refuses
 * proves nothing about the gate, and a candidate the schema ignores proves
 * nothing either. So each leaf gets a LIST of candidates tried in order, and
 * the first one that validates is the perturbation used. Only if the whole list
 * is refused is the leaf called REFUSED_BY_VALIDATION.
 *
 *   1. CORPUS ALTERNATIVE — tried first, for every type. Any value that some
 *      other committed record carries at the SAME normalised path class
 *      (`/samples/3/label` and `/samples/0/label` share the class
 *      `/samples/*&#47;label`). In-domain by construction: it is a value this
 *      schema has already accepted at this exact position, so a refusal is a
 *      cross-field refusal and not a typo. Capped at 8 distinct alternatives.
 *   1b. SCHEMA ALTERNATIVE — the other members of an enum the SCHEMA declares,
 *      transcribed below from the checks themselves. This exists because the
 *      corpus does not cover every enum: all 67 records are
 *      `injected-tape-runtime`, so without this table `/capture/method` would be
 *      scored as pinned when the schema in fact accepts two other values.
 *      Leaving it out is the same class of error as `+1`: it reports the
 *      CORPUS's uniformity as the SCHEMA's.
 *   2. BOOLEAN — the negation. The only other value there is.
 *   3. NUMBER — v+1, v-1, v+2, 0, 1, -1, 7, 12345, v+0.5.
 *      `v+1` ALONE is the trap the 2026-08-31 measurements fell into: it is
 *      refused on `/samples/*&#47;value` whenever value === max and on
 *      `/samples/*&#47;min` whenever min+1 exceeds value, for range reasons
 *      that say nothing at all about the gate.
 *   4. STRING — v+"x", v+"-x", "x"+v, upper-case, lower-case, v without its
 *      last character, "probe", "probe-x", "root:probe", "overlay:probe",
 *      "/hero/hitpoints", "unattributed".
 *      A character APPEND alone is the string-side version of the same trap:
 *      it is refused on most string leaves in this schema for case or charset
 *      reasons (`target.fixtureId` is lower-case only; `mutationTrace[].reason`
 *      is `[a-z-]` only), which again says nothing about the gate.
 *   5. NULL — 0, 1, false, "probe".
 *
 * A candidate whose canonical JSON equals the original record's is DISCARDED
 * before validation, as a null perturbation rather than a measurement: `-0` for
 * `0` is the case that matters, since `JSON.stringify(-0) === "0"` makes it
 * invisible to the digest and to both comparison surfaces alike.
 *
 * The list is searched EXHAUSTIVELY and FREE wins: a leaf is only scored
 * CAUGHT_BY_MATCHER once every candidate that validated was also caught. Taking
 * the first validating candidate would score a leaf as pinned on the strength of
 * one unlucky value.
 *
 * ---------------------------------------------------------------------------
 * LEAF COUNTING, decided and stated because the answer moves the numbers.
 *
 *   - A LEAF is a position holding a JSON scalar: string, number, boolean or
 *     null. Leaf counts are per-record, so every count below is a RANGE with
 *     the record holding each extreme named.
 *   - An EMPTY array or object is NOT a leaf: it holds no scalar. Six records
 *     carry an empty `mutationTrace`; that position is reported separately as
 *     an unprobed structural position. (Counting it as a leaf is what turns
 *     this tool's full-record minimum into the 101 an earlier measurement
 *     reported; both numbers are printed so the two reconcile.)
 *   - ARRAY LENGTH is NOT a leaf. Changing a length adds or removes a leaf
 *     rather than perturbing one, and the claim under test is about perturbing
 *     leaves. Length-changing forgeries are therefore OUT OF SCOPE here and
 *     are named in "what this does not prove".
 *   - `/digest` is a leaf but is NOT PROBEABLE: step 2 of the protocol
 *     rewrites it, so any perturbation of it is undone before validation. It is
 *     counted in the full-record leaf total and excluded from the perturbation
 *     total, which is why probeable = full-record − 1.
 *
 * ---------------------------------------------------------------------------
 * INDEPENDENCE. The tool must not use the gate's own projection to decide what
 * the gate can see, or a projection bug would hide itself. So both comparison
 * surfaces are re-derived here from the schema and then ASSERTED equal to the
 * library's, for every record, before any measurement runs. A disagreement
 * aborts the tool rather than being reported as a result.
 *
 * Nothing here launches the game, reads the installation, touches a save, or
 * writes to the repository. It reads committed JSON and calls library code.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJsonStringify,
  computeSs2ObservationDigest,
  isCosmeticDebrisSample,
  matchSs2ObservationToFixture,
  projectSs2ObservationForComparison,
  projectSs2ObservationForPairwiseComparison,
  ss2ObservationsMatch,
  validateSs2Observation
} from "../src/golden/observation.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OBSERVATION_DIR = path.join(REPO, "test/observations/ss2-1v1");
const CANDIDATE_DIR = path.join(REPO, "test/fixtures/ss2-1v1");
const GOLDEN_DIR = path.join(REPO, "test/fixtures/ss2-1v1-golden");

const EMIT_JSON = process.argv.includes("--json");

// ---------------------------------------------------------------------------
// Inputs. Fixtures are indexed by their `fixtureId` FIELD, not by file name,
// and only the two directories that hold real fixtures are read:
// test/fixtures/ss2-1v1-divergences/ holds `ss2-1v1-divergence` records which
// REUSE the candidate's fixtureId, so indexing that directory silently
// overwrites 22 candidates with objects the matcher cannot accept.

function readJsonDir(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ file: name, json: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) }));
}

const fixtures = new Map();
for (const dir of [CANDIDATE_DIR, GOLDEN_DIR]) {
  for (const { file, json } of readJsonDir(dir)) {
    if (json.kind !== "ss2-1v1-fixture") continue;
    if (fixtures.has(json.fixtureId)) {
      throw new Error(`two fixtures claim fixtureId ${json.fixtureId}; the second is ${file}`);
    }
    fixtures.set(json.fixtureId, json);
  }
}
const records = readJsonDir(OBSERVATION_DIR).map(({ file, json }) => ({ file, record: json }));

// Which observations the 22 promoted goldens actually rest on. Cited ids are
// resolved by the `observationId` FIELD: three committed records deliberately
// carry file names that do not match the id inside them (pinned by
// test/capture-campaign.test.js), so a by-file-name index reports three phantom
// missing observations.
const recordById = new Map(records.map(({ record }) => [record.observationId, record]));
const goldens = readJsonDir(GOLDEN_DIR)
  .filter(({ json }) => json.kind === "ss2-1v1-fixture" && json.fixtureId.startsWith("golden-"));
const citedIds = new Set();
for (const { json } of goldens) for (const id of json.provenance?.observationIds ?? []) citedIds.add(id);

// ---------------------------------------------------------------------------
// Leaf enumeration and the two comparison surfaces, re-derived independently.

const SCALAR = (value) => value === null || typeof value !== "object";

/** Leaf paths of `value`, as {segments, path}. Empty containers yield nothing. */
function leaves(value, segments = [], out = []) {
  if (SCALAR(value)) {
    out.push({ segments: [...segments], path: `/${segments.join("/")}` });
    return out;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) leaves(value[index], [...segments, index], out);
    return out;
  }
  for (const key of Object.keys(value).sort()) leaves(value[key], [...segments, key], out);
  return out;
}

/** Positions holding an empty array or object — counted, never probed. */
function emptyContainers(value, segments = [], out = []) {
  if (SCALAR(value)) return out;
  const entries = Array.isArray(value) ? value : Object.values(value);
  if (entries.length === 0) {
    out.push(`/${segments.join("/")}`);
    return out;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) emptyContainers(value[index], [...segments, index], out);
    return out;
  }
  for (const key of Object.keys(value).sort()) emptyContainers(value[key], [...segments, key], out);
  return out;
}

// The matcher reads the observation through `comparableSamples`: the debris
// filter, then five of the seven sample keys. Re-derived rather than imported.
const DEBRIS_LABEL = /^armour-debris-\d+-(?:x|y|rotation)$/;
const independentIsDebris = (sample) => sample.source === "randomNumber" && DEBRIS_LABEL.test(sample.label);

function independentMatcherSurface(record) {
  return {
    build: record.build,
    target: record.target,
    scenario: record.scenario,
    samples: record.samples
      .filter((sample) => !independentIsDebris(sample))
      .map(({ label, source, min, max, value }) => ({ label, source, min, max, value })),
    mutationTrace: record.mutationTrace,
    events: record.events,
    resultEvent: record.resultEvent,
    finalState: record.finalState
  };
}

// The pairwise gate enumerates the record's own top-level keys and drops three.
const INDEPENDENT_PAIRWISE_EXCLUDED = ["capture", "observationId", "digest"];
function independentPairwiseSurface(record) {
  const projected = {};
  for (const key of Object.keys(record).sort()) {
    if (INDEPENDENT_PAIRWISE_EXCLUDED.includes(key)) continue;
    projected[key] = record[key];
  }
  return projected;
}

/**
 * Fail closed. If the library's projections have drifted from the ones this
 * tool reasons about, every number below would be measuring the wrong surface,
 * so the run aborts instead of reporting.
 */
function assertSurfacesAgree() {
  for (const { file, record } of records) {
    for (const sample of record.samples) {
      assert.equal(independentIsDebris(sample), isCosmeticDebrisSample(sample),
        `${file}: debris predicate drifted`);
    }
    assert.deepEqual(
      JSON.parse(JSON.stringify(independentMatcherSurface(record))),
      projectSs2ObservationForComparison(record),
      `${file}: projectSs2ObservationForComparison drifted from this tool's re-derivation`
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(independentPairwiseSurface(record))),
      projectSs2ObservationForPairwiseComparison(record),
      `${file}: projectSs2ObservationForPairwiseComparison drifted from this tool's re-derivation`
    );
  }
}

// ---------------------------------------------------------------------------
// Perturbation.

/** `/samples/3/label` -> `/samples/*&#47;label`; the unit FREE counts group by. */
function pathClass(segments) {
  return `/${segments.map((segment) => (typeof segment === "number" ? "*" : segment)).join("/")}`;
}

/** The same normalisation applied to a printed path, e.g. one the gate reports. */
function pathClassOf(printed) {
  return pathClass(printed.slice(1).split("/").map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)));
}

function readAt(root, segments) {
  return segments.reduce((node, segment) => node[segment], root);
}

function withLeafSet(record, segments, value) {
  const copy = structuredClone(record);
  let node = copy;
  for (let index = 0; index < segments.length - 1; index += 1) node = node[segments[index]];
  node[segments.at(-1)] = value;
  delete copy.digest;
  copy.digest = computeSs2ObservationDigest(copy);
  return copy;
}

/** Values other committed records carry at the same path class. */
const corpusValues = new Map();
for (const { record } of records) {
  for (const { segments } of leaves(record)) {
    const key = pathClass(segments);
    if (!corpusValues.has(key)) corpusValues.set(key, new Map());
    const seen = corpusValues.get(key);
    const value = readAt(record, segments);
    const encoded = JSON.stringify(value ?? null);
    if (!seen.has(encoded)) seen.set(encoded, value);
  }
}

/**
 * Enum domains the SCHEMA declares, transcribed from the checks that enforce
 * them so the tool does not mistake the corpus's uniformity for the schema's.
 * Every entry is a value one of these functions accepts:
 *   ObservationCaptureMethod, assertEventShape, assertSampleShape  (observation.js)
 *   RESULT_REASONS, RESULT_HOW_DIED, the fightMode check, the gladiator_dir
 *   check, the mutationTrace path pattern                       (run-1v1-fixture.js)
 * Path classes absent from this table are covered by the corpus pool or by the
 * type-generic fallbacks.
 */
const SCHEMA_ALTERNATIVES = new Map([
  ["/capture/method", ["injected-tape-runtime", "passive-runtime", "synthetic-simulator"]],
  ["/scenario/attackerSide", ["hero", "villain"]],
  ["/scenario/fightMode", ["tournament", "duel", "misc"]],
  ["/scenario/hero/gladiator_dir", ["left", "right"]],
  ["/scenario/villain/gladiator_dir", ["left", "right"]],
  ["/samples/*/source", ["randomBetween", "randomNumber"]],
  ["/events/*/type", ["defender-hurt", "defender-blocked", "magic-damage", "death", "overlay-label"]],
  ["/events/*/method", ["normal", "critical", "taunt", "grievous"]],
  ["/events/*/side", ["hero", "villain"]],
  ["/events/*/label", ["combatwon", "combatlost"]],
  ["/mutationTrace/*/path", ["/hero/hitpoints", "/villain/hitpoints", "/result"]],
  ["/mutationTrace/*/reason", ["damagecharacter", "result-bridge", "unattributed", "remove-armour"]],
  ["/resultEvent/reason", ["elimination", "first-blood"]],
  ["/resultEvent/howDied", ["slain", "yield", "taunt", "arrow", "grievous"]],
  ["/resultEvent/winnerSide", ["hero", "villain"]],
  ["/resultEvent/loserSide", ["hero", "villain"]],
  ["/finalState/result/reason", ["elimination", "first-blood"]],
  ["/finalState/result/howDied", ["slain", "yield", "taunt", "arrow", "grievous"]],
  ["/finalState/result/winnerSide", ["hero", "villain"]],
  ["/finalState/result/loserSide", ["hero", "villain"]]
]);

const GENERIC_STRINGS = ["probe", "probe-x", "root:probe", "overlay:probe", "/hero/hitpoints", "unattributed"];

function candidatesFor(segments, value) {
  const out = [];
  const push = (kind, candidate) => {
    if (candidate === undefined) return;
    if (JSON.stringify(candidate ?? null) === JSON.stringify(value ?? null)) return;
    out.push({ kind, value: candidate });
  };
  // 1. corpus alternatives, in-domain by construction.
  const seen = corpusValues.get(pathClass(segments));
  if (seen) {
    let taken = 0;
    for (const candidate of seen.values()) {
      if (taken >= 8) break;
      if (JSON.stringify(candidate ?? null) === JSON.stringify(value ?? null)) continue;
      push("corpus-alternative", candidate);
      taken += 1;
    }
  }
  // 1b. the rest of a schema-declared enum, which the corpus may not cover.
  for (const candidate of SCHEMA_ALTERNATIVES.get(pathClass(segments)) ?? []) {
    push("schema-alternative", candidate);
  }
  // 2-5. type-generic fallbacks.
  if (typeof value === "boolean") push("boolean-flip", !value);
  else if (typeof value === "number") {
    for (const candidate of [value + 1, value - 1, value + 2, 0, 1, -1, 7, 12345, value + 0.5]) {
      push("numeric", candidate);
    }
  } else if (typeof value === "string") {
    for (const candidate of [
      `${value}x`, `${value}-x`, `x${value}`,
      value.toUpperCase(), value.toLowerCase(), value.slice(0, -1) || undefined,
      ...GENERIC_STRINGS
    ]) push("string-generic", candidate);
  } else if (value === null) {
    for (const candidate of [0, 1, false, "probe"]) push("null-replacement", candidate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The measurement.

const CLASSES = ["REFUSED_BY_VALIDATION", "CAUGHT_BY_MATCHER", "FREE_CAUGHT_BY_PAIRWISE_GATE", "FREE_CAUGHT_BY_NOTHING"];

function classifyLeaf(record, fixture, segments, baseline) {
  const value = readAt(record, segments);
  let caught = null;                       // remembered; FREE outranks it
  for (const candidate of candidatesFor(segments, value)) {
    let perturbed;
    try {
      perturbed = withLeafSet(record, segments, candidate.value);
    } catch {
      continue;                            // e.g. a value the digest cannot canonicalise
    }
    // A candidate that canonicalises to the original record is a null
    // perturbation, not a measurement. Discard before validating.
    if (canonicalJsonStringify(perturbed) === baseline) continue;
    try {
      validateSs2Observation(perturbed);
    } catch {
      continue;                            // refused by validation; try the next value
    }
    if (!matchSs2ObservationToFixture(fixture, perturbed).match) {
      caught ??= { outcome: "CAUGHT_BY_MATCHER", perturbation: candidate };
      continue;                            // keep looking: another value may be free
    }
    const agreement = ss2ObservationsMatch(record, perturbed);
    return {
      outcome: agreement.match ? "FREE_CAUGHT_BY_NOTHING" : "FREE_CAUGHT_BY_PAIRWISE_GATE",
      perturbation: candidate,
      gatePaths: agreement.differences.map((difference) => difference.path)
    };
  }
  return caught ?? { outcome: "REFUSED_BY_VALIDATION", perturbation: null };
}

function measure() {
  assertSurfacesAgree();

  const perRecord = [];
  const totals = Object.fromEntries(CLASSES.map((name) => [name, 0]));
  const totalsCited = Object.fromEntries(CLASSES.map((name) => [name, 0]));
  const totalsUncited = Object.fromEntries(CLASSES.map((name) => [name, 0]));
  const freeClasses = new Map();
  const baselineFailures = [];
  let emptyContainerPositions = 0;

  for (const { file, record } of records) {
    const fixture = fixtures.get(record.target.fixtureId);
    if (!fixture) throw new Error(`${file} targets ${record.target.fixtureId}, which no fixture declares`);
    try {
      validateSs2Observation(record);
      if (!matchSs2ObservationToFixture(fixture, record).match) {
        baselineFailures.push({ observationId: record.observationId, why: "does not match its candidate" });
        continue;
      }
    } catch (error) {
      baselineFailures.push({ observationId: record.observationId, why: error.message });
      continue;
    }

    const recordLeaves = leaves(record);
    const empties = emptyContainers(record);
    emptyContainerPositions += empties.length;
    const cited = citedIds.has(record.observationId);
    const bucket = cited ? totalsCited : totalsUncited;
    const counts = Object.fromEntries(CLASSES.map((name) => [name, 0]));
    const baseline = canonicalJsonStringify(record);

    for (const { segments, path: leafPath } of recordLeaves) {
      if (leafPath === "/digest") continue;              // derived; rewritten by step 2
      const result = classifyLeaf(record, fixture, segments, baseline);
      counts[result.outcome] += 1;
      totals[result.outcome] += 1;
      bucket[result.outcome] += 1;
      if (!result.outcome.startsWith("FREE")) continue;
      const key = pathClass(segments);
      if (!freeClasses.has(key)) {
        freeClasses.set(key, { pathClass: key, free: 0, caughtByGate: 0, records: new Set(), perturbations: new Set(), gatePaths: new Set() });
      }
      const entry = freeClasses.get(key);
      entry.free += 1;
      if (result.outcome === "FREE_CAUGHT_BY_PAIRWISE_GATE") entry.caughtByGate += 1;
      entry.records.add(record.observationId);
      entry.perturbations.add(`${result.perturbation.kind} -> ${JSON.stringify(result.perturbation.value)}`);
      for (const gatePath of result.gatePaths ?? []) entry.gatePaths.add(pathClassOf(gatePath));
    }

    perRecord.push({
      observationId: record.observationId,
      file,
      cited,
      fixtureId: record.target.fixtureId,
      fullRecordLeaves: recordLeaves.length,
      fullRecordLeavesCountingEmptyContainers: recordLeaves.length + empties.length,
      probeableLeaves: recordLeaves.length - 1,
      matcherProjectionLeaves: leaves(independentMatcherSurface(record)).length,
      matcherProjectionLeavesCountingEmptyContainers:
        leaves(independentMatcherSurface(record)).length + emptyContainers(independentMatcherSurface(record)).length,
      pairwiseProjectionLeaves: leaves(independentPairwiseSurface(record)).length,
      pairwiseProjectionLeavesCountingEmptyContainers:
        leaves(independentPairwiseSurface(record)).length + emptyContainers(independentPairwiseSurface(record)).length,
      emptyContainers: empties,
      counts
    });
  }

  return { perRecord, totals, totalsCited, totalsUncited, freeClasses, baselineFailures, emptyContainerPositions };
}

// ---------------------------------------------------------------------------
// The cited-pair agreement check: do the pairs the promoted goldens rest on
// still agree under `ss2ObservationsMatch`? A gate with teeth that refused a
// promotion already standing would be a defect and not a success, so this is
// measured beside the sweep rather than assumed from it.

function checkCitedPairs() {
  const pairs = [];
  let unresolved = 0;
  let notResolvableByFileName = 0;
  const fileNames = new Set(records.map(({ file }) => file.replace(/\.json$/, "")));
  for (const { json } of goldens) {
    const ids = json.provenance?.observationIds ?? [];
    for (const id of ids) if (!fileNames.has(id)) notResolvableByFileName += 1;
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const a = recordById.get(ids[left]);
        const b = recordById.get(ids[right]);
        if (!a || !b) { unresolved += 1; continue; }
        const agreement = ss2ObservationsMatch(a, b);
        pairs.push({
          fixtureId: json.fixtureId,
          left: ids[left],
          right: ids[right],
          agree: agreement.match,
          differences: agreement.differences.map((difference) => difference.path)
        });
      }
    }
  }
  return {
    goldens: goldens.length,
    pairs: pairs.length,
    agreeing: pairs.filter((pair) => pair.agree).length,
    disagreeing: pairs.filter((pair) => !pair.agree),
    unresolved,
    citedIdsNotResolvableByFileName: notResolvableByFileName
  };
}

// ---------------------------------------------------------------------------
// If the verdict is HAS TEETH, every document still calling the gate dormant is
// wrong, so the tool goes and FINDS them rather than naming line numbers that
// rot. It reports the lines; it does not judge them, and it writes nothing.

/**
 * Grepping for the word "dormant" is not enough, and an adversarial pass proved
 * it: that regex found four lines and missed every INSTRUCTION built on the
 * claim, because the instructions are phrased "precondition" and "Land no
 * exclusion before it" and never use the word. This project's own rule is that
 * a retraction at the top of a file does not reach a reader who starts at the
 * section telling them what to do, so the sites that must be corrected are
 * exactly the ones the narrow grep dropped.
 *
 * The second pattern is therefore the load-bearing one. It over-matches by
 * design — a few unrelated hits a reader can dismiss cost far less than one
 * uncorrected directive.
 */
const DORMANCY_CLAIM_PATTERNS = [
  /dormant/i,
  /\b162\b|\b142\b/,
  /can differ/i,
  /precondition/i,
  /land (any|no) (field )?exclusion/i,
  /before landing any/i
];

function findDormancyClaims() {
  const files = [
    path.join(REPO, "src/golden/promote-1v1-golden.js"),
    path.join(REPO, "src/golden/observation.js"),
    path.join(REPO, "HANDOFF.md"),
    ...(fs.existsSync(path.join(REPO, "docs/handoffs"))
      ? fs.readdirSync(path.join(REPO, "docs/handoffs")).map((name) => path.join(REPO, "docs/handoffs", name))
      : [])
  ];
  const hits = [];
  for (const file of files) {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    fs.readFileSync(file, "utf8").split("\n").forEach((line, index) => {
      if (!DORMANCY_CLAIM_PATTERNS.some((pattern) => pattern.test(line))) return;
      hits.push({ file: path.relative(REPO, file).replace(/\\/g, "/"), line: index + 1, text: line.trim().slice(0, 100) });
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Report.

function range(rows, key) {
  const sorted = [...rows].sort((l, r) => l[key] - r[key]);
  const low = sorted[0];
  const high = sorted.at(-1);
  return { min: low[key], minRecord: low.observationId, max: high[key], maxRecord: high.observationId };
}

/**
 * A leaf this measurement calls FREE is free FOR THE THREE FUNCTIONS MEASURED.
 * Some of them are policed by the promotion CLI, which this tool does not run;
 * printing the free list without saying so would read as a list of open holes.
 * Each note names the check, in `src/golden/promote-1v1-golden.js` unless the
 * file is given, so a reader can go and read it rather than trust this line.
 */
const POLICED_ELSEWHERE = new Map([
  // CORRECTED 2026-08-31 after an adversarial pass drove the real promotion
  // entry point. The first two notes here USED to name the duplicate-observation
  // check and the two-distinct-sessions check. Both were wrong in mechanism, and
  // wrong in the permissive direction: a RENAMED observationId is not a
  // duplicate, so that check never fires on this forgery, and a RENAMED
  // sessionId still yields two distinct sessions, so that check is satisfied
  // MORE easily rather than less. Measured: under a manifest rebuilt from the
  // forged records — which is what tools/runtime-capture/build-manifest.mjs
  // produces — both forgeries PROMOTE.
  ["/observationId", "the capture manifest, and ONLY when it is not rebuilt from the forged records: a renamed id is not attested, so promotion refuses it. Rebuild the manifest from the forgery and it PROMOTES. Renaming it also walks past the authored-from gate — see the free-leaf note below"],
  ["/capture/sessionId", "the capture manifest, and ONLY when it is not rebuilt from the forged records: a renamed id is not attested. Rebuild the manifest from the forgery and it PROMOTES. NOT the two-distinct-sessions check, which a rename satisfies rather than trips"],
  ["/capture/captureToolVersion", "promotion refuses a version that disagrees with the capture manifest"],
  ["/capture/method", "promotion refuses synthetic-simulator outright, and refuses a method the manifest session contradicts"],
  ["/capture/launchNonce", "promotion refuses two observations sharing a nonce; a MISSING nonce is waived only by digest (src/golden/pre-nonce-observations.js), and no repository-side check can tell a minted nonce from a typed one"],
  ["/capture/staged", "promotion refuses observations that disagree about staging"],
  ["/capture/observedAt", "NOTHING. It is read once, to stamp the golden's provenance.observedAt, and never checked"]
]);

/**
 * `validate-vehicle.ps1` was trusted past its evidence on this project and
 * caught 0 of the 6 defects found live; the correction was to make the tool
 * state its own limits. These are this tool's.
 */
const noncelessRecords = records.filter(({ record }) => record.capture.launchNonce === undefined).length;

const DOES_NOT_PROVE = [
  "It probes ONE leaf at a time. A forgery that moves two leaves together is out of scope. The " +
  "schema has at least one leaf reachable only that way — /samples/*/injected is refused on its own " +
  "(an injected-tape capture must have every sample injected) and becomes free only when " +
  "capture.method moves with it — and this tool scores it REFUSED_BY_VALIDATION, which is true of " +
  "the single-leaf perturbation and not of the forgery. MEASURED SEPARATELY, and it goes the " +
  "reassuring way: that two-leaf forgery is CAUGHT BY THE PAIRWISE GATE on all 67 records, at " +
  "/samples/*/injected, because `injected` is inside the pairwise projection even though `capture` " +
  "is not. Multi-leaf probing has so far only ever ADDED teeth, never removed them, so the " +
  "single-leaf scope is conservative with respect to the verdict.",

  "It does not change array LENGTHS, and it does not ADD OR REMOVE OBJECT KEYS. Both are forgeries " +
  "a value-perturbation walker structurally cannot express: there is no leaf to perturb at a key " +
  "that is absent. This is not hypothetical — adding the optional key capture.overdraw=0 to one " +
  "record validates, matches, is invisible to both surfaces, and PROMOTES, and no sweep of this " +
  "shape can see it. On array lengths specifically, the two surfaces count samples over different " +
  "arrays (the matcher filters cosmetic debris first, the pairwise gate does not) and nothing here " +
  "measures that gap.",

  "REFUSED_BY_VALIDATION means 'no candidate in this tool's perturbation table validated', not 'no " +
  "value exists', so the REFUSED/CAUGHT_BY_MATCHER split is ladder-dependent and approximate. THE " +
  "FREE COUNT IS NOT. It is exact for single-leaf value perturbations, and the reason is structural " +
  "rather than a property of the table: every record matches its fixture at baseline, so every " +
  "matcher-COMPARED leaf already equals its fixture counterpart and ANY different value there must " +
  "diverge. FREE is therefore exactly (matcher-blind leaf) AND (some valid perturbation exists), " +
  "the matcher-blind set is derivable from the projection shapes without probing anything, and the " +
  "blind leaves this tool scores pinned are pinned by strict-equality checks that admit no " +
  "alternative value at all. Do not repeat the weaker 'lower bound' claim this line used to make.",

  "IT DOES NOT RUN THE PROMOTION PATH, AND THAT IS THE LIMIT THAT MATTERS MOST. It measures " +
  "validateSs2Observation + matchSs2ObservationToFixture + ss2ObservationsMatch. On the real " +
  `promotion path the answer is different and worse: ${noncelessRecords} of the ${records.length} ` +
  "records carry no capture.launchNonce and are waived only by having their exact digest listed in " +
  "src/golden/pre-nonce-observations.js. THE SECOND HALF OF THIS PARAGRAPH WAS RETRACTED when the " +
  "four self-citing normal-band goldens were re-promoted. It read: 'ZERO of the observation ids " +
  "cited by the promoted goldens carries one ... the pairwise gate changes ZERO verdicts on the " +
  "corpus as committed', measured by excising the loop from a counterfactual build. That was true " +
  "of the corpus it was measured on. The goldens now cite 60 distinct records, NINE of them " +
  "nonce-bearing across four goldens, so a forgery on one of those nine reaches the pairwise loop " +
  "and the excision would change verdicts. This tool does NOT re-measure that — it never ran the " +
  "promotion path — so take the count from test/capture-campaign.test.js, which forges every cited " +
  "record of every golden and asserts which gate refuses each. What is unchanged: HAS TEETH is a " +
  "statement about the FUNCTION, and reachable is not the same as protecting anything.",

  "It matches each record against the CANDIDATE its target names, which is what the promotion path " +
  "does, so it undercounts the gate's teeth by one whole class. The matcher additionally accepts a " +
  "golden's id in place of the candidate's (candidateIdFor), so /target/fixtureId is pinned on this " +
  "path and LOOSE on the golden-match path that test/ss2-golden-fixtures.test.js exercises for " +
  "every cited observation. Measured there: rewriting /target/fixtureId from the candidate- form to " +
  "the golden- form on all 47 cited slots validates and still matches, and the pairwise gate " +
  "catches all 47. So /samples/*/callSite is the only teeth class ON THIS PATH, not the only one " +
  "that exists.",

  "A FREE leaf is a leaf on which two records COULD differ. It is not evidence that any committed " +
  "pair DOES differ there. Section 5 measures that separately, and it is why a gate can have teeth " +
  "and still refuse nothing that exists today — 'has teeth' and 'has ever fired' are different claims.",

  "READ THE VERDICT NARROWLY, BECAUSE THE ONE TEETH CLASS IS THE PROJECT'S OWN KNOWN-WEAK FIELD. " +
  "All 407 committed samples carry ONE callSite literal, and the schema says in its own words that " +
  "the wrapper has one roll emitter stamping one compile-time constant — which is why HANDOFF.md " +
  "already warns against adding a fixture-derived callSite comparison, as it 'would manufacture the " +
  "appearance of verification'. The teeth are real (a committed test fires the gate on a callSite " +
  "disagreement, and the simulator derives callSite per fixture) but they cannot bite two honest " +
  "wrapper captures, because the producer cannot emit two different values. Whether it ever could " +
  "is a runtime question about the wrapper that NO repository-side measurement can answer.",

  "AND THE GATE CATCHES DISAGREEMENT, NOT FALSEHOOD. Two records carrying the SAME fabricated " +
  "callSite agree with each other, match the candidate, and promote. So this measurement must not " +
  "be read as closing the hook-attribution forgery HANDOFF.md records: that hole is about " +
  "unfalsifiable attribution, and a pairwise comparison is structurally the wrong instrument for it " +
  "— exactly as a pairwise comparison could never have caught the copied-record forgery that had to " +
  "go through the launch nonce instead. Agreement is what this gate checks for, so anything two " +
  "forgeries can agree on is outside its reach by construction.",

  "It measures the corpus as committed today. A schema change, a new capture method, or a new field " +
  "moves every number here, which is the reason this is a tool and not a sentence in a comment."
];

/** Word-wrap for the console; the JSON emits the unwrapped sentences. */
function wrap(text, width, indent) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line.length + 1 + word.length) > width) { lines.push(line); line = indent + word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const measured = measure();
const citations = checkCitedPairs();
const dormancyClaims = findDormancyClaims();

const freeRows = [...measured.freeClasses.values()]
  .map((entry) => ({
    pathClass: entry.pathClass,
    free: entry.free,
    caughtByGate: entry.caughtByGate,
    caughtByNothing: entry.free - entry.caughtByGate,
    records: entry.records.size,
    examplePerturbations: [...entry.perturbations].slice(0, 3),
    gateReportsPaths: [...entry.gatePaths],
    policedElsewhere: POLICED_ELSEWHERE.get(entry.pathClass) ?? null
  }))
  .sort((l, r) => r.free - l.free);

const totalFree = measured.totals.FREE_CAUGHT_BY_PAIRWISE_GATE + measured.totals.FREE_CAUGHT_BY_NOTHING;
const teethClasses = freeRows.filter((row) => row.caughtByGate > 0);
const verdict = totalFree === 0
  ? "DORMANT"
  : (teethClasses.length === 0 ? "DORMANT (free leaves exist, but the gate is blind to every one)" : "HAS TEETH");

if (EMIT_JSON) {
  console.log(JSON.stringify({
    tool: "pairwise-gate-dormancy",
    recordsMeasured: measured.perRecord.length,
    recordsSkippedAtBaseline: measured.baselineFailures,
    leafDefinition: {
      leaf: "a position holding a JSON scalar",
      emptyContainerIsLeaf: false,
      emptyContainerPositions: measured.emptyContainerPositions,
      arrayLengthIsLeaf: false,
      digestProbeable: false
    },
    leafCounts: {
      fullRecord: range(measured.perRecord, "fullRecordLeaves"),
      fullRecordCountingEmptyContainers: range(measured.perRecord, "fullRecordLeavesCountingEmptyContainers"),
      probeable: range(measured.perRecord, "probeableLeaves"),
      matcherProjection: range(measured.perRecord, "matcherProjectionLeaves"),
      pairwiseProjection: range(measured.perRecord, "pairwiseProjectionLeaves")
    },
    classification: { all: measured.totals, citedByAGolden: measured.totalsCited, notCited: measured.totalsUncited },
    freePathClasses: freeRows,
    verdict,
    dormancyClaimsStillInTheRepository: dormancyClaims,
    citedPairs: citations,
    perRecord: measured.perRecord,
    doesNotProve: DOES_NOT_PROVE
  }, null, 2));
} else {
  const pct = (n) => `${((100 * n) / Math.max(1, Object.values(measured.totals).reduce((a, b) => a + b, 0))).toFixed(1)}%`;
  console.log("pairwise-gate-dormancy — is the promotion gate's pairwise agreement check dormant?\n");
  console.log(`corpus: ${records.length} observation records in test/observations/ss2-1v1`);
  console.log(`        ${fixtures.size} fixtures indexed by fixtureId field (${goldens.length} promoted goldens)`);
  console.log(`        ${measured.perRecord.length} measured; ${measured.perRecord.filter((r) => r.cited).length} cited by a promoted golden, ` +
    `${measured.perRecord.filter((r) => !r.cited).length} not cited`);
  if (measured.baselineFailures.length) {
    console.log(`        ${measured.baselineFailures.length} SKIPPED at baseline (a record that does not already match its`);
    console.log("        candidate cannot produce a FREE leaf, so scoring it would inflate CAUGHT_BY_MATCHER):");
    for (const failure of measured.baselineFailures) console.log(`          ${failure.observationId}: ${failure.why}`);
  } else {
    console.log("        baseline: every measured record validates AND matches its candidate before perturbation");
  }
  console.log();

  console.log("1. LEAF COUNTS PER SURFACE  (per-record ranges; a leaf is a JSON scalar position,");
  console.log("   an empty array/object is not a leaf, array length is not a leaf)");
  for (const [label, key] of [
    ["full record             ", "fullRecordLeaves"],
    ["probeable (minus digest)", "probeableLeaves"],
    ["matcher projection      ", "matcherProjectionLeaves"],
    ["pairwise projection     ", "pairwiseProjectionLeaves"]
  ]) {
    const row = range(measured.perRecord, key);
    console.log(`   ${label} ${String(row.min).padStart(4)} (${row.minRecord})  ..  ${String(row.max).padStart(4)} (${row.maxRecord})`);
  }
  console.log(`   empty-container positions across the corpus: ${measured.emptyContainerPositions} (unprobed).`);
  console.log("   Counting them as leaves — the other defensible choice — gives instead:");
  for (const [label, key] of [
    ["full record             ", "fullRecordLeavesCountingEmptyContainers"],
    ["matcher projection      ", "matcherProjectionLeavesCountingEmptyContainers"],
    ["pairwise projection     ", "pairwiseProjectionLeavesCountingEmptyContainers"]
  ]) {
    const row = range(measured.perRecord, key);
    console.log(`     ${label} ${String(row.min).padStart(4)} (${row.minRecord})  ..  ${String(row.max).padStart(4)} (${row.maxRecord})`);
  }
  console.log();

  const grand = Object.values(measured.totals).reduce((a, b) => a + b, 0);
  console.log(`2. PERTURBATION CLASSIFICATION  (${grand} single-leaf perturbations)`);
  console.log("                                        all     cited   uncited");
  for (const name of CLASSES) {
    console.log(`   ${name.padEnd(30)} ${String(measured.totals[name]).padStart(7)} ${String(measured.totalsCited[name]).padStart(7)} ` +
      `${String(measured.totalsUncited[name]).padStart(9)}   ${pct(measured.totals[name])}`);
  }
  console.log(`   ${"FREE (either kind)".padEnd(30)} ${String(totalFree).padStart(7)}`);
  console.log();

  console.log("3. PATH CLASSES WHERE A PERTURBATION CAME OUT FREE");
  if (freeRows.length === 0) console.log("   (none)");
  for (const row of freeRows) {
    const gate = row.caughtByGate === row.free ? "GATE CATCHES ALL"
      : row.caughtByGate === 0 ? "gate blind" : `gate catches ${row.caughtByGate}/${row.free}`;
    console.log(`   ${row.pathClass.padEnd(28)} ${String(row.free).padStart(4)} free leaves over ${String(row.records).padStart(2)} records   ${gate}`);
    console.log(`      perturbation used: ${row.examplePerturbations.join(" | ")}`);
    if (row.gateReportsPaths.length) console.log(`      gate reports at:   ${row.gateReportsPaths.join(", ")}`);
    if (row.policedElsewhere) console.log(`      outside this measurement, on the promotion path: ${row.policedElsewhere}`);
  }
  console.log();

  console.log(`4. VERDICT: ${verdict}`);
  if (teethClasses.length) {
    console.log(`   The gate refuses a forgery no other check refuses on: ${teethClasses.map((row) => row.pathClass).join(", ")}.`);
  }
  const holes = freeRows.filter((row) => row.caughtByNothing > 0);
  if (holes.length) {
    console.log(`   Neither check closes: ${holes.map((row) => `${row.pathClass} (${row.caughtByNothing})`).join(", ")}.`);
  }
  if (totalFree > 0 && dormancyClaims.length) {
    console.log(`   ${dormancyClaims.length} line(s) assert the dormancy claim or build an instruction on it.`);
    console.log("   This tool finds them and edits none. Read each one — the pattern set over-matches");
    console.log("   deliberately, and a hit is a site to CHECK, not a site known to be wrong. Sites under");
    console.log("   docs/handoffs/ are frozen records of what was believed then and must NOT be edited;");
    console.log("   correct those in HANDOFF.md and in the next handoff instead.");
    for (const claim of dormancyClaims) console.log(`      ${claim.file}:${claim.line}  ${claim.text}`);
  }
  console.log();

  console.log("5. CITED-PAIR AGREEMENT  (does the gate refuse any promotion that already stands?)");
  console.log(`   ${citations.goldens} promoted goldens, ${citations.pairs} cited observation pairs, ` +
    `${citations.agreeing} agree, ${citations.disagreeing.length} disagree, ${citations.unresolved} unresolvable`);
  console.log(`   ${citations.citedIdsNotResolvableByFileName} cited id(s) do not match a file NAME and resolve only by the observationId field`);
  for (const pair of citations.disagreeing) {
    console.log(`   DISAGREE ${pair.fixtureId}: ${pair.left} vs ${pair.right} at ${pair.differences.join(", ")}`);
  }
  console.log();

  console.log("WHAT THIS DOES NOT PROVE");
  for (const item of DOES_NOT_PROVE) {
    for (const line of wrap(`-- ${item}`, 94, "   ")) console.log(`   ${line}`);
  }
}
