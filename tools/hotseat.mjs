/**
 * Hot-seat runner: the first thing in this repository a person can PLAY, and
 * since this change the first that plays SS2's OWN arithmetic.
 *
 * Two humans take turns at one keyboard. It drives `src/team/` directly and
 * touches `src/adapter/` not at all — the adapter's canonical resource bag
 * cannot carry an SS2 rule set's inputs (see `src/team/ss2-rules.js`). Node
 * builtins only; `package.json` has no dependencies and this must not add one.
 *
 * WHY THIS EXISTS. The resolver, the roster, the RNG channel, elimination and
 * settlement had all been tested for months and never once been played, and a
 * corpus of 22 runtime-verified goldens fed nothing. Until a person can watch a
 * fight, no measurement has a consumer and no priority has a source.
 *
 * IT DECIDES NO COMBAT. Every number on screen was decided and clamped by the
 * resolver running the INJECTED RULE SET. There is no formula here — the only
 * arithmetic below is array indexing and column widths. That is the same
 * boundary `src/adapter/` keeps, and for the same reason: a runner that quietly
 * did its own damage would make the rule set unfalsifiable.
 *
 * ON HONESTY. The banner names the rule set's verification tier on every run
 * and refuses to be subtle about it. `map-derived` is NOT `runtime-verified`,
 * and the banner says which parts of the fight have golden backing and which
 * have none. That confusion is the exact failure this whole project is built to
 * prevent, and a playable demo is the easiest place in the world to commit it.
 *
 * Usage:
 *   node tools/hotseat.mjs [--rules ss2|placeholder] [--seed <n>]
 *                          [--hp <n>] [--armour <n>] [--names A,B]
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  createTeamBattle,
  legalActions,
  applyAction,
  currentCombatant,
  combatantById,
  allCombatants,
  placeholderTeamRules,
  resourceValue,
  rngJournal,
  seatOf
} from "../src/team/index.js";
import { ss2Combatant, ss2TeamRules } from "../src/team/ss2-rules.js";

/**
 * Input that works both ways round.
 *
 * A terminal gets `readline`. A PIPE gets its lines read up front into a queue,
 * because a piped run is how this is tested and how a demo is recorded, and
 * readline's prompt loop does not reliably drain a pipe that has already
 * closed — measured: it consumed one line of eight and then hung on an
 * unsettled await. Answering EOF with `null` lets the loop exit cleanly instead
 * of dying with a warning.
 */
async function createPrompter() {
  if (input.isTTY) {
    const rl = createInterface({ input, output });
    return {
      ask: async (question) => rl.question(question),
      close: () => rl.close()
    };
  }
  const chunks = [];
  for await (const chunk of input) chunks.push(chunk);
  const queue = chunks.join("").split("\n");
  return {
    ask: async (question) => {
      output.write(question);
      if (queue.length === 0) return null;
      const line = queue.shift();
      output.write(`${line}\n`);
      return line;
    },
    close: () => {}
  };
}

/* ------------------------------------------------------------------ */
/* Argument parsing                                                    */
/* ------------------------------------------------------------------ */

/** The rule sets a player may inject, by name. */
const RULE_SETS = Object.freeze({
  ss2: ss2TeamRules,
  placeholder: placeholderTeamRules
});

function parseArgs(argv) {
  const options = { seed: 1, hp: 60, armour: 0, rules: "ss2", names: ["Player 1", "Player 2"] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${flag} needs a value.`);
      index += 1;
      return value;
    };
    if (flag === "--seed") options.seed = Number(next());
    else if (flag === "--hp") options.hp = Number(next());
    else if (flag === "--armour") options.armour = Number(next());
    else if (flag === "--rules") options.rules = next();
    else if (flag === "--names") options.names = next().split(",").map((part) => part.trim());
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown flag ${flag}. Try --help.`);
  }
  if (!Number.isInteger(options.seed)) throw new Error("--seed must be an integer.");
  if (!Number.isInteger(options.hp) || options.hp < 1) throw new Error("--hp must be a positive integer.");
  if (!Number.isInteger(options.armour) || options.armour < 0) {
    throw new Error("--armour must be a non-negative integer.");
  }
  if (!Object.hasOwn(RULE_SETS, options.rules)) {
    throw new Error(`--rules must be one of: ${Object.keys(RULE_SETS).join(", ")}.`);
  }
  if (options.names.length !== 2 || options.names.some((name) => name === "")) {
    throw new Error("--names needs exactly two non-empty names, comma separated.");
  }
  return options;
}

