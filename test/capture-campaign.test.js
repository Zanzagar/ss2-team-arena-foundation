/**
 * Capture-campaign automation: manifest derivation and evidence coverage.
 *
 * The two modules under test are the bookkeeping half of the golden loop.
 * Neither may invent evidence, and neither may report an optimistic answer the
 * promotion gate would then refuse. The load-bearing test here is that
 * rebuilding a hand-written, already-committed capture manifest from the
 * observation records it cites reproduces its canonical digest exactly — the
 * digest a promoted golden already carries in
 * `provenance.captureManifestSha256`. If the builder and the hand-written
 * manifests ever disagree, a promoted golden's provenance stops being
 * reproducible, which is the one failure the manifest exists to prevent.
 *
 * Nothing here touches the licensed installation, Ruffle, or captures/.
 * Negative cases are built in memory from committed records (deep-cloned,
 * edited, re-sealed) and, where the code under test insists on reading a
 * repository layout off disk, from a throwaway mini-repo under the OS temp
 * directory that is removed again when the suite finishes.
 */

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SS2_PROJECTED_COMBATANT_KEYS,
  SS2_SIMULATED_CAPTURE_METHOD,
  computeSs2ObservationDigest,
  deriveExpectedEventsFromSs2Fixture,
  matchSs2ObservationToFixture,
  validateSs2Observation
} from "../src/golden/observation.js";
import {
  computeSs2CaptureManifestDigest,
  goldenFixtureIdFor,
  promoteSs2CandidateToGolden,
  validateSs2CaptureManifest
} from "../src/golden/promote-1v1-golden.js";
import { simulateSs2CaptureTrace } from "../src/golden/simulate-capture-trace.js";
import { buildSs2CaptureManifest } from "../tools/runtime-capture/build-manifest.mjs";
import {
  actionIdentityBandFor,
  actionIdentityFor,
  campaignShapeFor,
  captureVehicles,
  computeCoverage,
  extraWatchFieldsFor,
  isFamilyMember,
  loadFamily,
  parseArgs,
  readFamilyMembers,
  unstageableScenarioFieldsFor,
  wrapperDefaultWatchFields,
  wrapperEmittedEventTypes
} from "../tools/runtime-capture/campaign.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FAMILY = "prisoner-normal-kill";

/**
 * The digest docs/integration/ss2-runtime-capture.md names as the one the
 * rebuild must reproduce, and that golden-prisoner-normal-kill-dir6 cites.
 * Written out literally so a change to either side is a visible diff here.
 *
 * Moved when dir6 was re-promoted off its own transcription source. The old
 * value, 889e099e00f67b66199f7fc0b23642feb603362725197d9721dcb69e0bcefd6c,
 * attested [obs-diag, obs-gold3] — obs-diag being the record dir6's candidate
 * was copied out of — and its manifest file was retired with the promotion
 * that cited it.
 */
const DIR6_MANIFEST_SHA256 = "c123b7b1b544aa7ef4b5f42c7594953e406c87be8154e80becf936b7f6e9833e";

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

async function readJsonDir(...segments) {
  const directory = path.join(REPO_ROOT, ...segments);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => {
    const filePath = path.join(directory, name);
    return { name, filePath, value: await readJson(filePath) };
  }));
}

const observationEntries = await readJsonDir("test", "observations", "ss2-1v1");
const manifestEntries = await readJsonDir("test", "manifests");
const goldenEntries = await readJsonDir("test", "fixtures", "ss2-1v1-golden");
const candidateEntries = await readJsonDir("test", "fixtures", "ss2-1v1");
const divergenceEntries = await readJsonDir("test", "fixtures", "ss2-1v1-divergences");

const observationById = new Map(observationEntries.map((entry) => [entry.value.observationId, entry.value]));
const observationFileById = new Map(observationEntries.map((entry) => [entry.value.observationId, entry.filePath]));
const candidateById = new Map(candidateEntries.map((entry) => [entry.value.fixtureId, entry.value]));
const goldenById = new Map(goldenEntries.map((entry) => [entry.value.fixtureId, entry.value]));

const manifestObservationIds = (manifest) => manifest.sessions.flatMap((session) => session.observationIds);
const sortedIds = (ids) => [...ids].sort();
const idKey = (ids) => sortedIds(ids).join("|");

const manifestByObservationIds = new Map(
  manifestEntries.map((entry) => [idKey(manifestObservationIds(entry.value)), entry])
);

/** The committed goldens of the family under test, keyed by fixture id. */
const familyGoldens = goldenEntries
  .filter((entry) => entry.value.fixtureId.startsWith(`golden-${FAMILY}`))
  .map((entry) => entry.value);

/** Records for a list of observation ids, in the order given. */
function recordsFor(ids) {
  return ids.map((id) => {
    const record = observationById.get(id);
    assert.ok(record, `no committed observation record carries id ${id}`);
    return cloneJson(record);
  });
}

/** Re-digest an edited observation so it stays a well-formed record. */
function reseal(record) {
  const sealed = cloneJson(record);
  delete sealed.digest;
  sealed.digest = computeSs2ObservationDigest(sealed);
  return sealed;
}

/** Deep-clone a committed observation, edit it, and re-seal the digest. */
function observationVariant(id, mutate) {
  const draft = cloneJson(observationById.get(id));
  assert.ok(draft, `no committed observation record carries id ${id}`);
  mutate(draft);
  return reseal(draft);
}

// ---------------------------------------------------------------------------
// A throwaway mini-repo, so the on-disk halves of campaign.mjs can be driven
// with evidence sets the repository does not (and must not) contain.
// ---------------------------------------------------------------------------

/**
 * Copied verbatim into every sandbox.
 *
 * The last five are not code the driver runs — they are files it READS.
 * campaign.mjs derives the wrapper's default watch list and its emittable
 * event types from `ss2-capture-wrapper.as`, and derives which launcher
 * exposes `-WatchFields` / `-Stage*` from the launchers' own `param(...)`
 * blocks, rather than carrying copies of either that could drift. A sandbox
 * without them is a sandbox where `computeCoverage` cannot answer, and it
 * says so loudly rather than falling back to a default.
 */
const SANDBOX_CODE_FILES = [
  path.join("tools", "capture-session.mjs"),
  path.join("tools", "runtime-capture", "campaign.mjs"),
  path.join("tools", "runtime-capture", "build-manifest.mjs"),
  path.join("tools", "runtime-capture", "ss2-capture-wrapper.as"),
  path.join("tools", "runtime-capture", "run-campaign.ps1"),
  path.join("tools", "runtime-capture", "run-capture.ps1"),
  path.join("tools", "runtime-capture", "run-arena.ps1"),
  path.join("tools", "runtime-capture", "launch-capture.ps1")
];

const sandboxRoots = [];

after(async () => {
  for (const root of sandboxRoots) await rm(root, { recursive: true, force: true });
});

/**
 * Copy the campaign driver verbatim, together with the module tree it imports,
 * into a fresh temp directory and seed the three data directories it reads.
 * campaign.mjs derives its repository root from `import.meta.url`, so the copy
 * reads the seeded data and nothing else. The code is copied unmodified: this
 * controls the driver's inputs, never its behaviour.
 */
async function createCampaignSandbox({ candidates = [], goldens = [], observations = [], divergences = [] }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ss2-capture-campaign-"));
  sandboxRoots.push(root);

  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "ss2-capture-campaign-sandbox", private: true, type: "module" }, null, 2)}\n`,
    "utf8"
  );
  await cp(path.join(REPO_ROOT, "src"), path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools", "runtime-capture"), { recursive: true });
  for (const relative of SANDBOX_CODE_FILES) {
    await cp(path.join(REPO_ROOT, relative), path.join(root, relative));
  }

  const seed = async (relativeDir, records, key) => {
    await mkdir(path.join(root, relativeDir), { recursive: true });
    for (const record of records) {
      await writeFile(
        path.join(root, relativeDir, `${record[key]}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
        "utf8"
      );
    }
  };
  await seed(path.join("test", "fixtures", "ss2-1v1"), candidates, "fixtureId");
  await seed(path.join("test", "fixtures", "ss2-1v1-golden"), goldens, "fixtureId");
  await seed(path.join("test", "observations", "ss2-1v1"), observations, "observationId");

  // Divergence reports carry no single unique key — the driver names them
  // `<fixtureId>--<observationId>-<hash>.json` — so they are seeded under the
  // pair that identifies one. The directory is created only when reports are
  // supplied, which is deliberate: a sandbox with no divergence directory at
  // all is the fresh-clone shape, and the driver must report nothing about
  // sampling there rather than claiming to have checked.
  if (divergences.length > 0) {
    const divergenceDir = path.join(root, "test", "fixtures", "ss2-1v1-divergences");
    await mkdir(divergenceDir, { recursive: true });
    for (const report of divergences) {
      await writeFile(
        path.join(divergenceDir, `${report.fixtureId}--${report.observationId}.json`),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8"
      );
    }
  }

  const campaign = await import(pathToFileURL(path.join(root, "tools", "runtime-capture", "campaign.mjs")).href);
  return { root, campaign };
}

/**
 * Stage one finished session inside a sandbox: a reference trace for `fixture`
 * dressed as the Ruffle stdout log `ingest-round` delogs.
 *
 * The trace comes from `simulateSs2CaptureTrace`, the same reference generator
 * the wrapper is validated against, so nothing here is hand-written. Simulated
 * traces carry the `synthetic-simulator` method and are never promotable; they
 * are used only to drive the driver's own bookkeeping, and they never leave the
 * temp directory. The log wrapper mirrors Ruffle's `RUST_LOG=avm_trace=info`
 * line shape, which is what `extractCaptureTraceFromRuffleLog` matches on.
 */
async function stageSession(root, fixture, { sessionId, observationId }) {
  const trace = simulateSs2CaptureTrace(fixture, { sessionId, observationId });
  const logText = trace
    .trimEnd()
    .split("\n")
    .flatMap((line) => ["[INFO  ruffle_core] frame noise, dropped", `[INFO  ruffle_core] avm_trace: ${line}`])
    .join("\n");
  const sessionDir = path.join(root, "captures", sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sessionDir, `${observationId}.rufflelog`), `${logText}\n`, "utf8");
  return { trace, sessionId, observationId };
}

/** Run `body` with console.log captured, so a driver command can be asserted on. */
async function withCapturedLog(body) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.map(String).join(" "));
  try {
    const value = await body();
    return { value, lines };
  } finally {
    console.log = original;
  }
}

