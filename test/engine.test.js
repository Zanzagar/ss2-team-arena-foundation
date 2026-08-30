import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  advanceAiTurns,
  applyAction,
  createBattle,
  currentCombatant,
  replay,
  stateHash,
  toWireState
} from "../src/engine.js";

const fighter = (id, controller, agility, overrides = {}) => ({
  id,
  name: id,
  controller,
  stats: { strength: 10, agility, attack: 15, defense: 5, vitality: 7, stamina: 6, magicka: 4, ...overrides.stats },
  loadout: { meleeDamage: 12, rangedDamage: 8, canUseRanged: true, canUseSpell: true, canHeal: true, ...overrides.loadout },
  ...overrides
});

test("2v2 advances through AI allies and enemies until the next locally controlled turn", () => {
  const battle = createBattle({
    seed: 42,
    teams: [
      { id: "red", combatants: [fighter("red-1", "client-red", 50), fighter("red-2", "ai", 40)] },
      { id: "blue", combatants: [fighter("blue-1", "ai", 30), fighter("blue-2", "ai", 20)] }
    ]
  });
  assert.equal(currentCombatant(battle).id, "red-1");
  applyAction(battle, { actorId: "red-1", type: ActionType.MELEE, targetId: "blue-1" });
  const aiActions = advanceAiTurns(battle);
  assert.equal(aiActions.length, 3);
  assert.equal(currentCombatant(battle).id, "red-1");
  assert.equal(battle.events.filter((event) => ["melee", "ranged", "spell"].includes(event.type)).length >= 2, true);
});

test("3v3 resolves an all-AI battle without a special-case combat loop", () => {
  const battle = createBattle({
    seed: 7,
    teams: [
      { id: "red", combatants: [fighter("r1", "ai", 60), fighter("r2", "ai", 50), fighter("r3", "ai", 40)] },
      { id: "blue", combatants: [fighter("b1", "ai", 30), fighter("b2", "ai", 20), fighter("b3", "ai", 10)] }
    ]
  });
  advanceAiTurns(battle, 200);
  assert.ok(battle.result);
  assert.equal(["red", "blue"].includes(battle.result.winnerTeamId), true);
});

test("a host can replay the same action stream and obtain an identical wire state", () => {
  const blueprint = {
    seed: 99,
    teams: [
      { id: "red", combatants: [fighter("r1", "client-red", 20, { loadout: { canUseRanged: false, canUseSpell: false, canHeal: false } })] },
      { id: "blue", combatants: [fighter("b1", "client-blue", 10, { loadout: { canUseRanged: false, canUseSpell: false, canHeal: false } })] }
    ]
  };
  const live = createBattle(blueprint);
  const actions = [
    { actorId: "r1", type: ActionType.MELEE, targetId: "b1" },
    { actorId: "b1", type: ActionType.MELEE, targetId: "r1" },
    { actorId: "r1", type: ActionType.MELEE, targetId: "b1" },
    { actorId: "b1", type: ActionType.MELEE, targetId: "r1" }
  ];
  for (const action of actions) applyAction(live, action);
  const rebuilt = replay(blueprint, actions);
  assert.deepEqual(toWireState(rebuilt), toWireState(live));
  assert.equal(stateHash(rebuilt), stateHash(live));
});
