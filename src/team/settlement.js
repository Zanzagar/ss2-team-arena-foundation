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
 *
 * The token those two gates are matched on names **one battle**, not one
 * result. It used to name only the result, which was safe for exactly as long
 * as the project stayed single-process and one battle at a time: in a campaign
 * of consecutive bouts between the same two teams every bout produced the same
 * token, so bout 1's acknowledgement satisfied bout 2's gate 2 and settled it
 * with bout 1's winner. See `completionTokenFor`.
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
 * The shape of a battle discriminator: eight lowercase hex digits, which is
 * exactly what `combatStateHash(battle)` produces. Pinned as a shape so a
 * counter, a timestamp or a random string cannot be smuggled in as one.
 */
export const BATTLE_DISCRIMINATOR_PATTERN = /^[0-9a-f]{8}$/;

/**
 * The OUTCOME half of a completion token: who won, who lost, and why.
 *
 * This is what the token used to be in its entirety, and on its own it is not
 * an identity. Two independent bouts between the same two teams ending the
 * same way produce the same prefix — which is the point of keeping it: a
 * record whose result was edited no longer agrees with this half of its own
 * token, and `src/campaign/record.js` checks exactly that.
 */
export function outcomeTokenPrefix({ winnerTeamId, loserTeamIds, reason }) {
  const losers = [...loserTeamIds].sort();
  return `team-arena:${winnerTeamId ?? "none"}:${losers.join("+") || "none"}:${reason}`;
}

/**
 * The BATTLE half must be present and must be a state hash.
 *
 * It is required rather than defaulted on purpose. A default would silently
 * restore the defect for any caller that forgot it, and the caller that
 * forgets is exactly the one settling the wrong bout.
 */
export function assertBattleDiscriminator(battleDiscriminator) {
  if (typeof battleDiscriminator !== "string" || !BATTLE_DISCRIMINATOR_PATTERN.test(battleDiscriminator)) {
    throw new SettlementError(
      "A settlement outcome needs a battleDiscriminator: the eight lowercase hex digits of " +
      "combatStateHash(battle), taken at the moment the settlement is armed. Without it two bouts between " +
      "the same teams with the same result share a completion token, and the first bout's acknowledgement " +
      "settles the second."
    );
  }
  return battleDiscriminator;
}

/**
 * Deterministic completion token: `<outcome prefix>:<battle discriminator>`.
 *
 * It is a pure function of the outcome **of one particular battle**. The
 * outcome half says what happened; the battle half says which battle it
 * happened in, and is the controller-independent hash of that battle's own
 * terminal state — seed, RNG cursor, rosters, healths, statuses, initiative,
 * turn number and the whole ordered event log.
 *
 * Both halves are derived, never counted and never drawn, so a replayed battle
 * still produces the same token and a host and a client can still compare
 * acknowledgements without extra state. What changed is that they can no
 * longer compare *the wrong bout's* acknowledgement and find it acceptable: a
 * campaign of consecutive bouts between the same two teams used to hand every
 * bout the same token, so bout 1's acknowledgement settled bout 2 with bout
 * 1's winner.
 */
export function completionTokenFor({ winnerTeamId, loserTeamIds, reason, battleDiscriminator }) {
  assertBattleDiscriminator(battleDiscriminator);
  return `${outcomeTokenPrefix({ winnerTeamId, loserTeamIds, reason })}:${battleDiscriminator}`;
}

/**
 * The battle half of a token, or `null` if it does not carry a well-shaped one.
 *
 * Read from the end rather than by splitting: a team id may itself contain a
 * colon, but a discriminator never can, so the last segment is unambiguous.
 */
export function battleDiscriminatorOf(completionToken) {
  if (typeof completionToken !== "string") return null;
  const discriminator = completionToken.slice(completionToken.lastIndexOf(":") + 1);
  return BATTLE_DISCRIMINATOR_PATTERN.test(discriminator) ? discriminator : null;
}

/**
 * Does this token belong to this outcome?
 *
 * True when the token is the outcome's prefix followed by some well-shaped
 * battle discriminator. It deliberately does **not** say *which* battle: a
 * reader holding only a finished record cannot recompute an arm-time state
 * hash, and inventing one it could recompute would put the identity back where
 * it started. What it does say is the thing worth saying at rest — an edited
 * result no longer agrees with its own token.
 */
export function completionTokenMatchesOutcome(completionToken, { winnerTeamId, loserTeamIds, reason } = {}) {
  if (typeof completionToken !== "string" || !Array.isArray(loserTeamIds)) return false;
  const prefix = `${outcomeTokenPrefix({ winnerTeamId, loserTeamIds, reason })}:`;
  if (!completionToken.startsWith(prefix)) return false;
  return BATTLE_DISCRIMINATOR_PATTERN.test(completionToken.slice(prefix.length));
}

function normaliseOutcome(outcome) {
  if (!outcome || typeof outcome !== "object") {
    throw new SettlementError("A settlement outcome must be an object.");
  }
  const { winnerTeamId = null, loserTeamIds, reason, battleDiscriminator } = outcome;
  if (!Array.isArray(loserTeamIds) || loserTeamIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new SettlementError("A settlement outcome needs loserTeamIds as non-empty strings.");
  }
  if (typeof reason !== "string" || reason.length === 0) {
    throw new SettlementError("A settlement outcome needs a reason.");
  }
  if (winnerTeamId !== null && (typeof winnerTeamId !== "string" || winnerTeamId.length === 0)) {
    throw new SettlementError("A settlement winnerTeamId must be null or a non-empty string.");
  }
  assertBattleDiscriminator(battleDiscriminator);
  // The discriminator is folded into the token and kept nowhere else. The
  // settlement record's public shape is unchanged, so every consumer of it —
  // `src/campaign/from-battle.js`, the adapter bridge, the pending event —
  // sees the same five fields it always saw, carrying a token that is now
  // specific to this battle.
  const record = {
    winnerTeamId,
    loserTeamIds: [...loserTeamIds].sort(),
    reason,
    completionToken: completionTokenFor({ winnerTeamId, loserTeamIds, reason, battleDiscriminator })
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

  /**
   * Gate 1. Called by the resolver the moment a whole team is eliminated.
   *
   * `outcome` is `{ winnerTeamId, loserTeamIds, reason, battleDiscriminator }`.
   * The discriminator is what makes the resulting token this battle's rather
   * than merely this *result's*; see `completionTokenFor`.
   */
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
