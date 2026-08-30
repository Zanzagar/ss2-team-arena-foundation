/**
 * Once-only campaign settlement.
 *
 * Two independent gates must both pass before the campaign is told anything:
 *
 *   1. an entire team is eliminated (the resolver arms the settlement), and
 *   2. the presentation layer returns a matching
 *      `battle-result-animation-complete` acknowledgement.
 *
 * The settlement then fires exactly once. A repeated, delayed, or duplicated
 * acknowledgement is answered with `false` and never re-enters the callback.
 * The latch is a private field with no public setter and no reset, so the only
 * way to settle twice is to build a second `CampaignSettlement`.
 */

export const BATTLE_RESULT_PENDING_TYPE = "battle-result-pending";
export const BATTLE_RESULT_ACK_TYPE = "battle-result-animation-complete";
export const PENDING_STATUS = "pending-animation";

export class SettlementError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Deterministic completion token. It is a pure function of the outcome, so a
 * replayed battle produces the same token and a host and client can compare
 * acknowledgements without extra state.
 */
export function completionTokenFor({ winnerTeamId, loserTeamIds, reason }) {
  const losers = [...loserTeamIds].sort();
  return `team-arena:${winnerTeamId ?? "none"}:${losers.join("+") || "none"}:${reason}`;
}

function normaliseOutcome(outcome) {
  if (!outcome || typeof outcome !== "object") {
    throw new SettlementError("A settlement outcome must be an object.");
  }
  const { winnerTeamId = null, loserTeamIds, reason } = outcome;
  if (!Array.isArray(loserTeamIds) || loserTeamIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new SettlementError("A settlement outcome needs loserTeamIds as non-empty strings.");
  }
  if (typeof reason !== "string" || reason.length === 0) {
    throw new SettlementError("A settlement outcome needs a reason.");
  }
  if (winnerTeamId !== null && (typeof winnerTeamId !== "string" || winnerTeamId.length === 0)) {
    throw new SettlementError("A settlement winnerTeamId must be null or a non-empty string.");
  }
  const record = {
    winnerTeamId,
    loserTeamIds: [...loserTeamIds].sort(),
    reason,
    completionToken: completionTokenFor({ winnerTeamId, loserTeamIds, reason })
  };
  return Object.freeze(record);
}

export class CampaignSettlement {
  #pending = null;
  #settled = null;
  #latched = false;
  #onSettle;

  constructor(onSettle = null) {
    if (onSettle !== null && typeof onSettle !== "function") {
      throw new SettlementError("A settlement callback must be a function.");
    }
    this.#onSettle = onSettle;
  }

  /** Gate 1. Called by the resolver the moment a whole team is eliminated. */
  arm(outcome) {
    const record = normaliseOutcome(outcome);
    if (this.#latched) {
      throw new SettlementError("The campaign has already settled; it cannot be re-armed.");
    }
    if (this.#pending) {
      if (this.#pending.completionToken !== record.completionToken) {
        throw new SettlementError("A different battle result is already armed for settlement.");
      }
      return false;
    }
    this.#pending = record;
    return true;
  }

  get pending() {
    return this.#pending;
  }

  get isArmed() {
    return this.#pending !== null;
  }

  get isSettled() {
    return this.#latched;
  }

  get settled() {
    return this.#settled;
  }

  /** The event the presentation layer must acknowledge. */
  pendingResultEvent() {
    if (!this.#pending) return null;
    return Object.freeze({
      type: BATTLE_RESULT_PENDING_TYPE,
      status: PENDING_STATUS,
      completionToken: this.#pending.completionToken,
      winnerTeamId: this.#pending.winnerTeamId,
      loserTeamIds: [...this.#pending.loserTeamIds],
      reason: this.#pending.reason
    });
  }

  /**
   * Gate 2. Returns `true` exactly once — on the acknowledgement that actually
   * settles the campaign. Every later acknowledgement of the same token
   * returns `false` without touching the callback.
   */
  acknowledge(acknowledgement) {
    if (
      !acknowledgement ||
      typeof acknowledgement !== "object" ||
      acknowledgement.type !== BATTLE_RESULT_ACK_TYPE ||
      typeof acknowledgement.completionToken !== "string" ||
      acknowledgement.completionToken.length === 0
    ) {
      throw new SettlementError(
        `A ${BATTLE_RESULT_ACK_TYPE} acknowledgement with a non-empty completionToken is required.`
      );
    }
    if (!this.#pending) {
      throw new SettlementError(
        "No battle result is armed: a team must be eliminated before the campaign can settle."
      );
    }
    if (acknowledgement.completionToken !== this.#pending.completionToken) {
      throw new SettlementError("The acknowledgement token does not match the armed battle result.");
    }
    if (this.#latched) return false;
    // Latch first. A throwing campaign callback must not leave the settlement
    // re-fireable; the caller sees the throw, the campaign is not paid twice.
    this.#latched = true;
    this.#settled = Object.freeze({ ...this.#pending, acknowledgedToken: acknowledgement.completionToken });
    if (this.#onSettle) this.#onSettle(clone(this.#settled));
    return true;
  }

  toJSON() {
    return {
      armed: this.#pending !== null,
      settled: this.#latched,
      pending: this.#pending ? { ...this.#pending, loserTeamIds: [...this.#pending.loserTeamIds] } : null,
      record: this.#settled ? { ...this.#settled, loserTeamIds: [...this.#settled.loserTeamIds] } : null
    };
  }
}

export function createCampaignSettlement(onSettle = null) {
  return new CampaignSettlement(onSettle);
}
