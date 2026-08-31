/**
 * The campaign-persistence error hierarchy.
 *
 * One base class so a host can wrap the whole layer in a single `catch` and
 * degrade to "no campaign data", and narrow subclasses so the three failures
 * that mean genuinely different things can be told apart:
 *
 * - `VanillaBoundaryError` — this layer was asked to write outside its own
 *   namespace, or to write a record carrying a vanilla save field name. It is
 *   never recoverable and never degraded: the whole point of the boundary is
 *   that the write does not happen.
 * - `CampaignSchemaVersionError` — the record comes from a future version of
 *   this layer. It is not damaged, it is simply not ours to read. It must be
 *   left exactly where it is.
 * - `CampaignRecordIntegrityError` — the bytes disagree with the digest, or
 *   the record is structurally malformed. This is the corruption case, and it
 *   is the only one the reader degrades over.
 */

export class CampaignError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The record schema refused something. Refusal, never coercion. */
export class CampaignRecordError extends CampaignError {}

/** The bytes and the digest disagree, or the parse failed. */
export class CampaignRecordIntegrityError extends CampaignRecordError {}

/**
 * A record written by a newer schema than this build knows.
 *
 * Carries both versions so a host can report the mismatch precisely, and so
 * the store can be sure it is looking at a future record rather than a broken
 * one before it decides not to touch it.
 */
export class CampaignSchemaVersionError extends CampaignRecordError {
  constructor(message, { recordVersion = null, supportedVersion = null, ...options } = {}) {
    super(message, options);
    this.recordVersion = recordVersion;
    this.supportedVersion = supportedVersion;
  }
}

/** A migration step exists but could not be applied to this record. */
export class CampaignMigrationError extends CampaignRecordError {}

/** The storage backend misbehaved: a bad shape, or a write that did not stick. */
export class CampaignStorageError extends CampaignError {}

/**
 * The layer was asked to address or write something outside its namespace.
 *
 * This error is a bug report, not a runtime condition. If it is ever thrown in
 * production the correct response is to fix the caller, not to catch it.
 */
export class VanillaBoundaryError extends CampaignError {}