const USAGE = `
Hot-seat: two humans, one keyboard, one fight.

  node tools/hotseat.mjs [options]

  --rules <name> ss2 (default) plays the map-derived SS2 arithmetic;
                 placeholder plays the invented approximation
  --seed <n>     RNG seed; the same seed and the same choices replay exactly
  --hp <n>       starting health for both fighters (default 60). In the build
                 this is DERIVED (herolevel * 10 + vitality * 20) and would be
                 recomputed by battlevalues; here it is staged directly.
  --armour <n>   give both fighters a breastplate and helmet of this grade
                 (default 0, no armour). SS2 subtracts damage from armour
                 first and carries only the overflow into health.
  --names A,B    fighter names (default "Player 1,Player 2")
  --help         this text
`;

/* ------------------------------------------------------------------ */
/* Presentation — no combat decisions live here                        */
/* ------------------------------------------------------------------ */

const BAR_WIDTH = 24;

function healthBar(combatant) {
  const maximum = combatant.maxHealth > 0 ? combatant.maxHealth : 1;
  const ratio = Math.max(0, Math.min(1, combatant.health / maximum));
  const filled = Math.round(ratio * BAR_WIDTH);
  return `[${"#".repeat(filled)}${".".repeat(BAR_WIDTH - filled)}]`;
}

/**
 * One pool, read straight off the projection. Shown only when the rule set's
 * blueprint actually declared it, so the placeholder's scoreboard is unchanged.
 */
function poolColumn(combatant, name, maxName) {
  if (!Object.hasOwn(combatant.resources ?? {}, name)) return "";
  const value = resourceValue(combatant, name, 0);
  const maximum = resourceValue(combatant, maxName, 0);
  return `  ${name} ${String(value).padStart(3)}/${String(maximum).padEnd(3)}`;
}

function renderScoreboard(battle) {
  const lines = [];
  for (const combatant of allCombatants(battle)) {
    const down = combatant.alive ? "" : "  (down)";
    const health = `${String(combatant.health).padStart(4)}/${String(combatant.maxHealth).padEnd(4)}`;
    const armour = poolColumn(combatant, "armourclass", "armourclass_max");
    const stamina = poolColumn(combatant, "staminaleft", "staminamax");
    const status = combatant.status.length > 0 ? `  [${combatant.status.join(" ")}]` : "";
    lines.push(
      `  ${combatant.name.padEnd(12)} ${healthBar(combatant)} ${health}${armour}${stamina}${status}${down}`
    );
  }
  return lines.join("\n");
}

/**
 * Describes what the resolver actually applied, from `battle.lastResolution`.
 * Reads the record; computes nothing.
 */
function renderResolution(battle, before) {
  const resolution = battle.lastResolution;
  if (!resolution) return "  (nothing resolved)";
  // The rule set's own verdict, read — never recomputed. This block used to
  // derive "missed" from `effect.amount === 0`, which is a COMBAT DECISION and
  // was wrong: an armour-absorbed hit deals zero hitpoint damage, so every one
  // of them was announced as a miss while the derivation line printed two
  // lines above said HIT. A verifier measured 68 of them in six seeds at
  // `--armour 4`, and none at `--armour 0` — a defect this change's own new
  // flag made reachable.
  const attack = resolution.events?.find((event) => typeof event.hit === "boolean") ?? null;
  const lines = [];
  for (const effect of resolution.effects ?? []) {
    const target = combatantById(battle, effect.targetId);
    const name = target?.name ?? effect.targetId;
    if (effect.kind === "damage") {
      const was = before.get(effect.targetId);
      const now = target?.health ?? 0;
      if (attack && attack.hit === false) lines.push(`  ${name} is missed`);
      else if (effect.amount === 0) lines.push(`  ${name} is hit, and the blow is stopped by armour`);
      else lines.push(`  ${name} takes ${effect.amount} damage  (${was} -> ${now})`);
    } else if (effect.kind === "heal") {
      lines.push(`  ${name} recovers ${effect.amount}`);
    } else if (effect.kind === "status") {
      lines.push(`  ${name} ${effect.active === false ? "loses" : "gains"} status "${effect.status}"`);
    } else if (effect.kind === "resource") {
      lines.push(`  ${name} ${effect.resource} -> ${effect.to}`);
    }
  }
  if (lines.length === 0) lines.push("  no effect");
  // The resolver stamps the knockout onto `battle.events`, not onto the rule
  // set's own event list, and its wire token is `defeated` — the constant is
  // named COMBATANT_DEFEATED but the string is the historical one network
  // clients already key off. This block read `"combatant-defeated"` and
  // `event.combatantId`, so it matched nothing and printed nothing; both are
  // taken from the constant and from `resolution.knockouts` now.
  for (const knockedOut of resolution.knockouts ?? []) {
    lines.push(`  *** ${combatantById(battle, knockedOut)?.name ?? knockedOut} is down ***`);
  }
  return lines.join("\n");
}

