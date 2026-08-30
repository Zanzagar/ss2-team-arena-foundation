import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { ingestSs2CaptureTrace, CaptureTraceError } from "../src/golden/capture-ingest.js";
import {
  ObservationValidationError,
  SS2_PROJECTED_COMBATANT_KEYS,
  canonicalJsonStringify,
  computeSs2ObservationDigest,
  deriveExpectedEventsFromSs2Fixture,
  matchSs2ObservationToFixture,
  projectSs2ObservationForComparison,
  sha256OfCanonicalJson,
  ss2ObservationsMatch,
  validateSs2Observation
} from "../src/golden/observation.js";
import {
  CaptureManifestError,
  PromotionBlockedError,
  PromotionError,
  buildSs2DivergenceReport,
  computeSs2CaptureManifestDigest,
  goldenFixtureIdFor,
  promoteSs2CandidateToGolden,
  validateSs2CaptureManifest,
  validateSs2DivergenceReport
} from "../src/golden/promote-1v1-golden.js";
import {
  GoldenClassification,
  GoldenProvenance,
  runSs2OneVsOneGoldenFixture,
  validateSs2OneVsOneFixture
} from "../src/golden/run-1v1-fixture.js";
import { resolveSs2PhysicalAttackCandidate } from "../src/golden/ss2-attack-candidate.js";
import { verifyInstallAgainstFingerprint } from "../tools/capture-session.mjs";

import { loadSs2Fixtures } from "./ss2-fixture-files.js";

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const fixtures = await loadSs2Fixtures();
const fixturesById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));

const CALL_SITE = "overlay:862/frame:52/DoAction@0x240c7f";
const HOOK_FOR_REASON = {
  "physical-damage": "damagecharacter",
  "breastplate-stamina": "damagecharacter",
  "stat-clamp": "damagecharacter",
  "weapon-enchantment": "damagecharacter",
  "remove-armour-piece": "remove-armour",
  "remove-armour-clamp": "remove-armour",
  "death-status-clear": "death",
  "death-taunt-clear": "death",
  "battle-result-pending": "result-bridge"
};

/** A record shaped exactly as ingestion would emit for a matching capture. */
function observationFromFixture(fixture, overrides = {}) {
  const record = {
    schemaVersion: 1,
    kind: "ss2-1v1-observation",
    observationId: overrides.observationId ?? "obs-a",
    build: cloneJson(fixture.build),
    capture: {
      sessionId: overrides.sessionId ?? "session-a",
      captureToolVersion: overrides.captureToolVersion ?? "ss2-capture/0.1.0",
      method: "injected-tape-runtime",
      observedAt: overrides.observedAt ?? "2026-08-30T17:00:00Z",
      installHashVerifiedBefore: true,
      installHashVerifiedAfter: true,
      mutationGranularity: "property-watch"
    },
    target: { fixtureId: fixture.fixtureId },
    scenario: cloneJson(fixture.scenario),
    samples: fixture.samples.map((sample) => ({
      ...sample,
      callSite: CALL_SITE,
      injected: sample.source === "randomBetween"
    })),
    mutationTrace: fixture.expected.mutationTrace.map((entry) => ({
      ...entry,
      reason: HOOK_FOR_REASON[entry.reason] ?? "unattributed"
    })),
    events: deriveExpectedEventsFromSs2Fixture(fixture),
    resultEvent: cloneJson(fixture.expected.resultEvent),
    finalState: cloneJson(fixture.expected.state)
  };
  if (overrides.mutate) overrides.mutate(record);
  record.digest = computeSs2ObservationDigest(record);
  return record;
}

function captureManifestFor(observations, overrides = {}) {
  const sessions = new Map();
  for (const observation of observations) {
    const sessionId = observation.capture.sessionId;
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        sessionId,
        method: observation.capture.method,
        observedAt: observation.capture.observedAt,
        observationIds: [],
        installHashVerifiedBefore: true,
        installHashVerifiedAfter: true
      });
    }
    sessions.get(sessionId).observationIds.push(observation.observationId);
  }
  return {
    schemaVersion: 1,
    kind: "ss2-capture-manifest",
    build: cloneJson(observations[0].build),
    captureToolVersion: overrides.captureToolVersion ?? "ss2-capture/0.1.0",
    createdAt: "2026-08-30T18:00:00Z",
    sessions: [...sessions.values()]
  };
}

