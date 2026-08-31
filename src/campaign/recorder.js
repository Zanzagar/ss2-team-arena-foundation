/**
 * Wiring a campaign store onto a battle's once-only settlement.
 *
 * `createTeamBattle({ onCampaignSettled })` calls its callback exactly once —
 * `src/team/settlement.js` latches before invoking it, so even a throwing
 * callback cannot leave the settlement re-fireable. This module supplies that
 * callback, and adds a second, independent guarantee on top of it: the record
 * id is a pure function of the battle id and the settlement completion token,
 * so the store finds any existing copy and writes nothing. One battle yields
 * exactly one record whether the hook fires once, the caller also records
 * manually, or a host replays the same settlement after a restart.
 *
 * ## Why the hook does not throw
 *
 * By the time the hook runs, the battle is over and the campaign has already
 * been told. A storage failure at that point is a save problem, not a battle
 * problem, and letting it propagate would turn "the disk is full" into "the
 * arena crashed". So the hook collects failures on the recorder instead, and
 * the caller inspects `errors` (or passes `throwOnFailure: true` when it would
 * rather hear about it immediately).
 *
 * That leniency is scoped to the two failures it is an answer to —
 * `CampaignStorageError` and `CampaignRecordError` — and to nothing else. A
 * `VanillaBoundaryError` is a bug report, not a save problem, and propagates.
 */

import { CampaignError, CampaignRecordError, CampaignStorageError } from "./errors.js";
import { buildCampaignRecord } from "./from-battle.js";

/**
 * The two failures the hook is allowed to swallow.
 *
 * Both mean "this battle could not be saved": the backend refused, or the
 * record did not validate. Neither is a reason to crash an arena that has
 * already finished. Everything else — a `VanillaBoundaryError` above all,
 * which `errors.js` defines as a bug report rather than a runtime condition
 * and says must never be caught — propagates.
 */
const COLLECTED_FAILURES = Object.freeze([CampaignStorageError, CampaignRecordError]);

function isCollectable(error) {
  return COLLECTED_FAILURES.some((type) => error instanceof type);
}

/**
 * Build and store the record for a settled battle. Idempotent.
 *
 * @returns {{ result: object, record: object }} `result` is the store's write
 *   result, whose `status` distinguishes a fresh write from a duplicate.
 */
export function recordSettledBattle(store, battle, options = {}) {
  if (!store || typeof store.write !== "function") {
    throw new CampaignError("recordSettledBattle needs a campaign store.");
  }
  const record = buildCampaignRecord(battle, options);
  return { result: store.write(record), record };
}

class CampaignRecorder {
  #store;
  #battleId;
  #writer;
  #recordedAt;
  #throwOnFailure;
  #battle = null;
  #results = [];
  #errors = [];

  constructor({ store, battleId, writer, recordedAt, throwOnFailure = false } = {}) {
    if (!store || typeof store.write !== "function") {
      throw new CampaignError("A campaign recorder needs a campaign store.");
    }
    if (typeof battleId !== "string" || battleId.length === 0) {
      throw new CampaignError("A campaign recorder needs a battleId.");
    }
    this.#store = store;
    this.#battleId = battleId;
    this.#writer = writer;
    this.#recordedAt = recordedAt;
    this.#throwOnFailure = throwOnFailure === true;
    // Bound once so it can be handed straight to `createTeamBattle`, whose
    // blueprint is read before the battle object exists.
    this.hook = () => this.#settle();
  }

  /**
   * Bind the battle whose settlement this recorder writes.
   *
   * Two-step rather than one because `onCampaignSettled` has to be supplied in
   * the blueprint, before `createTeamBattle` has returned anything to attach.
   */
  attach(battle) {
    if (this.#battle && this.#battle !== battle) {
      throw new CampaignError("This recorder is already attached to a different battle.");
    }
    this.#battle = battle;
    return this;
  }

  get battleId() {
    return this.#battleId;
  }

  get results() {
    return [...this.#results];
  }

  get errors() {
    return [...this.#errors];
  }

  get lastResult() {
    return this.#results.at(-1) ?? null;
  }

  /** Ids of every record this recorder has successfully stored or matched. */
  get recordIds() {
    return this.#results.map((entry) => entry.recordId);
  }

  #options() {
    const options = { battleId: this.#battleId };
    if (this.#writer !== undefined) options.writer = this.#writer;
    if (this.#recordedAt !== undefined) options.recordedAt = this.#recordedAt;
    return options;
  }

  /** Explicit path. Throws; use it when the caller wants to handle failure. */
  record(battle = this.#battle) {
    if (!battle) throw new CampaignError("No battle is attached to this recorder.");
    const { result, record } = recordSettledBattle(this.#store, battle, this.#options());
    this.#results.push(result);
    return { result, record };
  }

  #settle() {
    try {
      this.record();
    } catch (error) {
      // Narrow on purpose. The blanket catch that used to be here also
      // swallowed `VanillaBoundaryError`, which `errors.js` says is "never
      // recoverable and never degraded" — a boundary violation would have been
      // filed on `errors` as though it were a full disk and the run would have
      // continued.
      if (!isCollectable(error)) throw error;
      this.#errors.push(error);
      if (this.#throwOnFailure) throw error;
    }
  }
}

export function createCampaignRecorder(options) {
  return new CampaignRecorder(options);
}

export { CampaignRecorder };
