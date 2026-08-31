#!/usr/bin/env node
/**
 * Capture-campaign driver: the bookkeeping half of the golden loop.
 *
 * `run-capture.ps1` produces one unattended session's raw log. Which
 * candidate that log is evidence for is not known until it has been read:
 * the wrapper observes `attack_direction` rather than forcing it, so a run
 * of the same staged scenario lands on whichever direction the game chose.
 * This driver closes that loop:
 *
 *   ingest-round  delog one session's log, ingest it against every fixture
 *                 in the family, keep the one that MATCHES, and install the
 *                 observation record under test/observations/
 *   plan          report per-member evidence coverage, the campaign shape, and
 *                 the derived reason each uncaptured member is not captured yet
 *   watch-fields  print the `-WatchFields` string a round of this family needs
 *   settle        build the capture manifest and promote every member
 *                 that has >= 2 matching observations from >= 2 sessions
 *
 * A "family" is the set of candidate fixtures whose ids share a
 * `-`-delimited id segment (`--family armour` is `candidate-armour` and
 * `candidate-armour-*`, never `candidate-armoured-*`) and differ only in
 * their action identity — the fixtures a single staged scenario can produce.
 * The action identity is the attack direction for the physical ingress and
 * the spell id for the spell ingress; see `actionIdentityFor`. Selecting the
 * fixture by matching, rather than by parsing an identity out of the trace,
 * means a run is only ever filed as evidence for a candidate it agrees with
 * in full.
 *
 * A family of ONE is a first-class campaign, not a workaround. Most of the
 * uncaptured candidates cannot share a round with their siblings — the five
 * `candidate-armoured-*` all stage attack direction 5 with different injected
 * samples, and so do the three `candidate-tournament-*` — so `--family
 * <whole-fixture-id-without-the-candidate-prefix>` is the ordinary way to run
 * them, and `plan` says which shape a family has rather than leaving an
 * operator to discover it from a refusal. `campaignShapeFor` derives that:
 * one round can serve a family only when no two members claim one action
 * identity AND every member's injectable tape is byte-identical.
 *
 * Everything `plan` reports about *why* a member is uncaptured is derived from
 * files in this repository, never transcribed from a runbook:
 *
 *   - the wrapper's `DEFAULT_WATCH_FIELDS` and the event types it can emit are
 *     parsed out of `tools/runtime-capture/ss2-capture-wrapper.as`;
 *   - which launcher exposes `-WatchFields` and which exposes `-Stage*` is
 *     parsed out of the launchers' own `param(...)` blocks;
 *   - the extra watch fields a fixture needs are the fields its own staged
 *     scenario names that the default list omits;
 *   - the fight modes already in the archive are read off the committed
 *     runtime observations.
 *
 * So each of those answers moves when the repository moves. Nothing here says
 * a fixture IS reachable: absence of a derived blocker is absence of evidence,
 * and `plan` words it that way.
 *
 * Nothing here fabricates evidence. Observations come from
 * `ingestSs2CaptureTrace`, matching from `matchSs2ObservationToFixture`,
 * manifests from the observation records, and promotion from the same
 * `promoteSs2CandidateToGolden` gate the CLI uses. Divergences are written
 * out, never dropped.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  extractCaptureTraceFromRuffleLog,
  verifyInstallAgainstFingerprint,
  wrapperTapeForFixture
} from "../capture-session.mjs";
import { ingestSs2CaptureTrace } from "../../src/golden/capture-ingest.js";
import {
  SS2_SIMULATED_CAPTURE_METHOD,
  deriveExpectedEventsFromSs2Fixture,
  matchSs2ObservationToFixture,
  validateSs2Observation
} from "../../src/golden/observation.js";
import {
  PromotionBlockedError,
  buildSs2DivergenceReport,
  goldenFixtureIdFor,
  promoteSs2CandidateToGolden
} from "../../src/golden/promote-1v1-golden.js";
import { validateSs2OneVsOneFixture } from "../../src/golden/run-1v1-fixture.js";
import { buildSs2CaptureManifest } from "./build-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANDIDATE_DIR = path.join(ROOT, "test", "fixtures", "ss2-1v1");
const GOLDEN_DIR = path.join(ROOT, "test", "fixtures", "ss2-1v1-golden");
const DIVERGENCE_DIR = path.join(ROOT, "test", "fixtures", "ss2-1v1-divergences");
const OBSERVATION_DIR = path.join(ROOT, "test", "observations", "ss2-1v1");
const MANIFEST_DIR = path.join(ROOT, "test", "manifests");
const CAPTURES_DIR = path.join(ROOT, "captures");
const LAUNCHER_DIR = path.join(ROOT, "tools", "runtime-capture");
const WRAPPER_SOURCE_PATH = path.join(LAUNCHER_DIR, "ss2-capture-wrapper.as");

/** The promotion gate's independence rule, stated once. */
const REQUIRED_OBSERVATIONS = 2;
const REQUIRED_SESSIONS = 2;

/**
 * The launchers a capture can be driven from, in the order an operator would
 * reach for them. Their capabilities are not listed here: they are read out of
 * each script's own `param(...)` block by `captureVehicles`, because a table of
 * capabilities kept in this file is a table that goes stale the first time a
 * launcher gains a flag.
 */
const VEHICLE_SCRIPTS = Object.freeze([
  "run-campaign.ps1",
  "run-capture.ps1",
  "run-arena.ps1",
  "launch-capture.ps1"
]);

