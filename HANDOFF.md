# Transfer handoff — SS2 Team Arena Foundation

## Capture campaign state (2026-08-30, latest)

Read this section first. Two full attack bands are runtime-verified, capture
runs are unattended and take ~14 seconds each, and the campaign has moved from
*confirming* candidates to *measuring* the build.

### What is promoted

Eight goldens, all from one staged fight (the tutorial prisoner):

- `golden-prisoner-normal-kill`, `-dir5`, `-dir6`, `-dir8` — the normal band
- `golden-prisoner-power-kill-dir9`, `-dir10`, `-dir11`, `-dir12` — the power band

The power band is the stronger evidence and the reason matters. Its candidates
were derived from the battle map by an author with no access to any capture,
and committed before a single power session ran; eight later sessions matched
them exactly, none diverging. The normal band's candidates were authored *from*
captures, so each one's first observation confirmed nothing — it is what the
candidate was fitted to. Prefer the power band as the model for how to do this.

### How to run it

```
powershell -File tools\runtime-capture\run-capture.ps1 `
  -FixturePath test\fixtures\ss2-1v1\<candidate>.json `
  -SessionId <unique> -ObservationId <unique>

powershell -File tools\runtime-capture\run-campaign.ps1 `
  -Family prisoner-power-kill -Autopilot "walkright*5,power_attack" `
  -Rounds 12 -StopWhenComplete
```

`run-campaign.ps1` loops sessions until every attack direction in a family has
a golden. It exists because the wrapper **observes** `attack_direction` rather
than forcing it: the game draws it (`randomBetween(5,8)` for normal, `(9,12)`
power, `(1,4)` quick) before the recording window arms, so which candidate a
run is evidence for is only known once the trace is read. `campaign.mjs
ingest-round` therefore ingests each session against every candidate in the
family and keeps the one that MATCHES.

Speed: a round is ~14s, down from 66s, because the player frame rate is locked
to 960. That is a time dilation, not a frame shortcut — every frame still
executes in order — and it was validated by capturing six sessions at 120/240/
480/960 against already-promoted candidates and confirming all six matched.
Measured curve: 30fps 66s, 120 23.7s, 240 18s, 480 18.3s, 960 14.3s. It
plateaus because Ruffle goes CPU-bound near 300 effective fps and ~7s of each
round is fixed setup.

### What a capture actually proves — read before trusting a golden

An adversarial pass could not break the arithmetic but did break the
provenance claim. The details are in the runtime-capture doc under "What a
match actually establishes"; the short version:

- **Genuinely observed:** the ordered mutation trace, the semantic events
  (including hit-vs-miss and the dispatched method), the final state, the
  observed attack direction and fight mode, and the *number* of draws.
- **Echoed, not observed:** every `roll` line's label, bounds, value and call
  site. The wrapper serves its tape from a tap on `Math.random`, which takes no
  arguments, so those fields are copied from the candidate under test. The
  sample comparison can only fail on draw count.
