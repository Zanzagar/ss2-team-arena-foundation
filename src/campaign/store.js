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
 * { read(key) -> string|null, write(key, text) -> void, remove(key) -> void, keys() -> string[],
 *   flush?() -> boolean }
 * ```
 *
 * Synchronous and string-valued because the AVM1 SharedObject surface is both,
 * and because the write is driven from the campaign-settlement callback: an
 * async store would make settlement async, which the once-only latch in
 * `src/team/settlement.js` is not built for. A host that needs async buffers
 * behind this interface.
 *
 * `flush()` is the one optional method: declare it and the store asks the host
 * to commit each write and refuses the write when the host says no; omit it
 * and nothing changes. See `OPTIONAL_BACKEND_METHODS` for why it is optional
 * rather than required.
 *
 * ## Two limits, because the host's storage is not this layer's
 *
 * The store occupies at most `byteBudget` bytes (keys included, default 64 KB)
 * and refuses the write that would cross it. A campaign history is unbounded
 * by nature — one record per settled battle, forever — and the eventual host
 * is a Flash local store with a 100 KB default quota that the vanilla save
 * already lives in. Silently filling that quota is how a flush starts failing,
 * and `refresh_gladiators` has a reset branch that blanks every character slot
 * when its read comes back wrong.
 *
 * The other limit is the container itself: `createNamespacedBackend()` refuses
 * a container that carries vanilla field names as its own keys.
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
 * | the key is not present in the backend | `missing` — no campaign data for that battle |
 * | the key is present but holds `null` | `corrupt` — a torn write, not an absence |
 * | value is not a string, or does not parse | `corrupt` |
 * | schema newer than this build | `unsupported`, and **left untouched** |
 * | digest does not match, or the record fails validation | `corrupt` |
 * | record id disagrees with its key | `corrupt` |
 * | otherwise | `ok`, with a deep-frozen record |
 *
 * `corrupt` entries are quarantined — copied to
 * `ss2TeamArena:quarantine:<recordId>:<n>` and then removed from the live key
 * — so the evidence is preserved rather than discarded, in the same spirit as
 * the divergence reports in `src/golden/promote-1v1-golden.js`. A text value is
 * preserved verbatim; a non-text value is preserved as a JSON envelope naming
 * its type and carrying its contents. If the copy fails, or the delete after it
 * fails, the store is left as it was found; a failed quarantine never deletes,
 * and an identical copy already in quarantine is never duplicated.
 *
 * The vanilla field-name screen deliberately does **not** run on this path.
 * See the note in `record.js`'s `validateCampaignRecord`: it once did, and a
 * single additive line in the adapter's catalogue would have quarantined and
 * then deleted every stored record in one read.
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
  parseCampaignKey,
  vanillaFieldNamesOn
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

/**
 * `flush` is optional, not required, and that is a decision rather than an
 * omission.
 *
 * Requiring it would break every backend that has no such concept — a `Map`, a
 * plain object, an in-process buffer — and would push each of them into
 * stubbing a method whose `true` would be a lie. What the layer actually
 * needed was not a mandatory method but an *answer*: a host whose medium can
 * refuse a commit (an AVM1 `SharedObject`, whose `flush()` returns `false` or
 * `"pending"` when the 100 KB local-storage quota is exceeded) must be able to
 * tell this layer so, and this layer must stop reporting `status: "written"`
 * when it happens. So: declare `flush()` and the store calls it, checks its
 * answer, rolls its own key back when the commit was refused, and refuses the
 * write. Do not declare it and nothing changes.
 */
const OPTIONAL_BACKEND_METHODS = Object.freeze(["flush"]);

/**
 * How many bytes of the host's storage this layer will occupy, keys included.
 *
 * Flash's default local-storage quota is 100 KB per origin and the vanilla
 * `ss2_data` store already lives inside it (679 bytes as measured in
 * `HANDOFF.md`). One 2v2 record is about 2.5 KB of canonical JSON, so an
 * uncapped campaign history reaches that quota in roughly forty battles — and
 * a quota-refused flush is a plausible route into `refresh_gladiators`' reset
 * branch, which blanks every character slot. 64 KB leaves a third of the
 * default quota to the game and turns "the save silently stops committing"
 * into a refused write this layer can report.
 */
export const DEFAULT_CAMPAIGN_BYTE_BUDGET = 64 * 1024;

function assertBackend(backend) {
  if (!backend || typeof backend !== "object") {
    throw new CampaignStorageError("A campaign store needs a storage backend.");
  }
  for (const method of BACKEND_METHODS) {
    if (typeof backend[method] !== "function") {
      throw new CampaignStorageError(`A storage backend must implement ${method}().`);
    }
  }
  for (const method of OPTIONAL_BACKEND_METHODS) {
    if (backend[method] !== undefined && typeof backend[method] !== "function") {
      throw new CampaignStorageError(`A storage backend's optional ${method} must be a function.`);
    }
  }
  return backend;
}

