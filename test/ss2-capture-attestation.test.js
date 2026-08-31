/**
 * The three capture attestations the wrapper mints on the trace's `end` line:
 * `overdraw` (draws the armed window made after the injected tape ran out),
 * `launchNonce` (an identity minted inside the player, which the operator did
 * not choose), and `staged` (the combatant fields the wrapper itself wrote
 * before the observed action).
 *
 * The first two used to be validated at ingest and then thrown away, so no
 * committed record carried either and a reviewer holding only the repository
 * could not check that the over-draw guard had ever been satisfied. `overdraw`
 * was also optional, which meant a trace without it silently carried no
 * assurance at all rather than failing loudly.
 *
 * `staged` answers a different question: not "was the capture sound" but "whose
 * scenario is this". All 22 promoted goldens rest on scenarios the game itself
 * produced; the armoured and tournament families cannot be reached that way, so
 * the wrapper will write combatant state directly. That is a legitimate
 * experimental input — the game still resolves the action — but it is a
 * materially different kind of evidence, and nothing in the repository
 * distinguished the two.
 *
 * This suite pins the whole chain: the fields are carried into the record, the
 * count is mandatory for `injected-tape-runtime` captures with exactly one
 * documented escape hatch, the nonce is a promotion-gate independence check,
 * staging must agree across the evidence for one fixture and must reach the
 * golden — and none of it disturbs the committed evidence, whose records
 * predate all three fields and must stay byte-identical.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CaptureTraceError, ingestSs2CaptureTrace } from "../src/golden/capture-ingest.js";
import { SS2_PRE_NONCE_OBSERVATION_DIGESTS } from "../src/golden/pre-nonce-observations.js";
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
import {
  GoldenClassification,
  GoldenFixtureValidationError,
  validateSs2OneVsOneFixture
} from "../src/golden/run-1v1-fixture.js";
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
 * Every attestation moves the record's digest, so none can be edited into or
 * out of a committed record without breaking it.
 *
 * That sentence used to sit above `assert.equal(record.digest,
 * computeSs2ObservationDigest(record))`, which does not establish it and in
 * fact cannot fail. `validateSs2Observation` recomputes and compares the digest
 * itself, and `ingestSs2CaptureTrace` returns THROUGH it, so on any ingested
 * record that equality holds by construction: an implementation that broke it
 * would throw at the ingest call and the assertion would never be reached in a
 * failing state. Worse, it is blind to the thing it was cited for — a digest
 * that dropped `capture.launchNonce` before hashing would drop it on both sides
 * and agree, which is exactly the shape that would let a nonce be edited in or
 * out and defeat the promotion independence gate.
 *
 * So the claim is tested directly: add or remove each attestation and require
 * the digest to move.
 */
function assertDigestCoversAttestations(record, label) {
  for (const key of SS2_CAPTURE_ATTESTATION_KEYS) {
    const edited = cloneJson(record);
    if (Object.hasOwn(edited.capture, key)) delete edited.capture[key];
    else edited.capture[key] = key === "overdraw" ? 0 : `${key}-probe`;
    assert.notEqual(
      computeSs2ObservationDigest(edited),
      record.digest,
      `${label}: the observation digest does not cover capture.${key}`
    );
  }
}

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
  // Validation recomputes the digest and compares it, so this covers the
  // record's own integrity; what it does not cover is WHICH fields the digest
  // is taken over, which is the next line's job.
  assert.equal(validateSs2Observation(record), record);
  assertDigestCoversAttestations(record, "obs-carry");
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

