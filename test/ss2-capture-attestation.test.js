/**
 * The two capture attestations the wrapper mints on the trace's `end` line:
 * `overdraw` (draws the armed window made after the injected tape ran out) and
 * `launchNonce` (an identity minted inside the player, which the operator did
 * not choose).
 *
 * Both used to be validated at ingest and then thrown away, so no committed
 * record carried either and a reviewer holding only the repository could not
 * check that the over-draw guard had ever been satisfied. `overdraw` was also
 * optional, which meant a trace without it silently carried no assurance at all
 * rather than failing loudly.
 *
 * This suite pins the whole chain: the fields are carried into the record, the
 * count is mandatory for `injected-tape-runtime` captures with exactly one
 * documented escape hatch, the nonce is a promotion-gate independence check —
 * and none of it disturbs the committed evidence, whose records predate both
 * fields and must stay byte-identical.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CaptureTraceError, ingestSs2CaptureTrace } from "../src/golden/capture-ingest.js";
import {
  ObservationValidationError,
  SS2_CAPTURE_ATTESTATION_KEYS,
  SS2_SIMULATED_CAPTURE_METHOD,
  computeSs2ObservationDigest,
  matchSs2ObservationToFixture,
  ss2ObservationsMatch,
  validateSs2Observation
} from "../src/golden/observation.js";
import {
  PromotionBlockedError,
  PromotionError,
  promoteSs2CandidateToGolden
} from "../src/golden/promote-1v1-golden.js";
import { GoldenClassification } from "../src/golden/run-1v1-fixture.js";
import { simulateSs2CaptureTrace } from "../src/golden/simulate-capture-trace.js";

import { loadSs2Fixtures } from "./ss2-fixture-files.js";

const OBSERVATION_DIR = fileURLToPath(new URL("observations/ss2-1v1/", import.meta.url));
const MANIFEST_DIR = fileURLToPath(new URL("manifests/", import.meta.url));
const FIXTURE_DIR = fileURLToPath(new URL("fixtures/ss2-1v1/", import.meta.url));
const GOLDEN_DIR = fileURLToPath(new URL("fixtures/ss2-1v1-golden/", import.meta.url));
const TOOLS_DIR = fileURLToPath(new URL("../tools/", import.meta.url));

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

async function loadJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

const fixtures = await loadSs2Fixtures();
const baseFixture = fixtures.find((fixture) => fixture.fixtureId === "candidate-normal-threshold-hit");
assert.ok(baseFixture, "the suite's base fixture is missing");

const committedObservations = await Promise.all(
  (await readdir(OBSERVATION_DIR))
    .filter((name) => name.endsWith(".json"))
    .map((name) => loadJson(path.join(OBSERVATION_DIR, name)))
);
const committedById = new Map(
  committedObservations.map((observation) => [observation.observationId, observation])
);

const parseTrace = (trace) => trace.trim().split("\n").map((line) => JSON.parse(line));
const writeTrace = (lines) => `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;

/**
 * A raw trace for `fixture` with a chosen capture method and a chosen `end`
 * line.
 *
 * Built from the reference simulator and then re-stamped, which is exactly the
 * weakness §"What a match actually establishes" records: the capture method is
 * one editable string in the meta line. That is a defect of the evidence chain
 * and a convenience here — it is the only way to exercise the injected-tape
 * ingest rules without a licensed capture, and the tests below assert rules,
 * never provenance.
 */
function traceWith(fixture, { method, observationId, sessionId, end }) {
  const lines = parseTrace(simulateSs2CaptureTrace(fixture, { observationId, sessionId }));
  lines[0] = { ...lines[0], method };
  if (method === "passive-runtime") {
    // A passive capture injects nothing, and the record schema refuses a
    // passive observation that claims an injected sample.
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].t === "roll") lines[index] = { ...lines[index], injected: false };
    }
  }
  lines[lines.length - 1] = end;
  return writeTrace(lines);
}

/** The end line as the wrapper emits it for a clean injected-tape session. */
const wrapperEnd = (overrides = {}) => ({
  t: "end",
  installHashVerifiedAfter: true,
  overdraw: 0,
  launchNonce: "417238-1900311477",
  ...overrides
});