/**
 * The one line a player needs to see the rule set's reasoning: what it rolled,
 * what it needed, and which of SS2's twelve directions the build drew. Reads
 * the event; computes nothing. Absent for rule sets that publish no such event.
 */
function renderDerivation(battle) {
  const event = battle.lastResolution?.events?.[0];
  if (!event || event.attackDirection === undefined) return "";
  const outcome = event.hit ? `HIT (${event.dispatchedMethod})` : "miss";
  return `  direction ${event.attackDirection}   chance ${event.chance}%   ` +
    `rolled ${event.diceroll} vs ${event.rollNeeded}   ${outcome}`;
}

function describeOption(battle, option) {
  const target = combatantById(battle, option.targetId);
  const targetName = target?.name ?? option.targetId;
  const spell = option.spellKind ? ` (${option.spellKind})` : "";
  return `${option.type}${spell} -> ${targetName}`;
}

/* ------------------------------------------------------------------ */
/* The loop                                                            */
/* ------------------------------------------------------------------ */

/** The placeholder's fighter: invented stats for an invented rule set. */
function buildPlaceholderFighter(id, name, hp) {
  return {
    id,
    name,
    controller: "local",
    stats: { strength: 10, agility: 10, attack: 40, defense: 0, vitality: 0, stamina: 5, magicka: 0 },
    loadout: { meleeDamage: 12, rangedDamage: 8, canUseRanged: false, canUseSpell: false, canHeal: false },
    maxHealth: hp,
    health: hp
  };
}

/**
 * The SS2 fighter: base stats and equipment, with every derived number — the
 * damage pair, the eight per-piece defences, the armour and stamina pools —
 * computed by the build's own `battlevalues`, not typed in here.
 *
 * The base stats below are an ARBITRARY, SYMMETRIC starting gladiator chosen so
 * a demo fight lasts a few turns. They are not a measured character; nothing in
 * the corpus says what a hot-seat duellist should be. `--hp` and `--armour`
 * move them.
 */
function buildSs2Fighter(id, name, hp, armour) {
  const source = ss2Combatant(
    {
      strength: 5,
      speed: 5,
      attack: 5,
      defence: 5,
      vitality: 3,
      stamina: 4,
      magicka: 0,
      charisma: 3,
      herolevel: 3,
      character_level: 3,
      weapon_min_damage: 3,
      weapon_max_damage: 6,
      breastplate: armour,
      helmet: armour,
      gladiator_dir: id === "p1" ? "right" : "left"
    },
    { id, name, controller: "local" }
  );
  // `--hp` stages `hitpointsmax` directly. `maximumHealth` returns a declared
  // maxHealth verbatim precisely so a staged one is never quietly overruled.
  source.maxHealth = hp;
  source.health = hp;
  return source;
}

