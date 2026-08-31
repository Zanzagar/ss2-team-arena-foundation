/**
 * Experimental-design contract for the post-tutorial candidate families:
 * `candidate-tournament-*` (the non-lethal path) and `candidate-armoured-*`
 * (the armour path).
 *
 * Why these families exist
 * ------------------------
 * Every promoted golden comes from one staged fight — a level-1 gladiator
 * against the tutorial prisoner, both unarmoured, `fight_mode` `"misc"`. That
 * staging is exhausted. The bytecode map of the post-tutorial route
 * (docs/integration/ss2-arena-route.md §3) establishes that `fight_mode`
 * `"tournament"` is reachable from the foyer once
 * `herolevel >= tournament_level_required` (4 for a fresh gladiator, arena
 * route §2), and that tournament opponents can carry armour
 * (arena route §"What this route does and does not unlock").
 *
 * Two rules become observable there and nowhere else:
 *
 *   - the defeat gate's FIRST-BLOOD term. The byte-verified gate
 *     (battle map §Defeat gate and death dispatch) is entered iff
 *     `hitpoints <= 0` OR (`hitpoints < hitpointsmax` AND the mode is not
 *     tournament). Outside tournament mode any hit that reaches hitpoints ends
 *     the fight, so a surviving hitpoint hit is a tournament-only observation;
 *   - every armour rule in `damagecharacter`, which is inert against a
 *     defender wearing nothing.
 *
 * What a capture can contradict
 * -----------------------------
 * The wrapper serves the injected tape from a tap on `Math.random` that
 * receives no arguments, so every emitted roll line's `label`, `min`, `max`,
 * `value` and `callSite` are copied from the tape — that is, from the fixture
 * under test (runtime-capture §What a match actually establishes). The channels
 * a capture GENUINELY observes are the ordered mutation trace, the semantic
 * events (hit/miss and the dispatched `defender_hurt` method), the result
 * event, the final state, the staged/observed `attack_direction` and
 * `fight_mode`, and the NUMBER of draws. Every fixture below is therefore
 * justified by naming the observed channel that would move if the rule it
 * encodes were wrong, and this suite asserts that naming.
 *
 * Every number asserted here is hand-derived from
 * docs/integration/ss2-battle-map.md and docs/integration/ss2-arena-route.md
 * and cited at its assertion. None of it was read back out of the resolver and
 * none of it came from a capture: these are predictions a later licensed
 * capture will confirm or refute.
 *
 * The opponent is a PARAMETER, and says so
 * ----------------------------------------
 * `randomise_gladiator` builds tournament ranks 2..N procedurally at the hero's
 * level, mixing `randomBetween` with `RandomNumber` opcodes (arena route §2),
 * and foyer frame 22 regenerates the whole field whenever
 * `_global.tournament_in_progress != true` — which is every fresh launch. The
 * field is inspectable before the first bout (`_root.game.villain1..N` at foyer
 * frame 36) but it is not reproducible across launches. The villain block of
 * every fixture here is therefore a DECLARED PROFILE, not a reachable staging:
 * a capture must read the ladder at foyer frame 36 and re-author the villain
 * block from the dump. Nothing about the rules under test moves when it does —
 * which is what `hit-roll` value 100 and the parameter-surface assertions below
 * are for.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveExpectedEventsFromSs2Fixture,
  isCosmeticDebrisSample
} from "../src/golden/observation.js";
import { runSs2OneVsOneGoldenFixture } from "../src/golden/run-1v1-fixture.js";
import { resolveSs2PhysicalAttackCandidate } from "../src/golden/ss2-attack-candidate.js";

import { loadSs2Fixtures } from "./ss2-fixture-files.js";

const fixtures = await loadSs2Fixtures();
const byId = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));

const canonical = (value) => JSON.stringify(value, (_key, item) => {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
  return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
});
const sameJson = (left, right) => canonical(left) === canonical(right);

const sampleByLabel = (fixture, label) => fixture.samples.find((sample) => sample.label === label) ?? null;
const labels = (fixture) => fixture.samples.map((sample) => sample.label);

/**
 * Exactly the channels a runtime capture genuinely observes, with the echoed
 * tape reduced to its length. Identical in construction to the equivalent
 * helper in ss2-probe-fixtures.test.js, deliberately: the two suites must judge
 * "discriminating" by the same standard.
 */
function observedChannels(fixture) {
  return {
    events: deriveExpectedEventsFromSs2Fixture(fixture),
    mutationTrace: fixture.expected.mutationTrace.map(({ sequence, path, before, after }) => ({
      sequence,
      path,
      before,
      after
    })),
    resultEvent: fixture.expected.resultEvent,
    finalState: fixture.expected.state,
    drawCount: fixture.samples.filter((sample) => !isCosmeticDebrisSample(sample)).length
  };
}

function differingObservedChannels(left, right) {
  const a = observedChannels(left);
  const b = observedChannels(right);
  return Object.keys(a).filter((channel) => !sameJson(a[channel], b[channel]));
}

const TOURNAMENT_FAMILY = [
  "candidate-tournament-nonlethal-normal-hit",
  "candidate-tournament-boundary-at-max",
  "candidate-tournament-boundary-below-max"
];
const ARMOURED_FAMILY = [
  "candidate-armoured-equality-quirk",
  "candidate-armoured-deflection-threshold-critical",
  "candidate-armoured-deflection-threshold-cleared",
  "candidate-armoured-removal-destroys-helmet",
  "candidate-armoured-removal-destroys-shoulderguard"
];
const POST_TUTORIAL_FAMILY = [...TOURNAMENT_FAMILY, ...ARMOURED_FAMILY];

