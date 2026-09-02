#!/usr/bin/env node
/**
 * Hot-seat runner: the first thing in this repository a person can PLAY.
 *
 * Two humans take turns at one keyboard. It drives `src/team/` directly and
 * touches `src/adapter/` not at all, because the adapter's canonical resource
 * bag cannot yet carry an SS2 rule set's inputs (see HANDOFF.md). Node builtins
 * only; `package.json` has no dependencies and this must not add one.
 *
 * WHY THIS EXISTS. The resolver, the roster, the RNG channel, elimination and
 * settlement have all been tested for months and never once been played. A
 * corpus of 22 runtime-verified goldens feeds nothing, and nothing feeds a
 * screen. Until a person can watch a fight, no measurement has a consumer and
 * no priority has a source. This closes that loop with the smallest thing that
 * could possibly work.
 *
 * IT DECIDES NO COMBAT. Every number on screen was decided and clamped by the
 * resolver running the INJECTED RULE SET. There is no formula here — the only
 * arithmetic below is array indexing and column widths. That is the same
 * boundary `src/adapter/` keeps, and for the same reason: a runner that quietly
 * did its own damage would make the rule set unfalsifiable.
 *
 * ON HONESTY. The banner names the rule set's verification tier on every run
 * and refuses to be subtle about it. A placeholder fight must never be mistaken
 * for measured SS2 behaviour — that confusion is the exact failure this whole
 * project is built to prevent, and a playable demo is the easiest place in the
 * world to commit it.
 *
 * Usage:
 *   node tools/hotseat.mjs [--seed <n>] [--hp <n>] [--names A,B]
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
  seatOf
} from "../src/team/index.js";

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

function parseArgs(argv) {
  const options = { seed: 1, hp: 60, names: ["Player 1", "Player 2"] };
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
    else if (flag === "--names") options.names = next().split(",").map((part) => part.trim());
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown flag ${flag}. Try --help.`);
  }
  if (!Number.isInteger(options.seed)) throw new Error("--seed must be an integer.");
  if (!Number.isInteger(options.hp) || options.hp < 1) throw new Error("--hp must be a positive integer.");
  if (options.names.length !== 2 || options.names.some((name) => name === "")) {
    throw new Error("--names needs exactly two non-empty names, comma separated.");
  }
  return options;
}

const USAGE = `
Hot-seat: two humans, one keyboard, one fight.

  node tools/hotseat.mjs [options]

  --seed <n>     RNG seed; the same seed and the same choices replay exactly
  --hp <n>       starting health for both fighters (default 60)
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

function renderScoreboard(battle) {
  const lines = [];
  for (const combatant of allCombatants(battle)) {
    const down = combatant.alive ? "" : "  (down)";
    const health = `${String(combatant.health).padStart(4)}/${String(combatant.maxHealth).padEnd(4)}`;
    lines.push(`  ${combatant.name.padEnd(12)} ${healthBar(combatant)} ${health}${down}`);
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
  const lines = [];
  for (const effect of resolution.effects ?? []) {
    const target = combatantById(battle, effect.targetId);
    const name = target?.name ?? effect.targetId;
    if (effect.kind === "damage") {
      const was = before.get(effect.targetId);
      const now = target?.health ?? 0;
      // A rule set reports a miss as a zero-amount damage effect rather than
      // by omitting it, so the effect list stays a faithful record of what was
      // attempted. Say "misses" instead of "takes 0 damage", which reads as a
      // bug to anyone playing.
      lines.push(effect.amount === 0
        ? `  ${name} is missed`
        : `  ${name} takes ${effect.amount} damage  (${was} -> ${now})`);
    } else if (effect.kind === "heal") {
      lines.push(`  ${name} recovers ${effect.amount}`);
    } else if (effect.kind === "status") {
      lines.push(`  ${name} ${effect.active === false ? "loses" : "gains"} status "${effect.status}"`);
    } else if (effect.kind === "resource") {
      lines.push(`  ${name} ${effect.resource} -> ${effect.to}`);
    }
  }
  for (const event of resolution.events ?? []) {
    if (event.type === "combatant-defeated") {
      const name = combatantById(battle, event.combatantId)?.name ?? event.combatantId;
      lines.push(`  *** ${name} is down ***`);
    }
  }
  if (lines.length === 0) lines.push("  no effect");
  return lines.join("\n");
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

function buildFighter(id, name, hp) {
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

function banner(battle) {
  const descriptor = battle.rulesDescriptor;
  const verified = descriptor.verification === "runtime-verified";
  const rule = `rule set: ${descriptor.id}   verification: ${descriptor.verification}`;
  const warning = verified
    ? `  Backed by ${descriptor.goldenFixtureIds.length} golden fixture(s) from the licensed build.`
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

  const battle = createTeamBattle({
    seed: options.seed,
    teams: [
      { id: "red", combatants: [buildFighter("p1", options.names[0], options.hp)] },
      { id: "blue", combatants: [buildFighter("p2", options.names[1], options.hp)] }
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
    console.log(`  turns: ${battle.turnNumber}   rolls drawn: ${battle.rngCursor}`);
    console.log("=".repeat(66));
  } finally {
    prompter.close();
  }
}

await main();