function banner(battle) {
  const descriptor = battle.rulesDescriptor;
  const goldens = descriptor.goldenFixtureIds.length;
  const rule = `rule set: ${descriptor.id}   verification: ${descriptor.verification}`;
  const warning = descriptor.verification === "runtime-verified"
    ? `  Backed by ${goldens} golden fixture(s) from the licensed build.`
    : descriptor.verification === "map-derived"
      ? "  *** MAP-DERIVED, NOT RUNTIME-VERIFIED. The attack arithmetic was read out\n" +
        `  *** of the licensed build's bytecode and replays against ${goldens} promoted\n` +
        "  *** goldens for attack directions 1-12. The stamina economy, the action\n" +
        "  *** legality and the AI around it have NO runtime backing at all, and no\n" +
        "  *** capture has ever observed this module driving a fight."
      : "  *** NOT SS2 BEHAVIOUR. These numbers are an invented approximation and\n" +
        "  *** must never be quoted as Swords & Sandals II parity.";
  return [
    "=".repeat(66),
    "  SWORDS & SANDALS II — multiplayer foundation — HOT SEAT",
    "=".repeat(66),
    `  ${rule}`,
    warning,
    descriptor.note ? `  note: ${descriptor.note}` : "",
    "=".repeat(66)
  ].filter(Boolean).join("\n");
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const rules = RULE_SETS[options.rules];
  const buildFighter = options.rules === "ss2"
    ? (id, name) => buildSs2Fighter(id, name, options.hp, options.armour)
    : (id, name) => buildPlaceholderFighter(id, name, options.hp);
  const battle = createTeamBattle({
    seed: options.seed,
    rules,
    teams: [
      { id: "red", combatants: [buildFighter("p1", options.names[0])] },
      { id: "blue", combatants: [buildFighter("p2", options.names[1])] }
    ]
  });

  console.log(banner(battle));
  console.log(`\n  seed ${battle.seed} — the same seed and the same choices replay exactly.\n`);

  const prompter = await createPrompter();
  try {
    while (battle.result === null) {
      const actor = currentCombatant(battle);
      if (!actor) break;
      const options_ = legalActions(battle);
      if (options_.length === 0) {
        console.log("\nNo legal action available — the fight cannot continue.");
        break;
      }

      console.log(`\n--- turn ${battle.turnNumber} — ${actor.name} (seat ${seatOf(battle, actor.id)}) ---`);
      console.log(renderScoreboard(battle));
      console.log("\n  actions:");
      options_.forEach((option, index) => {
        console.log(`    ${index + 1}) ${describeOption(battle, option)}`);
      });

      const raw = await prompter.ask(`\n  ${actor.name}, choose 1-${options_.length} (or q to quit): `);
      if (raw === null) {
        console.log("\n  input ended before the fight did.");
        break;
      }
      const answer = raw.trim();
      if (answer.toLowerCase() === "q") {
        console.log("\nQuit. No result recorded.");
        return;
      }
      const choice = Number(answer);
      if (!Number.isInteger(choice) || choice < 1 || choice > options_.length) {
        console.log(`  "${answer}" is not one of 1-${options_.length}. Try again.`);
        continue;
      }

      const before = new Map(allCombatants(battle).map((c) => [c.id, c.health]));
      applyAction(battle, { actorId: actor.id, ...options_[choice - 1] });
      console.log("");
      const derivation = renderDerivation(battle);
      if (derivation) console.log(derivation);
      console.log(renderResolution(battle, before));
    }

    console.log("\n" + "=".repeat(66));
    console.log(renderScoreboard(battle));
    if (battle.result) {
      const winner = battle.teams.find((team) => team.id === battle.result.winnerTeamId);
      const names = winner ? winner.combatants.map((c) => c.name).join(", ") : battle.result.winnerTeamId;
      console.log(`\n  WINNER: ${names}   (${battle.result.reason})`);
    } else {
      console.log("\n  No result.");
    }
      // Printed from the JOURNAL, not from the cursor. The cursor is a counter the
    // runner could in principle move; the journal is the resolver's own ordered
    // record of every draw, so `journal.length === rngCursor` is a check that
    // the runner invented no roll. A test asserts the two agree.
    console.log(
      `  turns: ${battle.turnNumber}   rolls drawn: ${rngJournal(battle).length}   ` +
      `rng cursor: ${battle.rngCursor}`
    );
    console.log("=".repeat(66));
  } finally {
    prompter.close();
  }
}

await main();
