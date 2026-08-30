/**
 * Campaign record storage: the injectable I/O seam, and the recovery policy.
 *
 * ## Why the backend is injected
 *
 * The eventual host is undecided — an AVM1 `SharedObject` bucket, a file on
 * disk, or something else — and it must stay a detail rather than a rewrite.
 * A backend is four synchronous, string-valued methods:
 *
 * ```js
 * { read(key) -> string|null, write(key, text) -> void, remove(key) -> void, keys() -> string[] }
 * ```
 *
 * Synchronous and string-valued because the AVM1 SharedObject surface is both,
 * and because the write is driven from the campaign-settlement callback: an
 * async store would make settlement async, which the once-only latch in
 * `src/team/settlement.js` is not built for. A host that needs async buffers
 * behind this interface.
 *
 * ## Why a record can only damage itself
 *
 * Records are **immutable and content-addressed**: the key is
 * `ss2TeamArena:battle:<recordId>` and the record id is a pure function of the
 * battle id and the settlement completion token. So there is no
 * read-modify-write anywhere in the layer, and no mutable aggregate — there is
 * deliberately no index file, because an index is the one structure an
 * interrupted write could corrupt for every record at once. `recordIds()`
 * enumerates the backend instead.
 *
 * An interrupted write can therefore only leave one torn key, belonging to one
 * record, and it can never touch a record that was already good.
 *
 * ## Recovery, in order
 *
 * | On read | Result |
 * | --- | --- |
 * | key absent | `missing` — no campaign data for that battle |
 * | value is not a string, or does not parse | `corrupt` |
 * | schema newer than this build | `unsupported`, and **left untouched** |
 * | digest does not match, or the record fails validation | `corrupt` |
 * | record id disagrees with its key | `corrupt` |
 * | otherwise | `ok`, with a deep-frozen record |
 *
 * `corrupt` entries are quarantined — copied to
 * `ss2TeamArena:quarantine:<recordId>:<n>` and then removed from the live key
 * — so the evidence is preserved rather than discarded, in the same spirit as
 * the divergence reports in `src/golden/promote-1v1-golden.js`. If the copy
 * fails, the original is left where it is; a failed quarantine never deletes.
 *
 * Nothing in any of these paths consults, reads, or repairs anything vanilla.
 * A missing or unreadable campaign record degrades to "no campaign data", full
 * stop.
 */

import {
  CampaignSchemaVersionError,
  CampaignStorageError,
  VanillaBoundaryError
} from "./errors.js";
import { migrateCampaignRecord } from "./migrations.js";
import {
  canonicalJsonStringify,
  deepFreeze,
  isPlainCampaignObject,
  validateCampaignRecord
} from "./record.js";
import {
  CAMPAIGN_NAMESPACE,
  CampaignKeyKind,
  assertCampaignKey,
  assertNoVanillaFieldNames,
  campaignKey,
  parseCampaignKey
} from "./vanilla-boundary.js";

export const ReadStatus = Object.freeze({
  OK: "ok",
  MISSING: "missing",
  CORRUPT: "corrupt",
  /** A newer schema. Not damaged, not ours, not touched. */
  UNSUPPORTED: "unsupported"
});

export const WriteStatus = Object.freeze({
  WRITTEN: "written",
  /** The same settlement is already stored and verifies. Nothing was written. */
  DUPLICATE: "duplicate",
  /** A corrupt copy was quarantined and replaced with a good one. */
  REPAIRED: "repaired"
});

const BACKEND_METHODS = Object.freeze(["read", "write", "remove", "keys"]);

function assertBackend(backend) {
  if (!backend || typeof backend !== "object") {
    throw new CampaignStorageError("A campaign store needs a storage backend.");
  }
  for (const method of BACKEND_METHODS) {
    if (typeof backend[method] !== "function") {
      throw new CampaignStorageError(`A storage backend must implement ${method}().`);
    }
  }
  return backend;
}

/* ------------------------------------------------------------------ */
/* Backends                                                            */
/* ------------------------------------------------------------------ */

/** In-memory backend. The tests run entirely on this; no filesystem needed. */
export function createMemoryBackend(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    read(key) {
      return values.has(key) ? values.get(key) : null;
    },
    write(key, text) {
      values.set(key, text);
    },
    remove(key) {
      values.delete(key);
    },
    keys() {
      return [...values.keys()];
    }
  };
}

/**
 * A backend over one sub-object of a host container — the shape an AVM1
 * SharedObject's `data` presents.
 *
 * This is the coexistence mechanism, and its safety is structural rather than
 * checked: the constructor resolves `container[CAMPAIGN_NAMESPACE]` **once**
 * and the returned backend closes over that bucket alone. It keeps no
 * reference to `container`, so after construction there is no expression in
 * the backend that could reach a sibling key. A vanilla field living next to
 * the bucket is not merely left alone; it is unreachable.
 *
 * @param {object} container the host's save container (e.g. `so_local.data`)
 */