/**
 * The hero every fixture here stages: the gladiator behind the promoted
 * prisoner goldens, levelled three times with the arena route's recommended
 * discipline and nothing else changed.
 *
 * Verified level-1 loadout (capture staging guide, "The staged fight that
 * produced the goldens"): strength 10, attack/defence/charisma/magicka 1,
 * damage 21-23, hp 30/30, stamina 105/110 at action time, no armour.
 * Arena route §5 recommends spending all four level-up points into `vitality`
 * every time, because it moves only `hitpointsmax` and leaves every input to
 * `attack_chances`, the damage roll, the deflection threshold and the
 * controller selector untouched. Three level-ups (1 -> 4) is 12 points.
 */
const HERO = {
  attack: 1,
  defence: 1,
  strength: 10,
  charisma: 1,
  magicka: 1,
  min_damage: 21,
  max_damage: 23,
  hitpoints: 300,
  hitpointsmax: 300,
  staminaleft: 105,
  staminamax: 110,
  armourclass: 0,
  armourclass_max: 0,
  gladiator_dir: "right"
};

/**
 * The only villain fields any fixture here is allowed to stage.
 *
 * Each staged field is one more value a capture's foyer dump has to match, so
 * the parameter surface is held down deliberately: the villain never attacks in
 * these fixtures, so its `attack`, `strength`, `min_damage`, `max_damage`,
 * `charisma` and `magicka` are never read by the resolver and are left
 * unstaged. `capture-session.mjs ingest` projects an observation onto exactly
 * the fields a fixture stages (capture staging guide, "Derivation
 * constraints"), so an unstaged field is not compared.
 */
const TOURNAMENT_OPPONENT_PARAMETERS = new Set([
  "defence",
  "hitpoints",
  "hitpointsmax",
  "staminaleft",
  "staminamax",
  "armourclass",
  "armourclass_max",
  "gladiator_dir",
  "helmet",
  "helmet_defence",
  "shoulderguard",
  "shoulderguard_defence",
  "greaves",
  "gauntlet",
  "boot"
]);

test("every post-tutorial fixture is a registered candidate that replays exactly", () => {
  const onDisk = fixtures
    .map((fixture) => fixture.fixtureId)
    .filter((id) => id.startsWith("candidate-tournament-") || id.startsWith("candidate-armoured-"))
    .sort();
  assert.deepEqual(
    onDisk,
    [...POST_TUTORIAL_FAMILY].sort(),
    "every candidate-tournament-*/candidate-armoured-* fixture must be catalogued here"
  );
  for (const id of POST_TUTORIAL_FAMILY) {
    const fixture = byId.get(id);
    assert.ok(fixture, `${id} was not discovered by the fixture registry`);
    assert.equal(fixture.classification, "candidate", id);
    assert.equal(fixture.provenance.kind, "synthetic-static-map", id);
    assert.equal(fixture.provenance.runtimeVerified, false, id);
    const replay = runSs2OneVsOneGoldenFixture(fixture, resolveSs2PhysicalAttackCandidate);
    assert.deepEqual(replay.outcome, fixture.expected, id);
    assert.deepEqual(replay.trace, fixture.samples, id);
  }
});

test("every post-tutorial fixture explicitly stages fight_mode tournament", () => {
  // This is the whole point of the family, and it is new. The thirteen legacy
  // candidates that are tournament-only OMIT `scenario.fightMode`, so they do
  // not assert the live mode at all: ingest projects `fight_mode` only when the
  // fixture stages it (capture staging guide, "The defeat gate makes most
  // legacy candidates tournament-only"). `fight_mode` is one of the channels a
  // capture genuinely reads from the game (runtime-capture §What a match
  // actually establishes), so staging it turns an assumption into evidence.
  for (const id of POST_TUTORIAL_FAMILY) {
    assert.equal(byId.get(id).scenario.fightMode, "tournament", id);
  }
  // The second half used to assert that NO fixture outside this family staged
  // tournament mode. That was a snapshot of a moment mistaken for an invariant,
  // and it cost something real: the champion family was authored, found it
  // could not stage `fight_mode` without failing here, and DROPPED the key -
  // forfeiting one of the few channels a capture genuinely reads from the game,
  // on a bout that was the first chance to assert it.
  //
  // The concern the clause actually protects is narrower: a LEGACY candidate,
  // authored before any of this existed, must not silently acquire the mode,
  // because those fixtures were never staged for it. So the rule is stated
  // positively - a fixture may stage tournament mode only if it belongs to a
  // family declared capable of it - and adding a family is a deliberate line
  // here rather than a test failure to work around.
  const TOURNAMENT_CAPABLE_PREFIXES = [
    "candidate-tournament-",
    "candidate-armoured-",
    "candidate-champion-"
  ];
  const undeclared = fixtures.filter(
    (fixture) => fixture.scenario.fightMode === "tournament" &&
      !POST_TUTORIAL_FAMILY.includes(fixture.fixtureId) &&
      !TOURNAMENT_CAPABLE_PREFIXES.some((prefix) => fixture.fixtureId.startsWith(prefix))
  );
  assert.deepEqual(
    undeclared.map((fixture) => fixture.fixtureId),
    [],
    "a fixture stages tournament mode without belonging to a family declared capable of it"
  );
});

test("every post-tutorial fixture stages the one levelled capture gladiator, unchanged", () => {
  for (const id of POST_TUTORIAL_FAMILY) {
    const fixture = byId.get(id);
    assert.deepEqual(fixture.scenario.hero, HERO, id);
    assert.equal(fixture.scenario.attackerSide, "hero", id);
    assert.equal(fixture.scenario.result, null, id);
    // `attack_direction` 5 is drawn by `normal_attack` from randomBetween(5, 8)
    // (battle map §Where attack_direction is assigned, `+0x61f1`), and 5 is in
    // the 1/5/8/9 group `remove_armour` maps to helmet + shoulderguard
    // (battle map §Spell-path reuse, direction-to-piece table).
    assert.equal(fixture.scenario.attackDirection, 5, id);
  }
});

