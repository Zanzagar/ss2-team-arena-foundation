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
  SS2_SIMULATED_CAPTURE_METHOD,
  computeSs2ObservationDigest,
  matchSs2ObservationToFixture,
  validateSs2Observation
} from "../src/golden/observation.js";
import {
  computeSs2CaptureManifestDigest,
  goldenFixtureIdFor,
  promoteSs2CandidateToGolden,
  validateSs2CaptureManifest
} from "../src/golden/promote-1v1-golden.js";
import { buildSs2CaptureManifest } from "../tools/runtime-capture/build-manifest.mjs";
import { computeCoverage, loadFamily } from "../tools/runtime-capture/campaign.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FAMILY = "prisoner-normal-kill";

/**
 * The digest docs/integration/ss2-runtime-capture.md names as the one the
 * rebuild must reproduce, and that golden-prisoner-normal-kill-dir6 cites.
 * Written out literally so a change to either side is a visible diff here.
 */
const DIR6_MANIFEST_SHA256 = "889e099e00f67b66199f7fc0b23642feb603362725197d9721dcb69e0bcefd6c";

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

const SANDBOX_CODE_FILES = [
  path.join("tools", "capture-session.mjs"),
  path.join("tools", "runtime-capture", "campaign.mjs"),
  path.join("tools", "runtime-capture", "build-manifest.mjs")
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
async function createCampaignSandbox({ candidates = [], goldens = [], observations = [] }) {
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

  return import(pathToFileURL(path.join(root, "tools", "runtime-capture", "campaign.mjs")).href);
}

const dir6Candidate = candidateById.get(`candidate-${FAMILY}-dir6`);
const dir6Golden = goldenById.get(`golden-${FAMILY}-dir6`);
const dir6ManifestEntry = manifestByObservationIds.get(idKey(["obs-diag", "obs-gold3"]));

const summarize = (row) => ({
  direction: row.direction,
  fixtureId: row.fixtureId,
  goldenId: row.goldenId,
  hasGolden: row.hasGolden,
  observationIds: sortedIds(row.observations.map((observation) => observation.observationId)),
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
    recordsFor(["obs-diag", "obs-gold3"]),
    { createdAt: committed.createdAt }
  );

  // Both observations really do come from test/observations/ss2-1v1/obs-20260830-auto{1,3}.json,
  // whose file names deliberately do not match the observation ids they carry.
  assert.equal(path.basename(observationFileById.get("obs-diag")), "obs-20260830-auto1.json");
  assert.equal(path.basename(observationFileById.get("obs-gold3")), "obs-20260830-auto3.json");

  assert.equal(digest, DIR6_MANIFEST_SHA256);
  assert.equal(digest, computeSs2CaptureManifestDigest(committed));
  assert.equal(digest, dir6Golden.provenance.captureManifestSha256);
  assert.deepEqual(manifest.sessions.map((session) => session.sessionId), ["session-diag", "session-gold3"]);
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

test("the four prisoner-normal-kill directions are all promoted", () => {
  assert.equal(familyGoldens.length, 4, "all four directions of the family should be promoted goldens");
});

test("createdAt is the only field the builder originates", () => {
  const committed = dir6ManifestEntry.value;
  const startedAt = Date.now();
  const { manifest } = buildSs2CaptureManifest(recordsFor(["obs-diag", "obs-gold3"]));

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
  const forward = buildSs2CaptureManifest(recordsFor(["obs-diag", "obs-gold3"]), {
    createdAt: committed.createdAt
  });
  const reversed = buildSs2CaptureManifest(recordsFor(["obs-gold3", "obs-diag"]), {
    createdAt: committed.createdAt
  });

  // `sessions` is an array, so canonical JSON preserves its order and the
  // order is part of the digest a promoted golden cites. The builder
  // therefore orders sessions by capture time rather than by the order the
  // caller read them off disk — `settle` supplies them in readdir order, so
  // without this the same evidence would digest differently on a filesystem
  // that enumerates differently.
  const chronological = ["session-diag", "session-gold3"];
  assert.deepEqual(forward.manifest.sessions.map((session) => session.sessionId), chronological);
  assert.deepEqual(reversed.manifest.sessions.map((session) => session.sessionId), chronological);
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
  assert.deepEqual(loaded.members.map((member) => member.direction), [5, 6, 7, 8]);
  assert.deepEqual(loaded.members.map((member) => member.fixture.fixtureId), [
    "candidate-prisoner-normal-kill-dir5",
    "candidate-prisoner-normal-kill-dir6",
    // The unsuffixed candidate is direction 7; membership is by prefix, not by name.
    "candidate-prisoner-normal-kill",
    "candidate-prisoner-normal-kill-dir8"
  ]);
  assert.deepEqual([...loaded.byDirection.keys()].sort((a, b) => a - b), [5, 6, 7, 8]);
  for (const [direction, member] of loaded.byDirection) {
    assert.equal(member.fixture.scenario.attackDirection, direction);
    assert.equal(path.basename(member.filePath), `${member.fixture.fixtureId}.json`);
    assert.equal(member.fixture.classification, "candidate");
  }
  // The sibling power/quick families share the "candidate-prisoner-" stem and
  // must not leak in through the prefix rule.
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
  assert.deepEqual(coverage.rows.map((row) => row.direction), [5, 6, 7, 8]);
  for (const row of coverage.rows) {
    assert.equal(row.hasGolden, true, `direction ${row.direction} lost its golden`);
    assert.equal(row.promotable, false, `direction ${row.direction} is golden and cannot be re-promoted`);
    // The gate's substance: at least two matching observations, from at least
    // as many distinct sessions as there are observations.
    assert.ok(row.observations.length >= 2, `direction ${row.direction} has too little evidence`);
    assert.equal(
      row.sessionCount,
      new Set(row.observations.map((observation) => observation.sessionId)).size
    );
    assert.ok(row.sessionCount >= 2, `direction ${row.direction} lacks independent sessions`);
  }
  // Direction 7 is the family member whose fixture id carries no dirN suffix.
  assert.equal(
    coverage.rows.find((row) => row.direction === 7).fixtureId,
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

test("coverage counts exactly the observations that match each candidate", async () => {
  const coverage = await computeCoverage(FAMILY);
  const loaded = await loadFamily(FAMILY);

  for (const row of coverage.rows) {
    const fixture = loaded.byDirection.get(row.direction).fixture;
    const genuinelyMatching = observationEntries
      .filter((entry) => matchSs2ObservationToFixture(fixture, entry.value).match)
      .map((entry) => entry.value.observationId);
    assert.deepEqual(
      sortedIds(row.observations.map((observation) => observation.observationId)),
      sortedIds(genuinelyMatching),
      `dir ${row.direction} coverage disagrees with matchSs2ObservationToFixture`
    );
    // No observation is evidence for two directions at once.
    for (const cited of row.observations) {
      assert.equal(observationById.get(cited.observationId).target.fixtureId, row.fixtureId);
    }
  }
  const counted = coverage.rows.flatMap((row) => row.observations.map((o) => o.observationId));
  assert.equal(new Set(counted).size, counted.length, "an observation must not back two directions");
});

test("the settle recipe reproduces every committed golden byte for byte", () => {
  for (const golden of familyGoldens) {
    const ids = golden.provenance.observationIds;
    const manifestEntry = manifestByObservationIds.get(idKey(ids));
    const records = recordsFor(ids);
    const candidateId = `candidate-${golden.fixtureId.slice("golden-".length)}`;
    const candidate = candidateById.get(candidateId);
    assert.ok(candidate, `${candidateId} is missing`);

    const { manifest } = buildSs2CaptureManifest(records, { createdAt: manifestEntry.value.createdAt });
    const promoted = promoteSs2CandidateToGolden(candidate, records, manifest);

    assert.deepEqual(promoted.golden, golden, `${golden.fixtureId} is not reproducible from its evidence`);
    assert.equal(promoted.captureManifestSha256, golden.provenance.captureManifestSha256);
    assert.equal(promoted.matches.length, ids.length);
  }
});

// ---------------------------------------------------------------------------
// campaign.mjs — the promotable rule, driven with controlled evidence
// ---------------------------------------------------------------------------

test("promotable is true for two matching observations from two independent sessions and no golden", async () => {
  const sandbox = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(["obs-diag", "obs-gold3"])
  });
  const coverage = await sandbox.computeCoverage(FAMILY);

  assert.deepEqual(coverage.rows.map(summarize), [{
    direction: 6,
    fixtureId: "candidate-prisoner-normal-kill-dir6",
    goldenId: "golden-prisoner-normal-kill-dir6",
    hasGolden: false,
    observationIds: ["obs-diag", "obs-gold3"],
    sessionCount: 2,
    promotable: true
  }]);

  // And the gate agrees: this is exactly the evidence dir6 was promoted on.
  const records = recordsFor(["obs-diag", "obs-gold3"]);
  const { manifest } = buildSs2CaptureManifest(records, { createdAt: dir6ManifestEntry.value.createdAt });
  assert.deepEqual(promoteSs2CandidateToGolden(dir6Candidate, records, manifest).golden, dir6Golden);
});

test("promotable is false once the direction already has a golden", async () => {
  const sandbox = await createCampaignSandbox({
    candidates: [dir6Candidate],
    goldens: [dir6Golden],
    observations: recordsFor(["obs-diag", "obs-gold3"])
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.equal(row.hasGolden, true);
  assert.equal(row.observations.length, 2);
  assert.equal(row.sessionCount, 2);
  assert.equal(row.promotable, false, "an existing golden is never re-promoted");
});

test("promotable is false with fewer than two matching observations", async () => {
  const sandbox = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(["obs-diag"])
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.equal(row.hasGolden, false);
  assert.equal(row.observations.length, 1);
  assert.equal(row.sessionCount, 1);
  assert.equal(row.promotable, false);

  const records = recordsFor(["obs-diag"]);
  const { manifest } = buildSs2CaptureManifest(records, { createdAt: dir6ManifestEntry.value.createdAt });
  assert.throws(
    () => promoteSs2CandidateToGolden(dir6Candidate, records, manifest),
    /at least two independent runtime observations/
  );
});

test("promotable is false when both matching observations come from the same session", async () => {
  // The independence rule the whole gate rests on: two runs of one session are
  // one experiment, however well they agree.
  const first = observationVariant("obs-diag", (record) => {
    record.capture.sessionId = "session-shared";
  });
  const second = observationVariant("obs-gold3", (record) => {
    record.capture.sessionId = "session-shared";
  });

  const sandbox = await createCampaignSandbox({
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
  assert.notEqual(diverging.capture.sessionId, observationById.get("obs-diag").capture.sessionId);
  const comparison = matchSs2ObservationToFixture(dir6Candidate, diverging);
  assert.equal(comparison.match, false);
  assert.deepEqual(comparison.differences.map((difference) => difference.path), ["/finalState/hero/staminaleft"]);

  const sandbox = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: [...recordsFor(["obs-diag"]), diverging]
  });
  const [row] = (await sandbox.computeCoverage(FAMILY)).rows;

  assert.deepEqual(row.observations.map((observation) => observation.observationId), ["obs-diag"]);
  assert.equal(row.sessionCount, 1);
  assert.equal(row.promotable, false, "a divergent run is never counted towards the two-observation rule");
});

test("loadFamily refuses a family whose members claim the same attack direction", async () => {
  const twin = cloneJson(dir6Candidate);
  twin.fixtureId = `${dir6Candidate.fixtureId}-twin`;

  const sandbox = await createCampaignSandbox({ candidates: [dir6Candidate, twin] });

  await assert.rejects(
    () => sandbox.loadFamily(FAMILY),
    /has two fixtures for attack direction 6/
  );
  await assert.rejects(() => sandbox.computeCoverage(FAMILY), /has two fixtures for attack direction 6/);
});