test("canonical JSON digests are key-order independent and content sensitive", () => {
  const left = { b: 1, a: { d: [1, 2], c: true } };
  const right = { a: { c: true, d: [1, 2] }, b: 1 };
  assert.equal(canonicalJsonStringify(left), canonicalJsonStringify(right));
  assert.equal(sha256OfCanonicalJson(left), sha256OfCanonicalJson(right));
  assert.notEqual(sha256OfCanonicalJson(left), sha256OfCanonicalJson({ ...left, b: 2 }));
});

test("a complete runtime observation validates and its digest is reproducible", () => {
  for (const fixture of fixtures) {
    const record = observationFromFixture(fixture);
    assert.equal(validateSs2Observation(record), record);
    assert.equal(record.digest, computeSs2ObservationDigest(record));
    const recomputed = cloneJson(record);
    assert.equal(computeSs2ObservationDigest(recomputed), record.digest);
  }
});

test("observation validation rejects tampered digests and unverified sessions", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const record = observationFromFixture(fixture);

  const tampered = cloneJson(record);
  tampered.finalState.villain.hitpoints += 1;
  assert.throws(() => validateSs2Observation(tampered), ObservationValidationError);

  const unverified = observationFromFixture(fixture, {
    mutate: (draft) => { draft.capture.installHashVerifiedAfter = false; }
  });
  assert.throws(() => validateSs2Observation(unverified), ObservationValidationError);

  const coarse = observationFromFixture(fixture, {
    mutate: (draft) => { draft.capture.mutationGranularity = "call-boundary"; }
  });
  assert.throws(() => validateSs2Observation(coarse), ObservationValidationError);
});

test("observation samples require call sites and forbid injected opcode rolls", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  assert.throws(() => {
    const record = observationFromFixture(fixture, {
      mutate: (draft) => { delete draft.samples[0].callSite; }
    });
    validateSs2Observation(record);
  }, ObservationValidationError);
  assert.throws(() => {
    const record = observationFromFixture(fixture, {
      mutate: (draft) => { draft.samples[0].callSite = "downloads:evil"; }
    });
    validateSs2Observation(record);
  }, ObservationValidationError);
  assert.throws(() => {
    const record = observationFromFixture(fixture, {
      mutate: (draft) => {
        draft.samples.push({
          label: "armour-debris-1-x",
          source: "randomNumber",
          min: 0,
          max: 19,
          value: 3,
          callSite: CALL_SITE,
          injected: true
        });
      }
    });
    validateSs2Observation(record);
  }, ObservationValidationError);
});

test("observation records reject asset-like payloads and foreign builds", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  assert.throws(() => {
    const record = observationFromFixture(fixture, {
      mutate: (draft) => { draft.observationId = "capture.swf"; }
    });
    validateSs2Observation(record);
  }, ObservationValidationError);
  assert.throws(() => {
    const record = observationFromFixture(fixture, {
      mutate: (draft) => { draft.build.steamBuildId += 1; }
    });
    validateSs2Observation(record);
  }, ObservationValidationError);
});

test("independent observations match while identity metadata differs", () => {
  const fixture = fixturesById.get("candidate-armour-overflow-burning");
  const first = observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" });
  const second = observationFromFixture(fixture, {
    observationId: "obs-b",
    sessionId: "session-b",
    observedAt: "2026-08-30T19:00:00Z"
  });
  assert.notEqual(first.digest, second.digest);
  const comparison = ss2ObservationsMatch(first, second);
  assert.equal(comparison.match, true);
  assert.deepEqual(comparison.differences, []);
  assert.deepEqual(
    projectSs2ObservationForComparison(first),
    projectSs2ObservationForComparison(second)
  );
});

test("observation matching redacts cosmetic debris values but not combat rolls", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const withDebris = (observationId, sessionId, debrisValue, hitValue) =>
    observationFromFixture(fixture, {
      observationId,
      sessionId,
      mutate: (draft) => {
        draft.samples[0].value = hitValue;
        draft.samples.push({
          label: "armour-debris-1-x",
          source: "randomNumber",
          min: 0,
          max: 19,
          value: debrisValue,
          callSite: CALL_SITE,
          injected: false
        });
      }
    });

  const debrisOnly = ss2ObservationsMatch(
    withDebris("obs-a", "session-a", 3, 50),
    withDebris("obs-b", "session-b", 17, 50)
  );
  assert.equal(debrisOnly.match, true);

  const combatRoll = ss2ObservationsMatch(
    withDebris("obs-a", "session-a", 3, 50),
    withDebris("obs-b", "session-b", 3, 51)
  );
  assert.equal(combatRoll.match, false);
  assert.ok(combatRoll.differences.some((difference) => difference.path === "/samples/0/value"));
});