test("all three attestations are optional, which is what keeps the committed evidence intact", () => {
  assert.deepEqual([...SS2_CAPTURE_ATTESTATION_KEYS].sort(), ["launchNonce", "overdraw", "staged"]);
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

  // `staged` is the same story told once more, and at the moment its whole
  // population is the legacy one: no wrapper has staged anything yet, so every
  // committed record is evidence the game produced unaided. Asserted as an
  // observation about today, not as an invariant — the armoured and tournament
  // families are expected to file staged records, and this line is then the one
  // to update, exactly as the attested/legacy split above already had to be.
  for (const observation of committedObservations) {
    assert.equal(
      Object.hasOwn(observation.capture, "staged"),
      false,
      `${observation.observationId} claims staging; if that is intentional, update this assertion ` +
      "and check the goldens citing it record the staging too"
    );
  }
  const withStaging = cloneJson(legacy[0]);
  withStaging.capture.staged = "hero.strength=40";
  assert.notEqual(computeSs2ObservationDigest(withStaging), legacy[0].digest);
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

test("promotion accepts distinct nonces, and refuses a nonce-free record it cannot place", () => {
  const withNonce = (suffix, launchNonce) =>
    injectedTapeRecord({
      observationId: `obs-ok-${suffix}`,
      sessionId: `session-ok-${suffix}`,
      end: wrapperEnd({ launchNonce })
    });
  // A nonce-free record, made the only way one can still be made: through the
  // archived-trace hatch, which the live capture path never passes. Ingest has
  // refused a fresh injected-tape trace without the nonce since cc42503.
  const withoutNonce = (suffix) =>
    injectedTapeRecord({
      observationId: `obs-ok-${suffix}`,
      sessionId: `session-ok-${suffix}`,
      end: { t: "end", installHashVerifiedAfter: true, overdraw: 0 },
      options: { allowMissingOverdraw: true }
    });

  const distinct = [withNonce("d1", "111-1"), withNonce("d2", "222-2")];
  const promotion = promoteSs2CandidateToGolden(baseFixture, distinct, manifestFor(distinct));
  assert.equal(promotion.golden.classification, GoldenClassification.GOLDEN);
  assert.equal(promotion.matches.length, 2);

  // THIS IS THE FORGERY, and until the pre-nonce waiver was enumerated it
  // promoted. Both records are nonce-free, so neither shares a nonce with the
  // other; both carry their own id and sessionId; both match the candidate;
  // and their comparison projections are identical, which is what the pairwise
  // gate is looking FOR. Absence used to mean "legacy, wave it through". It now
  // means "name the record", and a record minted today cannot be named.
  for (const [label, observations] of Object.entries({
    "two records with no nonce": [withoutNonce("n1"), withoutNonce("n2")],
    "one of each": [withNonce("m1", "333-3"), withoutNonce("m2")]
  })) {
    assert.throws(
      () => promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations)),
      (error) =>
        error instanceof PromotionError &&
        /carries no capture.launchNonce and is not one of the records that predate the field/
          .test(error.message),
      label
    );
  }

  // And the waiver is a set of DIGESTS, not of shapes: it is not enough to look
  // like a pre-nonce record. The end-to-end proof that the enumerated records
  // still promote is "the committed evidence still promotes untouched under the
  // nonce gate" above, which runs the real candidate against real records.
  assert.equal(SS2_PRE_NONCE_OBSERVATION_DIGESTS.has(withoutNonce("n1").digest), false);
});

// ---------------------------------------------------------------------------
// The pre-nonce waiver, which is the only way a nonce-free record still promotes
// ---------------------------------------------------------------------------

/**
 * The size the list had when it was frozen. It is a CEILING, not an equality:
 * entries leave when the record they name is re-captured with a nonce, and
 * nothing captured from here on can ever qualify to join, because ingest
 * refuses to emit a nonce-free injected-tape-runtime record at all. So a list
 * that has grown is a list somebody widened to let something through.
 */
const PRE_NONCE_CEILING = 58;

test("the pre-nonce waiver may only ever shrink", () => {
  assert.ok(
    SS2_PRE_NONCE_OBSERVATION_DIGESTS.size <= PRE_NONCE_CEILING,
    `the pre-nonce waiver has grown to ${SS2_PRE_NONCE_OBSERVATION_DIGESTS.size} entries. It is the ` +
    "hatch that lets a nonce-free record promote, and no capture taken since cc42503 can qualify for " +
    "it. Adding an entry is a claim that a record predating 2026-08-30 23:18 was overlooked; if that " +
    "is really what happened, lower PRE_NONCE_CEILING's justification here rather than raising it."
  );
});