function injectedTapeRecord({ fixture = baseFixture, observationId, sessionId, end, options } = {}) {
  return ingestSs2CaptureTrace(
    traceWith(fixture, {
      method: "injected-tape-runtime",
      observationId,
      sessionId,
      end: end ?? wrapperEnd()
    }),
    fixture,
    options
  );
}

function manifestFor(observations, captureToolVersion = "ss2-capture/0.1.0") {
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
    captureToolVersion,
    createdAt: "2026-08-30T18:00:00Z",
    sessions: [...sessions.values()]
  };
}

// ---------------------------------------------------------------------------
// Carrying the attestations into the record
// ---------------------------------------------------------------------------

test("ingest carries the over-draw count and the launch nonce into capture.*", () => {
  const record = injectedTapeRecord({ observationId: "obs-carry", sessionId: "session-carry" });

  assert.equal(record.capture.overdraw, 0);
  assert.equal(record.capture.launchNonce, "417238-1900311477");
  assert.equal(validateSs2Observation(record), record);
  // The digest covers the whole record, so a reviewer recomputing it is
  // recomputing over the attestations too: they cannot be edited into a
  // committed record after the fact without breaking it.
  assert.equal(record.digest, computeSs2ObservationDigest(record));
  // And carrying them changes nothing about what the observation is evidence
  // for: the fixture comparison never reads the capture block.
  assert.equal(matchSs2ObservationToFixture(baseFixture, record).match, true);
});

test("a nonce is an identity, not evidence: two records differing only in it still match", () => {
  const left = injectedTapeRecord({
    observationId: "obs-nonce-l",
    sessionId: "session-l",
    end: wrapperEnd({ launchNonce: "111-1" })
  });
  const right = injectedTapeRecord({
    observationId: "obs-nonce-r",
    sessionId: "session-r",
    end: wrapperEnd({ launchNonce: "222-2" })
  });

  assert.notEqual(left.capture.launchNonce, right.capture.launchNonce);
  const comparison = ss2ObservationsMatch(left, right);
  assert.deepEqual(comparison.differences, []);
  assert.equal(comparison.match, true);
});

// ---------------------------------------------------------------------------
// The mandatory rule and its one escape hatch
// ---------------------------------------------------------------------------

test("an injected-tape trace with no over-draw count is refused, naming the one escape hatch", () => {
  const bare = { t: "end", installHashVerifiedAfter: true };
  assert.throws(
    () => injectedTapeRecord({ observationId: "obs-bare", sessionId: "session-bare", end: bare }),
    (error) =>
      error instanceof CaptureTraceError &&
      /must carry end\.overdraw/.test(error.message) &&
      /allowMissingOverdraw/.test(error.message)
  );
});

test("the escape hatch admits an archived pre-overdraw trace, which then claims nothing", () => {
  // The reason this option exists: 113 of the 177 archived .jsonl traces under
  // the ignored captures/ directory carry `overdraw`; the rest predate the
  // field, and regenerating divergence reports from them must not be blocked by
  // evidence they could not have recorded.
  const bare = { t: "end", installHashVerifiedAfter: true };
  const record = injectedTapeRecord({
    observationId: "obs-archived",
    sessionId: "session-archived",
    end: bare,
    options: { allowMissingOverdraw: true }
  });

  assert.equal(record.capture.method, "injected-tape-runtime");
  // Absent, never defaulted to zero: a record ingested under the hatch must
  // make no claim rather than a false one.
  assert.equal(Object.hasOwn(record.capture, "overdraw"), false);
  assert.equal(Object.hasOwn(record.capture, "launchNonce"), false);
  assert.equal(validateSs2Observation(record), record);
  assert.equal(matchSs2ObservationToFixture(baseFixture, record).match, true);
});

test("the escape hatch waives only absence; the over-draw guard itself is untouched", () => {
  for (const options of [undefined, { allowMissingOverdraw: true }]) {
    assert.throws(
      () => injectedTapeRecord({
        observationId: "obs-over",
        sessionId: "session-over",
        end: wrapperEnd({ overdraw: 2 }),
        options
      }),
      /drew more randomness than the target candidate models/
    );
  }
});

