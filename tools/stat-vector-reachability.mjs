/**
 * Which fixture hero vectors the game's own progression can actually reach.
 *
 *   node tools/stat-vector-reachability.mjs
 *
 * Derives, for every distinct `scenario.hero` in test/fixtures/ss2-1v1/, whether
 * some (creation vector, herolevel, point spend, weapon id, armour ids) produces
 * it, using only battlevalues' own formulas:
 *
 *   staminamax   = 100 + stamina * 10                        (+0x37b6)
 *   hitpointsmax = herolevel * 10 + vitality * 20            (+0x378e)
 *   min/max_damage = round(strength * 2) + weapon_min/max    (+0x3356, +0x3386)
 *   <piece>_defence = round(<piece> * <piece>_dval)          (+0x3480 onward)
 *   armourclass_max = sum of the eight <piece>_defence       (+0x3ac3)
 *
 * plus the progression budget: heroDNA seeds all eight stats at 1 (indices
 * 16-22), initwarrior grants 9 creation points, and each level-up grants
 * exactly 4 which the commit button will not release until all are spent. So a
 * character at herolevel L has stats summing to 13 + 4L, none below 1, and
 * after creation they only ever increase — the levelup panel has eight `+`
 * buttons and no refund.
 *
 * TWO KINDS OF REFUSAL, and the distinction is the point. `BLOCK*` is
 * ABSOLUTE: it holds for any character however built, because it contradicts a
 * derivation battlevalues runs on every call. Plain `BLOCK` holds for a
 * CREATED gladiator and not necessarily for a DNA-built one — the tutorial
 * prisoner's unleash_hell literal carries stamina 0 and strength 0, values no
 * creation route can reach.
 *
 * The weapon and armour tables are parsed out of
 * docs/integration/ss2-item-tables.md rather than restated, so this cannot drift
 * from the document that byte-verified them. Nothing here launches the game,
 * reads the installation or touches a save.
 */
import fs from "node:fs";
import path from "node:path";