test("observations replaying the candidate tape match every static fixture", () => {
  for (const fixture of fixtures) {
    const comparison = matchSs2ObservationToFixture(fixture, observationFromFixture(fixture));
    assert.deepEqual(comparison.differences, []);
    assert.equal(comparison.match, true);
  }
});

test("fixture matching ignores reason annotations but not the mutation contract", () => {
  const fixture = fixturesById.get("candidate-armour-overflow-burning");
  const relabeled = observationFromFixture(fixture, {
    mutate: (draft) => {
      draft.mutationTrace = draft.mutationTrace.map((entry) => ({ ...entry, reason: "unattributed" }));
    }
  });
  assert.equal(matchSs2ObservationToFixture(fixture, relabeled).match, true);

  const reordered = observationFromFixture(fixture, {
    mutate: (draft) => {
      const [first, second, ...rest] = draft.mutationTrace;
      draft.mutationTrace = [
        { ...second, sequence: 1 },
        { ...first, sequence: 2 },
        ...rest
      ];
    }
  });
  const reorderedComparison = matchSs2ObservationToFixture(fixture, reordered);
  assert.equal(reorderedComparison.match, false);
  assert.ok(reorderedComparison.differences.some((difference) => difference.path.startsWith("/mutationTrace/")));

  const divergentState = observationFromFixture(fixture, {
    mutate: (draft) => {
      draft.finalState.villain.hitpoints = 41;
      draft.mutationTrace[1] = { ...draft.mutationTrace[1], after: 41 };
    }
  });
  const stateComparison = matchSs2ObservationToFixture(fixture, divergentState);
  assert.equal(stateComparison.match, false);
  assert.ok(stateComparison.differences.some((difference) =>
    difference.path === "/finalState/villain/hitpoints"
  ));
});

test("derived expected events cover miss, hit, and lethal candidates", () => {
  assert.deepEqual(
    deriveExpectedEventsFromSs2Fixture(fixturesById.get("candidate-normal-miss-roll-order")),
    [{ type: "defender-blocked" }]
  );
  assert.deepEqual(
    deriveExpectedEventsFromSs2Fixture(fixturesById.get("candidate-normal-threshold-hit")),
    [{ type: "defender-hurt", method: "normal" }]
  );
  assert.deepEqual(
    deriveExpectedEventsFromSs2Fixture(fixturesById.get("candidate-lethal-result")),
    [
      { type: "defender-hurt", method: "normal" },
      { type: "death", side: "villain" },
      { type: "overlay-label", label: "combatwon" }
    ]
  );
});

const PROJECTION_DEFAULTS = Object.freeze({
  armourclass: 0,
  armourclass_max: 0,
  burning: false,
  frozen: false,
  poison: false,
  life_stolen: false,
  taunted1: false,
  taunted2: false,
  helmet: 0,
  shoulderguard: 0,
  breastplate: 0,
  gauntlet: 0,
  greaves: 0,
  shinguard: 0,
  boot: 0,
  shield: 0
});

function stagedDump(scenarioSide) {
  return { ...PROJECTION_DEFAULTS, ...scenarioSide };
}