test("the levelled gladiator's formula-derived numbers follow from the battle map", () => {
  // TITLE AND SCOPE NARROWED DELIBERATELY. This test used to be called "the
  // levelled gladiator's numbers are derived, not chosen" and closed with
  //
  //     assert.equal(HERO.staminamax - HERO.staminaleft, 5);
  //
  // whose two operands are literals declared 130 lines above in THIS FILE
  // (staminamax 110, staminaleft 105). 110 - 105 is 5 however the game behaves,
  // so the assertion could not fail, and its own comment conceded the 5 was
  // observed rather than derived. An assertion that cannot fail is not weak
  // evidence, it is no evidence, and this one was standing under a title
  // claiming the opposite. The stamina drift is now checked against the
  // promoted goldens instead — see the test below — and this one claims only
  // what it actually shows: that the numbers with a FORMULA behind them follow
  // from it.
  const herolevel = 4;             // tournament 1 requires herolevel >= 4 (arena route §2)
  const vitality = 1 + 3 * 4;      // level-1 vitality 1, plus 4 points per level-up, 1 -> 4
  const staminaStat = 1;           // unchanged from the verified level-1 loadout
  const strength = 10;
  // battlevalues (battle map §Combatant state objects).
  assert.equal(herolevel * 10 + vitality * 20, HERO.hitpointsmax);
  assert.equal(100 + staminaStat * 10, HERO.staminamax);
  assert.equal(Math.round(strength * 2) + 1, HERO.min_damage);   // weapon 1/3, unchanged
  assert.equal(Math.round(strength * 2) + 3, HERO.max_damage);
  // Root frame 214 `+0x02a9` heals the hero to hitpointsmax on every arena
  // entry (arena route §2), so the hero enters at full health.
  assert.equal(HERO.hitpoints, HERO.hitpointsmax);
  // `assert.equal(herolevel, 4)` used to stand here as well, comparing a const
  // declared in this same test to its own initialiser. Dropped for the same
  // reason. `herolevel` still earns its place: it is load-bearing in the
  // hitpointsmax derivation two lines up, where a wrong value does fail.
});

test("the staged stamina drift is the drift the promoted goldens measured", async () => {
  // The one staged number with no formula behind it: five `walkright` autopilot
  // steps carry the hero from `longrange_warrior` into `closerange_warrior` and
  // cost one stamina each. There is no rule in the battle map to derive that
  // from — it is a function of the route the autopilot walks — so the only
  // honest check is against evidence, and the evidence is outside this file:
  // the runtime-verified prisoner goldens, whose hero walked the same route.
  //
  // Every operand here comes from a committed golden fixture, so the assertion
  // moves when the goldens move. Editing HERO.staminaleft or HERO.staminamax in
  // this file now fails it, which is exactly what the assertion it replaced
  // could not do.
  const goldenDir = fileURLToPath(new URL("fixtures/ss2-1v1-golden/", import.meta.url));
  const fileNames = (await readdir(goldenDir))
    .filter((name) => name.startsWith("golden-prisoner-") && name.endsWith(".json"))
    .sort();
  assert.ok(
    fileNames.length >= 4,
    `only ${fileNames.length} promoted prisoner goldens under ${goldenDir}; this test needs the ` +
    "runtime evidence it compares against, and must not pass by finding none"
  );

  const drifts = new Set();
  for (const fileName of fileNames) {
    const golden = JSON.parse(await readFile(path.join(goldenDir, fileName), "utf8"));
    assert.equal(golden.provenance.runtimeVerified, true, fileName);
    const { hero } = golden.scenario;
    drifts.add(hero.staminamax - hero.staminaleft);
  }
  assert.equal(drifts.size, 1, `the goldens disagree about the walk cost: ${[...drifts].join(", ")}`);
  const [observedDrift] = drifts;

  assert.equal(
    HERO.staminamax - HERO.staminaleft,
    observedDrift,
    "the post-tutorial hero's staged stamina drift must equal the drift the promoted prisoner " +
    "goldens actually measured; it is observed, not derived, so the goldens are the only warrant"
  );
});

test("the villain block is a declared parameter surface, and every member says so", () => {
  for (const id of POST_TUTORIAL_FAMILY) {
    const fixture = byId.get(id);
    for (const key of Object.keys(fixture.scenario.villain)) {
      assert.ok(
        TOURNAMENT_OPPONENT_PARAMETERS.has(key),
        `${id} stages villain.${key}, which is outside the declared parameter surface`
      );
    }
    assert.ok(
      fixture.provenance.candidateFlags.includes("tournament-opponent-profile-parameterised"),
      `${id} must flag that its opponent block is a profile a capture has to confirm`
    );
    assert.ok(
      fixture.provenance.candidateFlags.includes("fight-mode-tournament-unobserved"),
      `${id} must flag that tournament mode has never been observed live`
    );
  }
});

