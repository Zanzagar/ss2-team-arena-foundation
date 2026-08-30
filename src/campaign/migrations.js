/**
 * Schema versioning and migration for campaign team-battle records.
 *
 * The roadmap asks for "a separate team-battle record **and migration
 * version**". This module is that half. Three rules govern it:
 *
 * 1. **Forward only, and never silently.** A record from a schema this build
 *    does not know is refused with `CampaignSchemaVersionError`, which carries
 *    both versions. It is not truncated to the fields we recognise, not
 *    partially read, and — importantly — not rewritten or quarantined. A
 *    future record is not damaged; it is simply not ours.
 * 2. **Integrity before migration.** A legacy record's digest is verified
 *    before a single field is touched, and the pre-migration digest is carried
 *    into `provenance.migration.sourceDigest` so the chain of custody survives
 *    the re-digest that migration necessarily forces.
 * 3. **A migration may not invent evidence.** The 1 -> 2 step exists precisely
 *    to demonstrate this: schema 1 did not record which rule set produced a
 *    battle, so the migrated record says `unknown`. It does not guess
 *    "placeholder" — even though every rule set in the repository today is one
 *    — because a guess in a provenance field is worse than a gap.
 *
 * ## Version history
 *
 * | Version | Shape |
 * | --- | --- |
 * | 1 | the current record without `provenance.ruleSet`. |
 * | 2 | current. `provenance.ruleSet` is mandatory and its runtime-verified claim is gated exactly as `src/team/rule-set.js` gates it. |
 *
 * Version 1 was never written by a released version of this project: the
 * persistence layer landed at version 2. It is defined and supported anyway,
 * because a migration path that has never been exercised is not a migration
 * path, and because the 1 -> 2 step is the cheapest place to pin the
 * refuse-to-invent rule that every later migration will have to follow.
 */

import {
  CampaignMigrationError,
  CampaignRecordError,
  CampaignRecordIntegrityError,
  CampaignSchemaVersionError
} from "./errors.js";
import {
  CAMPAIGN_RECORD_KIND,
  CAMPAIGN_RECORD_SCHEMA_VERSION,
  RECORD_TOP_LEVEL_KEYS,
  RecordedRuleSetVerification,
  computeCampaignRecordDigest,
  isPlainCampaignObject,
  sealCampaignRecord,
  validateCampaignRecord
} from "./record.js";

/** The oldest schema this build can still read. */
export const MINIMUM_SUPPORTED_SCHEMA_VERSION = 1;

/**
 * What a migrated-from-v1 record says about the maths behind it.
 *
 * `unknown` is not "placeholder". It means the record never recorded the
 * answer and the answer cannot be recovered, so nothing downstream may treat
 * the battle as measured behaviour — `runtimeVerified` is false and there is
 * no build hash and no golden to point at.
 */
export const UNKNOWN_RULE_SET_PROVENANCE = Object.freeze({
  id: null,
  contractVersion: null,
  verification: RecordedRuleSetVerification.UNKNOWN,
  runtimeVerified: false,
  goldenFixtureIds: Object.freeze([]),
  buildSha256: null,
  note:
    "Migrated from schema 1, which did not record rule-set provenance. " +
    "The maths that produced this record cannot be identified and must not be presented as measured."
});

const V1_PROVENANCE_KEYS = Object.freeze(["battle", "migration", "writer"]);