test("a malformed over-draw count is refused, hatch or no hatch", () => {
  for (const overdraw of [-1, 1.5, "0", null, true]) {
    for (const options of [undefined, { allowMissingOverdraw: true }]) {
      assert.throws(
        () => injectedTapeRecord({
          observationId: "obs-bad",
          sessionId: "session-bad",
          end: wrapperEnd({ overdraw }),
          options
        }),
        CaptureTraceError,
        `overdraw ${JSON.stringify(overdraw)} was accepted`
      );
    }
  }
});

test("a malformed launch nonce is refused at the trace line that carried it", () => {
  for (const launchNonce of [17, "", "has space", null, "-leading-dash"]) {
    assert.throws(
      () => injectedTapeRecord({
        observationId: "obs-nonce-bad",
        sessionId: "session-nonce-bad",
        end: wrapperEnd({ launchNonce })
      }),
      /end\.launchNonce must be a token string/,
      `launchNonce ${JSON.stringify(launchNonce)} was accepted`
    );
  }
});

test("the mandatory rule is scoped to injected-tape captures, and nothing else", () => {
  const bare = { t: "end", installHashVerifiedAfter: true };

  // Passive: with no tape, every draw is past its end, so the count would be
  // meaningless rather than reassuring.
  const passive = ingestSs2CaptureTrace(
    traceWith(baseFixture, {
      method: "passive-runtime",
      observationId: "obs-passive",
      sessionId: "session-passive",
      end: bare
    }),
    baseFixture
  );
  assert.equal(passive.capture.method, "passive-runtime");
  assert.equal(Object.hasOwn(passive.capture, "overdraw"), false);

  // Synthetic: nothing in a generated trace can draw at all.
  const synthetic = ingestSs2CaptureTrace(
    traceWith(baseFixture, {
      method: SS2_SIMULATED_CAPTURE_METHOD,
      observationId: "obs-synth",
      sessionId: "session-synth",
      end: bare
    }),
    baseFixture
  );
  assert.equal(synthetic.capture.method, SS2_SIMULATED_CAPTURE_METHOD);
  assert.equal(Object.hasOwn(synthetic.capture, "overdraw"), false);
});

test("the simulator attests a zero over-draw and mints no launch nonce", () => {
  // The rule does not reach `synthetic-simulator`, but the reference trace is
  // the wrapper's executable specification of this same end line, and the claim
  // is true of it. A nonce is the opposite case: inventing one would fabricate
  // the single identity field that is supposed to come from a real launch.
  for (const fixture of fixtures) {
    const end = parseTrace(simulateSs2CaptureTrace(fixture)).at(-1);
    assert.equal(end.t, "end", fixture.fixtureId);
    assert.equal(end.installHashVerifiedAfter, true, fixture.fixtureId);
    assert.equal(end.overdraw, 0, fixture.fixtureId);
    assert.equal(Object.hasOwn(end, "launchNonce"), false, fixture.fixtureId);
  }

  const record = ingestSs2CaptureTrace(
    simulateSs2CaptureTrace(baseFixture, { observationId: "sim-att", sessionId: "sim-att" }),
    baseFixture
  );
  assert.equal(record.capture.overdraw, 0);
  assert.equal(Object.hasOwn(record.capture, "launchNonce"), false);
  assert.equal(matchSs2ObservationToFixture(baseFixture, record).match, true);
});

test("the live capture path never passes the escape hatch", async () => {
  // The option's whole justification is that it is reserved for re-ingesting
  // archived raw traces. If an operator CLI or the campaign driver ever passed
  // it, the mandatory rule would be decorative. Neither file is owned by this
  // track, so this guard is a tripwire, not a fix.
  //
  // `tools/runtime-capture/regenerate-divergences.mjs` is deliberately NOT on
  // this list: re-reading the archived pre-`overdraw` traces is the one purpose
  // the option was added for. Do not "fix" this test by adding it.
  for (const relativePath of ["capture-session.mjs", "runtime-capture/campaign.mjs"]) {
    const source = await readFile(path.join(TOOLS_DIR, relativePath), "utf8");
    assert.equal(
      source.includes("allowMissingOverdraw"),
      false,
      `${relativePath} must never pass allowMissingOverdraw`
    );
  }
});