test("the hit is forced by the tape, so re-authoring the opponent's defence cannot change it", () => {
  // attack_chances (battle map §Chance calculation): ratio =
  // (attacker.attack + 9) / (defender.defence + 9) = (1 + 9) / (3 + 9) = 10/12,
  // so normal = round(83.333... * 0.50) = round(41.666...) = 42, inside the
  // 1-99 clamp, and the dispatcher computes rollneeded = 100 - chance = 58 and
  // hits iff diceroll >= rollneeded (§Attack roll dispatcher).
  const ratio = (1 + 9) / (3 + 9);
  assert.equal(Math.round(ratio * 100 * 0.5), 42);
  for (const id of POST_TUTORIAL_FAMILY) {
    const fixture = byId.get(id);
    assert.equal(fixture.scenario.villain.defence, 3, id);
    assert.equal(fixture.expected.calculation.chance, 42, id);
    assert.equal(fixture.expected.calculation.rollNeeded, 58, id);
    assert.equal(fixture.expected.calculation.hit, true, id);
    // 100 is the largest value the inclusive 1-100 hit roll can take, and the
    // chance clamp guarantees rollneeded <= 99, so the hit survives ANY opponent
    // defence the foyer dump turns out to carry. `chance` and `rollNeeded` live
    // in expected.calculation, which matching never compares, so re-authoring
    // `defence` from the dump moves nothing a capture can disagree with.
    assert.equal(sampleByLabel(fixture, "hit-roll").value, 100, id);
    assert.ok(fixture.expected.calculation.rollNeeded <= 99, id);
  }
});

/* ------------------------------------------------------------------------- *
 * Family 1 - the non-lethal path
 * ------------------------------------------------------------------------- */

test("no post-tutorial fixture emits a result event, and that is the measurement", () => {
  // The byte-verified gate (battle map §Defeat gate and death dispatch) is
  // entered iff hitpoints <= 0 OR (hitpoints < hitpointsmax AND fight_mode is
  // not "tournament"). Every fixture here leaves the defender alive, and three
  // of them leave it BELOW maximum - which outside tournament mode would fire
  // the first-blood branch and end the fight.
  const belowMaximum = [];
  for (const id of POST_TUTORIAL_FAMILY) {
    const fixture = byId.get(id);
    const { hitpoints } = fixture.expected.state.villain;
    assert.ok(hitpoints > 0, `${id} must not eliminate the defender`);
    assert.equal(fixture.expected.resultEvent, null, id);
    assert.equal(fixture.expected.state.result, null, id);
    assert.deepEqual(
      fixture.expected.mutationTrace.filter((entry) => entry.path === "/result"),
      [],
      id
    );
    // The observed channel: a defeat would add `death` and `overlay-label`
    // events after `defender-hurt`. None of these fixtures predicts either.
    assert.deepEqual(
      deriveExpectedEventsFromSs2Fixture(fixture).map((event) => event.type),
      ["defender-hurt"],
      id
    );
    if (hitpoints < fixture.scenario.villain.hitpointsmax) belowMaximum.push(id);
  }
  // Exactly the fixtures that cross the gate's first-blood term. If the mode
  // term were absent - if the gate were simply "any damage below maximum ends
  // the fight" - every one of these would instead observe death + combatwon.
  assert.deepEqual(belowMaximum.sort(), [
    "candidate-armoured-deflection-threshold-critical",
    "candidate-armoured-equality-quirk",
    "candidate-armoured-removal-destroys-helmet",
    "candidate-tournament-boundary-below-max",
    "candidate-tournament-nonlethal-normal-hit"
  ]);
});

test("the unarmoured tournament hit is the gate's cleanest statement", () => {
  // No armour on the defender, so nothing between the selected damage and
  // hitpoints: one mutation, no armour algebra, no removal, no deflection
  // consequence. 22 of 80 hitpoints, and the fight continues.
  const fixture = byId.get("candidate-tournament-nonlethal-normal-hit");
  assert.equal(fixture.scenario.villain.armourclass, 0);
  assert.equal(fixture.scenario.villain.armourclass_max, 0);
  assert.equal(fixture.expected.calculation.selectedDamage, 22);
  assert.equal(fixture.expected.mutation.armourDamage, 0);
  assert.equal(fixture.expected.mutation.hitpointDamage, 22);
  assert.deepEqual(
    fixture.expected.mutationTrace.map(({ path, before, after }) => ({ path, before, after })),
    [{ path: "/villain/hitpoints", before: 80, after: 58 }]
  );
  // With no helmet and no greaves the deflection threshold degenerates to 100
  // ((100 - 1.5 * 0) + 0, battle map §Attack roll dispatcher), which is exactly
  // why this fixture carries no deflection claim: the critical sample is 7, so
  // the dispatched method is "normal" either way.
  assert.equal(fixture.expected.calculation.deflectionThreshold, 100);
  assert.equal(fixture.expected.calculation.dispatchedMethod, "normal");
  // hitpointsmax = herolevel * 10 + vitality * 20 with the opponent generated at
  // the hero's own level (arena route §2, randomise_gladiator): 4 * 10 + 2 * 20.
  assert.equal(4 * 10 + 2 * 20, fixture.scenario.villain.hitpointsmax);
  // randomise_gladiator distributes ceil(herolevel * 5) - 8 points over eight
  // stats seeded to 1, so the profile's stats must sum to 20 (arena route §2).
  assert.equal(Math.ceil(4 * 5) - 8 + 8, 20);
});

/* ------------------------------------------------------------------------- *
 * The damage-algebra bracket: one staging, the only three damage rolls the
 * normal band can produce, three different rules.
 * ------------------------------------------------------------------------- */

const BRACKET = {
  absorbed: "candidate-tournament-boundary-at-max",
  equality: "candidate-armoured-equality-quirk",
  overflow: "candidate-tournament-boundary-below-max"
};