// --- The weapon table, transcribed from docs/integration/ss2-item-tables.md §2.3/§2.4.
// id -> [type, min, max, itemlevel, gateAttribute]. Type 1 slashing, 2 bashing,
// 3 hacking, 4 ranged; the gate is `itemlevel <= speed` for slashing/ranged and
// `itemlevel <= strength` for hacking/bashing (§3.1).
const DOC = fs.readFileSync("docs/integration/ss2-item-tables.md", "utf8");
const WEAPONS = new Map();
for (const line of DOC.split("\n")) {
  // shop rows: | id | band | weap_i | itemlevel | gate | [0] | [3] | [4] | ...
  const shop = line.match(/^\| *(\d+) \| (slashing|bashing|hacking|ranged) \| *(\d+) \| *(\d+) \| `\w+ >= \d+` \| *(\d+) \| *(\d+) \| *(\d+) \|/);
  if (shop) {
    const [, id, band, , itemlevel, , min, max] = shop;
    WEAPONS.set(Number(id), {
      id: Number(id), band, min: Number(min), max: Number(max),
      itemlevel: Number(itemlevel),
      gate: band === "slashing" || band === "ranged" ? "speed" : "strength",
      shop: true
    });
    continue;
  }
  // §2.4 off-shop rows: | id | [0] | [2] | [3] | [4] | [5] | literal |
  const off = line.match(/^\| *(\d+) \| *(\d) \| *(\d+) \| *(\d+) \| *(\d+) \| *(\d+) \| `\+0x/);
  if (off) {
    const [, id, , , min, max] = off;
    WEAPONS.set(Number(id), { id: Number(id), band: "off-shop", min: Number(min), max: Number(max), shop: false });
  }
}

const DVAL = { breastplate: 16, helmet: 10, shinguard: 6, greaves: 3, shoulderguard: 8, gauntlet: 5, boot: 2, shield: 12 };

/**
 * Can `total` be written as a sum of round(n_p * dval_p), n_p in 0..26?
 *
 * A piece the fixture NAMES is pinned to the id it names rather than searched,
 * so the answer describes the fixture's own armour and not merely some armour
 * that would sum the same. Reporting a combination the fixture contradicts
 * would be worse than reporting nothing: it reads as corroboration.
 */
function armourReachable(total, hero = {}) {
  if (total === 0) return { ok: true, how: "no armour" };
  let reach = new Map([[0, []]]);
  for (const [piece, dval] of Object.entries(DVAL)) {
    if (hero[piece] !== undefined) {
      const contribution = Math.round(hero[piece] * dval);
      const next = new Map();
      for (const [sum, how] of reach) {
        const value = sum + contribution;
        if (value <= total) next.set(value, contribution === 0 ? how : [...how, `${piece}=${hero[piece]} (pinned, ${contribution})`]);
      }
      reach = next;
      continue;
    }
    const next = new Map();
    for (const [sum, how] of reach) {
      for (let n = 0; n <= 26; n += 1) {
        const s = sum + Math.round(n * dval);
        if (s > total || next.has(s)) continue;
        next.set(s, n === 0 ? how : [...how, `${piece}=${n}`]);
      }
    }
    reach = next;
  }
  return reach.has(total) ? { ok: true, how: reach.get(total).join(" ") } : { ok: false };
}

// Stats the fixture pins outright. `magicka` is absent from the whole
// attack-11/defence-11 family, so it is counted at its floor rather than
// skipped — leaving it out would understate the point budget those vectors need.
const PINNED = ["strength", "attack", "defence", "charisma", "magicka"];
const STAT_FLOOR = 1;

function analyse(hero) {
  const notes = [];
  const blockers = [];

  // staminamax = 100 + stamina * 10   (battlevalues +0x37b6)
  //
  // A stamina below 1 is NOT unreachable in general — the tutorial prisoner is
  // built from an unleash_hell DNA literal whose stamina is 0, and his
  // staminamax is the 100 the promoted goldens measured. It is unreachable for
  // a CREATED gladiator, whose eight stats start at 1 (heroDNA indices 16-22)
  // and can only be incremented afterwards. So it is reported as a
  // creation-route blocker, not an absolute one.
  let stamina = null;
  if (hero.staminamax !== undefined) {
    const raw = (hero.staminamax - 100) / 10;
    if (!Number.isInteger(raw)) blockers.push({ kind: "absolute", why: `staminamax ${hero.staminamax} is not 100 + 10*stamina` });
    else if (raw < STAT_FLOOR) blockers.push({ kind: "created-hero", why:
      `staminamax ${hero.staminamax} needs stamina ${raw}, below the created-gladiator floor of 1 ` +
      "(heroDNA seeds every stat at 1; createchar refunds stop there and the levelup panel has no " +
      "refund button at all). Reachable only for a DNA-built character, as the prisoner is" });
    else { stamina = raw; notes.push(`stamina ${stamina}`); }
  }

  // min/max_damage = 2*strength + weapon_min/max   (+0x3356, +0x3386)
  let weapon = null;
  if (hero.strength !== undefined && hero.min_damage !== undefined) {
    const wmin = hero.min_damage - 2 * hero.strength;
    const wmax = hero.max_damage - 2 * hero.strength;
    const rows = [...WEAPONS.values()].filter((w) => w.min === wmin && w.max === wmax);
    // UNCONDITIONAL. battlevalues reads weapon_min/max out of _root["weapon"+id]
    // for every character it is called on, so a damage pair no row produces is
    // out of reach however the character was built — created, DNA-built or
    // staged, since a staged min_damage is rewritten from the weapon id at the
    // next phase transition.
    if (rows.length === 0) blockers.push({ kind: "absolute", why:
      `damage ${hero.min_damage}/${hero.max_damage} at strength ${hero.strength} needs a weapon ` +
      `row (${wmin},${wmax}); none of the 90 ids in the build carries one` });
    else { weapon = rows; notes.push(`weapon ${rows.map((r) => `${r.id} (${r.band})`).join(" or ")}`); }
  }

  // Each pinned <piece>_defence must equal round(<piece> * dval) — battlevalues
  // rewrites the derived field from the id on every call, so a fixture stating
  // both is stating something the build can check.
  for (const [piece, dval] of Object.entries(DVAL)) {
    if (hero[piece] === undefined || hero[`${piece}_defence`] === undefined) continue;
    const derived = Math.round(hero[piece] * dval);
    if (derived !== hero[`${piece}_defence`]) {
      blockers.push({ kind: "absolute", why:
        `${piece} ${hero[piece]} derives ${piece}_defence ${derived}, not the ${hero[`${piece}_defence`]} pinned` });
    } else notes.push(`${piece}_defence ${derived} derives from ${piece} ${hero[piece]}`);
  }

  // armourclass_max = sum of the eight <piece>_defence   (+0x3ac3)
  if (hero.armourclass_max !== undefined) {
    const armour = armourReachable(hero.armourclass_max, hero);
    if (!armour.ok) blockers.push({ kind: "absolute", why: `armourclass_max ${hero.armourclass_max} is not a sum of round(n*dval)` });
    else notes.push(`armour ${armour.how}`);
  }

  // hitpointsmax = herolevel*10 + vitality*20 (+0x378e), and the point budget:
  // creation seeds 8 stats at 1 with 9 to spend (sum 17), each level adds 4.
  const solutions = [];
  const pinnedSum = PINNED.reduce((sum, k) => sum + (hero[k] ?? STAT_FLOOR), 0);
  // The budget is checked even when stamina is out of reach, so a vector that
  // fails on two independent grounds is reported as failing on two.
  if (hero.hitpointsmax !== undefined) {
    let anyLevel = false;
    for (let herolevel = 1; herolevel <= 50; herolevel += 1) {
      const vitality = (hero.hitpointsmax - herolevel * 10) / 20;
      if (!Number.isInteger(vitality) || vitality < STAT_FLOOR) continue;
      // 8 stats seeded at 1 plus 9 creation points, then 4 per level gained.
      const budget = 13 + 4 * herolevel;
      const floorNeed = pinnedSum + vitality + Math.max(stamina ?? STAT_FLOOR, STAT_FLOOR) + STAT_FLOOR;
      if (floorNeed <= budget) anyLevel = true;
    }
    if (!anyLevel) blockers.push({ kind: "created-hero", why:
      `no herolevel satisfies hitpointsmax = 10*L + 20*vitality together with the point budget ` +
      `13 + 4L: the pinned stats alone need ${pinnedSum} of it before vitality, stamina and speed` });
  }
  if (hero.hitpointsmax !== undefined && stamina !== null && PINNED.every((k) => hero[k] !== undefined)) {
    for (let herolevel = 1; herolevel <= 50; herolevel += 1) {
      const vitality = (hero.hitpointsmax - herolevel * 10) / 20;
      if (!Number.isInteger(vitality) || vitality < 1) continue;
      const budget = 13 + 4 * herolevel;                      // 17 at level 1, +4 per level
      const spoken = PINNED.reduce((sum, k) => sum + hero[k], 0) + stamina + vitality;
      const speed = budget - spoken;                          // the one free stat
      if (speed < 1) continue;
      if (weapon && weapon.every((w) => w.shop && w.gate === "speed" && w.itemlevel > speed)) continue;
      if (weapon && weapon.every((w) => w.shop && w.gate === "strength" && w.itemlevel > hero.strength)) continue;
      solutions.push({ herolevel, vitality, speed, budget });
    }
  }
  return { notes, blockers, solutions, stamina };
}

const dir = "test/fixtures/ss2-1v1";
const groups = new Map();
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  const key = JSON.stringify(fixture.scenario.hero);
  if (!groups.has(key)) groups.set(key, { hero: fixture.scenario.hero, ids: [] });
  groups.get(key).ids.push(fixture.fixtureId.replace("candidate-", ""));
}

console.log(`weapon rows parsed: ${WEAPONS.size} (${[...WEAPONS.values()].filter((w) => w.shop).length} shop)\n`);
for (const { hero, ids } of [...groups.values()].sort((l, r) => r.ids.length - l.ids.length)) {
  const { notes, blockers, solutions, stamina } = analyse(hero);
  const sig = PINNED.every((k) => hero[k] !== undefined)
    ? `atk ${hero.attack} def ${hero.defence} str ${hero.strength} cha ${hero.charisma} mag ${hero.magicka}`
    : `magicka-only (${Object.keys(hero).join(",")})`;
  console.log(`${ids.length} fixture(s)  ${sig}  hpmax ${hero.hitpointsmax} stmax ${hero.staminamax}`);
  console.log(`   ${ids.slice(0, 4).join(", ")}${ids.length > 4 ? ` … +${ids.length - 4}` : ""}`);
  for (const note of notes) console.log(`   ok    ${note}`);
  for (const blocker of blockers) {
    console.log(`   ${blocker.kind === "absolute" ? "BLOCK*" : "BLOCK "} ${blocker.why}`);
  }
  if (solutions.length) {
    const show = solutions.slice(0, 3).map((s) => `L=${s.herolevel} vit=${s.vitality} speed=${s.speed}`);
    console.log(`   REACHABLE at ${solutions.length} level(s): ${show.join(" | ")}${solutions.length > 3 ? " …" : ""}`);
    const best = solutions[0];
    // Any creation vector <= the target with all stats >= 1 and sum 17 works;
    // this prints one, spending the surplus greedily off the largest stats.
    const target = { ...Object.fromEntries(PINNED.map((k) => [k, hero[k] ?? STAT_FLOOR])),
      vitality: best.vitality, stamina, speed: best.speed };
    const creation = { ...target };
    let surplus = Object.values(target).reduce((a, b) => a + b, 0) - 17;
    for (const [k, v] of Object.entries(creation).sort((l, r) => r[1] - l[1])) {
      const take = Math.min(surplus, v - STAT_FLOOR);
      creation[k] = v - take;
      surplus -= take;
    }
    const spend = Object.entries(target)
      .filter(([k]) => target[k] !== creation[k])
      .map(([k]) => `${k} +${target[k] - creation[k]}`);
    console.log(`         create ${Object.entries(creation).map(([k, v]) => `${k[0]}${k[1]}${v}`).join(" ")} (sum 17)`);
    console.log(`         then spend over ${best.herolevel - 1} level(s): ${spend.join(", ") || "nothing"}`);
  }
  console.log();
}
