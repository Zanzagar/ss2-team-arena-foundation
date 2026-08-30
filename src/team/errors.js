/**
 * Shared error type for the team seam.
 *
 * `src/engine.js` re-exports this class under its historical name so existing
 * `instanceof BattleError` checks keep working across the refactor.
 */
export class BattleError extends Error {}

export { BattleError as TeamBattleError };