test("the damage bracket is one staged fight and one injected slot", () => {
  const arms = Object.values(BRACKET).map((id) => byId.get(id));
  const [reference] = arms;
  for (const fixture of arms) {
    assert.deepEqual(fixture.scenario, reference.scenario, `${fixture.fixtureId} must stage identically`);
    assert.deepEqual(labels(fixture), labels(reference), `${fixture.fixtureId} must use one roll order`);
    for (const sample of fixture.samples) {
      if (sample.label === "normal-damage-roll") continue;
      assert.deepEqual(
        sample,
        sampleByLabel(reference, sample.label),
        `${fixture.fixtureId}: ${sample.label} is confounded`
      );
    }
  }
  // The defender's armour is exactly the middle of the band, so the three
  // reachable damage rolls straddle it. min_damage 21 / max_damage 23 means the
  // normal band's randomBetween(min_damage, max_damage) has only three outcomes
  // (battle map §Attack roll dispatcher, directions 5-8), and armourclass 22
  // puts one strictly below, one exactly on, and one strictly above.
  assert.equal(reference.scenario.villain.armourclass, 22);
  assert.deepEqual(
    [BRACKET.absorbed, BRACKET.equality, BRACKET.overflow].map(
      (id) => sampleByLabel(byId.get(id), "normal-damage-roll").value
    ),
    [21, 22, 23]
  );
  // armourclass_max: helmet 2 and boot 1, at the battlevalues multipliers 10 and
  // 2 (battle map §Combatant state objects): 2 * 10 + 1 * 2 = 22.
  assert.equal(2 * 10 + 1 * 2, reference.scenario.villain.armourclass_max);
  assert.equal(reference.scenario.villain.armourclass, reference.scenario.villain.armourclass_max);
});

test("the damage bracket separates absorbed, equality and strict overflow in state", () => {
  const absorbed = byId.get(BRACKET.absorbed);
  const equality = byId.get(BRACKET.equality);
  const overflow = byId.get(BRACKET.overflow);

  // Absorbed: damage strictly below remaining armour. armourclass is
  // decremented and hitpoints are untouched (battle map §Hit and damage path:
  // "subtracts normal/grievous damage from armourclass first, carrying only
  // overflow into hitpoints").
  assert.equal(absorbed.expected.mutation.armourDamage, 21);
  assert.equal(absorbed.expected.mutation.hitpointDamage, 0);
  assert.equal(absorbed.expected.state.villain.armourclass, 22 - 21);
  assert.equal(absorbed.expected.state.villain.hitpoints, 80);

  // Equality: damage EXACTLY equal to remaining armour. The bytecode sets
  // armour to zero but does not rewrite the local damage register, so the
  // non-positive-armour branch applies the FULL original damage to hitpoints
  // as well (battle map §Hit and damage path, transient/boundary note; the same
  // quirk is byte-verified on the spell ingress at §Spell ingress step 2).
  assert.equal(equality.expected.mutation.armourDamage, 22);
  assert.equal(equality.expected.mutation.hitpointDamage, 22);
  assert.equal(equality.expected.state.villain.armourclass, 0);
  assert.equal(equality.expected.state.villain.hitpoints, 80 - 22);

  // Strict overflow: the register IS rewritten, to damage - originalArmour, and
  // armourclass is left negative until check_stats clamps it.
  assert.equal(overflow.expected.mutation.hitpointDamage, 23 - 22);
  assert.equal(overflow.expected.state.villain.hitpoints, 80 - 1);
  assert.deepEqual(
    overflow.expected.mutationTrace.map(({ path, before, after, reason }) => ({ path, before, after, reason })),
    [
      { path: "/villain/armourclass", before: 22, after: -1, reason: "physical-damage" },
      { path: "/villain/hitpoints", before: 80, after: 79, reason: "physical-damage" },
      { path: "/villain/armourclass", before: -1, after: 0, reason: "stat-clamp" }
    ]
  );

  // The signature, stated as the capture will see it: the defender's surviving
  // hitpoints are NOT monotonic in the injected damage roll. One more point of
  // damage (21 -> 22) costs 22 hitpoints; one more again (22 -> 23) gives 21 of
  // them back. No reading in which equality overflows like everything else can
  // produce that, and the final state is where it shows.
  assert.deepEqual(
    [absorbed, equality, overflow].map((fixture) => fixture.expected.state.villain.hitpoints),
    [80, 58, 79]
  );
  const sane = [21, 22, 23].map((damage) => 80 - Math.max(0, damage - 22));
  assert.deepEqual(sane, [80, 80, 79], "a uniformly-overflowing armour rule predicts these instead");
  assert.notDeepEqual(sane, [80, 58, 79]);
});

test("the damage bracket's arms differ only in channels a capture observes", () => {
  const pairs = [
    [BRACKET.absorbed, BRACKET.equality],
    [BRACKET.equality, BRACKET.overflow],
    [BRACKET.absorbed, BRACKET.overflow]
  ];
  for (const [leftId, rightId] of pairs) {
    // Same events (defender_hurt "normal" throughout), same result (none), same
    // draw count. Only the ordered mutations and the final state move - and they
    // move because the armour algorithm took a different branch, which is
    // exactly the thing under test.
    assert.deepEqual(
      differingObservedChannels(byId.get(leftId), byId.get(rightId)),
      ["mutationTrace", "finalState"],
      `${leftId} vs ${rightId}`
    );
  }
});

test("the boundary arms bracket hitpointsmax itself, one point apart", () => {
  // The gate's first-blood term tests `hitpoints < hitpointsmax`. The at-max arm
  // leaves the defender exactly AT maximum (armour absorbed everything) and the
  // below-max arm exactly ONE below it - the tightest bracket the term admits.
  // Both are tournament bouts, so the mapped gate predicts no defeat either
  // side of the boundary; a reading that ignored the mode term would predict a
  // defeat on the below-max arm and none on the at-max arm, and the difference
  // would appear in `events` and `resultEvent`, not merely in state.
  const atMax = byId.get(BRACKET.absorbed);
  const belowMax = byId.get(BRACKET.overflow);
  assert.equal(atMax.expected.state.villain.hitpoints, atMax.scenario.villain.hitpointsmax);
  assert.equal(belowMax.expected.state.villain.hitpoints, belowMax.scenario.villain.hitpointsmax - 1);
  assert.deepEqual(
    deriveExpectedEventsFromSs2Fixture(atMax),
    deriveExpectedEventsFromSs2Fixture(belowMax),
    "crossing hitpointsmax in tournament mode must not change the dispatched events"
  );
  assert.equal(atMax.expected.resultEvent, null);
  assert.equal(belowMax.expected.resultEvent, null);
});