const jsonFileNames = async (root, ...segments) => {
  try {
    return (await readdir(path.join(root, ...segments))).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

const dir6Candidate = candidateById.get(`candidate-${FAMILY}-dir6`);
const dir6Golden = goldenById.get(`golden-${FAMILY}-dir6`);
/**
 * dir6's cited evidence and the manifest that attests it, both DERIVED from
 * the committed golden rather than listed. A re-promotion moves both together
 * and every test below follows; a listed pair would have to be hand-edited,
 * which is how a test ends up pinned to evidence that has been retired.
 */
const dir6CitedIds = dir6Golden.provenance.observationIds;
const dir6ManifestEntry = manifestByObservationIds.get(idKey(dir6CitedIds));

/**
 * Two records that are eligible evidence for dir6 — neither is its
 * `authoredFrom` — used wherever a test needs "some matching pair" rather than
 * dir6's actual evidence. They were `["obs-diag", "obs-gold3"]` until obs-diag
 * stopped counting as evidence for the candidate transcribed out of it.
 */
const DIR6_ELIGIBLE_PAIR = ["obs-gold3", "obs-camp2"];

/** Two spell candidates whose spell ids differ, so they form a lawful family. */
const spellLethal = candidateById.get("candidate-spell-lethal-slain");
const spellDepleted = candidateById.get("candidate-spell-armour-depleted-full-damage");

const summarize = (row) => ({
  action: row.action,
  fixtureId: row.fixtureId,
  goldenId: row.goldenId,
  hasGolden: row.hasGolden,
  observationIds: sortedIds(row.observations.map((observation) => observation.observationId)),
  // Records that match but are refused as evidence. Summarized alongside the
  // counted ones so a row that dropped a record can never be deep-equal to a
  // row that never had one.
  ineligibleObservationIds: sortedIds(
    row.ineligibleObservations.map((observation) => observation.observationId)
  ),
  sessionCount: row.sessionCount,
  promotable: row.promotable
});

// ---------------------------------------------------------------------------
// build-manifest.mjs
// ---------------------------------------------------------------------------

test("rebuilding every committed capture manifest from its own observations reproduces it exactly", () => {
  assert.ok(manifestEntries.length >= 4, "the committed manifest set should not have shrunk");
  for (const entry of manifestEntries) {
    const committed = entry.value;
    const records = recordsFor(manifestObservationIds(committed));
    const { manifest, digest } = buildSs2CaptureManifest(records, { createdAt: committed.createdAt });

    assert.deepEqual(manifest, committed, `${entry.name} is not what the builder derives from its observations`);
    assert.equal(digest, computeSs2CaptureManifestDigest(committed), `${entry.name} digest drifted`);
    // A manifest that cannot be validated is a manifest the gate would reject.
    assert.equal(validateSs2CaptureManifest(manifest), manifest);
  }
});

test("the rebuilt dir6 manifest carries the digest golden-prisoner-normal-kill-dir6 cites", () => {
  const committed = dir6ManifestEntry.value;
  const { manifest, digest } = buildSs2CaptureManifest(
    recordsFor(dir6CitedIds),
    { createdAt: committed.createdAt }
  );

  // A record's file name is not its observation id, and keying on the wrong
  // one is a trap this repository has fallen into. obs-gold3 is cited by dir6
  // and lives in obs-20260830-auto3.json; obs-diag, which dir6 was transcribed
  // FROM and no longer cites, lives in obs-20260830-auto1.json. Both are
  // asserted, so the mismatch stays covered whichever side of the eligibility
  // line the record is on.
  assert.equal(path.basename(observationFileById.get("obs-gold3")), "obs-20260830-auto3.json");
  assert.equal(path.basename(observationFileById.get("obs-diag")), "obs-20260830-auto1.json");

  assert.equal(digest, DIR6_MANIFEST_SHA256);
  assert.equal(digest, computeSs2CaptureManifestDigest(committed));
  assert.equal(digest, dir6Golden.provenance.captureManifestSha256);
  assert.deepEqual(
    manifest.sessions.flatMap((session) => session.observationIds).sort(),
    [...dir6CitedIds].sort(),
    "the manifest must attest exactly the records the golden cites"
  );
});

test("EVERY promoted golden cites a manifest the repository can reproduce", () => {
  // Scoped to every golden, not to one family. It used to walk only the four
  // prisoner-normal-kill goldens, and that is exactly why it stayed green
  // while seven promoted goldens cited a capture manifest no committed file
  // reproduced: the campaign driver named manifests by attack direction, six
  // probe arms all stage direction 5, and they overwrote one another inside a
  // single settle loop. A manifest is a golden's session-independence
  // attestation, so a dangling reference means that golden's promotion cannot
  // be re-derived from the repository at all.
  assert.ok(goldenEntries.length >= 22, "expected the full promoted set");
  for (const golden of goldenEntries.map((entry) => entry.value)) {
    const ids = golden.provenance.observationIds;
    const entry = manifestByObservationIds.get(idKey(ids));
    assert.ok(
      entry,
      `${golden.fixtureId}: no committed manifest attests exactly ${ids.join(", ")}`
    );
    const { digest } = buildSs2CaptureManifest(recordsFor(ids), { createdAt: entry.value.createdAt });
    assert.equal(
      digest,
      golden.provenance.captureManifestSha256,
      `${golden.fixtureId} cites a manifest digest the builder does not derive`
    );
  }
});

test("EVERY committed manifest is cited by a golden, so none attests retired evidence", () => {
  // THE CONVERSE OF THE TEST ABOVE, and it was missing. That one walks
  // golden -> manifest and catches a dangling citation; nothing walked
  // manifest -> golden, so a manifest that no golden cites sat in the evidence
  // directory undetected. Measured before this landed: with the four
  // self-citing goldens re-promoted, the four manifests attesting the retired
  // pairs survived untouched — 26 manifests against 22 goldens — and the suite
  // was FULLY GREEN over all of them. They were not skipped: the rebuild test
  // above loads test/manifests/ by directory scan, so each one was read,
  // rebuilt, validated and passed.
  //
  // A capture manifest is a session-independence ATTESTATION. One that no
  // golden cites is a signed claim about evidence with nothing standing behind
  // it, and the four in question attested exactly the transcription-source
  // pairs the re-promotion existed to retire. `settle` can produce this state
  // on its own — it names manifests after the candidate, so a manifest written
  // under an older naming scheme is never overwritten, only orphaned.
  const citedDigests = new Map(
    goldenEntries.map((entry) => [entry.value.provenance.captureManifestSha256, entry.value.fixtureId])
  );
  assert.ok(manifestEntries.length > 0, `no manifests found: the directory scan is wrong`);
  const orphans = manifestEntries.filter(
    (entry) => !citedDigests.has(computeSs2CaptureManifestDigest(entry.value))
  );
  assert.deepEqual(
    orphans.map((entry) => `${entry.name} attesting ${manifestObservationIds(entry.value).join(", ")}`),
    [],
    "committed manifests that no golden cites; retire them with the promotion that cited them"
  );
  // And the correspondence is one-to-one in both directions, so a manifest
  // cannot be shared by two goldens or counted twice.
  assert.equal(manifestEntries.length, goldenEntries.length);
  assert.equal(citedDigests.size, goldenEntries.length, "two goldens cite one manifest digest");
});

test("the four prisoner-normal-kill directions are all promoted", () => {
  assert.equal(familyGoldens.length, 4, "all four directions of the family should be promoted goldens");
});

test("createdAt is the only field the builder originates", () => {
  const committed = dir6ManifestEntry.value;
  const startedAt = Date.now();
  const { manifest } = buildSs2CaptureManifest(recordsFor(dir6CitedIds));

  assert.ok(!Number.isNaN(Date.parse(manifest.createdAt)), "createdAt must be a parseable timestamp");
  assert.ok(Date.parse(manifest.createdAt) >= startedAt, "an omitted createdAt is stamped now, not copied");
  // Every other byte is copied out of the observation records.
  assert.deepEqual({ ...manifest, createdAt: committed.createdAt }, committed);
});

test("two observations from one session collapse into a single manifest session, timestamped by the earliest", () => {
  const later = observationVariant("obs-diag", (record) => {
    record.capture.sessionId = "session-shared";
    record.capture.observedAt = "2026-08-30T22:15:00Z";
  });
  const earlier = observationVariant("obs-gold3", (record) => {
    record.capture.sessionId = "session-shared";
    record.capture.observedAt = "2026-08-30T19:05:00Z";
  });

  // Supplied later-first, so "earliest wins" cannot pass by accident.
  const { manifest } = buildSs2CaptureManifest([later, earlier], { createdAt: "2026-08-30T23:00:00Z" });

  assert.equal(manifest.sessions.length, 1);
  assert.deepEqual(manifest.sessions[0], {
    installHashVerifiedAfter: true,
    installHashVerifiedBefore: true,
    method: "injected-tape-runtime",
    observationIds: ["obs-diag", "obs-gold3"],
    observedAt: "2026-08-30T19:05:00Z",
    sessionId: "session-shared"
  });
  assert.equal(validateSs2CaptureManifest(manifest), manifest);
});

test("session order is chronological, so the digest does not depend on record order", () => {
  const committed = dir6ManifestEntry.value;
  const forward = buildSs2CaptureManifest(recordsFor(dir6CitedIds), {
    createdAt: committed.createdAt
  });
  const reversed = buildSs2CaptureManifest(recordsFor([...dir6CitedIds].reverse()), {
    createdAt: committed.createdAt
  });

  // `sessions` is an array, so canonical JSON preserves its order and the
  // order is part of the digest a promoted golden cites. The builder
  // therefore orders sessions by capture time rather than by the order the
  // caller read them off disk — `settle` supplies them in readdir order, so
  // without this the same evidence would digest differently on a filesystem
  // that enumerates differently.
  // Derived from the records rather than listed, and it exercises the TIE
  // BREAK for the first time. The builder sorts on `observedAt` and breaks ties
  // on `sessionId` "so the ordering is total"; dir6's evidence contains two
  // tied pairs (session-par2/par3 both 2026-08-31T01:06:42Z, session-pq1/pq2
  // both 01:18:29Z), so reversing the input reverses two tied pairs. The old
  // two-record version of this test had no tie in it and could not have caught
  // a missing tiebreak at all.
  const observedAtOf = (sessionId) => forward.manifest.sessions
    .find((session) => session.sessionId === sessionId).observedAt;
  const order = forward.manifest.sessions.map((session) => session.sessionId);
  assert.ok(order.length >= 4, `too few sessions (${order.length}) to test ordering`);
  assert.deepEqual(reversed.manifest.sessions.map((session) => session.sessionId), order);
  assert.deepEqual(
    [...order].sort((left, right) =>
      Date.parse(observedAtOf(left)) - Date.parse(observedAtOf(right)) || left.localeCompare(right)),
    order,
    "sessions are not ordered by capture time with sessionId breaking ties"
  );
  assert.ok(
    new Set(forward.manifest.sessions.map((session) => session.observedAt)).size < order.length,
    "no two sessions share an observedAt, so this input cannot exercise the tie break"
  );
  assert.equal(forward.digest, DIR6_MANIFEST_SHA256);
  assert.equal(reversed.digest, DIR6_MANIFEST_SHA256);
  assert.equal(validateSs2CaptureManifest(reversed.manifest), reversed.manifest);
});

test("an empty observation list is refused", () => {
  assert.throws(
    () => buildSs2CaptureManifest([], { createdAt: "2026-08-30T23:00:00Z" }),
    /At least one observation is required/
  );
  assert.throws(() => buildSs2CaptureManifest(undefined), /At least one observation is required/);
  assert.throws(() => buildSs2CaptureManifest({}), /At least one observation is required/);
});

test("observations that disagree about captureToolVersion are refused", () => {
  const other = observationVariant("obs-gold3", (record) => {
    record.capture.captureToolVersion = "ss2-capture/0.2.0";
  });
  assert.throws(
    () => buildSs2CaptureManifest([observationById.get("obs-diag"), other], { createdAt: "2026-08-30T23:00:00Z" }),
    /disagree about captureToolVersion/
  );
});

test("two observations of one session that disagree about the capture method are refused", () => {
  const first = observationVariant("obs-diag", (record) => {
    record.capture.sessionId = "session-shared";
  });
  const second = observationVariant("obs-gold3", (record) => {
    record.capture.sessionId = "session-shared";
    record.capture.method = SS2_SIMULATED_CAPTURE_METHOD;
  });
  // Both records are individually valid; only the pairing is contradictory.
  assert.equal(validateSs2Observation(first), first);
  assert.equal(validateSs2Observation(second), second);

  assert.throws(
    () => buildSs2CaptureManifest([first, second], { createdAt: "2026-08-30T23:00:00Z" }),
    /Session session-shared has observations captured by different methods/
  );
});

test("the same observation supplied twice is refused", () => {
  const record = observationById.get("obs-diag");
  assert.throws(
    () => buildSs2CaptureManifest([record, record], { createdAt: "2026-08-30T23:00:00Z" }),
    /Observation obs-diag was supplied more than once/
  );
});

test("one observation id claimed by two different sessions is refused", () => {
  // This is the exact shape a faked independence claim would take: one
  // capture, relabelled, presented as two sessions. Duplicate detection is
  // global rather than per session precisely so the builder rejects it
  // itself, with the message naming the duplicate, rather than relying on
  // the manifest validator downstream.
  const twin = observationVariant("obs-diag", (record) => {
    record.capture.sessionId = "session-elsewhere";
  });
  assert.throws(
    () => buildSs2CaptureManifest([observationById.get("obs-diag"), twin], { createdAt: "2026-08-30T23:00:00Z" }),
    /obs-diag was supplied more than once/
  );
});

test("an observation that does not attest the installed hash before and after is refused", () => {
  for (const key of ["installHashVerifiedBefore", "installHashVerifiedAfter"]) {
    const unattested = observationVariant("obs-gold3", (record) => {
      record.capture[key] = false;
    });
    assert.throws(
      () => buildSs2CaptureManifest(
        [observationById.get("obs-diag"), unattested],
        { createdAt: "2026-08-30T23:00:00Z" }
      ),
      /verified before and after|does not attest the installed hash/,
      `clearing capture.${key} must block the manifest`
    );
  }
});

// ---------------------------------------------------------------------------
// campaign.mjs — loadFamily / computeCoverage against the committed repository
// ---------------------------------------------------------------------------

test("loadFamily groups the prisoner-normal-kill candidates by attack direction", async () => {
  const loaded = await loadFamily(FAMILY);

  assert.equal(loaded.family, FAMILY);
  assert.deepEqual(loaded.members.map((member) => member.action.id), [5, 6, 7, 8]);
  assert.deepEqual(loaded.members.map((member) => member.fixture.fixtureId), [
    "candidate-prisoner-normal-kill-dir5",
    "candidate-prisoner-normal-kill-dir6",
    // The unsuffixed candidate is direction 7; membership is by id segment, not by name.
    "candidate-prisoner-normal-kill",
    "candidate-prisoner-normal-kill-dir8"
  ]);
  assert.deepEqual([...loaded.byActionKey.keys()], [
    "attack-direction:5",
    "attack-direction:6",
    "attack-direction:7",
    "attack-direction:8"
  ]);
  for (const [key, member] of loaded.byActionKey) {
    assert.equal(member.action.key, key);
    assert.equal(member.action.ingress, "attack");
    assert.equal(member.action.id, member.fixture.scenario.attackDirection);
    assert.equal(member.action.label, `attack direction ${member.fixture.scenario.attackDirection}`);
    assert.equal(path.basename(member.filePath), `${member.fixture.fixtureId}.json`);
    assert.equal(member.fixture.classification, "candidate");
  }
  // The sibling power/quick families share the "candidate-prisoner-" stem and
  // must not leak in through the membership rule.
  for (const member of loaded.members) {
    assert.match(member.fixture.fixtureId, /^candidate-prisoner-normal-kill/);
  }
});

test("loadFamily refuses a family prefix no candidate matches", async () => {
  await assert.rejects(
    () => loadFamily("no-such-family"),
    /No candidate fixtures match family prefix "candidate-no-such-family"/
  );
});

test("computeCoverage reports the prisoner-normal-kill family as fully promoted", async () => {
  const coverage = await computeCoverage(FAMILY);

  assert.equal(coverage.family, FAMILY);
  // Asserted as invariants rather than as a roster of observation ids. Every
  // campaign round adds evidence to whichever direction the game happened to
  // draw, so pinning the exact set would make this test fail on success —
  // which it did, the first time a later campaign filed three more matching
  // observations against this family.
  assert.deepEqual(coverage.rows.map((row) => row.action.id), [5, 6, 7, 8]);
  for (const row of coverage.rows) {
    assert.equal(row.hasGolden, true, `${row.action.label} lost its golden`);
    assert.equal(row.promotable, false, `${row.action.label} is golden and cannot be re-promoted`);
    // The gate's substance: at least two matching observations, from at least
    // as many distinct sessions as there are observations.
    assert.ok(row.observations.length >= 2, `${row.action.label} has too little evidence`);
    assert.equal(
      row.sessionCount,
      new Set(row.observations.map((observation) => observation.sessionId)).size
    );
    assert.ok(row.sessionCount >= 2, `${row.action.label} lacks independent sessions`);
  }
  // Direction 7 is the family member whose fixture id carries no dirN suffix.
  assert.equal(
    coverage.rows.find((row) => row.action.key === "attack-direction:7").fixtureId,
    "candidate-prisoner-normal-kill"
  );
  // Every cited observation names the file it was actually read from, and the
  // file name is not the observation id.
  for (const row of coverage.rows) {
    assert.equal(path.basename(row.fixturePath), `${row.fixtureId}.json`);
    assert.equal(row.goldenId, goldenFixtureIdFor(row.fixtureId));
    for (const cited of row.observations) {
      assert.equal(cited.filePath, observationFileById.get(cited.observationId));
      assert.equal(cited.sessionId, observationById.get(cited.observationId).capture.sessionId);
    }
  }
});

test("coverage accounts for every matching observation, as evidence or as refused", async () => {
  // THE CONTRACT, and it changed. It used to be "coverage counts exactly what
  // `matchSs2ObservationToFixture` accepts". It is now "coverage PARTITIONS
  // what the matcher accepts into evidence and refused-with-a-reason, and
  // loses nothing" — because `settle` promotes from `row.observations`, so a
  // record the gate will refuse must not be in it, and a record that silently
  // vanishes is a cap this driver forbids.
  //
  // The partition is what makes this stronger rather than weaker: a bug that
  // dropped a record on the floor passed the old assertion only if it also
  // fooled the recomputation, but a bug that dropped one QUIETLY now has
  // nowhere to hide, because the two halves must still sum to the matcher's
  // own answer.
  const coverage = await computeCoverage(FAMILY);
  const loaded = await loadFamily(FAMILY);

  let refused = 0;
  for (const row of coverage.rows) {
    const fixture = loaded.byActionKey.get(row.action.key).fixture;
    const genuinelyMatching = observationEntries
      .filter((entry) => matchSs2ObservationToFixture(fixture, entry.value).match)
      .map((entry) => entry.value.observationId);
    const counted = row.observations.map((observation) => observation.observationId);
    const declined = row.ineligibleObservations.map((observation) => observation.observationId);
    assert.deepEqual(
      sortedIds([...counted, ...declined]),
      sortedIds(genuinelyMatching),
      `${row.action.label} coverage loses or invents an observation the matcher accepted`
    );
    // The two halves are disjoint: no record is both evidence and refused.
    assert.equal(new Set([...counted, ...declined]).size, counted.length + declined.length);
    // Every refusal names a reason and the record it refused, and the record
    // really is the candidate's declared source.
    for (const observation of row.ineligibleObservations) {
      assert.equal(observation.reason, "authored-from");
      assert.equal(observation.observationId, fixture.provenance.authoredFrom);
      assert.equal(observation.filePath, observationFileById.get(observation.observationId));
      refused += 1;
    }
    // No observation is evidence for two directions at once.
    for (const cited of row.observations) {
      assert.equal(observationById.get(cited.observationId).target.fixtureId, row.fixtureId);
    }
  }
  // All four members of this family are transcribed candidates whose source
  // record is committed, so the refusal path must have run four times. Zero
  // would mean the split had quietly stopped firing.
  assert.equal(refused, 4, "the authoredFrom refusal did not fire for every member of this family");
  const counted = coverage.rows.flatMap((row) => row.observations.map((o) => o.observationId));
  assert.equal(new Set(counted).size, counted.length, "an observation must not back two directions");
});

/**
 * Every committed golden with its candidate. NOT PARTITIONED, and the removal
 * of that partition is the point.
 *
 * This used to be split into `eligible` and `selfCiting`, because four goldens
 * cited the record their own candidate was transcribed from and so could not
 * be reproduced by the gate. The reproduction loop below walked only the
 * eligible half. That made the partition a SILENT FILTER, and it was measured
 * doing exactly what a silent filter does: with the split in place, reverting
 * one golden to its self-citing form REMOVED a failure from the suite — nine
 * failures with the plant, ten without, and not one of them naming the
 * offender. A self-citing golden was cheaper to hold than an honest one.
 *
 * With all four re-promoted there is nothing left to partition around, so
 * every golden goes through one loop that RUNS THE GATE. A golden that cites
 * its own source record now fails that loop by name, which is the behaviour
 * the split was standing in for.
 */
const goldenPairs = goldenEntries.map((entry) => entry.value).map((golden) => {
  const candidateId = `candidate-${golden.fixtureId.slice("golden-".length)}`;
  const candidate = candidateById.get(candidateId);
  assert.ok(candidate, `${candidateId} is missing`);
  return { golden, candidate, candidateId };
});

test("no committed golden cites the record its own candidate was transcribed from", () => {
  // Stated separately from the reproduction loop so the failure names the
  // defect rather than a downstream symptom. The loop below would also fail,
  // with "not reproducible from its evidence", which is true but does not say
  // why.
  const declared = goldenPairs.filter(({ candidate }) =>
    candidate.provenance.kind === "transcribed-observation");
  assert.ok(
    declared.length > 0,
    "no promoted golden comes from a transcribed candidate, so this assertion is vacuous"
  );
  for (const { golden, candidate, candidateId } of declared) {
    assert.equal(
      golden.provenance.observationIds.includes(candidate.provenance.authoredFrom),
      false,
      `${golden.fixtureId} cites ${candidate.provenance.authoredFrom}, the record ${candidateId} was ` +
      "transcribed from. A copy cannot fail to match its original, so that citation is not evidence. " +
      "Re-promote from records captured independently of the transcription."
    );
  }
});

test("the settle recipe reproduces every committed golden byte for byte", () => {
  // Widened from this one family to the whole corpus when the self-citation
  // split landed: with all four normal-band goldens self-citing, a
  // family-scoped loop would have had nothing left to iterate and would have
  // passed while asserting nothing. It now walks EVERY golden, with no
  // partition in front of it — see the comment on `goldenPairs` for why the
  // exemption list was more dangerous than the goldens it exempted.
  assert.equal(goldenPairs.length, goldenEntries.length, "every committed golden must be walked");
  assert.ok(goldenPairs.length > 0, "no golden to reproduce: this test would be vacuous");

  for (const { golden, candidate } of goldenPairs) {
    const ids = golden.provenance.observationIds;
    const manifestEntry = manifestByObservationIds.get(idKey(ids));
    assert.ok(manifestEntry, `${golden.fixtureId} has no committed manifest for ${idKey(ids)}`);
    const records = recordsFor(ids);
    const { manifest } = buildSs2CaptureManifest(records, { createdAt: manifestEntry.value.createdAt });
    const promoted = promoteSs2CandidateToGolden(candidate, records, manifest);

    assert.deepEqual(promoted.golden, golden, `${golden.fixtureId} is not reproducible from its evidence`);
    assert.equal(promoted.captureManifestSha256, golden.provenance.captureManifestSha256);
    assert.equal(promoted.matches.length, ids.length);
  }
});

// ---------------------------------------------------------------------------
// The pairwise gate, measured on the promotion path rather than in isolation
// ---------------------------------------------------------------------------

/**
 * Observations carrying a `capture.launchNonce`, grouped by the candidate they
 * target. Derived, never listed: a new nonce-bearing capture joins a group on
 * its own, and the two tests below widen with it.
 */
const nonceBearingGroups = new Map();
for (const record of observationEntries.map((entry) => entry.value)) {
  if (record.capture.launchNonce === undefined) continue;
  const group = nonceBearingGroups.get(record.target.fixtureId) ?? [];
  group.push(record);
  nonceBearingGroups.set(record.target.fixtureId, group);
}

/** One record with a different `samples[0].callSite`, resealed so it validates. */
function forgeCallSite(record) {
  const forged = cloneJson(record);
  forged.samples[0].callSite = "root:probe";
  return reseal(forged);
}

test("the pairwise gate can refuse a promotion, and does it on callSite", () => {
  // WHY THIS EXISTS AS AN END-TO-END TEST. `ss2-observation.test.js` already
  // pins that `ss2ObservationsMatch` sees a callSite disagreement the matcher
  // is blind to. That is a statement about a FUNCTION. Nothing pinned that the
  // function is REACHABLE from `promoteSs2CandidateToGolden` — and reachability
  // is the whole claim, because the gate sits behind the nonce check, the
  // session-count check and the divergence check, any of which can refuse
  // first and make the pairwise loop unreachable without a single test going
  // red. Delete the pairwise loop and this test fails; the unit tests do not.
  const usable = [...nonceBearingGroups].filter(([, records]) => records.length >= 2);
  assert.ok(
    usable.length > 0,
    "no candidate has two nonce-bearing observations, so this test would be vacuous"
  );

  for (const [candidateId, records] of usable) {
    const candidate = candidateById.get(candidateId);
    assert.ok(candidate, `${candidateId} is missing`);
    const [left, right] = records.slice(0, 2);

    // CONTROL. The honest pair must promote, or a refusal below would prove
    // nothing about the forgery — it would only prove the evidence was bad.
    const honest = [cloneJson(left), cloneJson(right)];
    const { manifest } = buildSs2CaptureManifest(honest, { createdAt: "2026-08-31T12:00:00Z" });
    assert.ok(
      promoteSs2CandidateToGolden(candidate, honest, manifest).golden,
      `${candidateId} does not promote from its honest nonce-bearing pair`
    );

    // EXPERIMENT. One record's callSite moved, and nothing else. The matcher is
    // blind to it — `comparableSamples` drops the field — so the only thing
    // that can refuse this is the pairwise comparison.
    const forged = [cloneJson(left), forgeCallSite(right)];
    assert.ok(
      matchSs2ObservationToFixture(candidate, forged[1]).match,
      `${candidateId}: the forged record must still match, or the matcher is refusing it instead`
    );
    const forgedManifest = buildSs2CaptureManifest(forged, { createdAt: "2026-08-31T12:00:00Z" }).manifest;
    assert.throws(
      () => promoteSs2CandidateToGolden(candidate, forged, forgedManifest),
      /disagree with EACH OTHER at: \/samples\/0\/callSite/,
      `${candidateId}: the pairwise gate did not refuse a callSite forgery`
    );
  }
});

test("which gate refuses a forgery is decided by the forged record's nonce, golden by golden", () => {
  // THE CORRECTION THIS FILE CARRIES, and it has now moved once. It used to
  // assert `reachedPairwise === 0`: ZERO of the observation ids the goldens
  // cited carried a `launchNonce`, every one was waived only by having its
  // exact digest listed in `pre-nonce-observations.js`, every forgery
  // re-digests and so drops out of that waiver, and the NONCE gate refused it
  // about forty lines before the pairwise loop ran. The pairwise gate had
  // teeth and never got a turn.
  //
  // Re-promoting the four self-citing goldens changed that fact — nine cited
  // ids now carry a nonce — and the old test's own instructions were to NARROW
  // it to the goldens that still cite nonce-free records. That repair was
  // measured and rejected: the narrowing predicate and the asserted outcome are
  // the same proposition, so the test would restate its own filter, could no
  // longer fail, and would drop every re-promoted golden — the entire subject
  // of the change — out of the probe.
  //
  // So it is widened instead. Every cited record of every golden is forged in
  // turn, and the outcome is PREDICTED from that record alone: forging a
  // nonce-free record re-digests it out of the waiver, so the nonce gate
  // refuses; forging a nonce-bearing record leaves the waiver irrelevant, so
  // the refusal falls through to the pairwise comparison. Both branches are
  // now exercised by committed evidence, both counts are derived from the
  // corpus rather than written down, and either can fail.
  let reachedPairwise = 0;
  let refusedByNonce = 0;
  let probed = 0;
  let expectedPairwise = 0;

  for (const { golden, candidate } of goldenPairs) {
    const records = recordsFor(golden.provenance.observationIds);
    assert.ok(records.length >= 2, `${golden.fixtureId} cites fewer than two records`);

    // CONTROL. The honest evidence must promote, or a refusal below would only
    // prove the evidence was bad.
    const manifestEntry = manifestByObservationIds.get(idKey(golden.provenance.observationIds));
    assert.ok(manifestEntry, `${golden.fixtureId} has no committed manifest`);
    assert.ok(
      promoteSs2CandidateToGolden(candidate, recordsFor(golden.provenance.observationIds),
        buildSs2CaptureManifest(recordsFor(golden.provenance.observationIds),
          { createdAt: manifestEntry.value.createdAt }).manifest).golden,
      `${golden.fixtureId} does not promote from its own cited evidence`
    );

    for (let index = 0; index < records.length; index += 1) {
      const forged = records.map((record, position) =>
        position === index ? forgeCallSite(cloneJson(record)) : cloneJson(record));
      // The matcher is blind to callSite, so nothing upstream of the two gates
      // can refuse this. If that ever stops being true the divergence check
      // fires first and the `else throw` below reports it.
      assert.equal(
        matchSs2ObservationToFixture(candidate, forged[index]).match,
        true,
        `${golden.fixtureId}: the forged record stopped matching, so the matcher is refusing it instead`
      );
      const forgedNonceBearing = records[index].capture.launchNonce !== undefined;
      if (forgedNonceBearing) expectedPairwise += 1;
      const { manifest } = buildSs2CaptureManifest(forged, { createdAt: "2026-08-31T12:00:00Z" });
      probed += 1;
      try {
        promoteSs2CandidateToGolden(candidate, forged, manifest);
        assert.fail(`${golden.fixtureId} promoted from a forged record`);
      } catch (error) {
        const where = /disagree with EACH OTHER/.test(error.message)
          ? "pairwise"
          : /carries no capture\.launchNonce/.test(error.message)
            ? "nonce"
            : null;
        if (where === null) throw error;
        assert.equal(
          where,
          forgedNonceBearing ? "pairwise" : "nonce",
          `${golden.fixtureId}: forging ${records[index].observationId} ` +
          `(launchNonce ${forgedNonceBearing ? "present" : "absent"}) was refused by the ${where} gate`
        );
        if (where === "pairwise") reachedPairwise += 1; else refusedByNonce += 1;
      }
    }
  }

  assert.ok(probed > 0, "no golden to probe: this test would be vacuous");
  assert.equal(reachedPairwise + refusedByNonce, probed);
  assert.equal(reachedPairwise, expectedPairwise);
  // BOTH branches must be non-empty, or one of them is asserting nothing. The
  // pairwise count was zero on committed evidence until the four normal-band
  // goldens were re-promoted onto nonce-bearing records; if it returns to zero
  // the gate has stopped being reachable from any promotion this repository
  // rests on, and "the pairwise gate protects the corpus" is again an argument
  // nobody has.
  assert.ok(reachedPairwise > 0, "no forgery reached the pairwise gate: it is unreachable again");
  assert.ok(refusedByNonce > 0, "no forgery was refused by the nonce gate: that branch is untested");
});

// ---------------------------------------------------------------------------
// campaign.mjs — the promotable rule, driven with controlled evidence
// ---------------------------------------------------------------------------

test("promotable is true for two matching observations from two independent sessions and no golden", async () => {
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(DIR6_ELIGIBLE_PAIR)
  });
  const coverage = await sandbox.computeCoverage(FAMILY);

  assert.deepEqual(coverage.rows.map(summarize), [{
    action: { ingress: "attack", id: 6, key: "attack-direction:6", label: "attack direction 6" },
    fixtureId: "candidate-prisoner-normal-kill-dir6",
    goldenId: "golden-prisoner-normal-kill-dir6",
    hasGolden: false,
    observationIds: sortedIds(DIR6_ELIGIBLE_PAIR),
    ineligibleObservationIds: [],
    sessionCount: 2,
    promotable: true
  }]);

  // And the gate agrees, on the same set. COVERAGE AND THE GATE NOW APPLY THE
  // SAME ELIGIBILITY RULE, and that is a reversal of a decision recorded here.
  // The argument that stood in this comment was: "coverage still counts it
  // because coverage answers 'which records match this fixture', which is a
  // different question from 'which records are evidence for it' ... a coverage
  // row is a shortlist, and the gate is what decides."
  //
  // That is true of a REPORT and false of a WORK LIST, and this row is both:
  // `plan` prints it and `settle` promotes from `row.observations`. Under the
  // shortlist reading, settle built a capture manifest over evidence the gate
  // then refused — and wrote it to disk first, so a blocked run deposited a
  // session-independence attestation for a pair the repository had just
  // rejected. What survives of the old argument is its real content: the
  // distinction must stay VISIBLE. So the refused record is not dropped, it is
  // reported in `ineligibleObservations`, which the test below pins.
  const records = recordsFor(DIR6_ELIGIBLE_PAIR);
  const { manifest } = buildSs2CaptureManifest(records, { createdAt: dir6ManifestEntry.value.createdAt });
  const promoted = promoteSs2CandidateToGolden(dir6Candidate, records, manifest).golden;
  assert.deepEqual(promoted.scenario, dir6Golden.scenario);
  assert.deepEqual(promoted.samples, dir6Golden.samples);
  assert.deepEqual(promoted.expected, dir6Golden.expected);
  assert.deepEqual(promoted.provenance.observationIds, DIR6_ELIGIBLE_PAIR);

  const citedRecords = recordsFor([dir6Candidate.provenance.authoredFrom, "obs-gold3"]);
  assert.throws(
    () => promoteSs2CandidateToGolden(dir6Candidate, citedRecords, buildSs2CaptureManifest(citedRecords, {
      createdAt: dir6ManifestEntry.value.createdAt
    }).manifest),
    /obs-diag is the record candidate-prisoner-normal-kill-dir6 was authored from/
  );
});

