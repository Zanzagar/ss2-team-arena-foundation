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
import { simulateSs2CaptureTrace } from "../src/golden/simulate-capture-trace.js";
import { buildSs2CaptureManifest } from "../tools/runtime-capture/build-manifest.mjs";
import {
  actionIdentityFor,
  computeCoverage,
  isFamilyMember,
  loadFamily,
  parseArgs,
  readFamilyMembers
} from "../tools/runtime-capture/campaign.mjs";

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
const dir6ManifestEntry = manifestByObservationIds.get(idKey(["obs-diag", "obs-gold3"]));

/** Two spell candidates whose spell ids differ, so they form a lawful family. */
const spellLethal = candidateById.get("candidate-spell-lethal-slain");
const spellDepleted = candidateById.get("candidate-spell-armour-depleted-full-damage");

const summarize = (row) => ({
  action: row.action,
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

test("coverage counts exactly the observations that match each candidate", async () => {
  const coverage = await computeCoverage(FAMILY);
  const loaded = await loadFamily(FAMILY);

  for (const row of coverage.rows) {
    const fixture = loaded.byActionKey.get(row.action.key).fixture;
    const genuinelyMatching = observationEntries
      .filter((entry) => matchSs2ObservationToFixture(fixture, entry.value).match)
      .map((entry) => entry.value.observationId);
    assert.deepEqual(
      sortedIds(row.observations.map((observation) => observation.observationId)),
      sortedIds(genuinelyMatching),
      `${row.action.label} coverage disagrees with matchSs2ObservationToFixture`
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
  const { campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(["obs-diag", "obs-gold3"])
  });
  const coverage = await sandbox.computeCoverage(FAMILY);

  assert.deepEqual(coverage.rows.map(summarize), [{
    action: { ingress: "attack", id: 6, key: "attack-direction:6", label: "attack direction 6" },
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
  const { campaign: sandbox } = await createCampaignSandbox({
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
  const { campaign: sandbox } = await createCampaignSandbox({
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
  assert.notEqual(diverging.capture.sessionId, observationById.get("obs-diag").capture.sessionId);
  const comparison = matchSs2ObservationToFixture(dir6Candidate, diverging);
  assert.equal(comparison.match, false);
  assert.deepEqual(comparison.differences.map((difference) => difference.path), ["/finalState/hero/staminaleft"]);

  const { campaign: sandbox } = await createCampaignSandbox({
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

  const { campaign: sandbox } = await createCampaignSandbox({ candidates: [dir6Candidate, twin] });

  await assert.rejects(
    () => sandbox.loadFamily(FAMILY),
    /has two fixtures for attack direction 6/
  );
  await assert.rejects(() => sandbox.computeCoverage(FAMILY), /has two fixtures for attack direction 6/);
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
      return true;
    }
  );
  await assert.rejects(() => sandbox.computeCoverage("spell"), /two fixtures for spell id 32/);
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

  const { root, campaign: sandbox } = await createCampaignSandbox({
    candidates: [dir6Candidate],
    observations: recordsFor(["obs-diag", "obs-gold3"])
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