/**
 * Fields the wrapper dumps WITHOUT watching them, so a fixture may stage them
 * without extending the watch list.
 *
 * `gladiator_dir` lives on the fighter clip rather than the stat object, and
 * `dumpSide` reads it from the clip after the watch loop. It is also the one
 * field `-Stage*` could never write (the wrapper's `parseStageList` refuses a
 * non-numeric value), which is why it is excluded from the unstageable-field
 * check too: the fixtures observe it, they do not ask for it to be staged.
 */
const CLIP_DUMPED_FIELDS = Object.freeze(new Set(["gladiator_dir"]));

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

async function writeJson(filePath, value, { overwrite = true } = {}) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: overwrite ? "w" : "wx"
  });
}

async function readJsonDir(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const entries = [];
  for (const name of names.filter((candidate) => candidate.endsWith(".json"))) {
    entries.push({ name, filePath: path.join(directory, name), value: await readJson(path.join(directory, name)) });
  }
  return entries;
}

/** Same naming rule the CLI uses, so reports never collide. */
function divergenceReportPath(fixtureId, observationId) {
  const suffix = createHash("sha256")
    .update(`${fixtureId}\n${observationId}`, "utf8")
    .digest("hex")
    .slice(0, 8);
  const token = (value) => value.replace(/[^A-Za-z0-9._-]/g, "-");
  return path.join(DIVERGENCE_DIR, `${token(fixtureId)}--${token(observationId)}-${suffix}.json`);
}

// ---------------------------------------------------------------------------
// What the vehicle can do, read off the vehicle
//
// The driver has to answer two questions it cannot answer from a fixture
// alone: which fields the wrapper already watches, and which semantic events
// it is able to emit. Both are properties of one file — the wrapper source —
// and both are load-bearing enough that a stale copy here would be worse than
// no answer at all. So they are parsed from the source, and the parse fails
// loudly rather than falling back to a default.
// ---------------------------------------------------------------------------

let wrapperSourcePromise;
function readWrapperSource() {
  wrapperSourcePromise ??= readFile(WRAPPER_SOURCE_PATH, "utf8").catch((error) => {
    wrapperSourcePromise = undefined;
    throw new Error(
      `Cannot read the capture wrapper at ${WRAPPER_SOURCE_PATH}: ${error.message}. The driver ` +
      "derives the default watch list and the emittable event types from the wrapper itself " +
      "rather than carrying a copy of either, so it cannot answer without it."
    );
  });
  return wrapperSourcePromise;
}

/** ActionScript line comments, removed so a `//` aside cannot be scanned. */
const stripLineComments = (text) => text.replace(/\/\/[^\n]*/g, "");

/**
 * The wrapper's `DEFAULT_WATCH_FIELDS`, parsed from its own array literal.
 *
 * This is the list `-WatchFields` EXTENDS (the wrapper concatenates and
 * de-duplicates), so a fixture needs an extra watch field exactly when it
 * stages a name this list omits.
 */