function thresholdTraceLines() {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const heroStaged = stagedDump(fixture.scenario.hero);
  const villainStaged = stagedDump(fixture.scenario.villain);
  const heroFinal = { ...heroStaged };
  delete heroFinal.attack; delete heroFinal.defence; delete heroFinal.strength;
  delete heroFinal.charisma; delete heroFinal.min_damage; delete heroFinal.max_damage;
  delete heroFinal.hitpointsmax; delete heroFinal.staminamax; delete heroFinal.gladiator_dir;
  const villainFinal = { ...villainStaged, hitpoints: 28 };
  delete villainFinal.attack; delete villainFinal.defence; delete villainFinal.hitpointsmax;
  delete villainFinal.staminamax; delete villainFinal.gladiator_dir;
  const roll = (sample) => ({ t: "roll", ...sample, callSite: CALL_SITE, injected: true });
  return [
    {
      t: "meta",
      schemaVersion: 1,
      observationId: "obs-trace-1",
      sessionId: "session-trace-1",
      captureToolVersion: "ss2-capture/0.1.0",
      method: "injected-tape-runtime",
      observedAt: "2026-08-30T17:30:00Z",
      mutationGranularity: "property-watch",
      installHashVerifiedBefore: true,
      attackerSide: "hero"
    },
    { t: "state", side: "hero", fields: heroStaged },
    { t: "state", side: "villain", fields: villainStaged },
    { t: "var", name: "attack_direction", value: 5 },
    ...fixture.samples.slice(0, 5).map(roll),
    { t: "set", path: "/villain/hitpoints", before: 40, after: 28, hook: "damagecharacter" },
    { t: "set", path: "/villain/hitpoints", before: 28, after: 28, hook: "damagecharacter" },
    { t: "event", type: "defender-hurt", method: "normal" },
    ...fixture.samples.slice(5).map(roll),
    { t: "final", side: "hero", fields: heroFinal },
    { t: "final", side: "villain", fields: villainFinal },
    { t: "end", installHashVerifiedAfter: true }
  ];
}

function traceText(lines) {
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

test("raw capture traces normalize into validated matching observations", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const record = ingestSs2CaptureTrace(traceText(thresholdTraceLines()), fixture);

  assert.equal(record.observationId, "obs-trace-1");
  assert.deepEqual(record.scenario, fixture.scenario);
  assert.deepEqual(
    record.samples.map(({ label, source, min, max, value }) => ({ label, source, min, max, value })),
    fixture.samples
  );
  assert.deepEqual(record.mutationTrace, [
    { sequence: 1, path: "/villain/hitpoints", before: 40, after: 28, reason: "damagecharacter" }
  ]);
  assert.deepEqual(record.events, [{ type: "defender-hurt", method: "normal" }]);
  assert.equal(record.resultEvent, null);
  assert.equal(validateSs2Observation(record), record);
  assert.equal(matchSs2ObservationToFixture(fixture, record).match, true);
});

test("trace ingestion rejects malformed and inconsistent streams", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const lines = thresholdTraceLines;

  const withoutMeta = lines().slice(1);
  assert.throws(() => ingestSs2CaptureTrace(traceText(withoutMeta), fixture), CaptureTraceError);

  const withoutEnd = lines().slice(0, -1);
  assert.throws(() => ingestSs2CaptureTrace(traceText(withoutEnd), fixture), CaptureTraceError);

  const unknownLine = lines();
  unknownLine.splice(4, 0, { t: "screenshot", data: "AA==" });
  assert.throws(() => ingestSs2CaptureTrace(traceText(unknownLine), fixture), CaptureTraceError);

  const brokenChain = lines().map((line) =>
    line.t === "set" && line.before === 40 ? { ...line, before: 39 } : line
  );
  assert.throws(
    () => ingestSs2CaptureTrace(traceText(brokenChain), fixture),
    /broken mutation chain/
  );

  const unobservedMutation = lines().map((line) =>
    line.t === "final" && line.side === "villain"
      ? { ...line, fields: { ...line.fields, staminaleft: 25 } }
      : line
  );
  assert.throws(
    () => ingestSs2CaptureTrace(traceText(unobservedMutation), fixture),
    /Unobserved mutation/
  );

  const missingDirection = lines().filter((line) => line.t !== "var");
  assert.throws(
    () => ingestSs2CaptureTrace(traceText(missingDirection), fixture),
    /attack_direction/
  );

  const missingStagedField = lines().map((line) =>
    line.t === "state" && line.side === "villain"
      ? { ...line, fields: (({ defence, ...rest }) => rest)(line.fields) }
      : line
  );
  assert.throws(
    () => ingestSs2CaptureTrace(traceText(missingStagedField), fixture),
    /missing the required field defence/
  );
});

test("capture manifests validate and digest deterministically", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const observations = [
    observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" }),
    observationFromFixture(fixture, { observationId: "obs-b", sessionId: "session-b" })
  ];
  const manifest = captureManifestFor(observations);
  assert.equal(validateSs2CaptureManifest(manifest), manifest);

  const reordered = {
    sessions: cloneJson(manifest.sessions),
    kind: manifest.kind,
    createdAt: manifest.createdAt,
    captureToolVersion: manifest.captureToolVersion,
    build: cloneJson(manifest.build),
    schemaVersion: manifest.schemaVersion
  };
  assert.equal(
    computeSs2CaptureManifestDigest(reordered),
    computeSs2CaptureManifestDigest(manifest)
  );

  const unattested = cloneJson(manifest);
  unattested.sessions[0].installHashVerifiedAfter = false;
  assert.throws(() => validateSs2CaptureManifest(unattested), CaptureManifestError);

  const duplicated = cloneJson(manifest);
  duplicated.sessions[1].observationIds.push("obs-a");
  assert.throws(() => validateSs2CaptureManifest(duplicated), CaptureManifestError);
});