// ---------------------------------------------------------------------------
// The record schema: optional by necessity, strict where it is present
// ---------------------------------------------------------------------------

test("both attestations are optional, which is what keeps the committed evidence intact", () => {
  assert.deepEqual([...SS2_CAPTURE_ATTESTATION_KEYS].sort(), ["launchNonce", "overdraw"]);
  assert.ok(committedObservations.length > 0, "no committed observations to check");

  const legacy = [];
  const attested = [];
  for (const observation of committedObservations) {
    // The invariant, and the only one optionality exists to protect: EVERY
    // committed record still validates and still digests to the value its
    // goldens cite - whether or not it carries an attestation.
    assert.equal(validateSs2Observation(observation), observation, observation.observationId);
    assert.equal(
      computeSs2ObservationDigest(observation),
      observation.digest,
      observation.observationId
    );
    if (Object.hasOwn(observation.capture, "overdraw")) attested.push(observation);
    else legacy.push(observation);
  }
  // Both populations have to be represented, and neither count is pinned.
  //
  // An earlier revision of this test asserted that NO committed record carried
  // an attestation - true when it was written, and false the moment the next
  // live session filed one, which is the intended future. It was a snapshot of
  // a moment mistaken for an invariant, and it broke on the first two real
  // captures taken after it landed. What actually matters is that records
  // WITHOUT the fields keep working, so that is what is asserted.
  assert.ok(legacy.length > 0, "no legacy record left to prove the fields are optional");
  assert.ok(
    attested.length > 0,
    "no committed record carries an attestation, so nothing proves the wrapper's " +
    "end line reaches capture.overdraw through a real session"
  );

  // And the reason they had to stay optional: the digest covers the record, so
  // adding a field to one that lacks it changes the digest and would invalidate
  // the provenance of every golden citing it.
  const withAttestation = cloneJson(legacy[0]);
  withAttestation.capture.overdraw = 0;
  assert.notEqual(computeSs2ObservationDigest(withAttestation), legacy[0].digest);
});

test("a record may claim a zero over-draw and nothing else", () => {
  const record = injectedTapeRecord({ observationId: "obs-schema", sessionId: "session-schema" });
  const rewritten = (mutate) => {
    const draft = cloneJson(record);
    mutate(draft.capture);
    draft.digest = computeSs2ObservationDigest(draft);
    return draft;
  };

  const baseline = rewritten(() => {});
  assert.equal(validateSs2Observation(baseline), baseline);
  assert.equal(baseline.capture.overdraw, 0);

  for (const overdraw of [1, -1, "0", null, 0.5]) {
    assert.throws(
      () => validateSs2Observation(rewritten((capture) => { capture.overdraw = overdraw; })),
      /capture\.overdraw must be 0 when present/,
      `overdraw ${JSON.stringify(overdraw)} was accepted`
    );
  }
  for (const launchNonce of ["", 17, "has space", null]) {
    assert.throws(
      () => validateSs2Observation(rewritten((capture) => { capture.launchNonce = launchNonce; })),
      /capture\.launchNonce must be a valid token/,
      `launchNonce ${JSON.stringify(launchNonce)} was accepted`
    );
  }
  // Optionality is for these two keys only; the block is otherwise closed.
  assert.throws(
    () => validateSs2Observation(rewritten((capture) => { capture.operatorNote = "trust me"; })),
    /capture has an unexpected field operatorNote/
  );
  assert.throws(
    () => validateSs2Observation(rewritten((capture) => { delete capture.sessionId; })),
    /capture is missing the field sessionId/
  );
});

// ---------------------------------------------------------------------------
// Nonce uniqueness in the promotion gate
// ---------------------------------------------------------------------------