- **Never compared at all:** `expected.calculation` and `expected.mutation`.
- Two chain weaknesses: the simulated-evidence rejection is one editable string
  in the trace meta line (a synthetic trace with it rewritten reproduces a
  committed observation's digest byte for byte), and session independence is
  two operator-supplied strings.

Two blind spots were closed in code: the wrapper now reports `overdraw`, the
count of draws made after the tape ran out — previously invisible, because
those fall through to the live RNG and are logged only as `dbg` lines that
`delog` strips — and ingest refuses a nonzero count as the divergence it is.
It also mints a `launchNonce` the operator does not supply.

### The probes — measurement rather than agreement

Ten fixtures in five pairs (`candidate-probe-*`), each differing in exactly one
injected value and predicted to differ in a genuinely observed channel. All ten
captured and matched. What they measured:

- **`rollneeded` bracketed to a single integer per band**: quick misses at 26
  and hits at 27, normal 43/44, power 62/63. All three match
  `round(ratio * 100 * K)`. Because 44 hits while 43 misses, the comparison is
  `diceroll >= rollneeded`, not `>` — previously indistinguishable.
- **The critical-deflection threshold is exactly 100, inclusive.** Both arms
  ran at hit-roll 50 direction 5 and differ in one field: deflection roll 99
  dispatches `critical`, roll 100 dispatches `normal`. Everything else is
  byte-identical.
- **The armour-selection draw is consumed before the equipped test**: removal
  roll 66 gives 7 draws, roll 67 gives 8, the extra being `armour-selection-1`
  burned on a defender wearing nothing.
- Two unplanned findings: a miss consumes only the pre-dispatch draws (3 normal,
  2 power/quick), so damage and the critical sample are derived before the hit
  test and the runtime does not short-circuit; and the quick band draws no
  knockback roll while normal and power do, independently confirming the
  directions 5–12 knockback gate.

### Non-negotiable rules (learned the hard way)

- The licensed SWFs are read-only and hash-verified before and after every
  capture. Never copy, export or commit game assets, extracted scripts, or
  original files.
- **Never shortcut the game's own frames.** Jumping past the prologue once
  tripped the game's character-tampering screen. The prologue is not a
  cutscene: it skins the hero and builds the villain via `unleash_hell(0)`.
  Locking the frame rate is fine — every frame still runs.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  independent sessions. Never hand-write a golden or an observation.
- Derive candidates from the battle map, never from a capture. Otherwise the
  later capture confirms a fit rather than a prediction.
- `tools\runtime-capture\validate-vehicle.ps1` must PASS after ANY wrapper edit.
- Snapshot before risky work: `tools\runtime-capture\save-state.ps1 snapshot
  <name>`. Known-good: `verified-good-1701`, `pre-arena-path`. It refuses to
  run while Ruffle is open.

### Known broken / in flight

- **`-SaveDirectory` is not usable yet.** Its protective half is verified — a
  session with its own store provably cannot touch the real save — but Ruffle
  wrote a fresh empty store rather than reading the seeded copy, so the
  navigator found no gladiator and stalled on the slot screen. Parallel capture
  is blocked on understanding that.
- The wrapper emits `spell_id`, and the pipeline projects it, but no spell
  capture has been attempted.

### The next move, and why

The tutorial-prisoner staging is close to exhausted: it produced the eight
goldens and the ten probe arms, and **22 of the 47 candidates are unreachable
from it**. They need armour on a combatant (the deflection threshold is always
100 here because helmet and greaves are 0), the bow weapon mode (the archer
controllers, and with them bombard/snipe/bash), a `tournament` fight mode (the
defeat gate ends any non-tournament fight on the first hit that reaches
hitpoints), or the spell ingress.

All of those need **a gladiator past level 1 fighting in the ordinary arena**,
which also removes the prologue entirely, since `daybreak` only routes a
level-1 hero to the dungeon. That requires following the game's own win →
reward → level-up → foyer chain, including whatever decision the level-up
screen demands — an unattended run must answer it identically every time or
captures stop being reproducible. That route is being mapped from the bytecode
into `docs/integration/ss2-arena-route.md`.

## On the PC with Swords & Sandals II installed

1. Preferred: copy `ss2-team-arena-foundation.bundle` to the new PC and run
   `git clone ss2-team-arena-foundation.bundle ss2-team-arena-foundation`.
   This preserves the complete commit history.
2. Alternative: extract the transfer ZIP into a new local Codex project folder.
3. Open that folder as the project, then continue this Codex task and say that
   the licensed game is installed.
4. Give Codex permission to read the game's installation directory when asked.
   Do not copy, upload, or redistribute the original SWF or assets.
5. Run `npm test` from this folder to confirm the transferred foundation.

## What Codex should inspect first

Locate the licensed Swords & Sandals Classic Collection installation and identify
the S&S II SWF and any S&S II mod folders. The adapter work starts by mapping
the vanilla battle entry point, player/opponent state objects, random-number
generation, combat formulas, result callback, and battle movie clips.

## Scope already completed

**The combat core is `src/team/`, not `src/engine.js`.** One shared resolver
serves 1v1, 2v2 and 3v3 — there is no second code path for 1v1 — with team
elimination, AI fill, controller identity independent of combatant identity,
and a campaign settlement that fires exactly once, after a whole team is down
*and* the final animation is acknowledged. `src/engine.js` is now a
compatibility facade over it, preserving the historical deterministic replay,
wire snapshots and state hashes; that equivalence was checked across 200
blueprints against the pre-refactor engine, not assumed.

Formulas are injected through the rule-set seam (`src/team/rule-set.js`), and
the seam is gated: a rule set may only claim `runtime-verified` if it pins the
build SHA-256 *and* cites a promoted golden. `classicStyleRules` is unchanged,
byte-identical to its original formulas, and still the only rule set —
explicitly a placeholder. **Nothing measured has been dropped into the seam
yet.** Eight goldens satisfy the gate's form, not its substance.

`src/adapter/` is the SS2 seam: it converts vanilla combatant state to
canonical state and back, dispatches presentation, and produces the result
acknowledgement — and it decides no combat, which is enforced by shape rather
than convention (every vanilla write mirrors the resolver's post-action
projection, never `before - effect`). It reconciles 3v3 with a two-sided
vanilla surface by treating hero/villain as a *binding* rebound per action
rather than a roster.

There are two isolated candidate families: the physical attack ingress
(`src/golden/ss2-attack-candidate.js`) and the spell ingress
(`src/golden/ss2-spell-candidate.js`, byte-verified from
`magic_damage_character`), registered separately and asserted disjoint. The
whole capture pipeline — digested observation records, raw-trace ingestion,
the two-independent-session promotion gate, preserved divergence reports, a
never-promotable reference simulator, and the campaign driver — is in place
and covered by tests. The delivery target remains 2v2 and 3v3 cooperative
campaign support; see `docs/roadmap.md`.

A separate design track is researching endless progression in
`docs/design/endless-progression-brief.md`. It is deliberately disjoint from
this work: design must never flow into candidate authoring, or a capture
confirms a fit rather than a prediction.

## Keep the project lawful and reversible

Use only a licensed local copy for inspection. Keep originals untouched, work in
a separate mod folder, and distribute patches or independently authored files
rather than the original game files or assets.