test("every waived digest names a committed record that actually lacks a nonce", () => {
  // A digest in that file is a promotion the gate will not refuse, so an entry
  // that names nothing is a hole with no record behind it. And because a digest
  // covers the whole record and validateSs2Observation verifies it against the
  // contents, an entry names one exact record byte for byte — it cannot be
  // moved onto different content by relabelling.
  const byDigest = new Map(committedObservations.map((observation) => [observation.digest, observation]));
  for (const digest of SS2_PRE_NONCE_OBSERVATION_DIGESTS) {
    const observation = byDigest.get(digest);
    assert.ok(observation, `waived digest ${digest} names no committed observation record`);
    assert.equal(
      Object.hasOwn(observation.capture, "launchNonce"),
      false,
      `${observation.observationId} carries a nonce and has no business in the pre-nonce waiver`
    );
    assert.equal(validateSs2Observation(observation), observation);
  }
});

test("no committed record lacks a nonce without being waived", () => {
  // Not a rule the gate needs — an unwaived nonce-free record simply cannot
  // promote. It is a tripwire on the corpus: it means every nonce-free record
  // in the repository today is one this waiver was written against, so a
  // nonce-free record appearing later is visible as an addition rather than
  // blending into 58 lookalikes.
  const unwaived = committedObservations
    .filter((observation) => !Object.hasOwn(observation.capture, "launchNonce"))
    .filter((observation) => !SS2_PRE_NONCE_OBSERVATION_DIGESTS.has(observation.digest))
    .map((observation) => observation.observationId);
  assert.deepEqual(unwaived, [], "these committed records carry no nonce and are not waived, so they cannot promote");
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

/**
 * The committed golden-prisoner-normal-kill-dir6 cites `obs-diag`, which is the
 * record its candidate was transcribed from, so the gate now refuses that pair
 * (see "a candidate's own source record is refused as evidence" below). These
 * two end-to-end regressions therefore promote from an ELIGIBLE pair instead:
 * `obs-gold3` (the golden's other cited record) and `obs-camp2`, an independent
 * later capture of the same direction. Both were captured after the candidate
 * was authored, so neither could have been its source.
 *
 * The comparison drops only the four provenance fields that NAME the evidence.
 * Everything a promotion actually derives — scenario, samples, expected, build,
 * classification, fixtureId, kind, runtimeVerified, sourceRefs, repetitions —
 * must still come out byte-identical to the committed golden, which is what
 * makes this a regression rather than a restatement.
 */
const EVIDENCE_NAMING_FIELDS = ["observationIds", "observationDigests", "observedAt", "captureManifestSha256"];

function goldenApartFromItsEvidence(golden) {
  const projected = cloneJson(golden);
  for (const field of EVIDENCE_NAMING_FIELDS) delete projected.provenance[field];
  return projected;
}

const DIR6_ELIGIBLE_PAIR = ["obs-gold3", "obs-camp2"];

test("the committed evidence still promotes untouched under the nonce gate", async () => {
  // The end-to-end regression that matters: real records, a real manifest, and
  // the real candidate, none of which carry a nonce.
  const golden = await loadJson(path.join(GOLDEN_DIR, "golden-prisoner-normal-kill-dir6.json"));
  const candidate = await loadJson(path.join(FIXTURE_DIR, "candidate-prisoner-normal-kill-dir6.json"));
  const observations = DIR6_ELIGIBLE_PAIR.map((observationId) => {
    const observation = committedById.get(observationId);
    assert.ok(observation, `missing observation ${observationId}`);
    assert.notEqual(observationId, candidate.provenance.authoredFrom, "the pair must be eligible");
    assert.equal(Object.hasOwn(observation.capture, "launchNonce"), false, observationId);
    return observation;
  });

  const promotion = promoteSs2CandidateToGolden(candidate, observations, manifestFor(observations));
  assert.deepEqual(promotion.golden.provenance.observationIds, DIR6_ELIGIBLE_PAIR);
  assert.deepEqual(goldenApartFromItsEvidence(promotion.golden), goldenApartFromItsEvidence(golden));
});

test("a candidate's own source record is refused as evidence, however well it matches", async () => {
  // obs-diag is not a divergent record, a duplicate, a same-session repeat or a
  // nonce collision — it matches candidate-prisoner-normal-kill-dir6 perfectly,
  // and it is cited by the committed golden. It matches perfectly BECAUSE the
  // candidate's scenario and tape were copied out of it, which is exactly why
  // its agreement is worth nothing.
  const candidate = await loadJson(path.join(FIXTURE_DIR, "candidate-prisoner-normal-kill-dir6.json"));
  assert.equal(candidate.provenance.kind, "transcribed-observation");
  assert.equal(candidate.provenance.authoredFrom, "obs-diag");

  const source = committedById.get("obs-diag");
  const other = committedById.get("obs-gold3");
  // It really does match — the refusal is not the matcher quietly disagreeing.
  assert.equal(matchSs2ObservationToFixture(candidate, source).match, true);

  const observations = [source, other];
  assert.throws(
    () => promoteSs2CandidateToGolden(candidate, observations, manifestFor(observations)),
    (error) =>
      error instanceof PromotionError &&
      /obs-diag is the record candidate-prisoner-normal-kill-dir6 was authored from/.test(error.message) &&
      /cannot fail/.test(error.message)
  );

  // And the taint is one record deep: swap the source out for any independent
  // capture and the same candidate promotes.
  const eligible = DIR6_ELIGIBLE_PAIR.map((id) => committedById.get(id));
  assert.equal(promoteSs2CandidateToGolden(candidate, eligible, manifestFor(eligible)).matches.length, 2);
});

// ---------------------------------------------------------------------------
// The staging declaration
//
// `end.staged` names every combatant field the WRAPPER wrote and the value that
// stuck after the game's own construction finished, in application order,
// `side.field=value` comma separated. Absent means the wrapper staged nothing,
// which is true of every trace and every golden that existed before it.
// ---------------------------------------------------------------------------

/** A declaration that agrees with the base fixture's staged dump. */
const STAGED_DECLARATION =
  `hero.strength=${baseFixture.scenario.hero.strength},` +
  `villain.hitpoints=${baseFixture.scenario.villain.hitpoints}`;

/**
 * One staged observation, and one the game produced unaided.
 *
 * Each mints its own `launchNonce` from its observation id. Without that the
 * nonce gate fires first on every multi-observation test below and masks the
 * staging gate under test — these are meant to be distinct player launches, so
 * they say so.
 */
const stagedRecord = ({ observationId, sessionId, staged = STAGED_DECLARATION }) =>
  injectedTapeRecord({
    observationId,
    sessionId,
    end: wrapperEnd({ launchNonce: `nonce-${observationId}`, staged })
  });

const producedRecord = ({ observationId, sessionId }) =>
  injectedTapeRecord({
    observationId,
    sessionId,
    end: wrapperEnd({ launchNonce: `nonce-${observationId}` })
  });

test("ingest carries the staging declaration into capture.staged, and its absence is a claim too", () => {
  const staged = stagedRecord({ observationId: "obs-staged", sessionId: "session-staged" });
  assert.equal(staged.capture.staged, STAGED_DECLARATION);
  assert.equal(validateSs2Observation(staged), staged);
  assertDigestCoversAttestations(staged, "obs-staged");

  // Staging is a scenario INPUT: the game still resolved the action, so the
  // observation is still evidence for the same fixture.
  assert.equal(matchSs2ObservationToFixture(baseFixture, staged).match, true);

  const unstaged = injectedTapeRecord({ observationId: "obs-unstaged", sessionId: "session-unstaged" });
  assert.equal(Object.hasOwn(unstaged.capture, "staged"), false);
  assert.equal(validateSs2Observation(unstaged), unstaged);
  // Absence is a claim too, so it has to be digest-covered in the same way:
  // adding `staged` to a record that says it staged nothing must break it.
  assertDigestCoversAttestations(unstaged, "obs-unstaged");
  assert.equal(matchSs2ObservationToFixture(baseFixture, unstaged).match, true);
});

test("a malformed staging declaration is refused at the trace line that carried it", () => {
  const malformed = [
    // Absence is how "staged nothing" is spelled; the empty string would be a
    // second spelling of the same fact and would digest differently.
    "",
    17,
    null,
    true,
    ["hero.strength=5"],
    "hero.strength",                     // no value
    "hero.strength=",                    // empty value
    "=5",                                // no field
    "hero.strength=5,",                  // trailing separator leaves an empty entry
    ",hero.strength=5",                  // leading separator
    "hero.strength=5, villain.helmet=6", // whitespace is not part of the grammar
    "wizard.strength=5",                 // only hero and villain exist
    "hero.Strength=5",                   // field tokens are lowercase, as set paths are
    "hero.strength=abc",                 // values are numeric or boolean, never free text
    "hero.strength=\"5\"",
    "hero.strength=5,hero.strength=5",   // one entry per field, carrying what stuck
    `hero.strength=${"5".repeat(600)}`   // past the length cap
  ];
  for (const staged of malformed) {
    assert.throws(
      () => stagedRecord({ observationId: "obs-bad-staged", sessionId: "session-bad-staged", staged }),
      (error) =>
        error instanceof CaptureTraceError &&
        /end\.staged must be a non-empty/.test(error.message) &&
        /^Capture trace line \d+:/.test(error.message),
      `staged ${JSON.stringify(staged)} was accepted`
    );
  }
});

test("a staging declaration accepts every value a watched combatant field can hold", () => {
  // Integers, negative and fractional numbers, and booleans — exactly the range
  // of the projected combatant keys, and nothing wider. The two watched fields
  // here are declared at the values the dump actually holds, because the
  // cross-check below is real; the unwatched ones carry the odd shapes.
  const staged = [
    `hero.strength=${baseFixture.scenario.hero.strength}`,
    "villain.burning=false",
    "villain.helmet_defence=6",
    "villain.greaves_defence=-1.5",
    "villain.helmet_enchanted=true"
  ].join(",");
  const record = stagedRecord({ observationId: "obs-values", sessionId: "session-values", staged });
  assert.equal(record.capture.staged, staged);
  assert.equal(validateSs2Observation(record), record);
});

test("end.staged must report the value that stuck, not the value the wrapper attempted", () => {
  // The point of "what stuck": the game's own construction runs after the write
  // and may overwrite it. The staged state dump is that same moment read back
  // off the live objects, so where it watches the field the two must agree.
  assert.throws(
    () => stagedRecord({
      observationId: "obs-drift",
      sessionId: "session-drift",
      staged: "hero.strength=99"
    }),
    (error) =>
      error instanceof CaptureTraceError &&
      /end\.staged claims hero\.strength=99 stuck/.test(error.message) &&
      new RegExp(`read back ${baseFixture.scenario.hero.strength}`).test(error.message)
  );

  // The live hazard, pinned deliberately. `staged` must be read back at the
  // moment the staging finished — which is the moment the `state` dump is
  // taken, since staging stops before the action arms. Reading it again at the
  // END of the action reports what the ACTION left behind, not what staging
  // left behind, and for exactly the fields the armoured and tournament
  // families stage (`helmet` under `remove_armour`, `hitpoints`, `staminaleft`)
  // those differ. Here the villain is staged at 40 hitpoints and the action
  // leaves 28; a declaration of 28 is a post-action reading and is refused.
  assert.equal(baseFixture.expected.state.villain.hitpoints, 28);
  assert.throws(
    () => stagedRecord({
      observationId: "obs-post-action",
      sessionId: "session-post-action",
      staged: "villain.hitpoints=28"
    }),
    /end\.staged claims villain\.hitpoints=28 stuck, but the staged villain dump read back 40/
  );

  // A field the dump does not watch cannot be cross-checked and is taken on the
  // wrapper's word. This is not laxity: the armoured captures stage per-piece
  // `*_defence` ratings that the default watch list omits, and refusing to let
  // the declaration name them would make it lie by omission instead.
  const unwatched = stagedRecord({
    observationId: "obs-unwatched",
    sessionId: "session-unwatched",
    staged: "villain.helmet_defence=6,villain.greaves_defence=2"
  });
  assert.equal(unwatched.capture.staged, "villain.helmet_defence=6,villain.greaves_defence=2");
});

test("the record schema admits a staging declaration and refuses a malformed one", () => {
  const record = stagedRecord({ observationId: "obs-schema-staged", sessionId: "session-schema-staged" });
  const rewritten = (mutate) => {
    const draft = cloneJson(record);
    mutate(draft.capture);
    draft.digest = computeSs2ObservationDigest(draft);
    return draft;
  };

  const baseline = rewritten(() => {});
  assert.equal(validateSs2Observation(baseline), baseline);

  // The record is checked against the same grammar as the trace, so no record
  // can carry a shape a trace could not have produced.
  for (const staged of ["", 17, null, "hero.strength", "hero.strength=abc", "hero.strength=5,hero.strength=5"]) {
    assert.throws(
      () => validateSs2Observation(rewritten((capture) => { capture.staged = staged; })),
      /capture\.staged must be a non-empty/,
      `staged ${JSON.stringify(staged)} was accepted`
    );
  }
  // Dropping the field is always legal — that is what an unstaged capture says.
  const dropped = rewritten((capture) => { delete capture.staged; });
  assert.equal(validateSs2Observation(dropped), dropped);
});

test("the simulator declares no staging, because it stages nothing", () => {
  // Easy to get backwards: every value in a reference trace's state lines comes
  // from the fixture, so the whole trace looks like one long staging. It is
  // not. `staged` declares what the wrapper wrote into a RUNNING game, and the
  // simulator runs no game — there is no construction for a write to survive
  // and so no stuck value to report. Emitting one would invent the single fact
  // the field exists to establish.
  for (const fixture of fixtures) {
    const end = parseTrace(simulateSs2CaptureTrace(fixture)).at(-1);
    assert.equal(Object.hasOwn(end, "staged"), false, fixture.fixtureId);
  }
  const record = ingestSs2CaptureTrace(
    simulateSs2CaptureTrace(baseFixture, { observationId: "sim-staged", sessionId: "sim-staged" }),
    baseFixture
  );
  assert.equal(Object.hasOwn(record.capture, "staged"), false);
});

test("the end line's key set is still closed, so an unknown attestation cannot slip in", () => {
  assert.throws(
    () => injectedTapeRecord({
      observationId: "obs-unknown-end",
      sessionId: "session-unknown-end",
      end: wrapperEnd({ stagedFields: "hero.strength=5" })
    }),
    /the end line carries an unexpected field stagedFields/
  );
});

// ---------------------------------------------------------------------------
// Staging in the promotion gate
// ---------------------------------------------------------------------------

/**
 * Whether the shared fixture schema admits `provenance.staged` yet.
 *
 * `GOLDEN_PROVENANCE_KEYS` lives in src/golden/run-1v1-fixture.js, which this
 * track does not own, and is a closed set that does not currently contain
 * `staged`. Probed rather than hard-coded so the tests below assert the rule —
 * a promoted golden must state that its scenario was wrapper-staged — and not a
 * snapshot of which day the schema change landed.
 *
 * The probe decides which of two UNEQUAL arms the test below takes, so it has
 * to be able to tell "the schema rejects this key" from "something else broke".
 * It could not: it used to end `catch { return false }`, and the arm that
 * selects only has to witness a refusal — which a validator broken in any way
 * at all also produces. Demonstrated, not argued. Teach the schema `staged` but
 * give it a validator that rejects every value of the field — the single most
 * likely regression, since the promotion gate's own error message tells the
 * next author to add the key and validate it — and the pre-fix file reported 29
 * passed / 0 failed, with the one test that exists to prove a staged golden
 * says so on its own face reporting success by taking the "not yet" branch.
 *
 * So exactly one error selects that branch now and every other throw is
 * rethrown. Evaluated lazily rather than at module load, so the rethrow is
 * attributed to the test that consumes it instead of taking the other 28 down
 * with it as an uncaught exception.
 */
const STAGED_KEY_REFUSED_BY_SCHEMA = /^golden provenance has unsupported fields: staged\.$/;

function goldenSchemaAdmitsStaged() {
  const observations = ["p1", "p2"].map((suffix) =>
    producedRecord({ observationId: `obs-probe-${suffix}`, sessionId: `session-probe-${suffix}` })
  );
  const { golden } = promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations));
  // The probe reads the schema only if its own baseline is sound. A validator
  // that rejects this golden for any OTHER reason rejects the mutated probe
  // too, and the probe would report that as "the schema has not learned
  // `staged` yet" — so the baseline is checked before the mutation is made.
  assert.equal(
    validateSs2OneVsOneFixture(golden),
    golden,
    "the staging probe's baseline golden does not validate, so the probe measures nothing"
  );
  const probe = cloneJson(golden);
  probe.provenance.staged = "hero.strength=40";
  try {
    validateSs2OneVsOneFixture(probe);
    return true;
  } catch (error) {
    if (
      error instanceof GoldenFixtureValidationError &&
      STAGED_KEY_REFUSED_BY_SCHEMA.test(error.message)
    ) {
      return false;
    }
    throw error;
  }
}