test("coverage refuses the candidate's own source record, and says so on the row", async () => {
  // The exclusion must never be a silent cap. A row that dropped a record has
  // to stay distinguishable from a row that never had one — this file's own
  // rule, stated for the divergence count in campaign.mjs, and it applies here
  // for the same reason: `candidate-duel-firstblood-normal-kill`'s ONLY
  // matching record is its own source, so without the disclosure its row would
  // read exactly like a fixture nobody has ever run.
  const source = dir6Candidate.provenance.authoredFrom;
  assert.equal(source, "obs-diag");
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor([source, ...DIR6_ELIGIBLE_PAIR])
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.deepEqual(
    sortedIds(row.observations.map((observation) => observation.observationId)),
    sortedIds(DIR6_ELIGIBLE_PAIR),
    "the source record must not be counted as evidence"
  );
  assert.deepEqual(row.ineligibleObservations.map((observation) => ({
    observationId: observation.observationId,
    reason: observation.reason
  })), [{ observationId: source, reason: "authored-from" }]);
  assert.match(row.ineligibleObservations[0].detail, /provenance\.authoredFrom/);
  // It really did match — the exclusion is not the matcher quietly disagreeing.
  assert.equal(matchSs2ObservationToFixture(dir6Candidate, observationById.get(source)).match, true);

  // And the disclosure reaches an operator's screen through the real command,
  // printed ABOVE the early return that suppresses blockers and notes once a
  // member has a golden. Asserted in BOTH states, because the four goldens this
  // exclusion was written for are all in the `hasGolden` one.
  for (const goldens of [[], [dir6Golden]]) {
    const { campaign: printer } = await createCampaignSandbox({
      candidates: [dir6Candidate],
      goldens,
      observations: recordsFor([source, ...DIR6_ELIGIBLE_PAIR])
    });
    const { lines } = await withCapturedLog(() => printer.commandPlan({ family: FAMILY }));
    const printed = lines.join("\n");
    assert.match(
      printed,
      new RegExp(`refused as evidence \\(authored-from\\): ${source}@`),
      `the refusal is invisible with ${goldens.length} golden(s) on disk`
    );
    assert.equal(printed.includes(`${source}@session-diag,`), false, "a refused record is not cited as evidence");
  }
});

