/**
 * Promotion gate from static candidate fixtures to runtime-observed goldens.
 *
 * A candidate is promoted only when at least two matching observations from
 * at least two independent capture sessions exist, no two of them share a
 * player-minted `capture.launchNonce`, they agree about whether the wrapper
 * staged the scenario, every observation is covered by a validated capture
 * manifest, and each observation's digest verifies. Any divergent observation
 * blocks promotion and yields a divergence report that must be preserved
 * instead of discarded.
 *
 * A golden promoted from wrapper-staged evidence carries that fact in
 * `provenance.staged`, so the fixture says so on its own face rather than
 * leaving a reader to follow observation ids back to their records. See
 * `assertGoldenCanRecordStaging` below for the one schema change that is
 * currently outstanding on this.
 */

import {
  SS2_SIMULATED_CAPTURE_METHOD,
  matchSs2ObservationToFixture,
  sha256OfCanonicalJson,
  validateSs2Observation
} from "./observation.js";
import {
  GoldenClassification,
  GoldenProvenance,
  SS2_BUILD_SHA256,
  SS2_STEAM_BUILD_ID,
  assertJsonSafe,
  assertNoAssetPayload,
  validateSs2OneVsOneFixture
} from "./run-1v1-fixture.js";

export const SS2_CAPTURE_MANIFEST_KIND = "ss2-capture-manifest";
export const SS2_CAPTURE_MANIFEST_SCHEMA_VERSION = 1;
export const SS2_DIVERGENCE_KIND = "ss2-1v1-divergence";
export const SS2_DIVERGENCE_SCHEMA_VERSION = 1;

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHOD_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MANIFEST_KEYS = Object.freeze([
  "build",
  "captureToolVersion",
  "createdAt",
  "kind",
  "schemaVersion",
  "sessions"
]);
const SESSION_KEYS = Object.freeze([
  "installHashVerifiedAfter",
  "installHashVerifiedBefore",
  "method",
  "observationIds",
  "observedAt",
  "sessionId"
]);
const DIVERGENCE_KEYS = Object.freeze([
  "build",
  "differences",
  "fixtureId",
  "kind",
  "observationDigest",
  "observationId",
  "recordedAt",
  "schemaVersion",
  "sessionId"
]);

export class PromotionError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class CaptureManifestError extends PromotionError {}