test("promotion refuses two observations minted by the same player launch", () => {
  const shared = "417238-1900311477";
  const observations = ["a", "b"].map((suffix) =>
    injectedTapeRecord({
      observationId: `obs-share-${suffix}`,
      sessionId: `session-share-${suffix}`,
      end: wrapperEnd({ launchNonce: shared })
    })
  );
  // The operator-supplied halves of independence both look fine.
  assert.equal(new Set(observations.map((o) => o.capture.sessionId)).size, 2);
  assert.equal(new Set(observations.map((o) => o.observationId)).size, 2);

  assert.throws(
    () => promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations)),
    (error) =>
      error instanceof PromotionError &&
      new RegExp(`share launchNonce ${shared}`).test(error.message) &&
      /obs-share-a/.test(error.message) &&
      /obs-share-b/.test(error.message)
  );
});

test("promotion accepts distinct nonces, absent nonces, and a mix of the two", () => {
  const withNonce = (suffix, launchNonce) =>
    injectedTapeRecord({
      observationId: `obs-ok-${suffix}`,
      sessionId: `session-ok-${suffix}`,
      end: wrapperEnd({ launchNonce })
    });
  const withoutNonce = (suffix) =>
    injectedTapeRecord({
      observationId: `obs-ok-${suffix}`,
      sessionId: `session-ok-${suffix}`,
      end: { t: "end", installHashVerifiedAfter: true, overdraw: 0 }
    });

  const cases = {
    "two distinct nonces": [withNonce("d1", "111-1"), withNonce("d2", "222-2")],
    // Legacy records carry no nonce at all. Absence must never be treated as a
    // shared value, or every committed golden would stop promoting.
    "two records with no nonce": [withoutNonce("n1"), withoutNonce("n2")],
    "one of each": [withNonce("m1", "333-3"), withoutNonce("m2")]
  };
  for (const [label, observations] of Object.entries(cases)) {
    const promotion = promoteSs2CandidateToGolden(
      baseFixture,
      observations,
      manifestFor(observations)
    );
    assert.equal(promotion.golden.classification, GoldenClassification.GOLDEN, label);
    assert.equal(promotion.matches.length, 2, label);
  }
});

test("a shared nonce never discards divergence evidence", () => {
  // Same deferral discipline the manifest gate already follows: an independence
  // failure must not swallow an observation that actually disagreed with the
  // candidate.
  const shared = "999-9";
  const matching = injectedTapeRecord({
    observationId: "obs-div-ok",
    sessionId: "session-div-ok",
    end: wrapperEnd({ launchNonce: shared })
  });
  const divergent = cloneJson(matching);
  divergent.observationId = "obs-div-bad";
  divergent.capture.sessionId = "session-div-bad";
  divergent.finalState.villain.hitpoints -= 1;
  divergent.mutationTrace[0] = {
    ...divergent.mutationTrace[0],
    after: divergent.mutationTrace[0].after - 1
  };
  divergent.digest = computeSs2ObservationDigest(divergent);
  assert.equal(validateSs2Observation(divergent), divergent);

  const observations = [divergent, matching];
  let blocked;
  try {
    promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations));
    assert.fail("a divergent observation must block promotion");
  } catch (error) {
    blocked = error;
  }
  assert.ok(blocked instanceof PromotionBlockedError);
  assert.equal(blocked.divergences.length, 1);
  assert.equal(blocked.divergences[0].observationId, "obs-div-bad");
});

test("the committed evidence still promotes untouched under the nonce gate", async () => {
  // The end-to-end regression that matters: real records, the real manifest,
  // and the real candidate, none of which carry a nonce.
  const golden = await loadJson(path.join(GOLDEN_DIR, "golden-prisoner-normal-kill-dir6.json"));
  const candidate = await loadJson(path.join(FIXTURE_DIR, "candidate-prisoner-normal-kill-dir6.json"));
  const manifest = await loadJson(path.join(MANIFEST_DIR, "prisoner-dir6.json"));
  const observations = golden.provenance.observationIds.map((observationId) => {
    const observation = committedById.get(observationId);
    assert.ok(observation, `missing cited observation ${observationId}`);
    assert.equal(Object.hasOwn(observation.capture, "launchNonce"), false, observationId);
    return observation;
  });

  const promotion = promoteSs2CandidateToGolden(candidate, observations, manifest);
  assert.equal(promotion.captureManifestSha256, golden.provenance.captureManifestSha256);
  assert.deepEqual(promotion.golden, golden);
});