test("promotable is false once the direction already has a golden", async () => {
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    goldens: [dir6Golden],
    observations: recordsFor(DIR6_ELIGIBLE_PAIR)
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.equal(row.hasGolden, true);
  assert.equal(row.observations.length, 2);
  assert.equal(row.sessionCount, 2);
  assert.equal(row.promotable, false, "an existing golden is never re-promoted");
});

test("promotable is false with fewer than two matching observations", async () => {
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(["obs-gold3"])
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.equal(row.hasGolden, false);
  assert.equal(row.observations.length, 1);
  assert.equal(row.sessionCount, 1);
  assert.equal(row.promotable, false);

  const records = recordsFor(["obs-gold3"]);
  const { manifest } = buildSs2CaptureManifest(records, { createdAt: dir6ManifestEntry.value.createdAt });
  assert.throws(
    () => promoteSs2CandidateToGolden(dir6Candidate, records, manifest),
    /at least two independent runtime observations/
  );
});

test("promotable is false when both matching observations come from the same session", async () => {
  // The independence rule the whole gate rests on: two runs of one session are
  // one experiment, however well they agree.
  // Both records are eligible (neither is dir6's `authoredFrom`), so the only
  // thing left for the gate to object to is the shared session — which is what
  // this test is about.
  //
  // The variants carry DISTINCT nonces. Editing a committed record re-seals its
  // digest, which drops it off the enumerated pre-nonce waiver in
  // src/golden/pre-nonce-observations.js — so leaving them nonce-free would put
  // the gate's nonce refusal in front of the session refusal and this test would
  // pass on the wrong error. Two launches sharing one operator-chosen sessionId
  // is also the honest shape of what is being asserted.
  const first = observationVariant("obs-camp2", (record) => {
    record.capture.sessionId = "session-shared";
    record.capture.launchNonce = "801-1122334455";
  });
  const second = observationVariant("obs-gold3", (record) => {
    record.capture.sessionId = "session-shared";
    record.capture.launchNonce = "802-5544332211";
  });

  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: [first, second]
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.equal(row.hasGolden, false);
  assert.equal(row.observations.length, 2, "both records still match the candidate in full");
  assert.equal(row.sessionCount, 1);
  assert.equal(row.promotable, false, "two observations from one session are not independent evidence");

  // The gate refuses the same evidence, so coverage is not merely pessimistic.
  const { manifest } = buildSs2CaptureManifest([first, second], { createdAt: "2026-08-30T23:00:00Z" });
  assert.equal(manifest.sessions.length, 1);
  assert.throws(
    () => promoteSs2CandidateToGolden(dir6Candidate, [first, second], manifest),
    /at least two independent capture sessions/
  );
});

test("coverage ignores an observation that targets the candidate but diverges from it", async () => {
  const diverging = observationVariant("obs-gold3", (record) => {
    record.finalState.hero.staminaleft += 1;
  });
  // It is a valid record, aimed at this very candidate, from its own session —
  // everything a target-id rule would look at.
  assert.equal(validateSs2Observation(diverging), diverging);
  assert.equal(diverging.target.fixtureId, dir6Candidate.fixtureId);
  assert.notEqual(diverging.capture.sessionId, observationById.get("obs-camp2").capture.sessionId);
  const comparison = matchSs2ObservationToFixture(dir6Candidate, diverging);
  assert.equal(comparison.match, false);
  assert.deepEqual(comparison.differences.map((difference) => difference.path), ["/finalState/hero/staminaleft"]);

  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: [...recordsFor(["obs-camp2"]), diverging]
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.deepEqual(row.observations.map((observation) => observation.observationId), ["obs-camp2"]);
  assert.equal(row.sessionCount, 1);
  assert.equal(row.promotable, false, "a divergent run is never counted towards the two-observation rule");
});

test("loadFamily refuses a family whose members claim the same attack direction, and names the one-fixture remedy", async () => {
  const twin = cloneJson(dir6Candidate);
  twin.fixtureId = `${dir6Candidate.fixtureId}-twin`;

  const { campaign: sandbox } = await createCampaignSandbox({ candidates: [dir6Candidate, twin] });

  await assert.rejects(
    () => sandbox.loadFamily(FAMILY),
    (error) => {
      assert.match(error.message, /has two fixtures for attack direction 6/);
      // The refusal is correct — two fixtures for one identity leave a
      // divergent round with no single candidate to be reported against — but
      // a refusal that does not say what to do instead is a dead end. The
      // remedy is the one-fixture family, spelled as the flag to type.
      assert.match(error.message, /--family prisoner-normal-kill-dir6-twin/);
      return true;
    }
  );
});

test("computeCoverage REPORTS on a family whose members share an action identity", async () => {
  // The behaviour this replaces: computeCoverage went through loadFamily, so
  // `plan --family armoured` (and champion, and tournament, and probe, and
  // spell) refused to print anything at all. Coverage is a per-member report
  // and never consults the action-identity index; requiring it hid the exact
  // report an operator needs in order to plan the family as several rounds.
  // The invariant itself is not weakened: loadFamily still refuses, which is
  // what ingest-round and seed rely on.
  const twin = cloneJson(dir6Candidate);
  twin.fixtureId = `${dir6Candidate.fixtureId}-twin`;

  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate, twin],
    observations: recordsFor(DIR6_ELIGIBLE_PAIR)
  });
  const coverage = await sandbox.computeCoverage(FAMILY);

  assert.deepEqual(coverage.rows.map((row) => row.fixtureId).sort(), [
    "candidate-prisoner-normal-kill-dir6",
    "candidate-prisoner-normal-kill-dir6-twin"
  ]);
  // Each row carries only the evidence aimed at it: the twin is the same
  // fight under a second id, and it collects nothing, because matching is
  // keyed on the record's target.
  const byFixture = new Map(coverage.rows.map((row) => [row.fixtureId, row]));
  assert.equal(byFixture.get("candidate-prisoner-normal-kill-dir6").observations.length, 2);
  assert.equal(byFixture.get("candidate-prisoner-normal-kill-dir6-twin").observations.length, 0);
  assert.equal(coverage.campaign.singleRound, false);
  assert.deepEqual(coverage.campaign.actionIdentityCollisions, [{
    key: "attack-direction:6",
    label: "attack direction 6",
    fixtureIds: ["candidate-prisoner-normal-kill-dir6", "candidate-prisoner-normal-kill-dir6-twin"]
  }]);
  // And loadFamily is unchanged, so the two commands that need the index
  // still refuse.
  await assert.rejects(() => sandbox.loadFamily(FAMILY), /has two fixtures for attack direction 6/);
});

test("no observation can be evidence for two candidates, whatever their action identities", () => {
  // This is what makes it safe for coverage to stop going through loadFamily.
  // The index guaranteed one candidate per action identity; the rule that
  // actually protects promotion is stronger and independent of it —
  // matchSs2ObservationToFixture compares observation.target.fixtureId, so a
  // record aimed at one candidate is never counted for another. Asserted over
  // the whole committed archive, not one family.
  const claimedBy = new Map();
  for (const entry of observationEntries) {
    for (const candidate of candidateEntries.map((item) => item.value)) {
      if (!matchSs2ObservationToFixture(candidate, entry.value).match) continue;
      const owner = claimedBy.get(entry.value.observationId);
      assert.equal(
        owner,
        undefined,
        `${entry.value.observationId} matches both ${owner} and ${candidate.fixtureId}`
      );
      claimedBy.set(entry.value.observationId, candidate.fixtureId);
    }
  }
  // And a twin candidate — the same fight under a second id — collects nothing,
  // because it is not what the record targets.
  const twin = cloneJson(dir6Candidate);
  twin.fixtureId = `${dir6Candidate.fixtureId}-twin`;
  const twinMatch = matchSs2ObservationToFixture(twin, observationById.get("obs-diag"));
  assert.equal(twinMatch.match, false);
  assert.deepEqual(twinMatch.differences.map((difference) => difference.path), ["/target/fixtureId"]);
});

// ---------------------------------------------------------------------------
// campaign.mjs — family membership is by `-`-delimited id segment
//
// `--family armour` used to match `fixtureId.startsWith("candidate-armour")`,
// which also swept the five `candidate-armoured-*` fixtures. That is a live
// collision in this repository, not a hypothetical: the two families stage
// different fights — different combatants, different armour, and the armoured
// five stage `fightMode: "tournament"` while the armour three stage none — so
// a campaign for either would have spent every round ingesting against the
// other's candidates as well.
// ---------------------------------------------------------------------------

const candidateIds = candidateEntries.map((entry) => entry.value.fixtureId).sort();
const selects = (family) => candidateIds.filter((id) => isFamilyMember(id, family));

test("--family armour selects the armour candidates and none of the armoured ones", () => {
  assert.deepEqual(selects("armour"), [
    "candidate-armour-equality-quirk",
    "candidate-armour-overflow-burning",
    "candidate-armour-removal-debris"
  ]);
  // The exact collision the old prefix rule produced, spelled out.
  assert.equal(candidateIds.filter((id) => id.startsWith("candidate-armour")).length, 8);
});

test("--family armoured selects exactly the five armoured candidates", () => {
  assert.deepEqual(selects("armoured"), [
    "candidate-armoured-deflection-threshold-cleared",
    "candidate-armoured-deflection-threshold-critical",
    "candidate-armoured-equality-quirk",
    "candidate-armoured-removal-destroys-helmet",
    "candidate-armoured-removal-destroys-shoulderguard"
  ]);
});

test("--family probe and --family spell select exactly their ten and eight candidates", () => {
  const probes = selects("probe");
  assert.equal(probes.length, 10);
  for (const id of probes) assert.match(id, /^candidate-probe-/);

  const spells = selects("spell");
  assert.equal(spells.length, 8);
  for (const id of spells) assert.match(id, /^candidate-spell-/);
});

test("the three prisoner bands select their own members and never a sibling band's", () => {
  assert.deepEqual(selects("prisoner-quick-kill"), [
    "candidate-prisoner-quick-kill-dir1",
    "candidate-prisoner-quick-kill-dir2",
    "candidate-prisoner-quick-kill-dir3",
    "candidate-prisoner-quick-kill-dir4"
  ]);
  assert.deepEqual(selects("prisoner-normal-kill"), [
    "candidate-prisoner-normal-kill",
    "candidate-prisoner-normal-kill-dir5",
    "candidate-prisoner-normal-kill-dir6",
    "candidate-prisoner-normal-kill-dir8"
  ]);
  assert.equal(selects("prisoner-power-kill").length, 4);
  // The stem all three share selects all twelve and nothing else.
  assert.equal(selects("prisoner").length, 12);
});

test("an exact whole-id match is a one-member family", () => {
  assert.deepEqual(selects("prisoner-normal-kill-dir6"), ["candidate-prisoner-normal-kill-dir6"]);
  assert.deepEqual(selects("spell-lethal-slain"), ["candidate-spell-lethal-slain"]);
  // A truncation of a real id matches nothing: the boundary has to be a "-".
  assert.deepEqual(selects("prisoner-normal-kill-dir"), []);
  assert.deepEqual(selects("armou"), []);
  // The `candidate-` stem is not itself a family name.
  assert.deepEqual(selects(""), []);
});

test("readFamilyMembers reads the armour family off disk without the armoured fixtures", async () => {
  // The on-disk half of the same rule. loadFamily cannot be used here, because
  // all three armour candidates stage attack direction 5 and it refuses an
  // ambiguous index — see the key tests below.
  const members = await readFamilyMembers("armour");
  assert.deepEqual(members.map((member) => member.fixture.fixtureId).sort(), [
    "candidate-armour-equality-quirk",
    "candidate-armour-overflow-burning",
    "candidate-armour-removal-debris"
  ]);
  for (const member of members) {
    assert.equal(path.basename(member.filePath), `${member.fixture.fixtureId}.json`);
    assert.equal(member.fixture.classification, "candidate");
  }

  const armoured = await readFamilyMembers("armoured");
  assert.equal(armoured.length, 5);
  // Disjoint, which under the old prefix rule they were not.
  const armourIds = new Set(members.map((member) => member.fixture.fixtureId));
  for (const member of armoured) assert.equal(armourIds.has(member.fixture.fixtureId), false);
});

