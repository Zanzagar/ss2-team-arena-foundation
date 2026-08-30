/**
 * The result-acknowledgement bridge: turning an animation surface into the
 * one acknowledgement that settles the campaign.
 *
 * The resolver arms settlement and emits a terminal `battle-result-pending`
 * event carrying a completion token; `src/team/settlement.js` then fires the
 * campaign exactly once, and only when a matching
 * `battle-result-animation-complete` comes back. This module is what
 * *produces* that acknowledgement, and it is the only part of the adapter with
 * a state machine.
 *
 * Two things make it more than a pass-through, and both matter for 2v2/3v3:
 *
 * 1. **The final animation is the last one, not the first.** A losing team can
 *    have up to three fighters, each with its own death animation. Vanilla has
 *    no concept of this: `death()` jumps straight to `combatwon`/`combatlost`
 *    on the first knockout. The bridge waits for every eliminated fighter on
 *    the losing side to report, so the campaign is never paid over the top of
 *    an animation still playing.
 * 2. **The animation surface must agree with resolved state.** The arena
 *    timeline label the presentation reached is checked against the label the
 *    resolved winner implies. A surface that reports `combat_won` for a battle
 *    the resolver decided the other way is a desync, and it is refused rather
 *    than settled.
 *
 * Nothing here decides an outcome. The bridge cannot make a battle end, cannot
 * choose a winner, and cannot settle a battle the resolver has not armed.
 */

import { allCombatants, acknowledgeResultAnimation, pendingResultEvent } from "../team/resolver.js";
import { BATTLE_RESULT_ACK_TYPE, BATTLE_RESULT_PENDING_TYPE } from "../team/settlement.js";
import { resultLabelsFor } from "./slot-layout.js";

export class AcknowledgementError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export const BridgeStatus = Object.freeze({
  IDLE: "idle",
  ARMED: "armed",
  SETTLED: "settled"
});

class ResultAcknowledgementBridge {
  #battle;
  #layout;
  #acknowledge;
  #pending = null;
  #expectedArenaLabel = null;
  #awaiting = new Set();
  #reported = new Set();
  #arenaLabelSeen = false;
  #settled = false;

  constructor(battle, { layout, acknowledge = acknowledgeResultAnimation } = {}) {
    if (!battle || typeof battle !== "object" || !Array.isArray(battle.teams)) {
      throw new AcknowledgementError("The acknowledgement bridge needs a live team battle.");
    }
    if (!layout || typeof layout.sideOf !== "function") {
      throw new AcknowledgementError("The acknowledgement bridge needs an arena layout from buildArenaLayout().");
    }
    if (typeof acknowledge !== "function") {
      throw new AcknowledgementError("The acknowledgement sink must be a function.");
    }
    this.#battle = battle;
    this.#layout = layout;
    this.#acknowledge = acknowledge;
  }