test("the scenario comparison cannot see staging, which is why the gate has to", () => {
  // The load-bearing demonstration. These two observations agree on every
  // channel the pipeline compares — same scenario values, same tape, same
  // mutation trace, same events, same final state — and differ only in who
  // wrote the scenario. Neither comparison notices.
  const staged = stagedRecord({ observationId: "obs-cmp-staged", sessionId: "session-cmp-staged" });
  const produced = producedRecord({
    observationId: "obs-cmp-produced",
    sessionId: "session-cmp-produced"
  });

  assert.deepEqual(staged.scenario, produced.scenario);
  // Observation-to-observation: the comparison projection excludes `capture`.
  assert.deepEqual(ss2ObservationsMatch(staged, produced).differences, []);
  // Observation-to-fixture: matching never reads the `capture` block at all.
  assert.equal(matchSs2ObservationToFixture(baseFixture, staged).match, true);
  assert.equal(matchSs2ObservationToFixture(baseFixture, produced).match, true);

  // So the promotion gate is the only thing standing between a wrapper-written
  // scenario and a golden that reads as game-produced.
  const observations = [staged, produced];
  assert.throws(
    () => promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations)),
    (error) =>
      error instanceof PromotionError &&
      /disagree about staging/.test(error.message) &&
      /obs-cmp-staged/.test(error.message) &&
      /obs-cmp-produced/.test(error.message) &&
      /staged nothing/.test(error.message)
  );
});