async function wrapperDefaultWatchFields() {
  const block = /var\s+DEFAULT_WATCH_FIELDS\s*=\s*\[([\s\S]*?)\]\s*;/.exec(await readWrapperSource());
  if (!block) {
    throw new Error(
      `${WRAPPER_SOURCE_PATH} no longer declares "var DEFAULT_WATCH_FIELDS = [ ... ];". The driver ` +
      "reads the default watch list from that literal; it will not guess at one."
    );
  }
  const names = [...stripLineComments(block[1]).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  if (names.length === 0) {
    throw new Error(`${WRAPPER_SOURCE_PATH} declares an empty DEFAULT_WATCH_FIELDS literal.`);
  }
  return names;
}

/**
 * The semantic event types the wrapper is able to emit, parsed from its own
 * `emit({ t: "event", type: "<name>", ... })` calls.
 *
 * `deriveExpectedEventsFromSs2Fixture` says which types a fixture's ingress
 * must produce. A type on that list that appears nowhere in the wrapper is a
 * tooling gap rather than a staging problem, and it is the one blocker an
 * operator cannot work around with a flag — so it is worth naming precisely,
 * and worth re-deriving every run so that it disappears by itself on the day
 * the wrapper gains the emit.
 */
async function wrapperEmittedEventTypes() {
  const source = stripLineComments(await readWrapperSource());
  const types = new Set();
  for (const match of source.matchAll(/t:\s*"event"\s*,\s*type:\s*"([^"]+)"/g)) types.add(match[1]);
  if (types.size === 0) {
    throw new Error(
      `${WRAPPER_SOURCE_PATH} contains no 'emit({ t: "event", type: "..." })' call. The driver reads ` +
      "the emittable event types from those calls; an empty set would blame every fixture."
    );
  }
  return types;
}

/**
 * Which launcher exposes `-WatchFields`, and which exposes `-StageHero` /
 * `-StageVillain`, read from each script's `param(...)` declarations.
 *
 * The gap between the two is the operational fact a fixture needing both runs
 * into, and it is a fact about the scripts, so it is read from the scripts.
 */
async function captureVehicles() {
  const vehicles = [];
  for (const name of VEHICLE_SCRIPTS) {
    let text;
    try {
      text = await readFile(path.join(LAUNCHER_DIR, name), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    vehicles.push({
      script: `tools/runtime-capture/${name}`,
      watchFields: /\[string\]\s*\$WatchFields\b/.test(text),
      staging: /\[string\]\s*\$Stage(?:Hero|Villain)\b/.test(text)
    });
  }
  return vehicles;
}

/**
 * The `-WatchFields` names one fixture needs on top of the wrapper's default
 * list: every field its own staged scenario names that the default omits.
 *
 * Ingest projects `Object.keys(fixture.scenario.<side>)` out of the staged
 * dump and refuses the trace when one is absent, and `dumpSide` writes exactly
 * the watched fields (plus the clip-read `gladiator_dir`). So this set is not a
 * roster to be maintained — it is those two rules composed, and it is right by
 * construction for a fixture that does not exist yet.
 */
function extraWatchFieldsFor(fixture, defaultWatchFields) {
  const known = new Set(defaultWatchFields);
  const extra = new Set();
  for (const side of ["hero", "villain"]) {
    for (const field of Object.keys(fixture?.scenario?.[side] ?? {})) {
      if (CLIP_DUMPED_FIELDS.has(field) || known.has(field)) continue;
      extra.add(field);
    }
  }
  return [...extra].sort();
}

/**
 * Scenario fields `-StageHero` / `-StageVillain` cannot write.
 *
 * The wrapper's `parseStageList` refuses any value that is not a number — it
 * traces `stage-refused` and moves on, because `check_for_nan` jumps the root
 * timeline to an error screen on a NaN `herolevel`. So a fixture staging a
 * boolean status flag has no staging route to that field at all, and the run
 * would surface as a state mismatch rather than as anything naming the cause.
 */
function unstageableScenarioFieldsFor(fixture) {
  const unstageable = [];
  for (const side of ["hero", "villain"]) {
    for (const [field, value] of Object.entries(fixture?.scenario?.[side] ?? {})) {
      if (CLIP_DUMPED_FIELDS.has(field)) continue;
      if (typeof value !== "number") unstageable.push({ side, field, value });
    }
  }
  return unstageable;
}

/**
 * The reasons, derived from this repository, that a round for this fixture
 * would not produce filed evidence today.
 *
 * `blockers` are refusals waiting to happen: each one names what would go
 * wrong and, where a flag fixes it, the flag. `notes` are facts an operator
 * should know that are not refusals. An empty `blockers` list means "nothing
 * in the repository says this cannot be captured" — which is not the same
 * claim as "this is reachable", and `plan` prints it as the former.
 */
function deriveBlockers(fixture, context) {
  const { defaultWatchFields, emittedEventTypes, observedFightModes, runtimeObservationCount } = context;
  const blockers = [];
  const notes = [];

  const requiredEvents = [...new Set(deriveExpectedEventsFromSs2Fixture(fixture).map((event) => event.type))];
  const unemittable = requiredEvents.filter((type) => !emittedEventTypes.has(type));
  if (unemittable.length > 0) {
    blockers.push({
      code: "wrapper-emits-no-event",
      fields: unemittable,
      detail:
        `the wrapper emits no ${unemittable.join(", ")} event, and this fixture's ingress needs it ` +
        "(deriveExpectedEventsFromSs2Fixture). No flag reaches this; it is a wrapper change."
    });
  }

  const unstageable = unstageableScenarioFieldsFor(fixture);
  if (unstageable.length > 0) {
    blockers.push({
      code: "unstageable-field",
      fields: unstageable.map((entry) => `${entry.side}.${entry.field}`),
      detail:
        "-StageHero/-StageVillain write numbers only (the wrapper's parseStageList refuses a " +
        `non-numeric value), so ${unstageable
          .map((entry) => `${entry.side}.${entry.field}=${JSON.stringify(entry.value)}`)
          .join(", ")} cannot be staged.`
    });
  }

  const extraWatchFields = extraWatchFieldsFor(fixture, defaultWatchFields);
  if (extraWatchFields.length > 0) {
    blockers.push({
      code: "needs-watch-fields",
      fields: extraWatchFields,
      detail:
        `ingest refuses a trace whose staged dump omits a field the fixture stages; pass ` +
        `-WatchFields "${extraWatchFields.join(",")}".`
    });
  }

  const fightMode = fixture?.scenario?.fightMode;
  if (fightMode !== undefined && !observedFightModes.has(fightMode)) {
    notes.push({
      code: "unobserved-fight-mode",
      detail:
        `no runtime observation records fight_mode "${fightMode}" yet (${runtimeObservationCount} ` +
        `runtime observations carry ${[...observedFightModes].sort().map((mode) => `"${mode}"`).join(", ") ||
          "no mode at all"}). A mode mismatch on the first such run is a finding, not a failed run.`
    });
  }

  return { blockers, notes, extraWatchFields };
}

/**
 * The action identity of one scenario — a fixture's, or an ingested
 * observation's.
 *
 * `validateSs2OneVsOneFixture` enforces exactly one action identity per
 * scenario, and `ingestSs2CaptureTrace` projects whichever one the target
 * fixture stages, so the same rule reads both sides:
 *
 *   physical ingress  `attackDirection` — the dispatcher and the death chain
 *                     both read the `attack_direction` global
 *   spell ingress     `spellId` — `magic_damage_character` has no direction
 *                     chain at all, and the wrapper emits `spell_id` instead
 *
 * This is the family's index key. Indexing on `attackDirection` alone was a
 * defect rather than a simplification: a spell family carries no direction,
 * so every member collapsed onto the single key `undefined` and the family
 * looked malformed (or, at one member, resolved by accident).
 */
function actionIdentityFor(scenario, describe) {
  const direction = scenario?.attackDirection;
  const spellId = scenario?.spellId;
  if ((direction === undefined) === (spellId === undefined)) {
    throw new Error(
      `${describe} must carry exactly one action identity: attackDirection for the physical ` +
      "ingress or spellId for the spell ingress."
    );
  }
  return direction === undefined
    ? { ingress: "spell", id: spellId, key: `spell-id:${spellId}`, label: `spell id ${spellId}` }
    : {
      ingress: "attack",
      id: direction,
      key: `attack-direction:${direction}`,
      label: `attack direction ${direction}`
    };
}

/** Stable member order: physical ingress first, then by numeric identity. */
const INGRESS_ORDER = Object.freeze(["attack", "spell"]);
function compareActions(left, right) {
  const byIngress = INGRESS_ORDER.indexOf(left.ingress) - INGRESS_ORDER.indexOf(right.ingress);
  return byIngress !== 0 ? byIngress : left.id - right.id;
}

/**
 * Is `fixtureId` a member of family `family`?
 *
 * Membership is `candidate-<family>` exactly, or `candidate-<family>-<rest>`:
 * a `-`-delimited segment boundary rather than a raw string prefix. The raw
 * prefix test this replaces is a live collision in this repository, not a
 * hypothetical — `--family armour` swept the five `candidate-armoured-*`
 * fixtures along with the three `candidate-armour-*` ones, so a campaign
 * staged unarmoured would have ingested every round against armoured
 * candidates too. The exact-match arm is what keeps a whole candidate id
 * usable as a one-member family (`--family prisoner-normal-kill-dir6`), and
 * what keeps `candidate-prisoner-normal-kill` — the unsuffixed direction-7
 * member — inside its own family.
 */
function isFamilyMember(fixtureId, family) {
  if (typeof fixtureId !== "string") return false;
  const prefix = `candidate-${family}`;
  if (!fixtureId.startsWith(prefix)) return false;
  return fixtureId.length === prefix.length || fixtureId.charAt(prefix.length) === "-";
}

/**
 * Read the candidate fixtures of one family off disk, in stable action order.
 * Membership only: the uniqueness invariant belongs to `loadFamily`, so this
 * still answers "which fixtures did `--family <f>` name?" for a family whose
 * members are not mutually distinguishable.
 */
async function readFamilyMembers(family) {
  if (typeof family !== "string" || family.length === 0) {
    throw new Error("A family name is required (--family <name>).");
  }
  const members = [];
  for (const entry of await readJsonDir(CANDIDATE_DIR)) {
    const fixture = entry.value;
    if (!isFamilyMember(fixture.fixtureId, family)) continue;
    validateSs2OneVsOneFixture(fixture);
    members.push({
      fixture,
      filePath: entry.filePath,
      action: actionIdentityFor(fixture.scenario, fixture.fixtureId)
    });
  }
  if (members.length === 0) {
    throw new Error(
      `No candidate fixtures match family prefix "candidate-${family}"; a member id must be ` +
      "exactly that or continue with a \"-\" segment boundary."
    );
  }
  // Ties broken on the fixture id, not left to readdir. A family whose members
  // share an action identity is now reported on rather than refused, so the
  // tie is reachable — and an order that depends on how a filesystem
  // enumerates would make `plan --json`, the collision list and the refusal
  // message all differ between machines for the same repository.
  members.sort((a, b) =>
    compareActions(a.action, b.action) ||
    (a.fixture.fixtureId < b.fixture.fixtureId ? -1 : a.fixture.fixtureId > b.fixture.fixtureId ? 1 : 0));
  return members;
}

/**
 * Load the candidate fixtures of one family, indexed by action identity.
 *
 * Two members claiming one identity is a repository error, not something to
 * guess about: it is the key `ingest-round` files a divergence report under,
 * so an ambiguous index means a divergent run has no single candidate to be
 * reported against. Families whose members share an identity — the ten
 * `candidate-probe-*` arms, the five `candidate-armoured-*` scenarios, the
 * eight `candidate-spell-*` ones — are not single-tape campaign families in
 * the first place (`seed` refuses them too, since their tapes differ); they
 * are run one candidate at a time, as one-member families.
 */
async function loadFamily(family) {
  const members = await readFamilyMembers(family);
  const byActionKey = new Map();
  for (const member of members) {
    const clash = byActionKey.get(member.action.key);
    if (clash !== undefined) {
      throw new Error(
        `Family "${family}" has two fixtures for ${member.action.label}: ` +
        `${clash.fixture.fixtureId} and ${member.fixture.fixtureId}. ` +
        "Family members must be distinguishable by the action identity a trace records. " +
        "Run them one candidate at a time instead — a whole fixture id is a one-member " +
        `family: --family ${oneFixtureFamilyName(member.fixture.fixtureId)}`
      );
    }
    byActionKey.set(member.action.key, member);
  }
  return { family, members, byActionKey };
}

/**
 * The `--family` argument that names exactly one fixture.
 *
 * `isFamilyMember`'s exact-match arm is what makes this work: `candidate-` +
 * the family name, matched whole, is the fixture id itself. So the one-fixture
 * mode needs no separate flag and no separate code path — it is the ordinary
 * family rule applied to a name that happens to select one member.
 */
function oneFixtureFamilyName(fixtureId) {
  return fixtureId.replace(/^candidate-/, "");
}

/**
 * Can one campaign round serve this whole family, or must its members be run
 * one at a time?
 *
 * Two independent requirements, and the driver already enforces both — this
 * only states them BEFORE an operator hits the refusal:
 *
 *   - `loadFamily` needs every member to claim a distinct action identity,
 *     because that key is what a divergent round is reported against;
 *   - `seed` needs every member's injectable tape to be byte-identical,
 *     because injection is tape-positional and one round serves them all.
 *
 * Neither is a defect when it refuses the armoured, tournament, champion,
 * probe or spell families: those really are several different fights that
 * share an id stem, and each has to be its own round.
 */
function campaignShapeFor(members) {
  const byActionKey = new Map();
  for (const member of members) {
    const bucket = byActionKey.get(member.action.key);
    if (bucket === undefined) byActionKey.set(member.action.key, [member]);
    else bucket.push(member);
  }
  const actionIdentityCollisions = [...byActionKey.values()]
    .filter((bucket) => bucket.length > 1)
    .map((bucket) => ({
      key: bucket[0].action.key,
      label: bucket[0].action.label,
      fixtureIds: bucket.map((member) => member.fixture.fixtureId)
    }));

  const tapes = new Map(
    members.map((member) => [member.fixture.fixtureId, wrapperTapeForFixture(member.fixture)])
  );
  const distinctTapes = new Set(tapes.values()).size;

  return {
    memberCount: members.length,
    oneFixture: members.length === 1,
    actionIdentityCollisions,
    distinctTapes,
    // One round can serve the family only when both invariants hold. For a
    // one-member family both hold trivially, which is precisely why the
    // one-fixture mode works without special-casing.
    singleRound: actionIdentityCollisions.length === 0 && distinctTapes === 1,
    oneFixtureFamilies: members.map((member) => oneFixtureFamilyName(member.fixture.fixtureId))
  };
}

async function loadObservations() {
  const entries = await readJsonDir(OBSERVATION_DIR);
  return entries.map((entry) => ({ ...entry, value: validateSs2Observation(entry.value) }));
}

async function loadGoldenIds() {
  const entries = await readJsonDir(GOLDEN_DIR);
  return new Set(entries.map((entry) => entry.value.fixtureId));
}

/**
 * Evidence coverage for one family: which committed observations match each
 * member's candidate, how many independent sessions back it, whether a
 * golden already exists, whether the promotion gate would pass now, and the
 * derived reason an uncaptured member is still uncaptured.
 *
 * Deliberately built on `readFamilyMembers`, not on `loadFamily`.
 *
 * Coverage is a per-member report: each row is one fixture matched against the
 * committed observations, and nothing in it consults the action-identity
 * index. Requiring that index here meant `plan --family armoured` — and
 * champion, and tournament, and probe, and spell — refused to report anything
 * at all, because those families share an attack direction across members.
 * The uniqueness invariant is real, but it belongs to the two commands that
 * actually depend on it: `ingest-round`, which files a divergence under the
 * identity key, and `seed`, which serves one tape to every member. Refusing to
 * REPORT on a family that cannot be one campaign hid exactly the report an
 * operator needs in order to plan it as several. The shape is reported
 * instead, by `campaignShapeFor`.
 *
 * What keeps `settle` safe without that index is a stronger rule than the
 * index ever was: `matchSs2ObservationToFixture` compares
 * `observation.target.fixtureId` against the fixture id, so one observation
 * can never be counted as evidence for two different candidates however their
 * action identities collide. Promotion therefore still rests on evidence
 * aimed at exactly the candidate being promoted.
 */
async function computeCoverage(family) {
  const members = await readFamilyMembers(family);
  const observations = await loadObservations();
  const goldenIds = await loadGoldenIds();
  const defaultWatchFields = await wrapperDefaultWatchFields();
  const emittedEventTypes = await wrapperEmittedEventTypes();

  // The archive's own record of what has been observed at runtime. Simulated
  // reference traces are excluded: they are generated from the fixture, so
  // counting one as an observation of its own fight mode would be circular.
  const runtimeObservations = observations.filter(
    (observation) => observation.value.capture.method !== SS2_SIMULATED_CAPTURE_METHOD
  );
  const observedFightModes = new Set(
    runtimeObservations
      .map((observation) => observation.value.scenario.fightMode)
      .filter((mode) => mode !== undefined)
  );
  const blockerContext = {
    defaultWatchFields,
    emittedEventTypes,
    observedFightModes,
    runtimeObservationCount: runtimeObservations.length
  };

  const rows = members.map((member) => {
    const matching = observations.filter(
      (observation) => matchSs2ObservationToFixture(member.fixture, observation.value).match
    );
    const sessions = new Set(matching.map((observation) => observation.value.capture.sessionId));
    const goldenId = goldenFixtureIdFor(member.fixture.fixtureId);
    const hasGolden = goldenIds.has(goldenId);
    const { blockers, notes, extraWatchFields } = deriveBlockers(member.fixture, blockerContext);
    return {
      // The whole identity, not just its value: a reader of `plan --json`
      // has to be able to tell a spell id from an attack direction, and the
      // key is what `ingest-round` looks a divergence target up by.
      action: member.action,
      fixtureId: member.fixture.fixtureId,
      fixturePath: member.filePath,
      goldenId,
      hasGolden,
      observations: matching.map((observation) => ({
        observationId: observation.value.observationId,
        sessionId: observation.value.capture.sessionId,
        filePath: observation.filePath
      })),
      sessionCount: sessions.size,
      promotable:
        !hasGolden &&
        matching.length >= REQUIRED_OBSERVATIONS &&
        sessions.size >= REQUIRED_SESSIONS,
      // The `-WatchFields` value a round for THIS fixture needs, and why a
      // round would not file evidence today. Reported for promoted members
      // too, rather than suppressed: a promoted golden with a derived blocker
      // would mean the derivation is wrong, and hiding it would hide that.
      extraWatchFields,
      blockers,
      notes
    };
  });
  const campaign = campaignShapeFor(members);
  return { family, rows, campaign, vehicles: await captureVehicles() };
}

function printCoverage(coverage) {
  console.log(`Family "${coverage.family}" — evidence coverage`);
  // The fixture id leads the row. The action label alone stopped being a
  // unique row identifier the moment coverage started reporting on families
  // whose members share one — which is most of the uncaptured set.
  const width = Math.max(0, ...coverage.rows.map((row) => row.fixtureId.length));
  for (const row of coverage.rows) {
    const state = row.hasGolden
      ? "GOLDEN"
      : row.promotable
        ? "PROMOTABLE"
        : `needs ${Math.max(0, REQUIRED_OBSERVATIONS - row.observations.length)} more`;
    const cited = row.observations
      .map((observation) => `${observation.observationId}@${observation.sessionId}`)
      .join(", ") || "-";
    console.log(
      `  ${row.fixtureId.padEnd(width)}  ${row.action.label}  ${state.padEnd(12)} ` +
      `obs ${row.observations.length} / sessions ${row.sessionCount}  [${cited}]`
    );
    if (row.hasGolden) continue;
    for (const blocker of row.blockers) console.log(`      blocked (${blocker.code}): ${blocker.detail}`);
    if (row.blockers.length === 0) {
      // Not "reachable". Absence of a derived blocker is absence of evidence:
      // the driver cannot see a staged save, a snapshot, or a controller gate.
      console.log("      no blocker derivable from the repository; the run itself is the test.");
    }
    for (const note of row.notes) console.log(`      note (${note.code}): ${note.detail}`);
  }
  const remaining = coverage.rows.filter((row) => !row.hasGolden).length;
  console.log(remaining === 0
    ? "  every member of this family is a promoted golden."
    : `  ${remaining} member(s) still short of a golden.`);
  printCampaignShape(coverage);
}

/** The one-round-or-one-at-a-time verdict, and what to type for each. */
function printCampaignShape(coverage) {
  const { campaign, vehicles } = coverage;
  if (campaign.oneFixture) {
    console.log("  campaign shape: ONE-FIXTURE — a whole fixture id is a family of one; " +
      "plan, seed, watch-fields, ingest-round and settle all serve it unchanged.");
  } else if (campaign.singleRound) {
    console.log(`  campaign shape: SINGLE-ROUND — ${campaign.memberCount} members, ` +
      "distinct action identities, one shared tape. run-campaign.ps1 can drive the whole family.");
  } else {
    const why = [];
    for (const collision of campaign.actionIdentityCollisions) {
      why.push(`${collision.fixtureIds.length} fixtures claim ${collision.label} ` +
        `(${collision.fixtureIds.join(", ")})`);
    }
    if (campaign.distinctTapes > 1) {
      why.push(`${campaign.distinctTapes} distinct injectable tapes across ${campaign.memberCount} members`);
    }
    console.log(`  campaign shape: ONE AT A TIME — ${why.join("; ")}.`);
    console.log(`    run each member as its own family: ${campaign.oneFixtureFamilies
      .map((name) => `--family ${name}`).join("  ")}`);
  }

  const needsWatch = coverage.rows.filter((row) => !row.hasGolden && row.extraWatchFields.length > 0);
  if (needsWatch.length === 0) return;
  const name = (vehicle) => vehicle.script;
  const withWatch = vehicles.filter((vehicle) => vehicle.watchFields).map(name);
  const withBoth = vehicles.filter((vehicle) => vehicle.watchFields && vehicle.staging).map(name);
  console.log(`  ${needsWatch.length} member(s) need -WatchFields. Exposed by: ${withWatch.join(", ") || "nothing"}.`);
  console.log(`    also exposing -StageHero/-StageVillain: ${withBoth.join(", ") || "NOTHING — " +
    "a fixture needing both has no wrapper script"}.`);
}

/**
 * Ingest a raw trace against one fixture, applying the same live
 * post-session hash check the CLI applies to wrapper traces (whose end line
 * carries the null attestation placeholder).
 */
async function ingestAgainst(rawText, fixture) {
  try {
    return ingestSs2CaptureTrace(rawText, fixture);
  } catch (error) {
    if (!/null after-attestation placeholder/.test(error.message)) throw error;
    const check = await verifyInstallAgainstFingerprint();
    if (!check.ok) {
      throw new Error(
        "Post-session hash verification FAILED: the installed build no longer matches the pinned " +
        "fingerprint, so this trace cannot be ingested as evidence."
      );
    }
    return ingestSs2CaptureTrace(rawText, fixture, { installHashVerifiedAfter: true });
  }
}

/**
 * Turn one finished session's Ruffle log into filed evidence.
 *
 * Every fixture in the family is tried. Exactly one may match: the family's
 * members differ only in their action identity, so two matches would mean the
 * fixtures are not distinguishable and the family is malformed. On no match
 * the run is a real divergence and a report is written against the fixture
 * for the action identity the trace actually recorded (falling back to the
 * family's first member when the trace recorded an unknown one).
 */
async function commandIngestRound(options) {
  const family = options.family ?? "prisoner-normal-kill";
  const sessionId = requireOption(options, "session", "--session");
  const observationId = requireOption(options, "observation", "--observation");
  const sessionDir = path.join(CAPTURES_DIR, sessionId);
  const logPath = options.log ?? path.join(sessionDir, `${observationId}.rufflelog`);
  const jsonlPath = options.jsonl ?? path.join(sessionDir, `${observationId}.jsonl`);

  const { trace, dropped } = extractCaptureTraceFromRuffleLog(await readFile(logPath, "utf8"));
  if (trace.length === 0) {
    throw new Error(`No capture-trace lines in ${logPath}; the session produced no evidence.`);
  }
  await mkdir(path.dirname(jsonlPath), { recursive: true });
  await writeFile(jsonlPath, trace, "utf8");
  console.log(
    `Extracted ${trace.trimEnd().split("\n").length} trace line(s) to ${jsonlPath} ` +
    `(${dropped} non-trace line(s) dropped).`
  );

  const loaded = await loadFamily(family);
  const matches = [];
  const attempts = [];
  for (const member of loaded.members) {
    let record;
    try {
      record = await ingestAgainst(trace, member.fixture);
    } catch (error) {
      attempts.push({ member, error });
      continue;
    }
    const comparison = matchSs2ObservationToFixture(member.fixture, record);
    attempts.push({ member, record, comparison });
    if (comparison.match) matches.push({ member, record });
  }

  if (matches.length > 1) {
    throw new Error(
      `Family "${family}" is malformed: ${observationId} matches ` +
      `${matches.map((match) => match.member.fixture.fixtureId).join(", ")}. ` +
      "Family members must be mutually exclusive."
    );
  }

  if (matches.length === 0) {
    // Report against the fixture for whatever action the run actually took,
    // so the divergence names the candidate it should have been. The lookup
    // uses the same action-identity key `loadFamily` indexes by, so a spell
    // trace resolves on its `spell_id` exactly as a physical one resolves on
    // its `attack_direction`; reading `attackDirection` here would have
    // resolved every spell divergence to the family's first member. Each
    // ingested record is consulted in turn rather than only the first,
    // because ingest projects the identity the *target* fixture stages.
    let target;
    for (const attempt of attempts) {
      if (attempt.record === undefined) continue;
      let identity;
      try {
        identity = actionIdentityFor(attempt.record.scenario, attempt.record.observationId);
      } catch {
        continue;
      }
      const resolved = loaded.byActionKey.get(identity.key);
      if (resolved !== undefined) {
        target = resolved;
        break;
      }
    }
    target ??= loaded.members[0];
    const attempt = attempts.find((entry) => entry.member === target);
    console.log(`DIVERGE ${observationId} matches no fixture in family "${family}".`);
    if (attempt?.record === undefined) {
      console.log(`  ingest against ${target.fixture.fixtureId} failed: ${attempt?.error?.message}`);
      console.log(`  the raw trace is the evidence; it stays at ${jsonlPath}`);
      return 1;
    }
    const report = buildSs2DivergenceReport(target.fixture, attempt.record, attempt.comparison.differences);
    const reportPath = divergenceReportPath(target.fixture.fixtureId, attempt.record.observationId);
    await writeJson(reportPath, report);
    for (const difference of attempt.comparison.differences.slice(0, 20)) {
      console.log(`  at ${difference.path}: fixture ${JSON.stringify(difference.expected)}` +
        ` vs observed ${JSON.stringify(difference.actual)}`);
    }
    console.log(`  full report preserved at ${reportPath}`);
    return 1;
  }

  const [{ member, record }] = matches;
  const outPath = path.join(OBSERVATION_DIR, `${record.observationId}.json`);
  try {
    await writeJson(outPath, record, { overwrite: false });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(
      `${outPath} already exists; refusing to overwrite committed evidence. ` +
      "Every capture needs a unique observation id."
    );
  }
  console.log(
    `MATCH ${record.observationId} agrees with ${member.fixture.fixtureId} ` +
    `(${member.action.label}, digest ${record.digest}).`
  );
  console.log(`  filed at ${outPath}`);
  return 0;
}

/**
 * Promote every family member whose evidence now satisfies the gate, building
 * each manifest from the observation records it attests.
 */
async function commandSettle(options) {
  const family = options.family ?? "prisoner-normal-kill";
  // `--manifest-prefix` named the old `<prefix>-dir<n>.json` manifest path and
  // has named nothing since manifests were renamed after the candidate they
  // attest (see the manifestPath comment below). It is still parsed, because
  // silently rejecting a flag an operator's script passes is worse than
  // accepting it — but silently *ignoring* one is its own hazard, so say so
  // rather than dropping it on the floor. No script in this repository passes
  // it; if that stays true it can be retired outright.
  if (options.manifestPrefix !== undefined) {
    console.log(
      `Note: --manifest-prefix ${options.manifestPrefix} is ignored and names nothing. ` +
      "Capture manifests are named after the candidate they attest."
    );
  }
  const coverage = await computeCoverage(family);
  const promotable = coverage.rows.filter((row) => row.promotable);
  printCoverage(coverage);
  if (promotable.length === 0) {
    console.log("Nothing to promote.");
    return 0;
  }

  let failures = 0;
  for (const row of promotable) {
    const candidate = await readJson(row.fixturePath);
    const observations = [];
    for (const cited of row.observations) observations.push(await readJson(cited.filePath));
    const { manifest } = buildSs2CaptureManifest(observations);
    // Named after the candidate, not after its attack direction. Direction is
    // not unique across a family whose members share one: six probe arms all
    // stage direction 5, so a direction-named path made them overwrite one
    // another in a single settle loop and left seven promoted goldens citing a
    // manifest digest no committed file reproduced. The suite did not catch it
    // because the coverage test only walked one family's goldens.
    //
    // overwrite: false makes the collision loud rather than silent. A manifest
    // is the session-independence attestation for a golden that already cites
    // its digest, so overwriting one destroys evidence.
    const manifestPath = path.join(MANIFEST_DIR, `${row.fixtureId.replace(/^candidate-/, "")}.json`);
    try {
      await writeJson(manifestPath, manifest, { overwrite: false });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      throw new Error(
        `${manifestPath} already exists; refusing to overwrite a capture manifest. ` +
        "If a golden already cites its digest, overwriting it destroys that golden's attestation."
      );
    }

    try {
      const { golden, captureManifestSha256 } = promoteSs2CandidateToGolden(candidate, observations, manifest);
      const goldenPath = path.join(GOLDEN_DIR, `${golden.fixtureId}.json`);
      await writeJson(goldenPath, golden, { overwrite: false });
      console.log(`Promoted ${candidate.fixtureId} -> ${golden.fixtureId}`);
      console.log(`  repetitions: ${golden.provenance.repetitions}`);
      console.log(`  capture manifest sha256: ${captureManifestSha256} (${manifestPath})`);
    } catch (error) {
      failures += 1;
      if (error instanceof PromotionBlockedError) {
        for (const report of error.divergences) {
          const reportPath = divergenceReportPath(report.fixtureId, report.observationId);
          await writeJson(reportPath, report);
          console.log(`DIVERGE ${report.observationId}: report preserved at ${reportPath}`);
        }
      }
      console.log(`Promotion of ${candidate.fixtureId} blocked: ${error.message}`);
    }
  }
  return failures > 0 ? 1 : 0;
}

/**
 * Print the fixture whose tape a campaign round should inject.
 *
 * One injected tape drives every round of a family, so the family only makes
 * sense as a campaign if its members agree on the injectable samples — that
 * is what "differ only in their action identity" has to mean in practice.
 * Injection is tape-positional: were the tapes to differ, a round would
 * silently feed one member's rolls into another's call order and the
 * resulting trace would be an experiment, not evidence. Refuse rather than
 * pick.
 */
async function commandSeed(options) {
  const loaded = await loadFamily(options.family ?? "prisoner-normal-kill");
  const tapes = new Map();
  for (const member of loaded.members) {
    tapes.set(member.fixture.fixtureId, wrapperTapeForFixture(member.fixture));
  }
  const distinct = new Set(tapes.values());
  if (distinct.size !== 1) {
    const detail = [...tapes.entries()].map(([id, tape]) => `  ${id}\n    ${tape}`).join("\n");
    throw new Error(
      `Family "${loaded.family}" members do not share one injectable tape, so a single campaign ` +
      `round cannot serve them all:\n${detail}`
    );
  }
  // The first member in action order is an arbitrary but stable choice among
  // equals — every member's tape is byte-identical by the check above.
  process.stdout.write(`${path.relative(ROOT, loaded.members[0].filePath)}\n`);
  return 0;
}

/**
 * Print the `-WatchFields` value a campaign round for this family needs.
 *
 * Shaped exactly like `seed`, and for the same reason. `seed` prints the one
 * fixture whose tape a round injects and refuses when members disagree;
 * `watch-fields` prints the one watch string a round passes and refuses when
 * members disagree. The refusal is not fussiness: `-WatchFields` installs an
 * `Object.watch` on every named field, and a watch fires per assignment, so a
 * field watched for member A can add a mutation line to member B's trace and
 * diverge a run that was otherwise correct. Widening the list to the union
 * would trade a refusal for a divergence nobody could explain.
 *
 * Empty output is a real answer — most families need nothing beyond the
 * wrapper's default list — so the command prints an empty line and exits 0.
 * `run-campaign.ps1` can therefore capture it unconditionally and pass the
 * flag only when it is non-empty.
 */
async function commandWatchFields(options) {
  const family = options.family ?? "prisoner-normal-kill";
  const members = await readFamilyMembers(family);
  const defaultWatchFields = await wrapperDefaultWatchFields();
  const perMember = members.map((member) => ({
    fixtureId: member.fixture.fixtureId,
    fields: extraWatchFieldsFor(member.fixture, defaultWatchFields)
  }));

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      family,
      defaultWatchFields,
      members: perMember
    }, null, 2)}\n`);
    return 0;
  }

  const distinct = new Set(perMember.map((entry) => entry.fields.join(",")));
  if (distinct.size !== 1) {
    const detail = perMember
      .map((entry) => `  ${entry.fixtureId}\n    ${entry.fields.join(",") || "(the default list is enough)"}`)
      .join("\n");
    throw new Error(
      `Family "${family}" members do not agree on the extra watch fields a round must pass, so one ` +
      "round cannot serve them all — a field watched for one member can add a mutation line to " +
      `another's trace:\n${detail}\n` +
      "Run them one candidate at a time; a whole fixture id is a family of one."
    );
  }
  process.stdout.write(`${perMember[0].fields.join(",")}\n`);
  return 0;
}

