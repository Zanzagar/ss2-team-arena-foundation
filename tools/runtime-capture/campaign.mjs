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
 *   plan          report per-member evidence coverage and what is promotable
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
import { matchSs2ObservationToFixture, validateSs2Observation } from "../../src/golden/observation.js";
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

/** The promotion gate's independence rule, stated once. */
const REQUIRED_OBSERVATIONS = 2;
const REQUIRED_SESSIONS = 2;

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
  members.sort((a, b) => compareActions(a.action, b.action));
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
        "Family members must be distinguishable by the action identity a trace records."
      );
    }
    byActionKey.set(member.action.key, member);
  }
  return { family, members, byActionKey };
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
 * golden already exists, and whether the promotion gate would pass now.
 */
async function computeCoverage(family) {
  const loaded = await loadFamily(family);
  const observations = await loadObservations();
  const goldenIds = await loadGoldenIds();

  const rows = loaded.members.map((member) => {
    const matching = observations.filter(
      (observation) => matchSs2ObservationToFixture(member.fixture, observation.value).match
    );
    const sessions = new Set(matching.map((observation) => observation.value.capture.sessionId));
    const goldenId = goldenFixtureIdFor(member.fixture.fixtureId);
    const hasGolden = goldenIds.has(goldenId);
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
        sessions.size >= REQUIRED_SESSIONS
    };
  });
  return { family, rows };
}

function printCoverage(coverage) {
  console.log(`Family "${coverage.family}" — evidence coverage`);
  const width = Math.max(0, ...coverage.rows.map((row) => row.action.label.length));
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
      `  ${row.action.label.padEnd(width)}  ${state.padEnd(12)} ` +
      `obs ${row.observations.length} / sessions ${row.sessionCount}  [${cited}]`
    );
  }
  const remaining = coverage.rows.filter((row) => !row.hasGolden).length;
  console.log(remaining === 0
    ? "  every member of this family is a promoted golden."
    : `  ${remaining} member(s) still short of a golden.`);
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
  commandIngestRound,
  commandSettle,
  computeCoverage,
  isFamilyMember,
  loadFamily,
  parseArgs,
  readFamilyMembers
};