/* ------------------------------------------------------------------------- *
 * Family 2 - the armour path on the helmeted opponent
 * ------------------------------------------------------------------------- */

const HELMETED = [
  "candidate-armoured-deflection-threshold-critical",
  "candidate-armoured-deflection-threshold-cleared",
  "candidate-armoured-removal-destroys-helmet",
  "candidate-armoured-removal-destroys-shoulderguard"
];

test("the helmeted opponent's armour sums to 79 at the battlevalues multipliers", () => {
  // battle map §Combatant state objects: breastplate 16, helmet 10, shinguard 6,
  // greaves 3, shoulderguard 8, gauntlet 5, boot 2, shield 12; helmet uses
  // round(helmet * 10) while helmet <= 25.
  const pieces = { helmet: 6, shoulderguard: 1, greaves: 2, gauntlet: 1 };
  const multipliers = { helmet: 10, shoulderguard: 8, greaves: 3, gauntlet: 5 };
  const total = Object.entries(pieces)
    .reduce((sum, [piece, value]) => sum + Math.round(value * multipliers[piece]), 0);
  assert.equal(total, 79);
  assert.ok(pieces.helmet <= 25, "above 25 the helmet contributes round(herolevel * 0.5 * 10) instead");

  for (const id of HELMETED) {
    const { villain } = byId.get(id).scenario;
    assert.equal(villain.armourclass_max, 79, id);
    assert.equal(villain.armourclass, 79, id);
    for (const [piece, value] of Object.entries(pieces)) assert.equal(villain[piece], value, `${id}.${piece}`);
    // Per-piece `_defence` fields are staged only where remove_armour reads
    // them, because each staged field is one more value a foyer dump must match
    // - and `_defence` fields are not in the wrapper's default watch list, so
    // staging one obliges the session to extend `watchFields`.
    assert.equal(
      villain.helmet_defence,
      id.startsWith("candidate-armoured-removal-") ? Math.round(6 * 10) : undefined,
      id
    );
    assert.equal(
      villain.shoulderguard_defence,
      id.startsWith("candidate-armoured-removal-") ? Math.round(1 * 8) : undefined,
      id
    );
  }
});

test("the deflection pair measures a real threshold, and excludes every rival operand reading", () => {
  // battle map §Attack roll dispatcher: the critical-deflection threshold is
  // `(100 - 1.5 * game_defender.helmet) + game_defender.greaves`, and an
  // inclusive 1-100 roll AT OR ABOVE it clears the critical. The map flags the
  // operand mix as counterintuitive and asks for a fixture; against a defender
  // with neither piece the expression collapses to 100, which is why the
  // existing prisoner-staged pair could only bracket the degenerate value.
  const helmet = 6;
  const greaves = 2;
  const threshold = (100 - 1.5 * helmet) + greaves;
  assert.equal(threshold, 93);

  const critical = byId.get("candidate-armoured-deflection-threshold-critical");
  const cleared = byId.get("candidate-armoured-deflection-threshold-cleared");
  for (const fixture of [critical, cleared]) {
    assert.equal(fixture.expected.calculation.deflectionThreshold, 93, fixture.fixtureId);
    // Direction 5-8 draws its critical from randomBetween(1, 20) and a SURVIVING
    // 20 dispatches defender_hurt("critical") (battle map §Attack roll
    // dispatcher), so 20 is the only sample that makes the threshold visible.
    assert.equal(sampleByLabel(fixture, "normal-critical-roll").max, 20, fixture.fixtureId);
    assert.equal(fixture.expected.calculation.criticalSample, 20, fixture.fixtureId);
  }

  assert.equal(sampleByLabel(critical, "critical-deflection-roll").value, 92);
  assert.equal(critical.expected.calculation.criticalCleared, false);
  assert.equal(critical.expected.calculation.dispatchedMethod, "critical");
  assert.equal(sampleByLabel(cleared, "critical-deflection-roll").value, 93);
  assert.equal(cleared.expected.calculation.criticalCleared, true);
  assert.equal(cleared.expected.calculation.criticalSampleAfterDeflection, 0);
  assert.equal(cleared.expected.calculation.dispatchedMethod, "normal");

  // A bracket, not a demonstration: 92 and 93 are adjacent, so the pair pins the
  // smallest clearing roll to a single integer, and that integer excludes every
  // other way the two operands could combine.
  const rivals = {
    "1.5 applied to both pieces": 100 - 1.5 * (helmet + greaves),
    "greaves subtracted instead of added": (100 - 1.5 * helmet) - greaves,
    "1.5 applied to greaves, not helmet": (100 - helmet) + 1.5 * greaves,
    "no 1.5 factor at all": (100 - helmet) + greaves,
    "operands swapped": (100 - 1.5 * greaves) + helmet
  };
  for (const [reading, value] of Object.entries(rivals)) {
    assert.notEqual(value, threshold, `${reading} must be a distinguishable reading`);
    assert.ok(value < 92 || value > 93, `the 92/93 bracket must exclude ${reading} (${value})`);
  }
});