test("readFamilyMembers refuses a family prefix no candidate matches, and an empty name", async () => {
  await assert.rejects(
    () => readFamilyMembers("armou"),
    /No candidate fixtures match family prefix "candidate-armou"/
  );
  await assert.rejects(() => readFamilyMembers(""), /A family name is required/);
});

// ---------------------------------------------------------------------------
// campaign.mjs — the family index key is the action identity, not the direction
//
// A physical fixture is identified by its attack direction; a spell fixture has
// no direction chain at all and is identified by its spellId. Indexing on
// `attackDirection` alone collapsed every member of a spell family onto the
// single key `undefined`.
// ---------------------------------------------------------------------------

test("actionIdentityFor reads whichever identity the scenario carries", () => {
  assert.deepEqual(actionIdentityFor({ attackDirection: 6 }, "x"), {
    ingress: "attack",
    id: 6,
    key: "attack-direction:6",
    label: "attack direction 6"
  });
  assert.deepEqual(actionIdentityFor({ spellId: 32 }, "x"), {
    ingress: "spell",
    id: 32,
    key: "spell-id:32",
    label: "spell id 32"
  });
  // The two ingresses share one key namespace and must not alias: spell 6 is
  // not direction 6.
  assert.notEqual(
    actionIdentityFor({ spellId: 6 }, "x").key,
    actionIdentityFor({ attackDirection: 6 }, "x").key
  );
  // Exactly one identity, the same rule validateSs2OneVsOneFixture enforces.
  for (const scenario of [{}, { attackDirection: 6, spellId: 32 }]) {
    assert.throws(
      () => actionIdentityFor(scenario, "candidate-x"),
      /candidate-x must carry exactly one action identity/
    );
  }
});

test("every committed candidate has an action identity", () => {
  // The guarantee that makes the key total: no candidate in the repository
  // falls through actionIdentityFor.
  for (const entry of candidateEntries) {
    const identity = actionIdentityFor(entry.value.scenario, entry.value.fixtureId);
    assert.equal(identity.ingress, entry.value.scenario.spellId === undefined ? "attack" : "spell");
  }
  const spellKeys = candidateEntries
    .filter((entry) => entry.value.scenario.spellId !== undefined)
    .map((entry) => actionIdentityFor(entry.value.scenario, entry.value.fixtureId).key);
  assert.equal(spellKeys.length, 8);
  for (const key of spellKeys) assert.match(key, /^spell-id:\d+$/);
});

test("loadFamily indexes a spell family by spell id", async () => {
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [spellLethal, spellDepleted]
  });
  const loaded = await sandbox.loadFamily("spell");

  // Under the old direction index both members keyed on `undefined` and this
  // family was reported malformed.
  assert.deepEqual([...loaded.byActionKey.keys()], ["spell-id:32", "spell-id:34"]);
  assert.deepEqual(loaded.members.map((member) => member.fixture.fixtureId), [
    "candidate-spell-lethal-slain",
    "candidate-spell-armour-depleted-full-damage"
  ]);
  for (const member of loaded.members) {
    assert.equal(member.action.ingress, "spell");
    assert.equal(member.action.id, member.fixture.scenario.spellId);
    assert.equal(member.fixture.scenario.attackDirection, undefined);
  }

  const coverage = await sandbox.computeCoverage("spell");
  assert.deepEqual(coverage.rows.map((row) => row.action.label), ["spell id 32", "spell id 34"]);
  for (const row of coverage.rows) {
    assert.equal(row.hasGolden, false);
    assert.equal(row.promotable, false, "no spell session has ever run");
  }
});

test("loadFamily refuses a spell family whose members claim the same spell id", async () => {
  const twin = cloneJson(spellLethal);
  twin.fixtureId = `${spellLethal.fixtureId}-twin`;
  assert.equal(twin.scenario.spellId, spellLethal.scenario.spellId);

  const { campaign: sandbox } = await createCampaignSandbox({ candidates: [spellLethal, twin] });

  // Named by spell id, not by "attack direction undefined": the diagnosis has
  // to point at the identity this ingress actually has. Both colliding ids are
  // named; which is named first is readdir order, so it is not asserted.
  await assert.rejects(
    () => sandbox.loadFamily("spell"),
    (error) => {
      assert.match(error.message, /Family "spell" has two fixtures for spell id 32:/);
      assert.match(error.message, /candidate-spell-lethal-slain\b/);
      assert.match(error.message, /candidate-spell-lethal-slain-twin\b/);
      assert.doesNotMatch(error.message, /attack direction/);
      // The remedy, named in the refusal: a whole fixture id is a family of one.
      assert.match(error.message, /--family spell-lethal-slain(-twin)?\b/);
      return true;
    }
  );
  // computeCoverage deliberately does NOT refuse: reporting per-member
  // coverage never consults the identity index, and refusing hid the report an
  // operator needs in order to plan the family as several one-fixture rounds.
  const coverage = await sandbox.computeCoverage("spell");
  assert.deepEqual(coverage.rows.map((row) => row.fixtureId).sort(), [
    "candidate-spell-lethal-slain",
    "candidate-spell-lethal-slain-twin"
  ]);
  assert.equal(coverage.campaign.singleRound, false);
  assert.equal(coverage.campaign.actionIdentityCollisions[0].label, "spell id 32");
});

// ---------------------------------------------------------------------------
// campaign.mjs — ingest-round, driven by reference traces in a sandbox
// ---------------------------------------------------------------------------

test("ingest-round files a spell session against the member whose spell id it recorded", async () => {
  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [spellLethal, spellDepleted]
  });
  await stageSession(root, spellDepleted, { sessionId: "session-sp1", observationId: "obs-sp1" });

  const { value, lines } = await withCapturedLog(() => sandbox.commandIngestRound({
    family: "spell",
    session: "session-sp1",
    observation: "obs-sp1"
  }));

  assert.equal(value, 0);
  assert.ok(
    lines.some((line) => line.includes("MATCH obs-sp1") &&
      line.includes("candidate-spell-armour-depleted-full-damage") &&
      line.includes("spell id 34")),
    `expected a spell-id-labelled MATCH line, got:\n${lines.join("\n")}`
  );

  assert.deepEqual(await jsonFileNames(root, "test", "observations", "ss2-1v1"), ["obs-sp1.json"]);
  const filed = await readJson(path.join(root, "test", "observations", "ss2-1v1", "obs-sp1.json"));
  assert.equal(filed.target.fixtureId, "candidate-spell-armour-depleted-full-damage");
  assert.equal(filed.scenario.spellId, 34);
  assert.equal(filed.scenario.attackDirection, undefined);
  assert.equal(validateSs2Observation(filed), filed);
  // A reference trace is not runtime evidence and must never read as any.
  assert.equal(filed.capture.method, SS2_SIMULATED_CAPTURE_METHOD);
  // No divergence report: the run agreed with a candidate in full.
  assert.deepEqual(await jsonFileNames(root, "test", "fixtures", "ss2-1v1-divergences"), []);
});

test("a diverging spell run is reported against the candidate for its own spell id", async () => {
  // The family holds the spell-32 candidate and an edited spell-34 one; the
  // session runs the unedited spell-34 scenario, so nothing matches.
  const edited = cloneJson(spellDepleted);
  edited.expected.state.hero.staminaleft += 1;

  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [spellLethal, edited]
  });
  await stageSession(root, spellDepleted, { sessionId: "session-sp2", observationId: "obs-sp2" });

  const { value, lines } = await withCapturedLog(() => sandbox.commandIngestRound({
    family: "spell",
    session: "session-sp2",
    observation: "obs-sp2"
  }));

  assert.equal(value, 1, "a divergence is a failed round");
  assert.ok(lines.some((line) => line.startsWith("DIVERGE obs-sp2")), lines.join("\n"));
  assert.ok(
    lines.some((line) => line.includes("at /finalState/hero/staminaleft")),
    `the report should name the field that diverged:\n${lines.join("\n")}`
  );

  // The load-bearing assertion: the report is filed against the spell-34
  // candidate, resolved through the spell-id key. Resolving on
  // `scenario.attackDirection` finds nothing for a spell trace and falls back
  // to the family's first member — the spell-32 candidate, which this trace
  // cannot even be ingested against, so no report would be written at all.
  const reports = await jsonFileNames(root, "test", "fixtures", "ss2-1v1-divergences");
  assert.equal(reports.length, 1, `expected exactly one divergence report, got ${reports.join(", ")}`);
  assert.match(reports[0], /^candidate-spell-armour-depleted-full-damage--obs-sp2-[0-9a-f]{8}\.json$/);
  const report = await readJson(path.join(root, "test", "fixtures", "ss2-1v1-divergences", reports[0]));
  assert.equal(report.fixtureId, "candidate-spell-armour-depleted-full-damage");
  assert.equal(report.observationId, "obs-sp2");
  // Nothing was filed as evidence.
  assert.deepEqual(await jsonFileNames(root, "test", "observations", "ss2-1v1"), []);
});

test("a diverging physical run is still reported against the candidate for its own direction", async () => {
  // The same rule from the other ingress, as a regression guard: the family's
  // first member is dir5, and the report must go to dir6 regardless.
  const dir5Candidate = candidateById.get(`candidate-${FAMILY}-dir5`);
  const edited = cloneJson(dir6Candidate);
  edited.expected.state.hero.staminaleft += 1;

  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir5Candidate, edited]
  });
  await stageSession(root, dir6Candidate, { sessionId: "session-ph1", observationId: "obs-ph1" });

  const { value, lines } = await withCapturedLog(() => sandbox.commandIngestRound({
    family: FAMILY,
    session: "session-ph1",
    observation: "obs-ph1"
  }));

  assert.equal(value, 1);
  assert.ok(lines.some((line) => line.startsWith("DIVERGE obs-ph1")), lines.join("\n"));
  const reports = await jsonFileNames(root, "test", "fixtures", "ss2-1v1-divergences");
  assert.equal(reports.length, 1);
  const report = await readJson(path.join(root, "test", "fixtures", "ss2-1v1-divergences", reports[0]));
  assert.equal(report.fixtureId, `candidate-${FAMILY}-dir6`);
  assert.equal(report.observationId, "obs-ph1");
});

test("ingest-round refuses to overwrite an observation record that already exists", async () => {
  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [spellLethal, spellDepleted]
  });
  await stageSession(root, spellLethal, { sessionId: "session-sp3", observationId: "obs-sp3" });
  const run = () => sandbox.commandIngestRound({
    family: "spell",
    session: "session-sp3",
    observation: "obs-sp3"
  });

  assert.equal((await withCapturedLog(run)).value, 0);
  await assert.rejects(
    () => withCapturedLog(run),
    /already exists; refusing to overwrite committed evidence/
  );
});

// ---------------------------------------------------------------------------
// campaign.mjs — --manifest-prefix
// ---------------------------------------------------------------------------

test("--manifest-prefix is still parsed but no longer names anything", async () => {
  // It named the old `<prefix>-dir<n>.json` manifest path. Manifests are now
  // named after the candidate they attest, because attack direction is not
  // unique across a family. The flag is kept so a script that passes it does
  // not fail on an unknown option, and settle says out loud that it is ignored
  // rather than silently dropping an operator's flag.
  assert.deepEqual(parseArgs(["--family", "spell", "--manifest-prefix", "sp"]), {
    family: "spell",
    manifestPrefix: "sp"
  });
  assert.throws(() => parseArgs(["--manifest-prefix"]), /--manifest-prefix needs a value/);

  // Eligible evidence, so settle actually reaches the manifest-writing step:
  // `obs-diag` is dir6's `authoredFrom` and would be refused before then.
  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(["obs-gold3", "obs-camp2"])
  });
  const { value, lines } = await withCapturedLog(() => sandbox.commandSettle({
    family: FAMILY,
    manifestPrefix: "ignored-prefix"
  }));

  assert.equal(value, 0);
  assert.ok(
    lines.some((line) => line.includes("--manifest-prefix ignored-prefix is ignored")),
    `settle must say the flag is ignored, got:\n${lines.join("\n")}`
  );
  // And the manifest really is named after the candidate, not after the prefix
  // and not after the direction.
  assert.deepEqual(await jsonFileNames(root, "test", "manifests"), [`${FAMILY}-dir6.json`]);
  assert.deepEqual(await jsonFileNames(root, "test", "fixtures", "ss2-1v1-golden"), [
    `golden-${FAMILY}-dir6.json`
  ]);
});

test("settle without --manifest-prefix says nothing about it", async () => {
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(["obs-diag"])
  });
  const { value, lines } = await withCapturedLog(() => sandbox.commandSettle({ family: FAMILY }));

  assert.equal(value, 0);
  assert.equal(lines.some((line) => line.includes("manifest-prefix")), false);
  assert.ok(lines.some((line) => line.includes("Nothing to promote.")), lines.join("\n"));
});

// ---------------------------------------------------------------------------
// campaign.mjs — what the driver reads off the wrapper and the launchers
//
// Every answer `plan` gives about *why* a candidate is uncaptured is derived
// from a file in this repository. These tests pin the derivations against the
// things they are derived from, so a wrapper edit that changes the default
// watch list or adds an event emit moves the driver's answer with it instead
// of leaving a stale copy behind.
// ---------------------------------------------------------------------------

const wrapperSource = await readFile(
  path.join(REPO_ROOT, "tools", "runtime-capture", "ss2-capture-wrapper.as"),
  "utf8"
);

test("the default watch list is parsed from the wrapper, not copied into the driver", async () => {
  const defaults = await wrapperDefaultWatchFields();

  // Cross-checked against an independent source rather than against a literal
  // list: the 18 keys ingest projects out of every dump come from
  // src/golden/observation.js, and the wrapper's own comment says the default
  // list is those plus the staged-scenario inputs. If the parse were picking
  // up the wrong array, or a comment, this would fail.
  for (const key of SS2_PROJECTED_COMBATANT_KEYS) {
    assert.ok(defaults.includes(key), `the default watch list must cover the projected key ${key}`);
  }
  assert.equal(new Set(defaults).size, defaults.length, "the wrapper must not list a field twice");
  assert.ok(defaults.length > SS2_PROJECTED_COMBATANT_KEYS.length, "the default list is the projected keys PLUS inputs");
  for (const name of defaults) assert.match(name, /^[a-z][a-z0-9_]*$/, `${name} is not a field name`);

  // And it really is the wrapper's array: every name appears inside the
  // literal the wrapper declares.
  const literal = /var\s+DEFAULT_WATCH_FIELDS\s*=\s*\[([\s\S]*?)\]\s*;/.exec(wrapperSource)[1];
  for (const name of defaults) assert.ok(literal.includes(`"${name}"`), `${name} is not in the wrapper's literal`);

  // `gladiator_dir` is deliberately absent: dumpSide reads it off the fighter
  // clip after the watch loop, which is why a fixture staging it needs no
  // extra watch field.
  assert.equal(defaults.includes("gladiator_dir"), false);
});