test("two differently staged observations are two scenarios, not two observations of one", () => {
  const left = stagedRecord({
    observationId: "obs-two-l",
    sessionId: "session-two-l",
    staged: "hero.strength=5"
  });
  const right = stagedRecord({
    observationId: "obs-two-r",
    sessionId: "session-two-r",
    staged: "hero.strength=5,villain.helmet_defence=6"
  });
  const observations = [left, right];
  assert.throws(
    () => promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations)),
    /disagree about staging/
  );
});

test("a staging disagreement never discards divergence evidence", () => {
  // Same deferral discipline as the manifest and nonce gates: an independence
  // or provenance failure must not swallow an observation that actually
  // disagreed with the candidate.
  const matching = stagedRecord({ observationId: "obs-sdiv-ok", sessionId: "session-sdiv-ok" });
  const divergent = cloneJson(matching);
  divergent.observationId = "obs-sdiv-bad";
  divergent.capture.sessionId = "session-sdiv-bad";
  divergent.capture.launchNonce = "nonce-obs-sdiv-bad";
  delete divergent.capture.staged;
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
  assert.equal(blocked.divergences[0].observationId, "obs-sdiv-bad");
});

test("unstaged evidence promotes exactly as before, adding no key to the golden", () => {
  const observations = ["u1", "u2"].map((suffix) =>
    producedRecord({ observationId: `obs-unst-${suffix}`, sessionId: `session-unst-${suffix}` })
  );
  const promotion = promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations));

  assert.equal(promotion.golden.classification, GoldenClassification.GOLDEN);
  assert.equal(promotion.staged, null);
  // Not `staged: null`, not `staged: ""` — no key. That is what keeps all 22
  // committed goldens byte-identical, and it is also the honest claim: no
  // wrapper wrote this scenario.
  assert.equal(Object.hasOwn(promotion.golden.provenance, "staged"), false);
});