test("the deflection pair is sharper against armour: the surviving critical bypasses it", () => {
  // battle map §Hit and damage path: "critical damage bypasses that armour-class
  // branch". Against the unarmoured prisoner that rule is invisible, because
  // there is no armour branch to bypass. Here the two arms take physically
  // different paths for the SAME 22 damage.
  const critical = byId.get("candidate-armoured-deflection-threshold-critical");
  const cleared = byId.get("candidate-armoured-deflection-threshold-cleared");

  assert.equal(critical.expected.calculation.effectiveDamageMethod, "critical");
  assert.equal(critical.expected.mutation.armourDamage, 0);
  assert.equal(critical.expected.mutation.hitpointDamage, 22);
  assert.equal(critical.expected.state.villain.armourclass, 79);
  assert.equal(critical.expected.state.villain.hitpoints, 58);

  assert.equal(cleared.expected.calculation.effectiveDamageMethod, "normal");
  assert.equal(cleared.expected.mutation.armourDamage, 22);
  assert.equal(cleared.expected.mutation.hitpointDamage, 0);
  assert.equal(cleared.expected.state.villain.armourclass, 79 - 22);
  assert.equal(cleared.expected.state.villain.hitpoints, 80);

  // One injected value, three observed channels: the dispatched method, the
  // ordered mutations, and the final state.
  assert.deepEqual(critical.scenario, cleared.scenario);
  assert.deepEqual(labels(critical), labels(cleared));
  assert.deepEqual(
    differingObservedChannels(critical, cleared),
    ["events", "mutationTrace", "finalState"]
  );
  assert.deepEqual(deriveExpectedEventsFromSs2Fixture(critical)[0], {
    type: "defender-hurt",
    method: "critical"
  });
  assert.deepEqual(deriveExpectedEventsFromSs2Fixture(cleared)[0], {
    type: "defender-hurt",
    method: "normal"
  });
});

test("the removal pair destroys a real piece and pins the group's selector order", () => {
  // battle map §Hit and damage path: every physical damage invocation rolls an
  // inclusive 1-100 armour-removal chance and calls remove_armour when the roll
  // is GREATER THAN 66. §Spell-path reuse gives the direction-to-piece table:
  // directions 1, 5, 8, 9 select `armour_to_remove = randomBetween(1, 2)` over
  // helmet (`+0x0320`) then shoulderguard (`+0x050a`), IN THAT SELECTOR ORDER.
  // The existing prisoner-staged gate probe could only measure the draw count,
  // because the prisoner wears nothing; here the selection has consequences.
  const helmetArm = byId.get("candidate-armoured-removal-destroys-helmet");
  const shoulderArm = byId.get("candidate-armoured-removal-destroys-shoulderguard");

  assert.deepEqual(helmetArm.scenario, shoulderArm.scenario, "the arms must stage identically");
  for (const fixture of [helmetArm, shoulderArm]) {
    assert.equal(sampleByLabel(fixture, "armour-removal-roll").value, 67, fixture.fixtureId);
    assert.ok(67 > 66, "67 is the smallest roll that clears the gate");
    assert.deepEqual(sampleByLabel(fixture, "armour-selection-1").min, 1, fixture.fixtureId);
    assert.deepEqual(sampleByLabel(fixture, "armour-selection-1").max, 2, fixture.fixtureId);
  }
  assert.equal(sampleByLabel(helmetArm, "armour-selection-1").value, 1);
  assert.equal(sampleByLabel(shoulderArm, "armour-selection-1").value, 2);

  // Selection 1 -> helmet. Both armourclass and armourclass_max drop by the
  // piece's own defence, the piece field is zeroed, and the three cosmetic
  // debris rolls follow only because a piece was actually equipped
  // (battle map §RNG surface: destroy_armour consumes exactly three rolls, the
  // first facing-selected; the defender faces left, so it is RandomNumber(30)).
  assert.deepEqual(helmetArm.expected.mutation.armourRemovals, [{
    request: 1,
    selected: "helmet",
    removed: true,
    defenceRemoved: 60,
    debrisRolls: {
      horizontal: { source: "randomNumber", value: 10 },
      vertical: 5,
      rotation: 2
    }
  }]);
  assert.equal(helmetArm.expected.state.villain.helmet, 0);
  assert.equal(helmetArm.expected.state.villain.armourclass_max, 79 - 60);
  // 19 armour left cannot absorb 22, so the same hit now overflows by 3 - the
  // removal is visible twice over, in the piece and in the hitpoints.
  assert.equal(helmetArm.expected.mutation.hitpointDamage, 22 - 19);
  assert.equal(helmetArm.expected.state.villain.hitpoints, 77);

  // Selection 2 -> shoulderguard. 8 defence gone, 71 left, and the same 22
  // damage stays fully absorbed: hitpoints never move.
  assert.deepEqual(shoulderArm.expected.mutation.armourRemovals, [{
    request: 1,
    selected: "shoulderguard",
    removed: true,
    defenceRemoved: 8,
    debrisRolls: {
      horizontal: { source: "randomNumber", value: 10 },
      vertical: 5,
      rotation: 2
    }
  }]);
  assert.equal(shoulderArm.expected.state.villain.shoulderguard, 0);
  assert.equal(shoulderArm.expected.state.villain.armourclass_max, 79 - 8);
  assert.equal(shoulderArm.expected.mutation.hitpointDamage, 0);
  assert.equal(shoulderArm.expected.state.villain.hitpoints, 80);

  // The observed channels. Which piece vanished, by how much both armour totals
  // fell, and whether hitpoints moved at all - none of it echoed from the tape.
  assert.deepEqual(
    differingObservedChannels(helmetArm, shoulderArm),
    ["mutationTrace", "finalState"]
  );
  // If the direction-5 group were the MIDDLE one instead, selection 2 would
  // pick gauntlet (the opponent wears gauntlet 1, defence 5), not shoulderguard.
  // The opponent is deliberately outfitted so a wrong group mapping destroys a
  // different, differently-priced piece and the final state says so.
  assert.equal(shoulderArm.scenario.villain.gauntlet, 1);
  assert.notEqual(Math.round(1 * 5), Math.round(1 * 8));
});