test("the emittable event types are parsed from the wrapper's own emit calls", async () => {
  const emitted = await wrapperEmittedEventTypes();

  // Cross-checked against an independent scan of the same file rather than
  // against a literal roster. The wrapper is under active development — the
  // magic-damage emit landed while this driver was being written — and the
  // whole point of reading the answer out of the source is that it moves when
  // the source moves. A test pinning today's set would have to be edited by
  // whoever changes the wrapper, which is exactly the coupling this avoids.
  const scanned = new Set(
    [...wrapperSource.matchAll(/emit\(\{[^}]*?type:\s*"([a-z][a-z-]*)"/g)].map((match) => match[1])
  );
  assert.ok(scanned.size >= 4, "the wrapper should emit several event types");
  assert.deepEqual([...emitted].sort(), [...scanned].sort());

  // The three the physical ingress has always needed must be there, or every
  // promoted golden's candidate would report a blocker.
  for (const type of ["defender-hurt", "defender-blocked", "death", "overlay-label"]) {
    assert.ok(emitted.has(type), `the wrapper must still emit ${type}`);
  }
});

test("captureVehicles reads each launcher's staging and watch-field support from its own param block", async () => {
  const vehicles = await captureVehicles();
  const byName = new Map(vehicles.map((vehicle) => [path.posix.basename(vehicle.script), vehicle]));

  assert.deepEqual(byName.get("run-arena.ps1"), {
    script: "tools/runtime-capture/run-arena.ps1", watchFields: true, staging: true
  });
  assert.deepEqual(byName.get("run-capture.ps1"), {
    script: "tools/runtime-capture/run-capture.ps1", watchFields: true, staging: false
  });
  assert.deepEqual(byName.get("run-campaign.ps1"), {
    script: "tools/runtime-capture/run-campaign.ps1", watchFields: false, staging: false
  });
  assert.deepEqual(byName.get("launch-capture.ps1"), {
    script: "tools/runtime-capture/launch-capture.ps1", watchFields: true, staging: true
  });

  // The operational consequence, derived rather than asserted from prose. TWO
  // scripts now expose both, and which two is the whole point: the champion
  // family needs a staged opponent AND eleven extra watch fields, and until
  // run-arena.ps1 gained -WatchFields the only vehicle that could serve it was
  // launch-capture.ps1 — which has NO snapshot guard, on a route that mutates
  // the licensed save on every town-square entry.
  //
  // The guard was deliberately not moved onto launch-capture.ps1 instead:
  // run-campaign.ps1 drives that script at -Concurrency 3 with isolated
  // -SaveDirectory stores that mutate nothing, so a guard there would have to
  // be opt-out — and an opt-out gate is the defect class this project already
  // closed once, when the launch-nonce gate turned out to be opt-out and two
  // forgeries walked through it.
  const both = vehicles.filter((vehicle) => vehicle.watchFields && vehicle.staging);
  assert.deepEqual(both.map((vehicle) => vehicle.script), [
    "tools/runtime-capture/run-arena.ps1",
    "tools/runtime-capture/launch-capture.ps1"
  ]);
  // And run-campaign.ps1 — the driver's own wrapper — exposes neither, which
  // is why it cannot drive any of the staged families as it stands.
  assert.equal(byName.get("run-campaign.ps1").watchFields, false);
  assert.equal(byName.get("run-campaign.ps1").staging, false);
});

test("computeCoverage fails loudly when it cannot read the wrapper it derives from", async () => {
  const { root, campaign: sandbox } = await createCampaignSandbox({ candidates: [dir6Candidate] });
  await rm(path.join(root, "tools", "runtime-capture", "ss2-capture-wrapper.as"));

  await assert.rejects(
    () => sandbox.computeCoverage(FAMILY),
    (error) => {
      assert.match(error.message, /Cannot read the capture wrapper/);
      // Silently falling back to a hard-coded default is the failure this
      // guards: it would report a watch list the session does not use.
      assert.match(error.message, /rather than carrying a copy/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// campaign.mjs — the extra watch fields, derived from each fixture's own
// staged scenario
// ---------------------------------------------------------------------------

const defaultWatchFields = await wrapperDefaultWatchFields();
const extraFor = (fixtureId) => extraWatchFieldsFor(candidateById.get(fixtureId), defaultWatchFields);

test("extraWatchFieldsFor is the fixture's staged fields minus the wrapper's default list", () => {
  // Composed from two rules that already exist, so it is right for a fixture
  // nobody has written yet: ingest projects Object.keys(scenario.<side>) out of
  // the staged dump and refuses when one is missing, and dumpSide writes
  // exactly the watched fields. The expectations below are therefore
  // consequences, not a maintained roster — each is recomputed from the
  // fixture on disk in the loop underneath.
  //
  // Stated first, because every expectation below depends on it: the wrapper's
  // default list still omits the per-piece defence ratings and the weapon
  // fields. If that changes, these lists change with it, and this assertion
  // says so rather than leaving a confusing diff.
  assert.equal(
    defaultWatchFields.some((name) => name.endsWith("_defence")),
    false,
    "the default watch list still omits every <piece>_defence name"
  );
  for (const name of ["equipped_weapon", "weapon_enchantment_type", "weapon_enchantment_potency"]) {
    assert.equal(defaultWatchFields.includes(name), false, `the default list still omits ${name}`);
  }

  assert.deepEqual(extraFor("candidate-armoured-removal-destroys-helmet"), [
    "helmet_defence", "shoulderguard_defence"
  ]);
  assert.deepEqual(extraFor("candidate-armoured-removal-destroys-shoulderguard"), [
    "helmet_defence", "shoulderguard_defence"
  ]);
  assert.deepEqual(extraFor("candidate-armour-equality-quirk"), ["boot_defence"]);
  assert.deepEqual(extraFor("candidate-armour-removal-debris"), ["helmet_defence", "shield_defence"]);
  assert.deepEqual(extraFor("candidate-deflection-threshold-discriminator"), [
    "greaves_defence", "helmet_defence"
  ]);
  assert.deepEqual(extraFor("candidate-snipe-shield-boost"), ["shield_defence"]);
  assert.deepEqual(extraFor("candidate-armour-overflow-burning"), [
    "equipped_weapon", "weapon_enchantment_potency", "weapon_enchantment_type"
  ]);
  assert.deepEqual(extraFor("candidate-frozen-enchantment-proc"), [
    "equipped_weapon", "weapon_enchantment_potency", "weapon_enchantment_type"
  ]);

  // The families the runbook records as needing nothing.
  for (const id of [
    "candidate-armoured-deflection-threshold-cleared",
    "candidate-armoured-deflection-threshold-critical",
    "candidate-armoured-equality-quirk",
    "candidate-tournament-nonlethal-normal-hit",
    "candidate-tournament-boundary-at-max",
    "candidate-tournament-boundary-below-max"
  ]) assert.deepEqual(extraFor(id), [], id);
});

test("every candidate's extra watch fields recompute from its own scenario, and never name gladiator_dir", () => {
  const known = new Set(defaultWatchFields);
  for (const entry of candidateEntries) {
    const fixture = entry.value;
    const derived = extraWatchFieldsFor(fixture, defaultWatchFields);
    const staged = new Set([
      ...Object.keys(fixture.scenario.hero),
      ...Object.keys(fixture.scenario.villain)
    ]);

    for (const field of derived) {
      assert.ok(staged.has(field), `${fixture.fixtureId}: ${field} is not staged by the fixture at all`);
      assert.equal(known.has(field), false, `${fixture.fixtureId}: ${field} is already watched by default`);
    }
    for (const field of staged) {
      if (known.has(field) || field === "gladiator_dir") continue;
      assert.ok(derived.includes(field), `${fixture.fixtureId}: ${field} is staged but unwatched and unreported`);
    }
    // gladiator_dir is dumped from the fighter clip, never watched.
    assert.equal(derived.includes("gladiator_dir"), false, fixture.fixtureId);
    assert.deepEqual(derived, [...derived].sort(), `${fixture.fixtureId}: the list must be stable`);
  }
});

test("the five champion candidates each need eleven extra watch fields", () => {
  // Load-bearing: the champion bout is the handoff's next step, and every one
  // of the five stages the full per-piece defence set plus the weapon fields,
  // so ingest would refuse all five on the wrapper's default watch list.
  //
  // run-arena.ps1 now exposes -WatchFields, so the command that needs these is
  // finally available from the one vehicle that also snapshots the save. The
  // vehicle test above pins that; this one pins the eleven fields themselves.
  const championIds = candidateEntries
    .map((entry) => entry.value.fixtureId)
    .filter((id) => id.startsWith("candidate-champion-"))
    .sort();
  assert.equal(championIds.length, 5);

  const expected = [
    "boot_defence", "breastplate_defence", "equipped_weapon", "gauntlet_defence", "greaves_defence",
    "helmet_defence", "shield_defence", "shinguard_defence", "shoulderguard_defence",
    "weapon_enchantment_potency", "weapon_enchantment_type"
  ];
  for (const id of championIds) assert.deepEqual(extraFor(id), expected, id);
});

test("unstageableScenarioFieldsFor finds exactly the fields -Stage* cannot write", () => {
  // parseStageList refuses a non-numeric value outright (it traces
  // `stage-refused` and moves on), so a boolean status flag has no staging
  // route at all. gladiator_dir is a string too, but it is observed off the
  // fighter clip rather than staged, so it is excluded by name.
  assert.match(wrapperSource, /function parseStageList/);
  assert.match(wrapperSource, /stage-refused/);

  const blocked = candidateEntries
    .map((entry) => ({ id: entry.value.fixtureId, fields: unstageableScenarioFieldsFor(entry.value) }))
    .filter((entry) => entry.fields.length > 0);

  assert.deepEqual(blocked.map((entry) => entry.id).sort(), [
    "candidate-lethal-result",
    "candidate-spell-first-blood-duel",
    "candidate-spell-lethal-slain"
  ]);
  for (const entry of blocked) {
    for (const field of entry.fields) {
      assert.equal(typeof field.value, "boolean", `${entry.id}.${field.field} should be a boolean status`);
      assert.notEqual(field.field, "gladiator_dir");
      assert.equal(candidateById.get(entry.id).scenario[field.side][field.field], field.value);
    }
  }
});

// ---------------------------------------------------------------------------
// campaign.mjs — the derived blockers, and the check that falsifies them
// ---------------------------------------------------------------------------

test("NO promoted candidate carries a derived blocker", async () => {
  // The falsifiability check for the whole derivation. Every one of the 22
  // promoted goldens was captured with the tooling exactly as it stands, so a
  // blocker on any of their candidates would mean the derivation invents
  // obstacles rather than reading them. This is the assertion that would fail
  // first if the watch-field rule, the event rule or the staging rule were
  // over-eager.
  assert.ok(goldenEntries.length >= 22, "expected the full promoted set");
  const promotedCandidateIds = new Set(
    goldenEntries.map((entry) => `candidate-${entry.value.fixtureId.slice("golden-".length)}`)
  );
  // Grouped only to keep the test cheap — stripping a trailing `-dirN` folds
  // the twelve prisoner goldens into three coverage runs. The assertion at the
  // end proves the grouping missed nothing.
  const families = new Set([...promotedCandidateIds]
    .map((id) => id.replace(/^candidate-/, "").replace(/-dir\d+$/, "")));

  const inspected = new Set();
  for (const family of families) {
    for (const row of (await computeCoverage(family)).rows) {
      if (!promotedCandidateIds.has(row.fixtureId)) continue;
      inspected.add(row.fixtureId);
      assert.equal(row.hasGolden, true, row.fixtureId);
      assert.deepEqual(row.blockers, [], `${row.fixtureId} is promoted, so no blocker may be derived for it`);
      assert.deepEqual(row.extraWatchFields, [], `${row.fixtureId} was captured on the default watch list`);
      assert.deepEqual(row.notes, [], `${row.fixtureId} was captured, so its fight mode is observed`);
    }
  }
  assert.deepEqual([...inspected].sort(), [...promotedCandidateIds].sort());
});

test("a fixture whose ingress needs an event the wrapper cannot emit is blocked, naming that event", async () => {
  // Driven against a DOCTORED copy of the wrapper rather than against whatever
  // the real one emits today, so the rule is tested rather than the moment.
  // The spell ingress is the case that matters: ingest keys the spell dispatch
  // on `events.some(e => e.type === "magic-damage")`, so a wrapper that cannot
  // emit it cannot produce a spell observation at all — and no flag reaches
  // that, unlike every other blocker the driver derives.
  const { root, campaign: sandbox } = await createCampaignSandbox({ candidates: [spellLethal] });
  const wrapperPath = path.join(root, "tools", "runtime-capture", "ss2-capture-wrapper.as");
  const doctored = (await readFile(wrapperPath, "utf8"))
    .replace(/emit\(\{\s*t:\s*"event",\s*type:\s*"magic-damage"[^;]*;/g, "/* removed for this test */;");
  assert.equal(/type:\s*"magic-damage"/.test(doctored), false, "the emit must actually be gone");
  await writeFile(wrapperPath, doctored, "utf8");

  const [row] = (await sandbox.computeCoverage("spell-lethal-slain")).rows;
  const blocker = row.blockers.find((entry) => entry.code === "wrapper-emits-no-event");
  assert.ok(blocker, `expected a wrapper-emits-no-event blocker, got ${JSON.stringify(row.blockers)}`);
  assert.deepEqual(blocker.fields, ["magic-damage"]);
  assert.match(blocker.detail, /No flag reaches this; it is a wrapper change\./);

  // Derived from the fixture's own ingress, not from its family name: the
  // required event list is deriveExpectedEventsFromSs2Fixture's.
  const required = deriveExpectedEventsFromSs2Fixture(spellLethal).map((event) => event.type);
  assert.ok(required.includes("magic-damage"));

  // The same doctored wrapper leaves the physical ingress alone, so the
  // blocker is specific to the event a fixture actually needs rather than a
  // blanket verdict on the wrapper.
  await cp(
    path.join(REPO_ROOT, "test", "fixtures", "ss2-1v1", `${dir6Candidate.fixtureId}.json`),
    path.join(root, "test", "fixtures", "ss2-1v1", `${dir6Candidate.fixtureId}.json`)
  );
  const [physicalRow] = (await sandbox.computeCoverage(FAMILY)).rows;
  assert.equal(physicalRow.fixtureId, dir6Candidate.fixtureId);
  assert.equal(physicalRow.blockers.some((entry) => entry.code === "wrapper-emits-no-event"), false);
});

test("the spell family's remaining blockers are the staging ones, and a fixture may carry several", async () => {
  const coverage = await computeCoverage("spell");
  assert.equal(coverage.rows.length, 8);
  for (const row of coverage.rows) assert.equal(row.action.ingress, "spell");

  // Wrapper-independent: these come from the fixtures' own staged scenarios.
  const withStagingBlocker = coverage.rows
    .filter((row) => row.blockers.some((blocker) => blocker.code === "unstageable-field"))
    .map((row) => row.fixtureId)
    .sort();
  assert.deepEqual(withStagingBlocker, ["candidate-spell-first-blood-duel", "candidate-spell-lethal-slain"]);

  // candidate-spell-lethal-slain carries two at once, and both are reported:
  // a fixture is not "blocked by" one reason picked out of several.
  const lethal = coverage.rows.find((row) => row.fixtureId === "candidate-spell-lethal-slain");
  const codes = lethal.blockers.map((blocker) => blocker.code).sort();
  assert.deepEqual(codes.filter((code) => code !== "wrapper-emits-no-event"), [
    "needs-watch-fields", "unstageable-field"
  ]);
  assert.deepEqual(
    lethal.blockers.find((blocker) => blocker.code === "needs-watch-fields").fields,
    ["breastplate_defence"]
  );
});

test("plan names the unobserved fight mode as a note, not as a blocker", async () => {
  // A first observation of `fight_mode == "tournament"` is a finding, not a
  // refusal, and the driver has to keep the two apart. The set of already
  // observed modes is read off the committed runtime observations, so the note
  // disappears by itself on the first successful tournament capture.
  const coverage = await computeCoverage("tournament");
  assert.equal(coverage.rows.length, 3);
  for (const row of coverage.rows) {
    assert.deepEqual(row.blockers, [], `${row.fixtureId} has no derivable blocker`);
    assert.deepEqual(row.notes.map((note) => note.code), ["unobserved-fight-mode"]);
    assert.match(row.notes[0].detail, /fight_mode "tournament"/);
  }

  // The archive really has never recorded it, and really has recorded the
  // other two the note cites.
  const runtimeModes = new Set(observationEntries
    .filter((entry) => entry.value.capture.method !== SS2_SIMULATED_CAPTURE_METHOD)
    .map((entry) => entry.value.scenario.fightMode)
    .filter((mode) => mode !== undefined));
  assert.equal(runtimeModes.has("tournament"), false);
  assert.deepEqual([...runtimeModes].sort(), ["duel", "misc"]);

  // And a family whose mode HAS been observed gets no such note.
  const misc = await computeCoverage(FAMILY);
  for (const row of misc.rows) assert.deepEqual(row.notes, [], row.fixtureId);
});

// ---------------------------------------------------------------------------
// campaign.mjs — campaign shape: one round, or one candidate at a time
// ---------------------------------------------------------------------------

const shapeOf = async (family) => campaignShapeFor(await readFamilyMembers(family));

test("the prisoner band is a single-round family", async () => {
  const shape = await shapeOf(FAMILY);

  assert.equal(shape.memberCount, 4);
  assert.equal(shape.oneFixture, false);
  assert.deepEqual(shape.actionIdentityCollisions, []);
  assert.equal(shape.distinctTapes, 1, "one injected tape drives all four directions");
  assert.equal(shape.singleRound, true, "run-campaign.ps1 can drive the whole family");
});

test("champion, armoured and tournament are correctly refused as single-tape campaigns", async () => {
  // The refusal is not a defect in the driver: these families really are
  // several different fights sharing an id stem. Each fails BOTH invariants
  // independently — members collide on the action identity, and every member
  // carries its own injected samples — so neither could be relaxed into a
  // single round without feeding one member's rolls into another's call order.
  for (const [family, members, collisions] of [["champion", 5, 2], ["armoured", 5, 1], ["tournament", 3, 1]]) {
    const shape = await shapeOf(family);
    assert.equal(shape.memberCount, members, family);
    assert.equal(shape.singleRound, false, family);
    assert.equal(shape.actionIdentityCollisions.length, collisions, family);
    assert.equal(shape.distinctTapes, members, `${family}: every member needs its own tape`);
    // And the remedy it prints is a family name that really selects one member.
    assert.equal(shape.oneFixtureFamilies.length, members, family);
    for (const name of shape.oneFixtureFamilies) {
      const one = await readFamilyMembers(name);
      assert.equal(one.length, 1, `--family ${name} must select exactly one fixture`);
    }
  }

  // The champion collisions are the two melee bands the DNA decode drives.
  const champion = await shapeOf("champion");
  assert.deepEqual(champion.actionIdentityCollisions.map((entry) => entry.label).sort(), [
    "attack direction 5", "attack direction 9"
  ]);
});

test("a one-fixture family is a single-round family by construction", async () => {
  for (const family of [
    "armoured-deflection-threshold-cleared",
    "tournament-nonlethal-normal-hit",
    "champion-power-hat-removal",
    "prisoner-normal-kill-dir6"
  ]) {
    const shape = await shapeOf(family);
    assert.equal(shape.memberCount, 1, family);
    assert.equal(shape.oneFixture, true, family);
    assert.deepEqual(shape.actionIdentityCollisions, [], family);
    assert.equal(shape.distinctTapes, 1, family);
    assert.equal(shape.singleRound, true, family);
  }
});

// ---------------------------------------------------------------------------
// campaign.mjs — the one-fixture campaign, end to end
//
// The runbook's answer to the families above is "run them one candidate at a
// time". That is not a workaround needing new code — `isFamilyMember`'s
// exact-match arm already makes a whole fixture id a family of one — but
// nothing exercised every command through it, so nothing said so.
// ---------------------------------------------------------------------------

test("every uncaptured candidate is addressable as its own one-fixture family", async () => {
  const goldenIds = new Set(goldenEntries.map((entry) => entry.value.fixtureId));
  const uncaptured = candidateEntries
    .map((entry) => entry.value.fixtureId)
    .filter((id) => !goldenIds.has(goldenFixtureIdFor(id)));
  assert.ok(uncaptured.length >= 33, `expected the uncaptured set, got ${uncaptured.length}`);

  for (const fixtureId of uncaptured) {
    const family = fixtureId.replace(/^candidate-/, "");
    const members = await readFamilyMembers(family);
    assert.deepEqual(
      members.map((member) => member.fixture.fixtureId),
      [fixtureId],
      `--family ${family} must select exactly ${fixtureId}`
    );
    // seed serves it: one member, so one tape, trivially.
    const loaded = await loadFamily(family);
    assert.equal(loaded.members.length, 1);
    assert.equal(loaded.byActionKey.size, 1);
  }
});

test("plan, seed, watch-fields, ingest-round and settle all serve a one-fixture family", async () => {
  // Driven with a candidate that has extra watch fields, so the watch-fields
  // command has something to say, and against a reference trace so the whole
  // loop runs.
  const target = candidateById.get("candidate-armoured-removal-destroys-helmet");
  const { root, campaign: sandbox } = await createCampaignSandbox({ candidates: [target] });
  const family = "armoured-removal-destroys-helmet";

  const coverage = await sandbox.computeCoverage(family);
  assert.equal(coverage.rows.length, 1);
  assert.equal(coverage.campaign.oneFixture, true);
  assert.equal(coverage.campaign.singleRound, true);
  assert.deepEqual(coverage.rows[0].extraWatchFields, ["helmet_defence", "shoulderguard_defence"]);

  const planned = await withCapturedLog(() => sandbox.commandPlan({ family }));
  assert.equal(planned.value, 0);
  assert.ok(
    planned.lines.some((line) => line.includes("ONE-FIXTURE")),
    `plan must say the family is one fixture:\n${planned.lines.join("\n")}`
  );
  assert.ok(
    planned.lines.some((line) => line.includes('-WatchFields "helmet_defence,shoulderguard_defence"')),
    `plan must name the flag value:\n${planned.lines.join("\n")}`
  );

  // seed and watch-fields both write one line to stdout, the two values a
  // round needs.
  const stdout = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdout.push(String(chunk)); return true; };
  try {
    assert.equal(await sandbox.commandSeed({ family }), 0);
    assert.equal(await sandbox.commandWatchFields({ family }), 0);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(stdout[0].trim(), path.join("test", "fixtures", "ss2-1v1", `${target.fixtureId}.json`));
  assert.equal(stdout[1].trim(), "helmet_defence,shoulderguard_defence");

  // Two independent sessions, ingested one at a time, then settled.
  for (const n of [1, 2]) {
    await stageSession(root, target, { sessionId: `session-one${n}`, observationId: `obs-one${n}` });
    const { value, lines } = await withCapturedLog(() => sandbox.commandIngestRound({
      family, session: `session-one${n}`, observation: `obs-one${n}`
    }));
    assert.equal(value, 0, lines.join("\n"));
    assert.ok(lines.some((line) => line.includes(`MATCH obs-one${n}`) && line.includes(target.fixtureId)));
  }

  // settle sees the one-member family as promotable and takes it all the way
  // to the gate — which then refuses, because reference traces are not runtime
  // evidence. That refusal is the point: the one-fixture mode is a bookkeeping
  // path, and it does not become a way to promote a fixture from a simulation.
  const settled = await withCapturedLog(() => sandbox.commandSettle({ family }));
  assert.equal(settled.value, 1, settled.lines.join("\n"));
  assert.ok(
    settled.lines.some((line) => line.includes("PROMOTABLE")),
    `the one-fixture family reaches the gate:\n${settled.lines.join("\n")}`
  );
  assert.ok(
    settled.lines.some((line) =>
      line.includes(`Promotion of ${target.fixtureId} blocked`) &&
      line.includes("synthetic simulator trace")),
    settled.lines.join("\n")
  );
  assert.deepEqual(await jsonFileNames(root, "test", "fixtures", "ss2-1v1-golden"), []);
});

// ---------------------------------------------------------------------------
// campaign.mjs — the watch-fields command
// ---------------------------------------------------------------------------

async function captureStdout(body) {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    const value = await body();
    return { value, text: chunks.join("") };
  } finally {
    process.stdout.write = original;
  }
}

test("watch-fields prints the string a round needs, and an empty line when the default suffices", async () => {
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [
      candidateById.get("candidate-armoured-removal-destroys-helmet"),
      candidateById.get("candidate-tournament-nonlethal-normal-hit"),
      dir6Candidate
    ]
  });

  const needs = await captureStdout(() => sandbox.commandWatchFields({
    family: "armoured-removal-destroys-helmet"
  }));
  assert.equal(needs.value, 0);
  assert.equal(needs.text, "helmet_defence,shoulderguard_defence\n");

  // Empty is a real answer, not a failure: most families run on the default
  // list, and a caller has to be able to tell "nothing extra" from "refused".
  for (const family of ["tournament-nonlethal-normal-hit", FAMILY]) {
    const none = await captureStdout(() => sandbox.commandWatchFields({ family }));
    assert.equal(none.value, 0, family);
    assert.equal(none.text, "\n", family);
  }
});

test("watch-fields refuses a family whose members disagree, exactly as seed refuses divergent tapes", async () => {
  // The refusal is substantive: -WatchFields installs an Object.watch per
  // name, the watch fires per assignment, and the mutation trace is compared
  // in full — so watching a field for one member can add a line to another
  // member's trace and diverge a run that was otherwise correct. Passing the
  // union would trade a refusal for an unexplainable divergence.
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [
      candidateById.get("candidate-armoured-removal-destroys-helmet"),
      candidateById.get("candidate-armoured-equality-quirk")
    ]
  });

  await assert.rejects(
    () => sandbox.commandWatchFields({ family: "armoured" }),
    (error) => {
      assert.match(error.message, /do not agree on the extra watch fields/);
      assert.match(error.message, /candidate-armoured-removal-destroys-helmet/);
      assert.match(error.message, /helmet_defence,shoulderguard_defence/);
      assert.match(error.message, /the default list is enough/);
      assert.match(error.message, /one candidate at a time/);
      return true;
    }
  );

  // --json reports every member instead of refusing, because a report is not
  // a command line and cannot mis-serve a round.
  const listed = await captureStdout(() => sandbox.commandWatchFields({ family: "armoured", json: true }));
  assert.equal(listed.value, 0);
  const parsed = JSON.parse(listed.text);
  assert.equal(parsed.family, "armoured");
  assert.deepEqual(
    Object.fromEntries(parsed.members.map((member) => [member.fixtureId, member.fields])),
    {
      "candidate-armoured-equality-quirk": [],
      "candidate-armoured-removal-destroys-helmet": ["helmet_defence", "shoulderguard_defence"]
    }
  );
  assert.deepEqual(parsed.defaultWatchFields, defaultWatchFields);
});

test("watch-fields is a registered subcommand and takes the same flags as plan", () => {
  assert.deepEqual(parseArgs(["--family", "armoured-removal-destroys-helmet", "--json"]), {
    family: "armoured-removal-destroys-helmet",
    json: true
  });
});

// ---------------------------------------------------------------------------
// campaign.mjs — the vehicle table has a floor
//
// `captureVehicles` used to swallow ENOENT per script, so a launcher it could
// not open became a launcher with no capabilities. That is a SILENT
// under-report and it points the wrong way. With all four gone, plan printed
// `pass -WatchFields "..."` and, three lines later, "Exposed by: nothing." —
// exit 0, no contradiction flagged. With only run-arena.ps1 gone it was worse:
// the staging line then named launch-capture.ps1, the route with NO snapshot
// guard, as the only vehicle for a staged capture on a save-mutating route.
//
// The two tests below are the floor. Reverting the throw to
// `if (error.code === "ENOENT") continue;` turns both red.
// ---------------------------------------------------------------------------

const LAUNCHER_NAMES = ["run-campaign.ps1", "run-capture.ps1", "run-arena.ps1", "launch-capture.ps1"];

test("captureVehicles refuses when a launcher it derives from cannot be read, and names it", async () => {
  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [candidateById.get("candidate-champion-power-hat-removal")]
  });
  const family = "champion-power-hat-removal";

  // Positive control. Without it, a sandbox broken for any other reason would
  // make the refusal below pass while proving nothing, and the answer being
  // controlled here is exactly the one plan's staging line is built from.
  const present = await sandbox.captureVehicles();
  assert.deepEqual(present.map((vehicle) => path.posix.basename(vehicle.script)), LAUNCHER_NAMES);
  assert.deepEqual(
    present
      .filter((vehicle) => vehicle.watchFields && vehicle.staging)
      .map((vehicle) => path.posix.basename(vehicle.script)),
    ["run-arena.ps1", "launch-capture.ps1"]
  );

  // The realistic trigger is a rename, a move, or a relocation of campaign.mjs
  // — LAUNCHER_DIR is derived from import.meta.url and cannot be misconfigured
  // by an argument.
  await rm(path.join(root, "tools", "runtime-capture", "run-arena.ps1"));

  await assert.rejects(() => sandbox.captureVehicles(), (error) => {
    assert.match(error.message, /Cannot read 1 of the 4 capture launchers/);
    assert.match(error.message, /run-arena\.ps1/);
    // The refusal has to say why silence was the wrong answer, or the next
    // person to hit it widens it back out.
    assert.match(error.message, /refuses rather than under-reporting/);
    return true;
  });

  // The floor is on the path `plan` takes, not only on the helper: a report
  // that recommends a vehicle must not be printable from a launcher set the
  // driver could not read.
  await assert.rejects(
    () => sandbox.computeCoverage(family),
    /Cannot read 1 of the 4 capture launchers/
  );
  await assert.rejects(
    () => sandbox.commandPlan({ family }),
    /Cannot read 1 of the 4 capture launchers/
  );
});

test("the vehicle floor names EVERY launcher it could not read, not just the first", async () => {
  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [candidateById.get("candidate-champion-power-hat-removal")]
  });
  for (const name of LAUNCHER_NAMES) {
    await rm(path.join(root, "tools", "runtime-capture", name));
  }

  await assert.rejects(() => sandbox.computeCoverage("champion-power-hat-removal"), (error) => {
    assert.match(error.message, /Cannot read 4 of the 4 capture launchers/);
    for (const name of LAUNCHER_NAMES) {
      assert.ok(
        error.message.includes(name),
        `the refusal must name ${name}, got: ${error.message}`
      );
    }
    return true;
  });
});