test("two matching independent observations promote a candidate to golden", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const observations = [
    observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" }),
    observationFromFixture(fixture, {
      observationId: "obs-b",
      sessionId: "session-b",
      observedAt: "2026-08-30T19:00:00Z"
    })
  ];
  const manifest = captureManifestFor(observations);
  const { golden, captureManifestSha256 } = promoteSs2CandidateToGolden(fixture, observations, manifest);

  assert.equal(golden.fixtureId, "golden-normal-threshold-hit");
  assert.equal(golden.classification, GoldenClassification.GOLDEN);
  assert.equal(golden.provenance.kind, GoldenProvenance.LICENSED);
  assert.equal(golden.provenance.runtimeVerified, true);
  assert.equal(golden.provenance.repetitions, 2);
  assert.deepEqual(golden.provenance.observationIds, ["obs-a", "obs-b"]);
  assert.deepEqual(
    golden.provenance.observationDigests,
    observations.map((observation) => observation.digest)
  );
  assert.equal(golden.provenance.observedAt, "2026-08-30T19:00:00Z");
  assert.equal(golden.provenance.captureManifestSha256, captureManifestSha256);
  assert.equal(captureManifestSha256, computeSs2CaptureManifestDigest(manifest));
  assert.equal(validateSs2OneVsOneFixture(golden), golden);

  const replay = runSs2OneVsOneGoldenFixture(golden, resolveSs2PhysicalAttackCandidate);
  assert.deepEqual(replay.outcome, golden.expected);

  const flagged = fixturesById.get("candidate-armour-equality-quirk");
  const flaggedObservations = [
    observationFromFixture(flagged, { observationId: "obs-q1", sessionId: "session-q1" }),
    observationFromFixture(flagged, { observationId: "obs-q2", sessionId: "session-q2" })
  ];
  const flaggedPromotion = promoteSs2CandidateToGolden(
    flagged,
    flaggedObservations,
    captureManifestFor(flaggedObservations)
  );
  assert.equal(flaggedPromotion.golden.fixtureId, "golden-armour-equality-quirk");
  assert.equal(flaggedPromotion.golden.provenance.candidateFlags, undefined);
  assert.equal(validateSs2OneVsOneFixture(flaggedPromotion.golden), flaggedPromotion.golden);
});

test("promotion requires two observations from independent sessions", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const single = [observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" })];
  assert.throws(
    () => promoteSs2CandidateToGolden(fixture, single, captureManifestFor(single)),
    PromotionError
  );

  const sameSession = [
    observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" }),
    observationFromFixture(fixture, { observationId: "obs-b", sessionId: "session-a" })
  ];
  assert.throws(
    () => promoteSs2CandidateToGolden(fixture, sameSession, captureManifestFor(sameSession)),
    /at least two independent capture sessions/
  );

  const duplicated = [
    observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" }),
    observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-b" })
  ];
  assert.throws(
    () => promoteSs2CandidateToGolden(
      fixture,
      duplicated,
      captureManifestFor([duplicated[0]])
    ),
    PromotionError
  );
});

test("a divergent observation blocks promotion and preserves its report", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const matching = observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" });
  const divergent = observationFromFixture(fixture, {
    observationId: "obs-b",
    sessionId: "session-b",
    mutate: (draft) => {
      draft.finalState.villain.hitpoints = 27;
      draft.mutationTrace[0] = { ...draft.mutationTrace[0], after: 27 };
    }
  });
  const manifest = captureManifestFor([matching, divergent]);

  let blocked;
  try {
    promoteSs2CandidateToGolden(fixture, [matching, divergent], manifest, {
      recordedAt: "2026-08-30T20:00:00Z"
    });
    assert.fail("promotion must be blocked by a divergent observation");
  } catch (error) {
    blocked = error;
  }
  assert.ok(blocked instanceof PromotionBlockedError);
  assert.equal(blocked.divergences.length, 1);
  const report = blocked.divergences[0];
  assert.equal(validateSs2DivergenceReport(report), report);
  assert.equal(report.fixtureId, fixture.fixtureId);
  assert.equal(report.observationId, "obs-b");
  assert.equal(report.sessionId, "session-b");
  assert.equal(report.observationDigest, divergent.digest);
  assert.ok(report.differences.some((difference) =>
    difference.path === "/finalState/villain/hitpoints"
  ));

  const standalone = buildSs2DivergenceReport(
    fixture,
    divergent,
    matchSs2ObservationToFixture(fixture, divergent).differences,
    { recordedAt: "2026-08-30T20:00:00Z" }
  );
  assert.deepEqual(standalone, report);
});