/** UTF-8 byte length, the unit every real storage quota is denominated in. */
function byteLengthOf(text) {
  return Buffer.byteLength(String(text), "utf8");
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
 * A backend over one sub-object of a host container.
 *
 * **Give this its own container.** The intended host is a SharedObject this
 * project owns — `SharedObject.getLocal("ss2TeamArena")`'s `data`, or any
 * other object the game does not write — and *not* the vanilla save's
 * `so_local.data`. This JSDoc used to name `so_local.data` as its example, and
 * that example was the whole hazard: campaign records inside `ss2_data` share
 * the vanilla store's flush and its quota, `refresh_gladiators` flushes
 * `ss2_data` unconditionally, and that function has a reset branch that blanks
 * every character slot when the gladiator count reads back wrong. A campaign
 * history growing inside that store is a route to the branch.
 *
 * The coexistence *within* the container is structural: the constructor
 * resolves `container[CAMPAIGN_NAMESPACE]` **once** and the returned backend
 * closes over that bucket alone. It keeps no reference to `container`, so
 * after construction there is no expression in the backend that could reach a
 * sibling key. A field living next to the bucket is not merely left alone; it
 * is unreachable.
 *
 * The refusal below makes the *choice* of container structural too. A
 * container carrying vanilla field names as its own keys is the vanilla save,
 * and this backend refuses it outright rather than documenting a preference —
 * "records alongside, never inside" was advice, and advice does not survive a
 * caller in a hurry.
 *
 * @param {object} container a container this project owns; not the vanilla save
 * @param {{allowVanillaSiblings?: boolean}} [options] explicit opt-in for a
 *   host that has decided, knowingly, to share the vanilla container
 */
export function createNamespacedBackend(container, { allowVanillaSiblings = false } = {}) {
  if (!container || typeof container !== "object" || Array.isArray(container)) {
    throw new CampaignStorageError("A namespaced backend needs a container object.");
  }
  if (!allowVanillaSiblings) {
    const vanilla = vanillaFieldNamesOn(container);
    if (vanilla.length > 0) {
      throw new VanillaBoundaryError(
        `The container carries ${vanilla.length} vanilla save field name(s) as its own keys ` +
        `(${vanilla.slice(0, 5).join(", ")}${vanilla.length > 5 ? ", …" : ""}), so it is the vanilla save. ` +
        "This layer records alongside that save, in a container of its own, and refuses to grow inside it: " +
        "the vanilla store is flushed unconditionally by refresh_gladiators, shares one storage quota, and " +
        "has a reset branch that blanks every character slot. Pass { allowVanillaSiblings: true } only if " +
        "you have decided to accept that."
      );
    }
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

/**
 * Preserve a non-string stored value as text, keeping its contents.
 *
 * The previous form was `JSON.stringify({ nonString: String(rawValue) })`,
 * which turned every object into the literal `[object Object]` and then
 * deleted the original — the quarantine destroyed exactly the evidence it
 * exists to preserve. A structured envelope keeps the value itself wherever
 * JSON can hold it, and falls back through `String()` only when it cannot.
 */
function envelopeForNonString(rawValue) {
  const type = rawValue === null ? "null" : Array.isArray(rawValue) ? "array" : typeof rawValue;
  const envelope = { nonString: true, type, value: null, text: null };
  try {
    const json = JSON.stringify(rawValue);
    if (typeof json === "string") envelope.value = JSON.parse(json);
  } catch {
    // Circular, or a toJSON that throws. The text fallback below still runs.
  }
  try {
    envelope.text = String(rawValue);
  } catch {
    envelope.text = null;
  }
  return JSON.stringify(envelope);
}

class CampaignStore {
  #backend;
  #quarantine;
  #byteBudget;

  constructor({ backend, quarantine = true, byteBudget = DEFAULT_CAMPAIGN_BYTE_BUDGET } = {}) {
    this.#backend = assertBackend(backend);
    this.#quarantine = quarantine === true;
    if (byteBudget !== null && (!Number.isSafeInteger(byteBudget) || byteBudget < 1)) {
      throw new CampaignStorageError("byteBudget must be a positive integer, or null to disable the cap.");
    }
    this.#byteBudget = byteBudget;
  }

  /** The single choke point. Every backend call in this class goes through it. */
  #read(key) {
    const value = this.#backend.read(assertCampaignKey(key));
    return value === undefined ? null : value;
  }

  /**
   * Whether the backend holds this key at all, independent of its value.
   *
   * The seam's `read()` contract is `string|null`, so a `null` *value* and an
   * absent key are indistinguishable through `read()` alone. They mean very
   * different things: absent is "no campaign data", while a stored null is a
   * torn write, and reporting it as absent both contradicted the documented
   * recovery table (a value that is not a string is corrupt) and let the next
   * write clobber the evidence. `keys()` is the only way to tell, so it is
   * consulted — but only on the path where `read()` came back null, so an
   * ordinary hit still costs one `read()`.
   */
  #isStored(key) {
    const keys = this.#backend.keys();
    if (!Array.isArray(keys)) {
      throw new CampaignStorageError("A storage backend's keys() must return an array.");
    }
    return keys.includes(key);
  }

  /** Bytes this layer currently occupies in the backend: its own keys and values. */
  #ownedBytes(exceptKey = null) {
    let total = 0;
    for (const key of this.#ownedKeys()) {
      if (key === exceptKey) continue;
      total += byteLengthOf(key);
      const value = this.#backend.read(key);
      if (typeof value === "string") total += byteLengthOf(value);
    }
    return total;
  }

  #assertWithinBudget(key, text) {
    if (this.#byteBudget === null) return;
    // The key being written is excluded from the running total, because an
    // overwrite replaces it rather than adding to it.
    const projected = this.#ownedBytes(key) + byteLengthOf(key) + byteLengthOf(text);
    if (projected > this.#byteBudget) {
      throw new CampaignStorageError(
        `Writing ${key} would put this layer at ${projected} bytes, past its ${this.#byteBudget}-byte budget. ` +
        "Refusing the write: an uncapped campaign history shares the host's storage quota with the vanilla " +
        "save, and exhausting that quota is how a flush starts failing silently. Prune the history, or " +
        "raise byteBudget deliberately."
      );
    }
  }

  #write(key, text) {
    assertCampaignKey(key);
    this.#assertWithinBudget(key, text);
    this.#backend.write(key, text);
    // Read-back verification proves the backend accepted the value. It cannot
    // prove the host flushed it — `#flush()` is what asks that question, when
    // the backend can answer it — and a torn flush is caught by the digest on
    // the next read, which is why the digest exists.
    if (this.#backend.read(key) !== text) {
      throw new CampaignStorageError(
        `The storage backend did not retain the value written to ${key}; refusing to report a successful write.`
      );
    }
  }

  #remove(key) {
    this.#backend.remove(assertCampaignKey(key));
  }

  /**
   * Ask the host to commit, when the host can be asked.
   *
   * Returns `true` (committed), `false` (refused) or `null` (the backend does
   * not declare `flush`, so the question cannot be asked here). AVM1's
   * `SharedObject.flush()` returns `false` or `"pending"` rather than throwing
   * when the quota is exceeded, so a non-`true` answer is treated as a refusal
   * and a thrown one likewise.
   */
  #flush() {
    if (typeof this.#backend.flush !== "function") return null;
    try {
      return this.#backend.flush() === true;
    } catch {
      return false;
    }
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

  /**
   * Whether anything at all is stored under this record id.
   *
   * Presence, not readability: a torn or corrupt entry answers `true`, because
   * the question "is this key taken" is the one a caller deciding whether to
   * write needs answered, and a stored `null` is taken.
   */
  has(recordId) {
    const key = battleKeyFor(recordId);
    return this.#read(key) !== null || this.#isStored(key);
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

  /** An existing quarantine copy of this record holding exactly this text, if any. */
  #existingQuarantineOf(recordId, text) {
    for (const key of this.quarantinedKeys()) {
      if (parseCampaignKey(key).parts[0] !== recordId) continue;
      if (this.#read(key) === text) return key;
    }
    return null;
  }

  /**
   * Move a bad value out of the live key. Copy first, delete only on success:
   * a failed quarantine leaves the evidence exactly where it was.
   *
   * Two things guard the copy against multiplying. First, an identical copy
   * already in quarantine is reused rather than added to — otherwise a medium
   * that accepts writes but refuses removes grew one more copy of the same
   * bytes on *every* read of the same damaged record, to the thousand-copy cap
   * and then to a permanent refusal. Second, if the delete fails after the
   * copy landed, the copy is rolled back, so the failed quarantine really does
   * leave the store as it found it.
   */
  #quarantineValue(recordId, rawValue) {
    const text = typeof rawValue === "string" ? rawValue : envelopeForNonString(rawValue);
    const already = this.#existingQuarantineOf(recordId, text);
    if (already !== null) {
      // The copy exists; only the delete is outstanding, and it is the caller's
      // failure to report if it fails again.
      this.#remove(battleKeyFor(recordId));
      return already;
    }
    const key = this.#quarantineKeyFor(recordId);
    this.#write(key, text);
    try {
      this.#remove(battleKeyFor(recordId));
    } catch (error) {
      try {
        this.#remove(key);
      } catch {
        // The medium refuses removes outright. Nothing further can be undone;
        // the duplicate-copy check above keeps this from repeating.
      }
      throw error;
    }
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
    if (raw === null) {
      // `read()` cannot tell an absent key from one holding a null, and the two
      // are not the same answer: absent is "no campaign data", a stored null is
      // a torn write and belongs in the corrupt column with everything else
      // that is not text.
      if (!this.#isStored(key)) {
        return this.#result(recordId, ReadStatus.MISSING, { reason: "no record is stored" });
      }
      return this.#degrade(recordId, null, "the stored value is null, not text", quarantine);
    }
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
    // The screen runs first, and it runs here rather than inside
    // `validateCampaignRecord`, because this is a *write*: the write path is
    // the direction the boundary guards, and a record reaching for a vanilla
    // field name should say so rather than report a stray key. Reading is the
    // other direction and is deliberately screen-free — see `record.js`.
    if (isPlainCampaignObject(record)) assertNoVanillaFieldNames(record, "record");
    validateCampaignRecord(record);
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
    let quarantineFailed = null;
    let repairing = false;
    if (existing.status === ReadStatus.CORRUPT) {
      // Replacing a corrupt copy of the same record with a verified one is a
      // repair, and the corrupt bytes are kept if they can be.
      repairing = true;
      const raw = this.#read(key);
      const stored = raw !== null || this.#isStored(key);
      if (stored) {
        try {
          quarantinedTo = this.#quarantineValue(recordId, raw);
        } catch (error) {
          // Symmetry with the read path, and the fix for a real trap: this used
          // to propagate, so on a medium that refuses removes every write of a
          // damaged record threw — permanently, once the copy cap was reached.
          // Preserving the evidence is best-effort; storing a verified record
          // over a copy of itself that no longer verifies is not.
          quarantineFailed = error.message;
        }
      }
    }
    this.#write(key, text);
    const flushed = this.#flush();
    if (flushed === false) {
      // The host refused the commit — on an AVM1 SharedObject that means the
      // storage quota. Roll our own key back rather than leaving it to be
      // committed by somebody else's flush of the same store, and refuse the
      // write instead of reporting one that did not land.
      try {
        this.#remove(key);
      } catch {
        // Nothing further to undo; the refusal below is still the honest answer.
      }
      throw new CampaignStorageError(
        `The storage backend refused to commit ${key}. The record was rolled back rather than reported ` +
        "as written: a refused flush usually means the host's storage quota is exhausted."
      );
    }
    return Object.freeze({
      status: repairing ? WriteStatus.REPAIRED : WriteStatus.WRITTEN,
      written: true,
      recordId,
      key,
      quarantinedTo,
      quarantineFailed,
      flushed
    });
  }
}

export function createCampaignStore(options) {
  return new CampaignStore(options);
}

export { CampaignStore };