// ---------------------------------------------------------------------------
// campaign.mjs — the sampling note, and why it is a note
//
// `plan --family armoured-deflection-threshold-cleared --json` used to return
// `observations: []`, `sessionCount: 0`, `blockers: []` — byte-identical to
// the report for a fixture nobody has ever run — while six divergence reports
// for that exact fixtureId, written by this driver's own `ingest-round`, sat
// committed in test/fixtures/ss2-1v1-divergences.
//
// What those reports say is a SAMPLING fact, not a tooling one. The direction
// this fixture stages is reachable: one of its own six reports records it and
// diverges elsewhere, and the candidate engine resolves it through a band of
// four. So the remedy is more rounds, and reporting it as a blocker would send
// an operator to write code where the answer is to book time. It is therefore
// a note — and the tests below pin that it is a note, not merely that it
// exists.
// ---------------------------------------------------------------------------

const ARMOURED_TARGET = "candidate-armoured-deflection-threshold-cleared";
const armouredReports = divergenceEntries
  .map((entry) => entry.value)
  .filter((report) => report.fixtureId === ARMOURED_TARGET);
const identityDifferenceIn = (report) =>
  report.differences.find((entry) => entry.path === "/scenario/attackDirection");

/**
 * One committed report, re-aimed at a different round: a new observation and
 * session, and either a different recorded direction or none at all.
 *
 * The note tests are driven from these rather than from the live archive, and
 * the reason is the defect class this suite exists to refuse. Asserting the
 * note's exact text against however many reports the archive holds TODAY makes
 * a snapshot of the present into an invariant: the next armoured round files a
 * seventh report and the test goes red on success. The floors below say the
 * archive really has this shape; the controlled input says what the driver
 * does with it.
 */