test("the deflection threshold is computed before remove_armour can change the helmet", () => {
  // Ordering claim: checkattackroll's deflection test runs before
  // damagecharacter's removal roll (battle map §Attack roll dispatcher, then
  // §Hit and damage path), so the threshold reads the helmet the defender was
  // still wearing. The helmet-removal arm destroys a helmet 6 and still reports
  // the helmet-6 threshold; if the order were reversed it would report
  // (100 - 0) + 2 = 102.
  const helmetArm = byId.get("candidate-armoured-removal-destroys-helmet");
  assert.equal(helmetArm.expected.calculation.deflectionThreshold, 93);
  assert.equal(helmetArm.expected.state.villain.helmet, 0);
  assert.notEqual((100 - 1.5 * 0) + 2, 93);
});

/* ------------------------------------------------------------------------- *
 * Capture-window and tape discipline
 * ------------------------------------------------------------------------- */

test("every non-lethal tape is exactly the mapped roll order for a hitting direction-5 attack", () => {
  // A non-lethal action never reaches a `combatwon`/`combatlost` label, so the
  // wrapper's lethal close cannot fire; if its `checkattackroll` wrap did not
  // interpose, the only remaining close is the `nextphase` hook, which calls
  // finishTrace BEFORE nextphase's stamina and regeneration accounting so the
  // action's scope still matches this fixture's. The consequence for evidence:
  // the window may stay armed longer than the action, so the observed draw
  // count is the channel that says whether anything else drew inside it. The
  // wrapper reports extra draws as `overdraw` on the end line.
  const base = [
    "hit-roll",
    "normal-damage-roll",
    "normal-critical-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "knockback-roll",
    "enchantment-potency-roll"
  ];
  const withRemoval = [
    "hit-roll",
    "normal-damage-roll",
    "normal-critical-roll",
    "critical-deflection-roll",
    "armour-removal-roll",
    "armour-selection-1",
    "armour-debris-1-x",
    "armour-debris-1-y",
    "armour-debris-1-rotation",
    "knockback-roll",
    "enchantment-potency-roll"
  ];
  for (const id of POST_TUTORIAL_FAMILY) {
    const fixture = byId.get(id);
    assert.deepEqual(
      labels(fixture),
      id.startsWith("candidate-armoured-removal-") ? withRemoval : base,
      id
    );
    // Knockback is gated on 5 <= attack_direction <= 12 or 30 (battle map,
    // knockback dispatch gate), so direction 5 draws it; the roll is 1, below
    // the `randosmash > 3` force threshold, so no force is applied and the
    // knockback cannot perturb anything observable.
    assert.deepEqual(fixture.expected.mutation.knockback, { roll: 1, force: null, animation: false });
    // No enchantment on the capture gladiator's starting weapon, and the roll is
    // the largest the inclusive 1-100 draw can take, so no status is applied and
    // the final state carries no status flag that a death clear could hide.
    assert.equal(fixture.expected.mutation.statusApplied, null, id);
    assert.equal(sampleByLabel(fixture, "enchantment-potency-roll").value, 100, id);
  }
  // Cosmetic RandomNumber debris rolls are excluded from observation matching on
  // both sides, so the count a capture can be held to is the randomBetween one.
  assert.deepEqual(
    POST_TUTORIAL_FAMILY.map((id) => observedChannels(byId.get(id)).drawCount),
    [7, 7, 7, 7, 7, 7, 8, 8]
  );
});

test("no post-tutorial arm relies on an echoed sample value to tell its counterpart apart", () => {
  // The audit finding this discipline answers: the wrapper's roll lines are
  // copied from the injected tape, so a pair whose arms differ only in a sample
  // value compares a fixture against a copy of itself. Erasing the tape's
  // labels, bounds and values entirely must still leave every pair
  // distinguishable in a channel the game actually reports.
  const pairs = [
    [BRACKET.absorbed, BRACKET.equality],
    [BRACKET.equality, BRACKET.overflow],
    [BRACKET.absorbed, BRACKET.overflow],
    ["candidate-armoured-deflection-threshold-critical", "candidate-armoured-deflection-threshold-cleared"],
    ["candidate-armoured-removal-destroys-helmet", "candidate-armoured-removal-destroys-shoulderguard"]
  ];
  for (const [leftId, rightId] of pairs) {
    assert.ok(
      differingObservedChannels(byId.get(leftId), byId.get(rightId)).length > 0,
      `${leftId} vs ${rightId} agree on every observed channel and measure nothing`
    );
  }

  // ...and the check has teeth. "Simplify" the equality arm so it overflows like
  // its neighbours and the bracket's middle stops carrying information.
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const flattened = clone(byId.get(BRACKET.equality));
  flattened.expected.mutation.hitpointDamage = 0;
  flattened.expected.mutationTrace = clone(byId.get(BRACKET.absorbed).expected.mutationTrace);
  flattened.expected.mutationTrace[0].after = 0;
  flattened.expected.state = clone(byId.get(BRACKET.absorbed).expected.state);
  flattened.expected.state.villain.armourclass = 0;
  const stillAbsorbed = clone(byId.get(BRACKET.absorbed));
  stillAbsorbed.expected.mutationTrace[0].after = 0;
  stillAbsorbed.expected.state.villain.armourclass = 0;
  assert.deepEqual(
    differingObservedChannels(stillAbsorbed, flattened),
    [],
    "an equality arm that overflows like its neighbour measures nothing"
  );
});