export class PromotionBlockedError extends PromotionError {
  constructor(message, divergences) {
    super(message);
    this.divergences = divergences;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, path, ErrorClass) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ErrorClass(`${path} has unexpected or missing fields.`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Validate the capture manifest that attests every promotion session. */
export function validateSs2CaptureManifest(manifest) {
  if (!isPlainObject(manifest)) throw new CaptureManifestError("The capture manifest must be an object.");
  assertExactKeys(manifest, MANIFEST_KEYS, "manifest", CaptureManifestError);
  if (manifest.schemaVersion !== SS2_CAPTURE_MANIFEST_SCHEMA_VERSION) {
    throw new CaptureManifestError(`manifest.schemaVersion must be ${SS2_CAPTURE_MANIFEST_SCHEMA_VERSION}.`);
  }
  if (manifest.kind !== SS2_CAPTURE_MANIFEST_KIND) {
    throw new CaptureManifestError(`manifest.kind must be ${SS2_CAPTURE_MANIFEST_KIND}.`);
  }
  if (
    !isPlainObject(manifest.build) ||
    manifest.build.fingerprintSchemaVersion !== 1 ||
    manifest.build.steamBuildId !== SS2_STEAM_BUILD_ID ||
    manifest.build.ss2Sha256 !== SS2_BUILD_SHA256
  ) {
    throw new CaptureManifestError("manifest.build must match the pinned SS2 fingerprint.");
  }
  if (
    typeof manifest.captureToolVersion !== "string" ||
    manifest.captureToolVersion.trim().length === 0 ||
    manifest.captureToolVersion.length > 128
  ) {
    throw new CaptureManifestError("manifest.captureToolVersion must be a non-empty string.");
  }
  if (typeof manifest.createdAt !== "string" || Number.isNaN(Date.parse(manifest.createdAt))) {
    throw new CaptureManifestError("manifest.createdAt must be a parseable timestamp.");
  }
  if (!Array.isArray(manifest.sessions) || manifest.sessions.length === 0) {
    throw new CaptureManifestError("manifest.sessions must be a non-empty array.");
  }
  const sessionIds = new Set();
  const observationIds = new Set();
  manifest.sessions.forEach((session, index) => {
    if (!isPlainObject(session)) throw new CaptureManifestError(`sessions[${index}] must be an object.`);
    assertExactKeys(session, SESSION_KEYS, `sessions[${index}]`, CaptureManifestError);
    if (typeof session.sessionId !== "string" || !TOKEN_PATTERN.test(session.sessionId)) {
      throw new CaptureManifestError(`sessions[${index}].sessionId must be a valid token.`);
    }
    if (sessionIds.has(session.sessionId)) {
      throw new CaptureManifestError(`sessions[${index}] repeats sessionId ${session.sessionId}.`);
    }
    sessionIds.add(session.sessionId);
    if (typeof session.method !== "string" || !METHOD_PATTERN.test(session.method)) {
      throw new CaptureManifestError(`sessions[${index}].method must be a lowercase token.`);
    }
    if (typeof session.observedAt !== "string" || Number.isNaN(Date.parse(session.observedAt))) {
      throw new CaptureManifestError(`sessions[${index}].observedAt must be a parseable timestamp.`);
    }
    if (session.installHashVerifiedBefore !== true || session.installHashVerifiedAfter !== true) {
      throw new CaptureManifestError(
        `sessions[${index}] must attest the installed hash before and after the session.`
      );
    }
    if (
      !Array.isArray(session.observationIds) ||
      session.observationIds.length === 0 ||
      session.observationIds.some((id) => typeof id !== "string" || !TOKEN_PATTERN.test(id))
    ) {
      throw new CaptureManifestError(`sessions[${index}].observationIds must be a non-empty token array.`);
    }
    for (const id of session.observationIds) {
      if (observationIds.has(id)) {
        throw new CaptureManifestError(`observation ${id} is listed by more than one manifest session.`);
      }
      observationIds.add(id);
    }
  });
  try {
    assertJsonSafe(manifest, "manifest");
    assertNoAssetPayload(manifest, "manifest");
  } catch (error) {
    throw new CaptureManifestError(error.message, { cause: error });
  }
  return manifest;
}

export function computeSs2CaptureManifestDigest(manifest) {
  validateSs2CaptureManifest(manifest);
  return sha256OfCanonicalJson(manifest, "manifest");
}

export function goldenFixtureIdFor(candidateFixtureId) {
  if (typeof candidateFixtureId !== "string" || !candidateFixtureId.startsWith("candidate-")) {
    throw new PromotionError(
      `A promotable fixtureId must start with "candidate-", got ${JSON.stringify(candidateFixtureId)}.`
    );
  }
  return `golden-${candidateFixtureId.slice("candidate-".length)}`;
}

/** Preservable record of one observation that disagreed with a fixture. */
export function buildSs2DivergenceReport(fixture, observation, differences, options = {}) {
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  if (!Array.isArray(differences) || differences.length === 0) {
    throw new PromotionError("A divergence report requires at least one difference.");
  }
  const report = {
    schemaVersion: SS2_DIVERGENCE_SCHEMA_VERSION,
    kind: SS2_DIVERGENCE_KIND,
    build: cloneJson(fixture.build),
    fixtureId: fixture.fixtureId,
    observationId: observation.observationId,
    observationDigest: observation.digest,
    sessionId: observation.capture.sessionId,
    recordedAt,
    differences: cloneJson(differences)
  };
  return validateSs2DivergenceReport(report);
}

export function validateSs2DivergenceReport(report) {
  if (!isPlainObject(report)) throw new PromotionError("The divergence report must be an object.");
  assertExactKeys(report, DIVERGENCE_KEYS, "divergence report", PromotionError);
  if (
    report.schemaVersion !== SS2_DIVERGENCE_SCHEMA_VERSION ||
    report.kind !== SS2_DIVERGENCE_KIND ||
    typeof report.fixtureId !== "string" ||
    typeof report.observationId !== "string" ||
    !/^[a-f0-9]{64}$/.test(report.observationDigest ?? "") ||
    typeof report.sessionId !== "string" ||
    typeof report.recordedAt !== "string" ||
    Number.isNaN(Date.parse(report.recordedAt)) ||
    !Array.isArray(report.differences) ||
    report.differences.length === 0
  ) {
    throw new PromotionError("The divergence report has invalid metadata.");
  }
  if (
    !isPlainObject(report.build) ||
    report.build.fingerprintSchemaVersion !== 1 ||
    report.build.steamBuildId !== SS2_STEAM_BUILD_ID ||
    report.build.ss2Sha256 !== SS2_BUILD_SHA256
  ) {
    throw new PromotionError("The divergence report build must match the pinned SS2 fingerprint.");
  }
  report.differences.forEach((difference, index) => {
    if (
      !isPlainObject(difference) ||
      typeof difference.path !== "string" ||
      difference.path.length === 0 ||
      Object.keys(difference).some((key) => !["actual", "expected", "path"].includes(key))
    ) {
      throw new PromotionError(`differences[${index}] must be a {path, expected, actual} object.`);
    }
  });
  try {
    assertJsonSafe(report, "divergence report");
    assertNoAssetPayload(report, "divergence report");
  } catch (error) {
    throw new PromotionError(error.message, { cause: error });
  }
  return report;
}

/**
 * Promote one candidate fixture to a runtime-observed golden fixture.
 *
 * Returns `{ golden, captureManifestSha256, matches }`. Throws
 * PromotionBlockedError (with preservable divergence reports) when any
 * observation disagrees with the candidate, and PromotionError for every
 * unmet independence or attestation requirement.
 */
export function promoteSs2CandidateToGolden(candidate, observations, manifest, options = {}) {
  validateSs2OneVsOneFixture(candidate);
  if (candidate.classification !== GoldenClassification.CANDIDATE) {
    throw new PromotionError("Only candidate fixtures can be promoted.");
  }
  if (!Array.isArray(observations) || observations.length < 2) {
    throw new PromotionError("Promotion requires at least two independent runtime observations.");
  }

  const observationIds = new Set();
  const sessionIds = new Set();
  // launchNonce -> the first observation that claimed it. The nonce is minted
  // inside the player, from values the launcher does not supply, so two records
  // agreeing on one came from a single launch however different their
  // operator-chosen sessionIds look. Legacy records carry no nonce (the field
  // was validated and discarded before it was carried into the record), and
  // they must still promote — so this gate binds only observations that
  // actually carry one, and says nothing about the ones that do not.
  const nonceOwners = new Map();
  // The staging claim -> the first observation that made it. The key is the
  // declaration string, or `null` for "the wrapper staged nothing", which is
  // what every legacy record says by carrying no field at all.
  //
  // This check is LOAD-BEARING, not a restatement of the scenario comparison.
  // Nothing else in the pipeline looks at it: `matchSs2ObservationToFixture`
  // compares scenario/samples/mutations/events/result/finalState and never
  // reads the `capture` block, and `projectSs2ObservationForComparison`
  // excludes that block outright. So two observations can agree on every
  // compared channel — identical scenario values, tape, mutation trace and
  // final state — while one of them had those values written in by the wrapper
  // and the other got them from the game's own progression. The comparison sees
  // equal values; it cannot see unequal authorship. Offered as evidence for one
  // fixture they would produce a golden whose `staged` claim is true of half
  // its evidence, which is worse than either claim alone.
  const stagingClaims = new Map();
  const divergences = [];
  const matches = [];
  // Gate failures — the manifest included — are deferred until every
  // observation has been compared, so an attestation problem can never
  // discard an observation's divergence evidence.
  let gateError = null;
  const defer = (error) => { gateError ??= error; };
  let manifestSha256 = null;
  try {
    manifestSha256 = computeSs2CaptureManifestDigest(manifest);
  } catch (error) {
    defer(error);
  }
  for (const observation of observations) {
    try {
      validateSs2Observation(observation);
    } catch (error) {
      defer(new PromotionError(
        `Observation ${observation?.observationId ?? "(unidentified)"} is invalid: ${error.message}`,
        { cause: error }
      ));
      continue;
    }
    if (observation.capture.method === SS2_SIMULATED_CAPTURE_METHOD) {
      defer(new PromotionError(
        `Observation ${observation.observationId} is a synthetic simulator trace, not runtime evidence.`
      ));
      continue;
    }
    if (observationIds.has(observation.observationId)) {
      defer(new PromotionError(`Observation ${observation.observationId} is supplied more than once.`));
      continue;
    }
    observationIds.add(observation.observationId);
    sessionIds.add(observation.capture.sessionId);
    const launchNonce = observation.capture.launchNonce;
    if (launchNonce !== undefined) {
      const owner = nonceOwners.get(launchNonce);
      if (owner !== undefined) {
        defer(new PromotionError(
          `Observations ${owner} and ${observation.observationId} share launchNonce ${launchNonce}; ` +
          "the nonce is minted once per player launch, so they are one session's evidence offered " +
          "twice, not two independent observations."
        ));
      } else {
        nonceOwners.set(launchNonce, observation.observationId);
      }
    }
    const stagingClaim = Object.hasOwn(observation.capture, "staged")
      ? observation.capture.staged
      : null;
    if (!stagingClaims.has(stagingClaim)) stagingClaims.set(stagingClaim, observation.observationId);
    if (manifestSha256 !== null) {
      if (observation.capture.captureToolVersion !== manifest.captureToolVersion) {
        defer(new PromotionError(
          `Observation ${observation.observationId} was captured with a different tool version than the manifest.`
        ));
      }
      const session = manifest.sessions.find((candidateSession) =>
        candidateSession.sessionId === observation.capture.sessionId
      );
      if (!session || !session.observationIds.includes(observation.observationId)) {
        defer(new PromotionError(
          `Observation ${observation.observationId} is not attested by the capture manifest.`
        ));
      } else if (session.method !== observation.capture.method) {
        defer(new PromotionError(
          `Observation ${observation.observationId} disagrees with its manifest session about the capture method.`
        ));
      }
    }
    const comparison = matchSs2ObservationToFixture(candidate, observation);
    if (!comparison.match) {
      divergences.push(
        buildSs2DivergenceReport(candidate, observation, comparison.differences, options)
      );
    } else {
      matches.push({ observationId: observation.observationId, digest: observation.digest });
    }
  }
  if (stagingClaims.size > 1) {
    const describe = ([claim, observationId]) =>
      `${observationId} ${claim === null ? "staged nothing" : `staged ${JSON.stringify(claim)}`}`;
    defer(new PromotionError(
      `The observations offered for ${candidate.fixtureId} disagree about staging: ` +
      `${[...stagingClaims.entries()].map(describe).join("; ")}. A scenario the wrapper wrote and the ` +
      "same scenario the game produced unaided are different kinds of evidence, and one golden cannot " +
      "record both. Promote each set separately, or re-capture so every observation stages alike."
    ));
  }

  if (divergences.length > 0) {
    throw new PromotionBlockedError(
      `${divergences.length} observation(s) diverge from ${candidate.fixtureId}; ` +
      "preserve the divergence reports and correct the isolated candidate instead of promoting.",
      divergences
    );
  }
  if (gateError) throw gateError;
  if (sessionIds.size < 2) {
    throw new PromotionError(
      "Promotion requires observations from at least two independent capture sessions."
    );
  }

  const observedAt = observations
    .map((observation) => observation.capture.observedAt)
    .sort((left, right) => Date.parse(left) - Date.parse(right))
    .at(-1);

  // One agreed claim, checked above.
  const staged = [...stagingClaims.keys()][0] ?? null;

  const golden = cloneJson(candidate);
  golden.fixtureId = goldenFixtureIdFor(candidate.fixtureId);
  golden.classification = GoldenClassification.GOLDEN;
  golden.provenance = {
    kind: GoldenProvenance.LICENSED,
    runtimeVerified: true,
    sourceRefs: cloneJson(candidate.provenance.sourceRefs),
    observedAt,
    captureToolVersion: manifest.captureToolVersion,
    repetitions: observations.length,
    observationIds: observations.map((observation) => observation.observationId),
    observationDigests: observations.map((observation) => observation.digest),
    captureManifestSha256: manifestSha256,
    // Present only when the evidence was wrapper-staged. Omitted otherwise, so
    // every golden promoted from game-produced evidence — all 22 in the
    // repository — is byte-identical to what this gate produced before the
    // field existed. Absence is also the honest claim rather than a
    // compatibility dodge: no `staged` key means no wrapper wrote this
    // scenario.
    ...(staged === null ? {} : { staged })
  };
  assertGoldenCanRecordStaging(golden, staged);
  return { golden, captureManifestSha256: manifestSha256, matches, staged };
}

/**
 * A golden must say on its own face that its scenario was wrapper-staged.
 *
 * The alternative designs were considered and rejected. Leaving the fact only
 * in the cited observation records makes a reader chase ids through
 * `test/observations/` to learn something that changes how the fixture should
 * be read — the project's own rule is that evidence a reviewer holding the
 * repository cannot check is evidence that is not there. Refusing staged
 * evidence outright would be worse still: staging is the only route to the
 * `candidate-armoured-*` per-piece values and to a reproducible hero entering
 * the tournament rank-1 bout, and the ingest pipeline was built expecting
 * staged scenarios. So the golden records it, in one optional provenance field
 * whose absence carries the same meaning it does on a record.
 *
 * The field is currently REFUSED by the shared fixture schema:
 * `GOLDEN_PROVENANCE_KEYS` in src/golden/run-1v1-fixture.js is a closed set and
 * does not contain `staged`. That file is owned by another track, so this gate
 * fails loudly with the exact change required rather than quietly dropping the
 * field — a golden that silently looked game-produced is precisely the outcome
 * this whole field exists to prevent. Unstaged promotions are untouched by any
 * of this: they add no key, so they never reach the refusal.
 */
function assertGoldenCanRecordStaging(golden, staged) {
  try {
    validateSs2OneVsOneFixture(golden);
  } catch (error) {
    if (staged === null) throw error;
    throw new PromotionError(
      `The observations for ${golden.fixtureId} were wrapper-staged (${JSON.stringify(staged)}), so the ` +
      "golden must record that in provenance.staged — a promoted fixture has to state on its own face " +
      "that its scenario was written in rather than produced by the game. The shared fixture schema " +
      "does not admit the field yet: add \"staged\" to GOLDEN_PROVENANCE_KEYS in " +
      "src/golden/run-1v1-fixture.js and validate it with parseSs2StagedDeclaration from " +
      "src/golden/observation.js. Until then a staged capture can be ingested, matched and inspected, " +
      "but not promoted. Underlying schema error: " + error.message,
      { cause: error }
    );
  }
}