function divergenceVariant(base, { observationId, sessionId, actual }) {
  const report = cloneJson(base);
  report.observationId = observationId;
  report.sessionId = sessionId;
  if (actual === undefined) {
    report.differences = report.differences.filter((entry) => entry !== identityDifferenceIn(report));
  } else {
    identityDifferenceIn(report).actual = actual;
  }
  return report;
}

test("the committed divergence archive really holds the rounds these tests are built on", () => {
  // Floors, never counts. The archive is meant to grow — HANDOFF's next step
  // is more rounds of this very fixture — so an equality here would break on
  // the intended future.
  assert.ok(divergenceEntries.length > 0, "the committed divergence archive is empty");
  assert.ok(armouredReports.length >= 6, `only ${armouredReports.length} armoured reports survive`);
  assert.ok(
    new Set(armouredReports.map((report) => report.sessionId)).size >= 6,
    "the armoured reports no longer come from independent sessions"
  );

  // The two populations the note is built out of, and both must be non-empty:
  // rounds that recorded another direction, and at least one that recorded the
  // direction this fixture stages and diverged for some other reason. That
  // second one is the repository's own evidence that the identity is REACHABLE,
  // which is what makes the note a note instead of a blocker.
  const diverged = armouredReports.filter((report) => identityDifferenceIn(report) !== undefined);
  assert.ok(diverged.length >= 5, `only ${diverged.length} armoured rounds missed the identity`);
  assert.ok(
    armouredReports.length - diverged.length >= 1,
    "no archived armoured round ever recorded attack direction 5, so the note's reachability " +
    "claim has lost its evidence and this should be a blocker instead"
  );
  for (const report of diverged) {
    assert.equal(identityDifferenceIn(report).expected, 5, report.observationId);
  }
});

test("plan reports the rounds a fixture has already burned, as a note and never as a blocker", async () => {
  const target = candidateById.get(ARMOURED_TARGET);
  const family = "armoured-deflection-threshold-cleared";
  const base = armouredReports.find((report) => identityDifferenceIn(report) !== undefined);
  const matched = armouredReports.find((report) => identityDifferenceIn(report) === undefined);
  assert.ok(base && matched, "the archive no longer holds both shapes this test is built from");

  // Six controlled rounds: five that drew another direction (two of them from
  // outside the normal band entirely) and one that drew this fixture's own.
  const seeded = [
    divergenceVariant(base, { observationId: "obs-s1", sessionId: "session-s1", actual: 4 }),
    divergenceVariant(base, { observationId: "obs-s2", sessionId: "session-s2", actual: 8 }),
    divergenceVariant(base, { observationId: "obs-s3", sessionId: "session-s3", actual: 8 }),
    divergenceVariant(base, { observationId: "obs-s4", sessionId: "session-s4", actual: 10 }),
    divergenceVariant(base, { observationId: "obs-s5", sessionId: "session-s5", actual: 11 }),
    divergenceVariant(matched, { observationId: "obs-s6", sessionId: "session-s6" })
  ];

  // The two sandboxes differ in ONE thing: whether the archive holds this
  // fixture's reports. Everything else — candidates, goldens, observations,
  // wrapper, launchers — is identical, so any difference between the two rows
  // is the archive being read.
  const { campaign: unrun } = await createCampaignSandbox({ candidates: [target] });
  const { campaign: attempted } = await createCampaignSandbox({
    candidates: [target],
    divergences: seeded
  });
  const [never] = (await unrun.computeCoverage(family)).rows;
  const [burned] = (await attempted.computeCoverage(family)).rows;

  // The defect: these two rows used to be indistinguishable.
  assert.equal(never.divergenceReports, 0);
  assert.equal(burned.divergenceReports, 6);
  // The unrun row still carries the fight-mode note both rows share, so
  // "no sampling note" below is a real absence and not an empty derivation.
  assert.deepEqual(never.notes.map((note) => note.code), ["unobserved-fight-mode"]);
  assert.deepEqual(burned.notes.map((note) => note.code), [
    "unobserved-fight-mode",
    "action-identity-not-sampled"
  ]);

  const sampling = burned.notes.find((note) => note.code === "action-identity-not-sampled");
  assert.ok(sampling, `expected a sampling note, got ${JSON.stringify(burned.notes)}`);
  assert.deepEqual(sampling.fields, ["4", "8", "8", "10", "11"]);
  assert.match(sampling.detail, /6 committed divergence report\(s\) for this fixture, across 6 session\(s\)/);
  assert.match(sampling.detail, /5 recorded attack direction 4, 8, 8, 10, 11/);
  // The reachability evidence, which is what decides note-versus-blocker.
  assert.match(sampling.detail, /1 recorded that identity and diverged for another reason/);
  // The expected round count, and the remedy it implies.
  assert.match(sampling.detail, /attack direction 5, 6, 7, 8 through one profile/);
  assert.match(sampling.detail, /about one round in 4/);
  assert.match(sampling.detail, /the remedy is more rounds, not a code change/);
  // Three of the five landed outside the band entirely (10, 11 and 4), so the
  // band's odds do not account for them and the note must not pretend they do.
  assert.match(sampling.detail, /3 of the 5 recorded an identity OUTSIDE that band/);

  // A NOTE. The archive may add to what an operator is told and must never add
  // to what the driver claims will refuse: `blockers` is byte-identical across
  // the two sandboxes.
  assert.deepEqual(burned.blockers, never.blockers);
  assert.equal(
    burned.blockers.some((blocker) => blocker.code === "action-identity-not-sampled"),
    false,
    "a sampling problem is not a refusal waiting to happen"
  );

  // And it reaches the operator's actual report, not only --json.
  const printed = await withCapturedLog(() => attempted.commandPlan({ family }));
  assert.equal(printed.value, 0);
  assert.ok(
    printed.lines.some((line) => line.includes("note (action-identity-not-sampled)")),
    `plan must print the sampling note:\n${printed.lines.join("\n")}`
  );
  assert.equal(
    printed.lines.some((line) => line.includes("blocked (action-identity-not-sampled)")),
    false,
    "plan must not print a sampling fact as a blocker"
  );
});

test("a member that already has evidence gets no sampling note, though its archive was read", async () => {
  // candidate-prisoner-normal-kill is promoted AND still carries the reports
  // of the rounds that missed its direction on the way there. The pairing is
  // what makes this non-vacuous: a non-zero divergenceReports proves the
  // archive was consulted, so the empty notes list is a decision rather than a
  // failure to look.
  const coverage = await computeCoverage(FAMILY);
  const dir7 = coverage.rows.find((row) => row.fixtureId === "candidate-prisoner-normal-kill");
  assert.equal(dir7.hasGolden, true);
  assert.ok(dir7.divergenceReports > 0, "this fixture's own rounds are in the archive");
  assert.deepEqual(dir7.notes, [], "a captured fixture needs no sampling budget");

  // The archive count is per fixture, not per family: its three siblings have
  // reports of their own or none, and the row must say which.
  const counted = coverage.rows.map((row) => [row.fixtureId, row.divergenceReports]);
  assert.equal(counted.length, 4);
  for (const [fixtureId, count] of counted) {
    const actual = divergenceEntries.filter((entry) => entry.value.fixtureId === fixtureId).length;
    assert.equal(count, actual, fixtureId);
  }
});

test("a divergence report written against an earlier version of a fixture is not counted", async () => {
  // The report says `expected: 9` and the fixture stages 5, so the report is
  // evidence about a scenario that no longer exists. Counting it would tell an
  // operator their fixture keeps missing an identity it does not claim.
  const target = candidateById.get(ARMOURED_TARGET);
  const stale = cloneJson(armouredReports.find((report) =>
    report.differences.some((entry) => entry.path === "/scenario/attackDirection")));
  const difference = stale.differences.find((entry) => entry.path === "/scenario/attackDirection");
  assert.equal(target.scenario.attackDirection, 5);
  assert.notEqual(difference.expected, 9);
  difference.expected = 9;

  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [target],
    divergences: [stale]
  });
  const [row] = (await sandbox.computeCoverage("armoured-deflection-threshold-cleared")).rows;

  // Read — the count proves the file was opened — but not counted as sampling
  // evidence for a fixture whose identity it never tested. The fight-mode note
  // is still there, so this is an absence rather than an empty derivation.
  assert.equal(row.divergenceReports, 1);
  assert.deepEqual(row.notes.map((note) => note.code), ["unobserved-fight-mode"]);
});

// ---------------------------------------------------------------------------
// campaign.mjs — the band the expected round count comes from
//
// The band is PROBED out of src/golden/ss2-attack-candidate.js rather than
// transcribed from the battle map: two directions are in one band exactly when
// the engine's own `calculation` is identical for both apart from
// `attackDirection`.
//
// The mutation that breaks the test below is `delete profile.attackDirection`
// — without it every direction is its own band and the "one round in 4" the
// note offers becomes "one round in 1". Recorded here because a NEARBY
// mutation does NOT break it and the difference matters: driving the probe at
// the top of the roll range instead of the bottom, so that every direction
// hits, leaves every band on the committed corpus unchanged. The armour-group
// branch that cuts across the bands reaches the mutation trace, not
// `calculation`, so the forced miss buys a short path through the engine
// rather than a correct band. Do not read it as the guard.
// ---------------------------------------------------------------------------

const bandOf = (fixtureId) => {
  const fixture = candidateById.get(fixtureId);
  return actionIdentityBandFor(fixture, actionIdentityFor(fixture.scenario, fixtureId));
};

test("the action-identity band is probed out of the engine and agrees with the committed bands", async () => {
  // The independent cross-check. Three committed candidate families were
  // authored one fixture per direction, straight off the battle map, and their
  // members are the band. If the probe were finding the wrong equivalence —
  // splitting a band on armour group, or merging two — the two sources would
  // disagree here.
  for (const [family, expected] of [
    ["prisoner-quick-kill", [1, 2, 3, 4]],
    ["prisoner-normal-kill", [5, 6, 7, 8]],
    ["prisoner-power-kill", [9, 10, 11, 12]]
  ]) {
    const members = await readFamilyMembers(family);
    assert.deepEqual(
      members.map((member) => member.action.id).sort((a, b) => a - b),
      expected,
      `${family}: the committed family is not the band it is being checked against`
    );
    for (const member of members) {
      assert.deepEqual(
        actionIdentityBandFor(member.fixture, member.action),
        expected,
        `${member.fixture.fixtureId}: probed band`
      );
    }
  }

  // The single-identity directions really are single. A taunt is not drawn
  // from a band of four, and the note must not offer "one round in 4" for one.
  for (const [fixtureId, expected] of [
    ["candidate-taunt-charisma-floor", [20]],
    ["candidate-bombard-threshold", [21]],
    ["candidate-snipe-shield-boost", [22]],
    ["candidate-bash-inherited-critical", [23]],
    ["candidate-grievous-knockback", [30]]
  ]) assert.deepEqual(bandOf(fixtureId), expected, fixtureId);

  // A spell id is not drawn over a range of directions at all, so there is no
  // band to report and the driver says nothing rather than guessing.
  assert.equal(bandOf("candidate-spell-lethal-slain"), undefined);
});

test("every committed candidate's band contains its own identity and nothing the engine refuses", () => {
  assert.ok(candidateEntries.length > 0, "no candidates to probe");
  let probed = 0;
  for (const entry of candidateEntries) {
    const fixture = entry.value;
    const action = actionIdentityFor(fixture.scenario, fixture.fixtureId);
    const band = actionIdentityBandFor(fixture, action);
    if (action.ingress === "spell") {
      assert.equal(band, undefined, fixture.fixtureId);
      continue;
    }
    probed += 1;
    assert.ok(band.includes(action.id), `${fixture.fixtureId}: the band omits its own direction`);
    assert.deepEqual(band, [...band].sort((a, b) => a - b), `${fixture.fixtureId}: bands are ordered`);
    assert.equal(new Set(band).size, band.length, `${fixture.fixtureId}: bands do not repeat`);
    // Every band is one of the engine's, so no candidate probes into a band
    // whose size would make the note's round count meaningless.
    assert.ok(band.length >= 1 && band.length <= 4, `${fixture.fixtureId}: band ${band.join(",")}`);
  }
  assert.ok(probed >= 40, `expected the physical candidate set to be probed, got ${probed}`);
});