function assertExactKeys(value, expectedKeys, path) {
  if (!isPlainCampaignObject(value)) throw new CampaignMigrationError(`${path} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CampaignMigrationError(
      `${path} does not have the schema-1 shape (expected exactly: ${expected.join(", ")}).`
    );
  }
}

/**
 * The schema-1 envelope check. Deliberately shallow: everything a schema-1 and
 * a schema-2 record share is validated by `validateCampaignRecord` once the
 * migration has run, so this checks only what makes a record *version 1* and
 * what has to hold before the record may be touched at all.
 */
function assertSchema1Envelope(record) {
  assertExactKeys(record, RECORD_TOP_LEVEL_KEYS, "record");
  if (record.kind !== CAMPAIGN_RECORD_KIND) {
    throw new CampaignMigrationError(`kind must be ${CAMPAIGN_RECORD_KIND}.`);
  }
  assertExactKeys(record.provenance, V1_PROVENANCE_KEYS, "provenance");
  if (record.provenance.migration !== null) {
    throw new CampaignMigrationError("A schema-1 record cannot already carry a migration block.");
  }
  if (typeof record.digest !== "string" || !/^[a-f0-9]{64}$/.test(record.digest)) {
    throw new CampaignRecordIntegrityError("digest must be a lowercase SHA-256 hex digest.");
  }
  if (record.digest !== computeCampaignRecordDigest(record)) {
    throw new CampaignRecordIntegrityError("digest does not match the record contents; refusing to migrate it.");
  }
  return record;
}

/**
 * Schema 1 -> 2: add the mandatory rule-set provenance block, filled with the
 * only honest value available.
 */
function migrateV1ToV2(record) {
  assertSchema1Envelope(record);
  return {
    ...record,
    schemaVersion: 2,
    provenance: {
      battle: record.provenance.battle,
      writer: record.provenance.writer,
      migration: null,
      ruleSet: { ...UNKNOWN_RULE_SET_PROVENANCE, goldenFixtureIds: [] }
    }
  };
}

/**
 * The migration chain, in order. Contiguous by construction: a test asserts
 * that the steps run from `MINIMUM_SUPPORTED_SCHEMA_VERSION` to
 * `CAMPAIGN_RECORD_SCHEMA_VERSION` with no gap.
 */
export const CAMPAIGN_MIGRATIONS = Object.freeze([
  Object.freeze({
    from: 1,
    to: 2,
    describe: "add provenance.ruleSet; an unrecorded rule set becomes unknown, never a guess",
    apply: migrateV1ToV2
  })
]);

const MIGRATIONS_BY_FROM = new Map(CAMPAIGN_MIGRATIONS.map((step) => [step.from, step]));

export function schemaVersionOf(raw) {
  if (!isPlainCampaignObject(raw)) {
    throw new CampaignRecordError("A campaign record must be a plain object.");
  }
  const version = raw.schemaVersion;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new CampaignRecordError("schemaVersion must be a positive integer.");
  }
  return version;
}

/**
 * Migrate a record of any supported schema to the current one.
 *
 * @returns {{ record: object, applied: string[], sourceSchemaVersion: number }}
 *   `applied` is empty when the record was already current.
 * @throws {CampaignSchemaVersionError} for a schema newer than this build.
 * @throws {CampaignRecordIntegrityError} when a legacy record's digest fails.
 * @throws {CampaignMigrationError} when a step exists but cannot be applied.
 */
export function migrateCampaignRecord(raw, { migratedAt = new Date().toISOString() } = {}) {
  const sourceSchemaVersion = schemaVersionOf(raw);
  if (sourceSchemaVersion > CAMPAIGN_RECORD_SCHEMA_VERSION) {
    throw new CampaignSchemaVersionError(
      `This build reads campaign records up to schema ${CAMPAIGN_RECORD_SCHEMA_VERSION}, but the record ` +
      `declares schema ${sourceSchemaVersion}. Refusing to read it: a newer record is not damaged, and ` +
      "partially reading, rewriting, or discarding it would be.",
      { recordVersion: sourceSchemaVersion, supportedVersion: CAMPAIGN_RECORD_SCHEMA_VERSION }
    );
  }
  if (sourceSchemaVersion < MINIMUM_SUPPORTED_SCHEMA_VERSION) {
    throw new CampaignMigrationError(
      `Schema ${sourceSchemaVersion} predates the oldest readable schema ` +
      `(${MINIMUM_SUPPORTED_SCHEMA_VERSION}).`
    );
  }
  if (sourceSchemaVersion === CAMPAIGN_RECORD_SCHEMA_VERSION) {
    validateCampaignRecord(raw);
    return { record: raw, applied: [], sourceSchemaVersion };
  }

  const sourceDigest = raw.digest;
  const applied = [];
  let working = raw;
  let version = sourceSchemaVersion;
  while (version < CAMPAIGN_RECORD_SCHEMA_VERSION) {
    const step = MIGRATIONS_BY_FROM.get(version);
    if (!step) {
      throw new CampaignMigrationError(`No migration is registered from campaign schema ${version}.`);
    }
    working = step.apply(working);
    if (working?.schemaVersion !== step.to) {
      throw new CampaignMigrationError(
        `The ${step.from}->${step.to} migration did not produce a schema-${step.to} record.`
      );
    }
    applied.push(`${step.from}->${step.to}`);
    version = step.to;
  }

  const draft = { ...working };
  // The digest necessarily changes, so the pre-migration digest is preserved
  // rather than lost: it is the only remaining evidence of what was on disk.
  delete draft.digest;
  draft.provenance = {
    ...draft.provenance,
    migration: {
      sourceSchemaVersion,
      sourceDigest,
      migratedAt,
      steps: applied
    }
  };
  let record;
  try {
    record = sealCampaignRecord(draft);
  } catch (error) {
    throw new CampaignMigrationError(
      `Migrating schema ${sourceSchemaVersion} to ${CAMPAIGN_RECORD_SCHEMA_VERSION} produced an ` +
      `invalid record: ${error.message}`,
      { cause: error }
    );
  }
  return { record, applied, sourceSchemaVersion };
}

/** Human-readable summary of the chain, for the docs and for diagnostics. */
export function describeCampaignMigrations() {
  return Object.freeze({
    current: CAMPAIGN_RECORD_SCHEMA_VERSION,
    minimumSupported: MINIMUM_SUPPORTED_SCHEMA_VERSION,
    steps: Object.freeze(
      CAMPAIGN_MIGRATIONS.map((step) => Object.freeze({ from: step.from, to: step.to, describe: step.describe }))
    )
  });
}