test("a golden promoted from staged evidence must say so on its own face", () => {
  const observations = ["s1", "s2"].map((suffix) =>
    stagedRecord({ observationId: `obs-gold-${suffix}`, sessionId: `session-gold-${suffix}` })
  );
  const promote = () =>
    promoteSs2CandidateToGolden(baseFixture, observations, manifestFor(observations));

  if (goldenSchemaAdmitsStaged()) {
    const promotion = promote();
    assert.equal(promotion.staged, STAGED_DECLARATION);
    // A reader opening the golden sees the staging without chasing observation
    // ids into test/observations/.
    assert.equal(promotion.golden.provenance.staged, STAGED_DECLARATION);
    assert.equal(validateSs2OneVsOneFixture(promotion.golden), promotion.golden);
    return;
  }

  // The schema does not admit the field yet, and the gate refuses rather than
  // dropping it. Emitting a golden that silently read as game-produced is the
  // exact outcome `staged` exists to prevent, so failing loudly with the
  // required change is the only honest option left to this track.
  //
  // NOT also asserted here: that `error.cause` is the schema's refusal of this
  // one key. It reads like the natural companion to the narrowed probe above,
  // and it is decoration — `assertAllowedKeys(provenance, GOLDEN_PROVENANCE_KEYS)`
  // runs BEFORE every other golden check, so while `staged` is an unsupported
  // key that refusal masks any other defect in the golden and the cause matches
  // by construction; and once the key is supported this arm is not taken at
  // all. An assertion that cannot fail in either state is worth less than the
  // comment saying why, so this is the comment.
  //
  // The real hazard it looked like it was covering lives in
  // src/golden/promote-1v1-golden.js and is reported, not patched from here:
  // `assertGoldenCanRecordStaging` relabels ANY golden validation failure as
  // "the schema does not admit provenance.staged" whenever staging is present.
  // Harmless today for the ordering reason above; the day `staged` joins
  // GOLDEN_PROVENANCE_KEYS it will start telling the next author to make a
  // change they have already made.
  assert.throws(
    promote,
    (error) =>
      error instanceof PromotionError &&
      /must record that in provenance\.staged/.test(error.message) &&
      /GOLDEN_PROVENANCE_KEYS in src\/golden\/run-1v1-fixture\.js/.test(error.message)
  );
});

test("the committed evidence promotes untouched under the staging gate", async () => {
  // The regression that matters most: real records, a real manifest, the real
  // candidate, none of which mention staging, producing the committed golden's
  // every derived field. The evidence pair is the eligible one — see
  // goldenApartFromItsEvidence above for why and for what is compared.
  const golden = await loadJson(path.join(GOLDEN_DIR, "golden-prisoner-normal-kill-dir6.json"));
  const candidate = await loadJson(path.join(FIXTURE_DIR, "candidate-prisoner-normal-kill-dir6.json"));
  const observations = DIR6_ELIGIBLE_PAIR.map((observationId) => {
    const observation = committedById.get(observationId);
    assert.ok(observation, `missing observation ${observationId}`);
    assert.equal(Object.hasOwn(observation.capture, "staged"), false, observationId);
    return observation;
  });

  const promotion = promoteSs2CandidateToGolden(candidate, observations, manifestFor(observations));
  assert.equal(promotion.staged, null);
  assert.equal(Object.hasOwn(promotion.golden.provenance, "staged"), false);
  assert.deepEqual(goldenApartFromItsEvidence(promotion.golden), goldenApartFromItsEvidence(golden));
});