async function commandPlan(options) {
  const coverage = await computeCoverage(options.family ?? "prisoner-normal-kill");
  if (options.json) {
    process.stdout.write(`${JSON.stringify(coverage, null, 2)}\n`);
    return 0;
  }
  printCoverage(coverage);
  return 0;
}

function requireOption(options, key, flag) {
  const value = options[key];
  if (value === undefined) throw new Error(`${flag} is required for this subcommand.`);
  return value;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${flag} needs a value.`);
      return argv[index];
    };
    switch (flag) {
      case "--family": options.family = next(); break;
      case "--session": options.session = next(); break;
      case "--observation": options.observation = next(); break;
      case "--log": options.log = next(); break;
      case "--jsonl": options.jsonl = next(); break;
      // Vestigial: settle accepts it and reports that it is ignored. See the
      // note at the top of commandSettle.
      case "--manifest-prefix": options.manifestPrefix = next(); break;
      case "--json": options.json = true; break;
      default: throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
}

const COMMANDS = new Map([
  ["plan", commandPlan],
  ["seed", commandSeed],
  ["watch-fields", commandWatchFields],
  ["ingest-round", commandIngestRound],
  ["settle", commandSettle]
]);

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const handler = COMMANDS.get(command);
  if (!handler) {
    console.error(`Usage: node tools/runtime-capture/campaign.mjs <${[...COMMANDS.keys()].join("|")}> [options]`);
    process.exitCode = 2;
    return;
  }
  try {
    process.exitCode = await handler(parseArgs(rest));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export {
  actionIdentityFor,
  campaignShapeFor,
  captureVehicles,
  commandIngestRound,
  commandPlan,
  commandSeed,
  commandSettle,
  commandWatchFields,
  computeCoverage,
  extraWatchFieldsFor,
  isFamilyMember,
  loadFamily,
  parseArgs,
  readFamilyMembers,
  unstageableScenarioFieldsFor,
  wrapperDefaultWatchFields,
  wrapperEmittedEventTypes
};