test("promotion refuses observations missing from the capture manifest", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const observations = [
    observationFromFixture(fixture, { observationId: "obs-a", sessionId: "session-a" }),
    observationFromFixture(fixture, { observationId: "obs-b", sessionId: "session-b" })
  ];
  const partial = captureManifestFor([observations[0]]);
  assert.throws(
    () => promoteSs2CandidateToGolden(fixture, observations, partial),
    /not attested by the capture manifest/
  );

  const wrongTool = captureManifestFor(observations, { captureToolVersion: "ss2-capture/9.9.9" });
  assert.throws(
    () => promoteSs2CandidateToGolden(fixture, observations, wrongTool),
    /different tool version/
  );
});

test("golden fixture ids derive only from candidate-prefixed ids", () => {
  assert.equal(goldenFixtureIdFor("candidate-normal-threshold-hit"), "golden-normal-threshold-hit");
  assert.throws(() => goldenFixtureIdFor("armour-equality-quirk"), PromotionError);
  assert.throws(() => goldenFixtureIdFor("golden-armour-equality-quirk"), PromotionError);
});

test("verify-install compares installed files against the pinned fingerprint", async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), "ss2-verify-install-"));
  const launcherBytes = Buffer.from("synthetic launcher bytes");
  const gameBytes = Buffer.from("synthetic ss2 bytes");
  await writeFile(path.join(workDir, "launcher.bin"), launcherBytes);
  const swfDir = path.join(workDir, "swf");
  await mkdir(swfDir, { recursive: true });
  await writeFile(path.join(swfDir, "game.bin"), gameBytes);
  const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex").toUpperCase();
  const fingerprintPath = path.join(workDir, "fingerprint.json");
  await writeFile(fingerprintPath, JSON.stringify({
    collection: {
      launcher: { relativePath: "launcher.bin", bytes: launcherBytes.length, sha256: sha256(launcherBytes) },
      ss2: { relativePath: "swf/game.bin", bytes: gameBytes.length, sha256: sha256(gameBytes) }
    }
  }));

  const matching = await verifyInstallAgainstFingerprint({
    installDir: workDir,
    fingerprintPath
  });
  assert.equal(matching.ok, true);
  assert.deepEqual(matching.checks.map((check) => check.ok), [true, true]);

  await writeFile(path.join(swfDir, "game.bin"), Buffer.from("tampered bytes"));
  const tampered = await verifyInstallAgainstFingerprint({
    installDir: workDir,
    fingerprintPath
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.checks[0].ok, true);
  assert.equal(tampered.checks[1].ok, false);

  const missing = await verifyInstallAgainstFingerprint({
    installDir: path.join(workDir, "missing"),
    fingerprintPath
  });
  assert.equal(missing.ok, false);
});

test("sample bound violations surface as observation validation errors", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const record = observationFromFixture(fixture, {
    mutate: (draft) => { draft.samples[0].value = 101; }
  });
  assert.throws(() => validateSs2Observation(record), ObservationValidationError);
});

test("capture methods are a closed enum with injected-flag consistency", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  assert.throws(() => {
    validateSs2Observation(observationFromFixture(fixture, {
      mutate: (draft) => { draft.capture.method = "totally-made-up"; }
    }));
  }, ObservationValidationError);
  assert.throws(() => {
    validateSs2Observation(observationFromFixture(fixture, {
      mutate: (draft) => { draft.capture.method = "passive-runtime"; }
    }));
  }, /passive-runtime captures cannot contain injected samples/);
  assert.throws(() => {
    validateSs2Observation(observationFromFixture(fixture, {
      mutate: (draft) => {
        draft.capture.method = "injected-tape-runtime";
        for (const sample of draft.samples) sample.injected = false;
      }
    }));
  }, /at least one injected sample/);
  const passive = observationFromFixture(fixture, {
    mutate: (draft) => {
      draft.capture.method = "passive-runtime";
      for (const sample of draft.samples) sample.injected = false;
    }
  });
  assert.equal(validateSs2Observation(passive), passive);
});