export function createNamespacedBackend(container) {
  if (!container || typeof container !== "object" || Array.isArray(container)) {
    throw new CampaignStorageError("A namespaced backend needs a container object.");
  }
  const existing = container[CAMPAIGN_NAMESPACE];
  if (existing !== undefined && !isPlainCampaignObject(existing)) {
    throw new VanillaBoundaryError(
      `${CAMPAIGN_NAMESPACE} already exists on the container and is not a plain object. ` +
      "Refusing to replace it: this layer never overwrites something it did not write."
    );
  }
  if (existing === undefined) container[CAMPAIGN_NAMESPACE] = {};
  // The only reference retained. `container` is not captured.
  const bucket = container[CAMPAIGN_NAMESPACE];
  return {
    read(key) {
      const value = bucket[key];
      return value === undefined ? null : value;
    },
    write(key, text) {
      bucket[key] = text;
    },
    remove(key) {
      delete bucket[key];
    },
    keys() {
      return Object.keys(bucket);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

function battleKeyFor(recordId) {
  return campaignKey(CampaignKeyKind.BATTLE, recordId);
}

class CampaignStore {
  #backend;
  #quarantine;

  constructor({ backend, quarantine = true } = {}) {
    this.#backend = assertBackend(backend);
    this.#quarantine = quarantine === true;
  }

  /** The single choke point. Every backend call in this class goes through it. */
  #read(key) {
    const value = this.#backend.read(assertCampaignKey(key));
    return value === undefined ? null : value;
  }

  #write(key, text) {
    this.#backend.write(assertCampaignKey(key), text);
    // Read-back verification proves the backend accepted the value. It cannot
    // prove the host flushed it; a torn flush is caught by the digest on the
    // next read, which is why the digest exists.
    if (this.#backend.read(key) !== text) {
      throw new CampaignStorageError(
        `The storage backend did not retain the value written to ${key}; refusing to report a successful write.`
      );
    }
  }

  #remove(key) {
    this.#backend.remove(assertCampaignKey(key));
  }

  #ownedKeys() {
    const keys = this.#backend.keys();
    if (!Array.isArray(keys)) {
      throw new CampaignStorageError("A storage backend's keys() must return an array.");
    }
    return keys.filter((key) => typeof key === "string" && parseCampaignKey(key) !== null);
  }

  /** Record ids present in the backend, sorted for a deterministic listing. */
  recordIds() {
    return this.#ownedKeys()
      .map(parseCampaignKey)
      .filter((parsed) => parsed.kind === CampaignKeyKind.BATTLE && parsed.parts.length === 1)
      .map((parsed) => parsed.parts[0])
      .sort();
  }

  has(recordId) {
    return this.#read(battleKeyFor(recordId)) !== null;
  }

  quarantinedKeys() {
    return this.#ownedKeys()
      .filter((key) => parseCampaignKey(key).kind === CampaignKeyKind.QUARANTINE)
      .sort();
  }

  /** The preserved raw text of a quarantined entry, for diagnostics. */
  readQuarantined(key) {
    const parsed = parseCampaignKey(key);
    if (!parsed || parsed.kind !== CampaignKeyKind.QUARANTINE) {
      throw new VanillaBoundaryError(`${JSON.stringify(key)} is not a quarantine key.`);
    }
    return this.#read(key);
  }

  #quarantineKeyFor(recordId) {
    const taken = new Set(this.quarantinedKeys());
    for (let index = 1; index <= 1000; index += 1) {
      const key = campaignKey(CampaignKeyKind.QUARANTINE, recordId, String(index));
      if (!taken.has(key)) return key;
    }
    throw new CampaignStorageError(`Too many quarantined copies of ${recordId}.`);
  }

  /**
   * Move a bad value out of the live key. Copy first, delete only on success:
   * a failed quarantine leaves the evidence exactly where it was.
   */
  #quarantineValue(recordId, rawValue) {
    const text = typeof rawValue === "string" ? rawValue : JSON.stringify({ nonString: String(rawValue) });
    const key = this.#quarantineKeyFor(recordId);
    this.#write(key, text);
    this.#remove(battleKeyFor(recordId));
    return key;
  }

  /**
   * Read one record.
   *
   * Never throws for a damaged, absent, or future-schema record — that is the
   * degradation the roadmap constraint asks for. It throws only for programmer
   * error: a key outside the namespace, or a broken backend.
   *
   * @returns {{status: string, recordId: string, record: object|null, reason: string|null,
   *            migrated: boolean, quarantinedTo?: string, quarantineFailed?: string,
   *            recordVersion?: number}}
   */
  readRecord(recordId, { quarantine = this.#quarantine } = {}) {
    const key = battleKeyFor(recordId);
    const raw = this.#read(key);
    if (raw === null) return this.#result(recordId, ReadStatus.MISSING, { reason: "no record is stored" });
    if (typeof raw !== "string") {
      return this.#degrade(recordId, raw, "the stored value is not text", quarantine);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return this.#degrade(recordId, raw, `the stored text is not JSON: ${error.message}`, quarantine);
    }

    let migration;
    try {
      migration = migrateCampaignRecord(parsed);
    } catch (error) {
      if (error instanceof CampaignSchemaVersionError) {
        // Deliberately not quarantined and deliberately not removed. A future
        // record is intact; the only wrong move is to touch it.
        return this.#result(recordId, ReadStatus.UNSUPPORTED, {
          reason: error.message,
          recordVersion: error.recordVersion
        });
      }
      return this.#degrade(recordId, raw, error.message, quarantine);
    }

    const record = migration.record;
    if (record.recordId !== recordId) {
      return this.#degrade(
        recordId,
        raw,
        `the record identifies itself as ${record.recordId} but is stored under ${recordId}`,
        quarantine
      );
    }
    return this.#result(recordId, ReadStatus.OK, {
      record: deepFreeze(record),
      migrated: migration.applied.length > 0
    });
  }

  #result(recordId, status, extra = {}) {
    return Object.freeze({
      recordId,
      status,
      record: null,
      reason: null,
      migrated: false,
      ...extra
    });
  }

  #degrade(recordId, raw, reason, quarantine) {
    const extra = { reason };
    if (quarantine) {
      try {
        extra.quarantinedTo = this.#quarantineValue(recordId, raw);
      } catch (error) {
        // Preserving the evidence is best-effort; degrading is not. A failed
        // quarantine must never turn a bad read into a thrown error.
        extra.quarantineFailed = error.message;
      }
    }
    return this.#result(recordId, ReadStatus.CORRUPT, extra);
  }

  /**
   * Read every stored record, partitioned by outcome.
   *
   * The good records are returned even when others are damaged: one torn
   * record must not cost a campaign its whole history.
   */
  readAll(options = {}) {
    const records = [];
    const corrupt = [];
    const unsupported = [];
    for (const recordId of this.recordIds()) {
      const result = this.readRecord(recordId, options);
      if (result.status === ReadStatus.OK) records.push(result.record);
      else if (result.status === ReadStatus.UNSUPPORTED) unsupported.push(result);
      else if (result.status === ReadStatus.CORRUPT) corrupt.push(result);
    }
    return Object.freeze({
      records: Object.freeze(records),
      corrupt: Object.freeze(corrupt),
      unsupported: Object.freeze(unsupported)
    });
  }

  /**
   * Store one sealed record.
   *
   * Idempotent by construction: the key is derived from the settlement, so a
   * second write of the same settled battle finds a verifying record already
   * there and writes nothing.
   */
  write(record) {
    validateCampaignRecord(record);
    // Redundant with the screen inside `validateCampaignRecord`, and kept
    // anyway: the write path is the thing being audited, and one grep for
    // `assertNoVanillaFieldNames` should land on it.
    assertNoVanillaFieldNames(record, "record");
    const recordId = record.recordId;
    const key = battleKeyFor(recordId);
    const text = canonicalJsonStringify(record, "record");

    const existing = this.readRecord(recordId, { quarantine: false });
    if (existing.status === ReadStatus.OK) {
      return Object.freeze({ status: WriteStatus.DUPLICATE, written: false, recordId, key });
    }
    if (existing.status === ReadStatus.UNSUPPORTED) {
      throw new CampaignSchemaVersionError(
        `${key} already holds a record from schema ${existing.recordVersion}. Refusing to overwrite a ` +
        "record written by a newer build of this layer.",
        { recordVersion: existing.recordVersion ?? null }
      );
    }
    let quarantinedTo = null;
    if (existing.status === ReadStatus.CORRUPT) {
      // Replacing a corrupt copy of the same record with a verified one is a
      // repair, and the corrupt bytes are kept.
      const raw = this.#read(key);
      if (raw !== null) quarantinedTo = this.#quarantineValue(recordId, raw);
    }
    this.#write(key, text);
    return Object.freeze({
      status: quarantinedTo ? WriteStatus.REPAIRED : WriteStatus.WRITTEN,
      written: true,
      recordId,
      key,
      quarantinedTo
    });
  }
}

export function createCampaignStore(options) {
  return new CampaignStore(options);
}

export { CampaignStore };
