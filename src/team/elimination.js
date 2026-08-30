/**
 * Knockout tracking and team elimination.
 *
 * The rule the campaign depends on: an individual knockout is a
 * combatant-defeated event and nothing more. A team is eliminated only when
 * *every* slot on it — including AI-filled slots — is down. Campaign
 * settlement is gated on team elimination, never on a knockout.
 */

export const EliminationEvent = Object.freeze({
  /**
   * Wire token for the combatant-defeated event. The historical engine emitted
   * `"defeated"`, and network clients already key off it, so the token is kept
   * while the constant name states what the event means.
   */
  COMBATANT_DEFEATED: "defeated",
  TEAM_ELIMINATED: "team-eliminated"
});

export const ResultReason = Object.freeze({
  ELIMINATION: "elimination",
  DRAW: "draw"
});

/** Alive-flag snapshot taken before a rule set's effects are applied. */
export function snapshotLiveness(combatants) {
  return new Map(combatants.map((combatant) => [combatant.id, combatant.alive]));
}

/** Combatants that transitioned from standing to down, in roster order. */
export function collectKnockouts(before, combatants) {
  return combatants
    .filter((combatant) => before.get(combatant.id) === true && combatant.alive === false)
    .map((combatant) => combatant.id);
}

export function teamStanding(team) {
  const total = team.combatants.length;
  const alive = team.combatants.filter((combatant) => combatant.alive).length;
  return {
    teamId: team.id,
    total,
    alive,
    down: total - alive,
    eliminated: alive === 0
  };
}

/**
 * Whole-battle standing. `decided` is true only when at most one team still
 * has a standing combatant.
 */
export function battleStanding(teams) {
  const standings = teams.map(teamStanding);
  const survivingTeamIds = standings.filter((entry) => !entry.eliminated).map((entry) => entry.teamId);
  const eliminatedTeamIds = standings.filter((entry) => entry.eliminated).map((entry) => entry.teamId);
  const decided = survivingTeamIds.length <= 1;
  return {
    teams: standings,
    survivingTeamIds,
    eliminatedTeamIds,
    decided,
    winnerTeamId: decided && survivingTeamIds.length === 1 ? survivingTeamIds[0] : null,
    reason: decided
      ? (survivingTeamIds.length === 1 ? ResultReason.ELIMINATION : ResultReason.DRAW)
      : null
  };
}