  /**
   * Picks up the terminal `battle-result-pending` event if the resolver has
   * emitted one. Safe to call after every action; a no-op until the battle is
   * decided, and idempotent once it is.
   */
  sync() {
    if (this.#pending || this.#settled) return this.status;
    const pending = pendingResultEvent(this.#battle);
    if (!pending) return this.status;
    if (pending.type !== BATTLE_RESULT_PENDING_TYPE) {
      throw new AcknowledgementError(`Expected a ${BATTLE_RESULT_PENDING_TYPE} event.`);
    }
    this.#pending = pending;
    const labels = resultLabelsFor(this.#layout, pending.winnerTeamId);
    this.#expectedArenaLabel = labels.arenaLabel;
    const losers = new Set(pending.loserTeamIds);
    for (const combatant of allCombatants(this.#battle)) {
      // Every fighter on an eliminated team is down by definition, and each
      // one has a death animation the campaign must not outrun.
      if (losers.has(combatant.teamId)) this.#awaiting.add(combatant.id);
    }
    return this.status;
  }

  get status() {
    if (this.#settled) return BridgeStatus.SETTLED;
    return this.#pending ? BridgeStatus.ARMED : BridgeStatus.IDLE;
  }

  get pendingToken() {
    return this.#pending?.completionToken ?? null;
  }

  get expectedArenaLabel() {
    return this.#expectedArenaLabel;
  }

  get awaitingDeathAnimations() {
    return [...this.#awaiting].filter((id) => !this.#reported.has(id));
  }

  get arenaLabelReached() {
    return this.#arenaLabelSeen;
  }

  get isSettled() {
    return this.#settled;
  }

  /** The acknowledgement this bridge will submit, for host/client comparison. */
  acknowledgement() {
    if (!this.#pending) return null;
    return Object.freeze({ type: BATTLE_RESULT_ACK_TYPE, completionToken: this.#pending.completionToken });
  }

  /**
   * Validates an acknowledgement against the armed result without submitting
   * it. A host and a client can compare acknowledgements this way because the
   * token is a pure function of the outcome.
   */
  verifyAcknowledgement(acknowledgement) {
    if (
      !acknowledgement ||
      typeof acknowledgement !== "object" ||
      acknowledgement.type !== BATTLE_RESULT_ACK_TYPE ||
      typeof acknowledgement.completionToken !== "string" ||
      acknowledgement.completionToken.length === 0
    ) {
      throw new AcknowledgementError(
        `A ${BATTLE_RESULT_ACK_TYPE} acknowledgement with a non-empty completionToken is required.`
      );
    }
    this.#requireArmed("verify an acknowledgement");
    if (acknowledgement.completionToken !== this.#pending.completionToken) {
      throw new AcknowledgementError(
        `The acknowledgement token ${acknowledgement.completionToken} does not match the armed result ` +
        `${this.#pending.completionToken}.`
      );
    }
    return true;
  }

  #requireArmed(action) {
    this.sync();
    if (!this.#pending) {
      throw new AcknowledgementError(
        `Cannot ${action}: no battle result is armed. A whole team must be eliminated first.`
      );
    }
  }

  #knows(combatantId) {
    return allCombatants(this.#battle).some((combatant) => combatant.id === combatantId);
  }

  /**
   * The presentation surface reports that one fighter's death animation has
   * finished playing.
   *
   * Deaths on the winning side are accepted and ignored — they played earlier
   * in the battle and settlement does not wait on them.
   */
  reportDeathAnimation(combatantId) {
    this.#requireArmed("report a death animation");
    if (!this.#knows(combatantId)) {
      throw new AcknowledgementError(`Combatant ${String(combatantId)} is not in this battle.`);
    }
    if (!this.#awaiting.has(combatantId)) {
      return this.#outcome({ accepted: true, counted: false, settled: false });
    }
    const duplicate = this.#reported.has(combatantId);
    this.#reported.add(combatantId);
    const settled = this.#maybeSettle();
    return this.#outcome({ accepted: true, counted: !duplicate, duplicate, settled });
  }

  /**
   * The presentation surface reports that the arena timeline reached its
   * result label (`combat_won` / `combat_lost`).
   *
   * @param {string} arenaLabel
   * @param {object} [options.completionToken] optional token to cross-check
   */
  reportArenaLabel(arenaLabel, { completionToken } = {}) {
    this.#requireArmed("report an arena result label");
    if (completionToken !== undefined) {
      this.verifyAcknowledgement({ type: BATTLE_RESULT_ACK_TYPE, completionToken });
    }
    if (this.#expectedArenaLabel === null) {
      throw new AcknowledgementError(
        "The resolved result has no vanilla arena transition (a draw), so no arena label can acknowledge it."
      );
    }
    if (arenaLabel !== this.#expectedArenaLabel) {
      throw new AcknowledgementError(
        `The animation surface reached ${String(arenaLabel)} but the resolved result implies ` +
        `${this.#expectedArenaLabel}. Presentation and resolved state disagree; refusing to settle.`
      );
    }
    const duplicate = this.#arenaLabelSeen;
    this.#arenaLabelSeen = true;
    const settled = this.#maybeSettle();
    return this.#outcome({ accepted: true, counted: !duplicate, duplicate, settled });
  }

  #outcome({ accepted, counted = true, duplicate = false, settled }) {
    return Object.freeze({
      accepted,
      counted,
      duplicate,
      settled,
      status: this.status,
      alreadySettled: this.#settled && settled === false,
      remaining: this.awaitingDeathAnimations
    });
  }

  #maybeSettle() {
    if (this.#settled) return false;
    if (!this.#arenaLabelSeen) return false;
    if (this.awaitingDeathAnimations.length > 0) return false;
    // Latch before submitting, mirroring CampaignSettlement: a throwing
    // campaign callback must not leave the bridge able to fire again.
    this.#settled = true;
    return this.#acknowledge(this.#battle, this.acknowledgement()) === true;
  }
}

export function createResultAcknowledgementBridge(battle, options) {
  return new ResultAcknowledgementBridge(battle, options);
}