test("digit-bearing watched fields like taunted1 ingest and validate", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const lines = thresholdTraceLines().map((line) => {
    if (line.t === "state" && line.side === "villain") {
      return { ...line, fields: { ...line.fields, taunted1: true } };
    }
    if (line.t === "final" && line.side === "villain") {
      return { ...line, fields: { ...line.fields, taunted1: false } };
    }
    return line;
  });
  const setIndex = lines.findIndex((line) => line.t === "set");
  lines.splice(setIndex + 2, 0, {
    t: "set", path: "/villain/taunted1", before: true, after: false, hook: "death"
  });
  const record = ingestSs2CaptureTrace(traceText(lines), fixture);
  assert.deepEqual(record.mutationTrace[1], {
    sequence: 2, path: "/villain/taunted1", before: true, after: false, reason: "death"
  });
});

test("staged dumps must anchor every projected field", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const lines = thresholdTraceLines().map((line) => {
    if (line.t === "state" && line.side === "villain") {
      const fields = { ...line.fields };
      delete fields.burning;
      return { ...line, fields };
    }
    return line;
  });
  assert.throws(
    () => ingestSs2CaptureTrace(traceText(lines), fixture),
    /staged villain state is missing the required field burning/
  );
});

test("set lines must carry explicit before and after values", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const lines = thresholdTraceLines();
  const setIndex = lines.findIndex((line) => line.t === "set");
  lines.splice(setIndex, 0, { t: "set", path: "/villain/burning", hook: "burn" });
  assert.throws(
    () => ingestSs2CaptureTrace(traceText(lines), fixture),
    /explicit before and after values/
  );
});

test("divergence reports refuse asset payloads and foreign builds", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const observation = observationFromFixture(fixture);
  assert.throws(
    () => buildSs2DivergenceReport(fixture, observation, [
      { path: "/finalState/villain/hitpoints", expected: 28, actual: "C:\\Program Files\\SS2\\gladiator.swf" }
    ], { recordedAt: "2026-08-30T20:00:00Z" }),
    PromotionError
  );
  const report = buildSs2DivergenceReport(fixture, observation, [
    { path: "/finalState/villain/hitpoints", expected: 28, actual: 27 }
  ], { recordedAt: "2026-08-30T20:00:00Z" });
  const foreignBuild = cloneJson(report);
  foreignBuild.build.steamBuildId += 1;
  assert.throws(() => validateSs2DivergenceReport(foreignBuild), PromotionError);
  const looseDifference = cloneJson(report);
  looseDifference.differences[0].note = "extra";
  assert.throws(() => validateSs2DivergenceReport(looseDifference), PromotionError);
});

test("a gate failure on one observation never discards another's divergence", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  const divergent = observationFromFixture(fixture, {
    observationId: "obs-a",
    sessionId: "session-a",
    mutate: (draft) => {
      draft.finalState.villain.hitpoints = 27;
      draft.mutationTrace[0] = { ...draft.mutationTrace[0], after: 27 };
    }
  });
  const wrongTool = observationFromFixture(fixture, {
    observationId: "obs-b",
    sessionId: "session-b",
    captureToolVersion: "ss2-capture/9.9.9"
  });
  const manifest = captureManifestFor([divergent, wrongTool]);

  let blocked;
  try {
    promoteSs2CandidateToGolden(fixture, [divergent, wrongTool], manifest, {
      recordedAt: "2026-08-30T20:00:00Z"
    });
    assert.fail("the divergence must block promotion even alongside a gate failure");
  } catch (error) {
    blocked = error;
  }
  assert.ok(blocked instanceof PromotionBlockedError);
  assert.equal(blocked.divergences.length, 1);
  assert.equal(blocked.divergences[0].observationId, "obs-a");
});

test("projected combatant keys stay aligned with the fixture state projection", () => {
  const fixture = fixturesById.get("candidate-normal-threshold-hit");
  assert.deepEqual(
    [...SS2_PROJECTED_COMBATANT_KEYS].sort(),
    Object.keys(fixture.expected.state.villain).sort()
  );
});
