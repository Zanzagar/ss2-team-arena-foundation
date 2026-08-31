# SS2 controlled runtime-capture workflow

Status: capture, verification, and promotion landed 2026-08-30 and are fully
covered by tests. The loop runs unattended end to end, and since `e4d02a3` it
runs **concurrently** as well. **22 fixtures are promoted** to runtime-observed
goldens in `test/fixtures/ss2-1v1-golden/`: twelve prisoner kills covering all
twelve melee attack directions (the normal, power and quick bands) and ten
probe arms that measure `rollneeded` per band, the critical-deflection
threshold, and the armour-selection draw. Each cleared the same gate — at least
two matching observations from at least two independent sessions. The other 33
committed fixtures are still `classification: "candidate"`.

Two things a reader must not take from that status, both corrected in place
below: the mutation trace's **hook attribution** is a much weaker claim than the
trace itself, and was compared to nothing at all until 2026-08-31
([what an attributed mutation means](#what-an-attributed-mutation-means)), and
**`attackerSide` is a launcher FlashVar that the arena route got wrong nine
times in twenty armed rounds**
([the attacker side is declared, not observed](#the-attacker-side-is-declared-not-observed)).

This document is the operating procedure
for Stage 3 of [the roadmap](../roadmap.md): promoting static candidates to
runtime-observed goldens with repeated evidence from the licensed local build
in [`ss2-build-fingerprint.json`](ss2-build-fingerprint.json).

## Boundary

- The installed SWFs are read in place and stay byte-identical; the pinned
  SHA-256 hashes are rechecked before and after every capture session, and both
  attestations are mandatory fields of every observation and manifest.
- No original SWF, extracted script, artwork, audio, screenshot, or install
  path enters the repository. Committed records contain only independently
  authored numeric state, ordered RNG samples with structural call-site
  identifiers, ordered mutations, semantic events, and SHA-256 digests.
- Raw instrumentation traces stay in the ignored `captures/` directory.
- The unrelated third-party SWF previously found in Downloads is not evidence
  and must not be captured.
- `classicStyleRules` stays the injected placeholder rule set, with its
  formulas untouched, until a runtime-verified rule set is promoted into the
  shared team resolver's seam (`src/team/rule-set.js`). The seam exists now;
  nothing measured has been dropped into it, and the verified-claim gate
  refuses to let a rule set say otherwise without citing a promoted golden.

## Pipeline

```text
licensed build (read-only, hash-checked)
  -> instrumented controlled 1v1 action
  -> raw JSONL trace                     captures/ (ignored)
  -> tools/capture-session.mjs ingest
  -> observation record (digested)       test/observations/ss2-1v1/
  -> tools/capture-session.mjs verify
       match    -> repeat in a second independent session
       diverge  -> divergence report     test/fixtures/ss2-1v1-divergences/
  -> tools/capture-session.mjs promote   (needs >= 2 matching observations
       from >= 2 sessions + manifest)
  -> golden fixture                      test/fixtures/ss2-1v1-golden/
```

Module responsibilities:

| File | Responsibility |
| --- | --- |
| `src/golden/observation.js` | observation schema/digests, comparison projection, observation-vs-observation and observation-vs-fixture matching |
| `src/golden/capture-ingest.js` | raw JSONL trace normalization, mutation-chain and final-state integrity checks, the mandatory over-draw guard, and carrying the three `end`-line attestations into `capture.*` |
| `src/golden/promote-1v1-golden.js` | capture-manifest validation/digest, independence gate (distinct sessions, no shared launch nonce), the staging-agreement gate, promotion, divergence reports |
| `src/golden/simulate-capture-trace.js` | reference trace generator (`synthetic-simulator` method, never promotable) for pipeline dry runs and wrapper validation |
| `tools/capture-session.mjs` | operator CLI: `verify-install`, `simulate`, `tape`, `delog`, `ingest`, `verify`, `promote`, `manifest-digest` |
| `tools/runtime-capture/` | AS2 wrapper source, shell/stub builders, the `validate-vehicle.ps1` gate, the launchers (`launch-capture.ps1`, `run-capture.ps1`), the campaign driver (`run-campaign.ps1`, `campaign.mjs`), and the arena route (`run-arena.ps1`). Its README carries the validation status, how to run sessions concurrently, and the wrapper cache |

## Capture session protocol

Per-fixture staging requirements (implied equipment, level/vitality
derivations, and open staging questions) are catalogued in
[the capture staging guide](ss2-capture-staging.md).

1. `node tools/capture-session.mjs verify-install` — both installed hashes
   must match the fingerprint or the session must not start.
2. Stage the exact scenario of one target candidate fixture (stats, armour,
   statuses, positions) in a controlled 1v1.
3. Run the instrumented action once, writing the raw JSONL trace to
   `captures/<session-id>/<observation-id>.jsonl`.
4. `node tools/capture-session.mjs ingest --trace <raw> --fixture
   test/fixtures/ss2-1v1/<candidate>.json --out
   test/observations/ss2-1v1/<observation-id>.json` — for wrapper traces
   (whose end line carries the `null` attestation placeholder) ingest re-runs
   the installed-hash verification itself and refuses the trace when the
   post-session check fails. It also refuses an `injected-tape-runtime` trace
   whose end line carries no `overdraw`, and any trace whose `overdraw` is
   non-zero; both are described under
   [the capture attestations](#the-three-capture-attestations-on-the-end-line).
5. `node tools/capture-session.mjs verify --fixture <candidate> --observation
   <record>`; a divergence is preserved automatically, never deleted.
6. Repeat from step 1 in a fresh game launch (a new `sessionId`) until at
   least two matching observations from at least two sessions exist. A fresh
   launch also mints a fresh `launchNonce`, and promotion refuses two
   observations that share one. Since `e4d02a3` these repeats can run
   **concurrently**, each session given its own SharedObject store; see
   [`tools/runtime-capture/README.md`](../../tools/runtime-capture/README.md).
7. Write the capture manifest listing every session and observation, then
   `node tools/capture-session.mjs promote --fixture <candidate> --manifest
   <manifest> --observation <record1> --observation <record2>`.

Promotion enforces, in code, everything the fixture validator already
requires of goldens: `licensed-observation` provenance, `runtimeVerified:
true`, at least two unique observation IDs and digests, distinct capture
sessions, no two observations sharing a `capture.launchNonce`, agreement between
every observation about whether the wrapper staged the scenario,
per-observation manifest attestation, and the capture-manifest SHA-256.
`candidateFlags` do not carry over; a promoted quirk (for example the
armour-equality behavior) is thereby confirmed as build behavior.

## Instrumentation vehicle (installed and stub-validated 2026-08-30)

Portable **Ruffle 0.5.0** is installed under ignored `.tools/` by
`tools/install-ruffle.ps1` (pinned official release, SHA-256 verified
against the GitHub-published digest; installation was explicitly approved).
The wrapper is compiled from source on demand: `make-wrapper-shell.mjs`
assembles a minimal FWS v8 shell and portable FFDec compiles
`ss2-capture-wrapper.as` into it via `-importScript`.

`tools/runtime-capture/validate-vehicle.ps1` is the one-command validation
gate: it rebuilds the wrapper and the structural stub game, runs the wrapper
against the stub with `candidate-lethal-result`'s tape injected, and
requires the full `delog -> ingest -> verify` round trip to MATCH the
fixture. The gate passes, which proves every wrapper mechanism (FlashVars,
tape injection, `Object.watch` capture, cross-level function wrapping,
`loadMovieNum` isolation, event ordering, hash-check stamping) under
Ruffle's AVM1. `tools/runtime-capture/launch-capture.ps1` drives a real
session the same way, loading the installed SWF in place via a `file:` URL.
A licensed AIR/projector runtime remains the fallback vehicle if Ruffle's
AVM1 fidelity proves insufficient on the real battle timeline.

The wrapper source is committed at
`tools/runtime-capture/ss2-capture-wrapper.as`. It is no longer a draft: it has
passed the stub gate and produced the sessions behind all 22 promoted goldens.
It instruments without patching:

- serves the injected deterministic tape from a tap on the shared `Math`
  singleton underneath every `randomBetween` body, because frame 52 re-defines
  `randomBetween` and calls it in the same script execution, so a slot wrap
  cannot interpose there. The wraps on the three mapped `randomBetween`
  definitions (overlay frame 52 blocks `0x23f835`/`0x240c7f`, root frame 35
  block `0x40198e`) are diagnostic passthrough only. **A consequence that
  matters for how evidence is read: the tap receives no arguments, so the
  `label`, `min`, `max`, `value` and `callSite` on every emitted `roll` line
  are copied from the tape entry being served — that is, from the candidate
  fixture — and are not observations.** What the trace observes about the
  rolls is their *count* and their *position* in the armed window. See
  [what a match establishes](#what-a-match-actually-establishes);
- uses AS2 `Object.watch` on every projected field of `_root.game.hero` and
  `_root.game.villain` for per-assignment mutation capture
  (`mutationGranularity: "property-watch"`);
- wraps `defender_hurt`, `defender_blocked`, `death`, and observes the overlay
  `combatwon`/`combatlost` transitions for semantic events;
- can neither inject nor record AVM1 `RandomNumber` opcode rolls (the opcode
  is bytecode, not a wrappable function): the cosmetic armour-debris rolls
  are therefore excluded from observation matching on both sides — fixtures
  keep documenting them, and the static harness still replays them — and
  `attack_direction` is observed and recorded rather than forced;
- emits the end line with a `null` post-session attestation placeholder: the
  hash check cannot have run yet, so `capture-session.mjs ingest` re-runs the
  installed-hash verification live and stamps `installHashVerifiedAfter` only
  when it passes. The same line carries `overdraw` (draws made after the tape
  ran out — mandatory for an injected-tape capture) and `launchNonce` (minted
  inside the player before the `Math` tap is installed, so it consumes nothing
  from the tape); both are carried into the observation record's `capture`
  block, and both are described under
  [the capture attestations](#the-three-capture-attestations-on-the-end-line);
- emits only the JSONL trace grammar below (no screenshots, no assets).

### Reading divergent traces

Injection is tape-positional and unvalidated: the tap serves tape entry *n*
to the *n*th draw in the armed window, whatever that draw actually is. There
is no bounds comparison and no fallback labelling — an earlier revision of
this document described one, and it was never implemented.

Two consequences when a run diverges. First, a served value is remapped by
the game: the tap returns the fraction `(value - min + 0.5) / span` computed
from the *tape's* bounds, and the game's own `randomBetween(a, b)` then
derives `floor(fraction * (b - a + 1)) + a` from its *real* bounds. Feeding a
`21..23` entry to a real `5..20` call yields 13, not 22. Second, once the tape
is exhausted the tap falls through to the live RNG and records the draw only
as a `dbg` line, which `delog` strips — so the draw itself is not visible in
the delogged trace.

**Those over-draws are no longer silent.** The wrapper counts them and reports
the total as `overdraw` on the `end` line, ingest refuses any trace reporting a
non-zero count, and the zero is carried into `capture.overdraw` on the
observation record, so a reviewer holding only the repository can see that the
guard was satisfied. An `injected-tape-runtime` trace that carries no count at
all is refused outright — see
[the capture attestations](#the-three-capture-attestations-on-the-end-line). The
individual draws are still only in the raw log: `"at":"mrand"` lines under
`captures/` are where you read *what* was drawn, and the count is what tells you
whether you need to.

Interpret divergent raw traces by position, and treat injected values on a
divergent run as controlled experimental inputs, which they are.

### What a match actually establishes

A MATCH is narrower than "the formula is verified", and the gap is worth
stating precisely, because everything downstream rests on it.

**Genuinely observed** — these come from the running build and can contradict
a candidate:

- the ordered mutation trace, from `Object.watch` on the persistent combat
  objects — precisely, the ordered `(sequence, path, before, after)` tuples.
  **Those tuples are the substantive evidence.** The `hook` attribution stamped
  on each one is a claim of a different and much weaker kind, and it is not part
  of what a match establishes; see
  [what an attributed mutation means](#what-an-attributed-mutation-means);
- the semantic events — `defender-hurt` with its dispatched method,
  `defender-blocked`, `death`, and the overlay label — so, in particular,
  whether an attack **hit or missed** is measured, not assumed;
- the staged and final state dumps;
- `attack_direction` and `fight_mode`, read from the game;
- the **number** of draws in the armed window — including the draws that ran
  past the end of the injected tape, which the wrapper counts as `overdraw` and
  ingest refuses when non-zero.

**Not observed** — these are echoed or derived, and a match cannot contradict
them:

- every `roll` line's label, bounds, value, call site and `injected` flag
  (copied from the tape, hence from the candidate — and `callSite`/`injected`
  are additionally hard-coded constants in the wrapper's single emitter, so all
  407 sample entries across all 67 committed records carry the identical pair);
- the `hook` on every `set` line, and therefore the `reason` on every mutation
  entry of every observation. It is the wrapper's report about the *wrapper's
  own* call stack, so it constrains where in the action a write happened without
  establishing which game function performed it. Nothing compared it at all
  before 2026-08-31; see
  [what an attributed mutation means](#what-an-attributed-mutation-means);
- `howDied`, which `capture-ingest.js` synthesizes with the same static rule
  the candidate uses;
- `attackerSide`, which is a launcher FlashVar the game never sees. This one is
  not merely unverified: it has been observed **wrong**, in nine of twenty
  armed arena rounds on 2026-08-31. See
  [the attacker side is declared, not observed](#the-attacker-side-is-declared-not-observed);
- whether the scenario is one the game's own progression can *reach*. A capture
  observes what the build does with the state in front of it, never how that
  state could have arisen — which is why a wrapper-staged scenario has to be
  declared rather than inferred (see *What a STAGED capture proves* below);
- `expected.calculation` and `expected.mutation` in their entirety — matching
  never compares them, so `chance`, `rollNeeded`, `deflectionThreshold`,
  `armourRemovalRoll`, `knockback` and `enchantmentRoll` are candidate
  assertions that no observation has tested.

**Two known weaknesses in the chain itself**, recorded so they are not
rediscovered as surprises:

- the capture method is a string in the trace's meta line, so the
  simulated-evidence rejection is only as strong as that string. A
  `synthetic-simulator` trace with the method rewritten ingests, matches and
  promotes, reproducing a committed observation's digest exactly. The raw
  logs under `captures/` are what actually distinguish a live run, and they
  are not committed. Note one incidental consequence of the mandatory
  over-draw rule: a rewritten-method trace must now also carry a plausible
  `overdraw`, which is one more line for a forger to edit and no kind of
  barrier. The rule guards against assurance being silently *absent*, not
  against it being forged;
- session independence is `sessionId` and `observationId`, both supplied by
  the operator, plus `launchNonce`, which is not: it is minted inside the
  player and the promotion gate refuses two observations that share one. That
  narrows the gap rather than closing it — the nonce distinguishes player
  launches, and nothing still binds an observation to a distinct process.
  Legacy records carry no nonce, and **not one of the 22 promoted goldens
  cites an observation that carries one** (only 9 of the 67 committed records
  do, and none of those 9 is cited), so for every golden in the repository
  today independence remains exactly the two operator strings.

**What a STAGED capture proves, and what it does not.** Until now the wrapper
has never written combatant state: it injects the RNG tape and observes, and all
22 promoted goldens rest on scenarios the game itself produced. The
`candidate-armoured-*` fixtures need exact per-piece values (helmet 6, greaves
2) the game will never produce by chance, and while the tournament rank-1
opponent is reproducible (`unleash_hell` builds it from hard-coded DNA
literals), the *hero's* state entering that bout is not — `staminaleft` carries
across bouts and a mid-ladder level-up is decided by a generated opponent's
experience award. Both were observed live. So the wrapper will write combatant
state, declaring what it wrote in `end.staged`.

Be precise about what changes:

- **A staged capture measures the formulas exactly as well as an unstaged one.**
  The formulas operate on whatever inputs they are given. The game still
  resolves the action; the mutation trace, the hit/miss dispatch, the semantic
  events and the final state are all still genuinely observed and can all still
  contradict the candidate. Staging is a scenario **input**, of the same kind as
  the injected tape, which every existing golden already relies on. A staged
  deflection measurement at helmet 6 / greaves 2 is a real measurement of the
  deflection formula at helmet 6 / greaves 2.
- **What it does not establish is that the scenario is reachable.** Nobody has
  shown the game's own progression can produce a gladiator in that state. An
  unstaged golden carries that for free: the configuration existed because the
  game made it. A staged golden does not, and no number of repetitions adds it —
  every session stages the same way.
- **Reachability matters where a formula's inputs are constrained by the game.**
  If the build only ever equips helmets in a range the staging leaves, or only
  ever pairs certain pieces, a staged capture can measure the formula at a point
  the build never visits. That is still a correct measurement of the formula and
  still a wrong prediction of play. Treat a staged golden as evidence about the
  **formula**, not about the **distribution of situations** the formula is
  applied to.
- **Staging is not fabrication, and the distinction is the whole point of the
  field.** Nothing about the outcome is authored: the wrapper writes inputs and
  records what the build did with them. What would be fabrication is a staged
  capture presented as an unaided one, which is exactly what `end.staged` and
  the promotion gate's staging rules exist to make impossible.
- **The declaration is only as honest as the wrapper.** It says what the wrapper
  reports writing. A wrapper that wrote a field and omitted it from the
  declaration would be undetectable from the record alone — the cross-check
  against the staged dump catches a *wrong* value, not an *unmentioned* write.
  That is the same class of weakness as the editable capture-method string
  above, and it is recorded here for the same reason.

**How to strengthen a match rather than repeat it.** Because three of the
seven tape slots in the prisoner scenario write nothing observable (the
defender has no armour, so the removal roll is inert, and the knockback and
enchantment draws write nothing), many different roll orderings produce an
identical observation. Repeating that capture adds sessions, not information.
A *discriminating* tape does: stage an armoured defender so the removal roll
above 66 is visible, choose a deflection roll at the threshold, and choose a
knockback value that crosses its gate. **That is exactly what the ten probe
goldens are**: each arm is a one-member family whose tape pins one draw at a
value that either does or does not cross a gate, promoted in pairs
(`*-hit`/`*-miss`, `*-above`/`*-below`, `*-cleared`/`*-critical`) so the
threshold is bracketed rather than asserted. The power band is the worked
example of the other half of the discipline — its candidates were derived from
the map before any power session existed, so the twelve sessions that matched
them confirmed a prediction rather than a fit.

#### What an attributed mutation means

Every `set` line carries a `hook`, and ingest copies it onto the observation
record's mutation entry as `reason` (`src/golden/capture-ingest.js:372`). It is
natural to read that token as saying *which game function performed the write*.
It does not say that.

**The mechanism.** `currentHook` is one global in the wrapper
(`tools/runtime-capture/ss2-capture-wrapper.as:1734`), set on entry to and
restored on exit from every function the wrapper wraps (`makeHookMaker`,
`:1829-1841`); the `Object.watch` callback stamps whatever value it happens to
hold at the instant the assignment fires (`:1774`). The label is therefore a
**dynamic-extent** fact — *the innermost wrapped function on the AVM1 call stack
when the write happened* — and three consequences follow directly:

- a write performed by an unwrapped callee is attributed to its nearest wrapped
  ancestor. `"hook":"damagecharacter"` means "during `damagecharacter`'s call",
  never "by `damagecharacter`'s own bytecode";
- `"hook":"unattributed"` is a real and reachable value, not a defect marker: it
  means the write landed inside the armed window but outside every wrapped
  function. `captures/session-adc21` is a complete armed arena trace whose four
  mutations are all `unattributed`;
- the label is an observation about the **wrapper**, and only an inference about
  the **build**;
- and one entry in a lethal record's trace is not a watched write at all.
  `capture-ingest.js:447` mints `{path: "/result", …, reason: "result-bridge"}`
  from the observed `death` and `overlay-label` events; no `set` line carries
  `/result`. Its `winnerSide`/`loserSide` are evidence-derived — the `death`
  event's side is read off the real clip — which makes it the one place in the
  whole chain where a side comes from the game rather than from the operator.
  It exists only when somebody dies.

**What compares it, and what used to.** Until 2026-08-31 the answer was
*nothing*. `matchSs2ObservationToFixture` — the function `verify` and the
promotion gate both call (`src/golden/promote-1v1-golden.js:373`) — ran both
traces through a `stripTraceReasons` that kept `sequence`, `path`, `before` and
`after` and dropped `reason`, on the reasonable-sounding grounds that the two
vocabularies are not comparable as strings. They are not: across the committed
corpus, observations carry hook names (`damagecharacter` ×121, `elimination`
×180, `result-bridge` ×61, `first-blood` ×3) while fixtures carry
static-analysis labels (`physical-damage` ×19, `stat-clamp` ×19,
`battle-result-pending` ×19, `elimination` ×57). The cost of that convenience
was a working forgery, HANDOFF's third: a record attributing the hitpoint write
to `remove-armour`, or to `unattributed`, or to a hook no wrapper can emit,
ingested, verified, promoted, and yielded a golden the committed suite accepted.

It is now **translated rather than stripped**. `matchSs2ObservationToFixture`
projects both sides through `projectTraceForMatching`
(`src/golden/observation.js:863`), taking the observation's `reason` as-is and
mapping each fixture entry's static reason through `hookForFixtureMutation`
(`:888`) into the hook a wrapper must report for it —
`SS2_HOOK_FOR_STATIC_REASON` (`:206`), or `SS2_SPELL_HOOK_FOR_STATIC_REASON`
(`:229`) when the scenario stages a `spellId`. An unmapped reason **throws**
(`HookAttributionError`, `:173`) rather than becoming a difference, so a gap in
the table can never be misread as a divergent capture. It cost no re-capture:
re-running the comparison over the 44 golden-cited observation records that are
committed, all 44 still match — each already carried the hook its fixture's
reason maps to. Two things the translation deliberately does not reach:
`projectSs2ObservationForComparison` (`:732`), which keeps `reason` untranslated
and is called by no code on the capture path (its only caller is a test), and
the `/result` row, which `hookForFixtureMutation` short-circuits to the
`result-bridge` constant on both sides (`:896`) — a constant compared to a
constant, included so the projection needs no special case, with the real
evidence on that row being its `before`/`after` payload.

What a reader may conclude from an attributed mutation:

- **The write itself is evidence, and always was.** Path, before, after and
  order are observed and can contradict a candidate. It is the tuple, not the
  label, that carries the weight; the translation adds a constraint, it does not
  relocate the evidence.
- **May now** conclude that the write happened inside the dynamic extent the
  candidate's static analysis predicts — a write that moved to a different phase
  of the action, or was attributed to a function that never ran, diverges
  instead of matching silently. That is a real added constraint on the trace,
  and it closes the forgery.
- **May not** conclude that the named game function performed the write.
  Nearest-wrapped-ancestor attribution cannot distinguish a function from
  anything it calls, and the table's own convention is the *ingress that owns
  the assignment* rather than the innermost helper (`stat-clamp` is
  `check_stats`' arithmetic, attributed to whichever ingress called it).
- **May not** conclude anything new about the **build**. The fixture label, the
  wrapper label, and the table mapping one to the other are all authored by this
  project; their agreement constrains the tooling's self-consistency, not the
  game's structure. That `damagecharacter` exists and is called at that site is
  byte evidence from read-only static inspection, and stays byte evidence.
- **May not** read the 22 promoted goldens as having *passed* this check. They
  were promoted under the stripping gate; their fixtures still carry the
  *candidate's* static labels, not any observed hook, because no observed
  attribution is ever copied into a golden. Re-running the comparison over their
  committed evidence is a retrospective check, and it passes — but it is a check
  run after the fact, not a gate they cleared.

**Do not "strengthen" this by comparing `callSite` or `injected`.** Both are
compile-time constants in the wrapper's single roll emitter
(`ss2-capture-wrapper.as:1898`, with `OVERLAY_CALL_SITE` defined at `:1701`), so
every one of the 407 committed sample entries carries the same
`overlay:862/frame:52/DoAction@0x240c7f` and the same `injected: true`.
`comparableSamples` (`src/golden/observation.js:704-714`) drops both before
comparing, which is correct: a comparison of one hard-coded constant against
another manufactures the appearance of verification while asserting nothing.
That is this project's signature defect, and it has now been found six times.
The hook translation above is not an instance of it — the observation's hook is
produced at runtime by a mechanism that can and does emit other values, including
`unattributed`, so a wrong attribution reddens. The `/result` row is the one
exception inside it, and the code says so on its own face.

#### The attacker side is declared, not observed

`attackerSide` is a launcher FlashVar. The wrapper reads it off `_root`
(`ss2-capture-wrapper.as:144`), ingest checks only that it spells `hero` or
`villain` and copies it through (`src/golden/capture-ingest.js:106-107`, `:505`),
and matching compares `/scenario/attackerSide` — an operator-declared string on
the fixture side against an operator-declared string on the observation side.
**The game never sees this value, and no repository artefact derived from an
observation can contradict it.** The single exception is a lethal record: the
`death` event's side is read off the real clip, and ingest derives
`loserSide`/`winnerSide` from it (`capture-ingest.js:437-447`) while the fixture
derives its own from the *declared* `attackerSide`, so a fatal mislabelled swing
diverges at `/resultEvent`. That covers kills and nothing else — and none of the
twenty arena rounds below was a kill.

That is not a theoretical gap. On 2026-08-31, twenty-two `run-arena.ps1` rounds
were run against `candidate-armoured-deflection-threshold-cleared`
(`captures/session-adc1` … `session-adc22`). Twenty-one armed — `session-adc15`
aborted at the special-event screen and never armed — and twenty of those
produced a `damagecharacter` write. Split by which combatant that first write
landed on:

| Who actually swung | n | `attack_direction` values observed |
| --- | ---: | --- |
| hero (first write on `/villain/…`) | 11 | 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 8 |
| **villain** (first write on `/hero/…`) | **9** | 2, 3, 4, **5**, 10, 10, 11, 20, 20 |

**All twenty carry `"attackerSide":"hero"` in their meta line. Nine of the
twenty are false on that field.** They are not near-misses or edge cases; they
are ordinary rounds of the route the next families are meant to run through.

The guard that exists for this did not fire. `captureAllowedNow` wraps the side
check in `if (attacker != undefined)` (`ss2-capture-wrapper.as:1978`), and
`gameRoot().game_attacker` is undefined at that moment, so the check is skipped
rather than failed — an undefined read taking the permissive branch, the same
class as the `isNum` trap. `capture-refused-wrong-side` appears **zero** times
across all 268 archived `.rufflelog` files and zero times in any `.jsonl`; its
sibling `capture-refused-unstaged`, later in the same function body, appears
1091 times, so emission works and the count is a real zero. Two independent
read-only audits on 2026-08-31 byte-mapped `game_attacker` to *overlay-clip*
scope (bare `SetVariable` inside `changeCombatants`), which would make
`gameRoot().game_attacker` undefined on **every** route rather than only this
one — consistent with a marker that has never fired anywhere in this archive. So
do not read the zero as "the guard checked and approved": nothing here shows the
guard has ever run to completion on any route. The wrapper is not this
document's to change; the correction and its consequences are HANDOFF's item.

**The discriminator that actually worked: which side the first
`damagecharacter`-hooked `set` line wrote to.** The candidate engines record
damage on the defender only, so the first damage write names the defender and
therefore the attacker. That is how the nine were found, and it re-derives from
the raw logs in one pass. Two limits on it, both load-bearing:

- **it needs a damage write.** `session-adc21` armed, drew direction 20,
  produced a complete trace with both `final` lines and an `end` line, and made
  no `damagecharacter` write at all — its four mutations are `unattributed` — so
  the discriminator cannot classify it. A **miss** produces no damage write by
  construction, and three promoted goldens
  (`golden-probe-{normal,power,quick}-rollneeded-miss`) have an empty
  `expected.mutationTrace`. For a miss, no channel in the compared projection
  carries an attacker identity at all. This is not a corner: **53 of the 193
  armed sessions in the archive made no `damagecharacter` write**, so the
  discriminator is silent on more than a quarter of them;
- **it is not a check anybody runs.** It is something a reader can do to a raw
  log. Nothing in ingest, matching, promotion or the test suite compares the
  declared `attackerSide` against the observed mutation paths. The two
  assertions that look like side verification —
  `test/ss2-probe-fixtures.test.js:184` and
  `test/ss2-post-tutorial-fixtures.test.js:252`, both
  `assert.equal(scenario.attackerSide, "hero", id)` — compare a *fixture* field
  to a hard-coded literal. They never read an observation, so no mislabelled
  trace can redden them. That is the project's signature defect sitting in the
  exact place a reader would look for the check that matters.

**`attack_direction` does NOT discriminate, and must not be used as if it did.**
Both combatants dispatch through the same overlay code and therefore the same
bands, so the ranges do not separate them. `session-adc18` is the demonstration:
a **villain** swing that drew **direction 5** — inside the hero's own
`normal_attack` band `randomBetween(5, 8)` — with its damage landing on
`/hero/hitpoints` and its method `critical`. Its divergence report
(`test/fixtures/ss2-1v1-divergences/candidate-armoured-deflection-threshold-cleared--obs-adc18-a1-b3360b98.json`)
records no difference at `/scenario/attackDirection`: the direction **matched
the fixture**. What caught it were the side-bearing paths —
`/mutationTrace/0/path` (`/villain/armourclass` expected, `/hero/hitpoints`
observed) and the `/finalState/hero/*` entries.

That catch is **incidental, not a designed defence**. It holds only because
every currently reachable fixture happens to expect a villain-side mutation. A
fixture expecting a hero-side mutation, or any of the three miss fixtures, would
have taken adc18 as a match — and the promotion gate needs only two such, from
two sessions, which each arena round supplies for free (its own process, its own
`launchNonce`, its own `sessionId`).

Until an evidence-derived attacker identity reaches the record, read
`attackerSide` on any observation as **an operator's assertion about a round, of
the same evidential kind as the capture-method string.** In particular, do not
read the 22 promoted goldens as having been protected by the guard and found
clean. They were not screened by it at all: each golden-cited session preserves
the exact wrapper it ran under `captures/<session-id>/`, and across the 44 of
the 47 cited observations whose records are committed, **not one of those
wrappers contains `captureAllowedNow` or `game_attacker`** — the guard did not
exist when they were captured. Their side labels rest instead on the prisoner
route never giving the villain a turn. Running the discriminator over the whole
archive: of 193 armed sessions, 140 made a `damagecharacter` write and can be
classified, and **exactly 9 wrote first to the claimed attacker's own side —
the nine arena rounds above, and nothing else.** That is a property of the
route, not a check that ran.

### Reference traces (simulator)

`node tools/capture-session.mjs simulate --fixture <candidate.json>` writes
the exact JSONL a perfect wrapper would emit for that fixture's staged
scenario and injected tape (default output under ignored
`captures/simulated/`). These traces exercise `ingest` and `verify` end to
end and are the wrapper's executable specification: during validation the
wrapper must reproduce them (modulo meta identity, passive roll values, and
per-roll callSite attribution) before a real capture counts as evidence. The
simulator also fails fast on any fixture that cannot produce a
self-verifying reference trace, blaming the fixture rather than the trace.
Their capture method is
`synthetic-simulator`, which observation validation accepts but promotion
rejects unconditionally — a simulated trace can never become runtime
evidence, and simulated records do not belong in `test/observations/`.

A reference trace's `end` line carries `overdraw: 0` and **no** `launchNonce`
and **no** `staged`. The mandatory-overdraw rule does not reach
`synthetic-simulator`, so the count is not required of it; it is emitted anyway
because the claim is true (the simulator serves exactly the fixture's tape, with
no live RNG behind it) and because these traces are the wrapper's executable
specification of that same end line. The nonce is the opposite case: it exists
to carry one identity minted inside a real player launch, so a
simulator-invented value would be a fabricated independence token. Absent is the
honest value.

`staged` is absent for a reason that is easy to get backwards. Every value in a
reference trace's `state` lines comes from the fixture, so the whole trace looks
like one long staging. It is not: `staged` declares what the wrapper wrote into
a **running game**, and this generator runs no game. There is no construction
for a write to survive and therefore no stuck value to report, so emitting a
declaration would invent the one fact the field exists to establish. A wrapper
that stages emits its own, from its own read-back.

## Raw trace grammar (JSON lines, version 1)

| Line `t` | Position | Contents |
| --- | --- | --- |
| `meta` | first | trace schema version, observation/session IDs, tool version, method, timestamp, `mutationGranularity`, `installHashVerifiedBefore: true`, attacker side — **declared by the launcher, never observed; wrong in 9 of the 20 arena rounds of 2026-08-31 that can be classified, see [below](#the-attacker-side-is-declared-not-observed)** |
| `state` | before the action, one per side | staged numeric/boolean field dump per combatant |
| `var` | any | named scalar: `fight_mode`, `attack_direction` (physical ingress), `spell_id` (spell ingress — `magic_damage_character` has no direction chain), `criticalhit` |
| `roll` | action | `{label, source, min, max, value, callSite, injected}` in exact call order |
| `set` | action | `{path, before, after, hook}` — one watched assignment; `hook` names the innermost *wrapped* function on the stack when the write fired (`damagecharacter`, `magic-damage-character`, `remove-armour`, `death`, ..., or `unattributed`), which is weaker than "this function wrote it" — see [what an attributed mutation means](#what-an-attributed-mutation-means) |
| `event` | action | `defender-hurt`/`defender-blocked`/`magic-damage`/`death`/`overlay-label` |
| `final` | after the action, one per side | post-action field dump |
| `end` | last | `installHashVerifiedAfter: true`, or `null` as the wrapper's placeholder — ingest then re-runs the hash check live and refuses the trace when it fails; `overdraw`, the count of draws the armed window made after the injected tape ran out; `launchNonce`, minted inside the player; `staged`, the optional `side.field=value` list of everything the wrapper itself wrote, absent when it wrote nothing. See [the capture attestations](#the-three-capture-attestations-on-the-end-line) |

Ingestion (`src/golden/capture-ingest.js`) enforces integrity before a record
exists: every `set` must chain from the staged value or the previous `after`
for its path, no-op assignments are dropped, the final dump must equal the end
of each watched chain (any gap is an "unobserved mutation" error), a death
event must be followed by its matching overlay label, and the scenario is
projected onto exactly the target fixture's staged fields — a mis-staged
scenario is recorded as observed and surfaces as an explicit mismatch.

### The three capture attestations on the end line

The wrapper mints three fields on the `end` line that are neither observations
of the game nor operator input. All three are carried into the observation
record's `capture` block, so a reviewer holding only the repository can check
them.

**`overdraw`** is the count of draws the armed recording window made *after* the
injected tape ran out. Those draws are otherwise invisible: they fall through to
the live RNG and are logged only as `dbg` lines, which `delog` strips. Without
the count, a run that drew more randomness than the target candidate models is
indistinguishable from one that matched it. Ingest refuses any trace reporting a
non-zero count — that is a divergence, and the fix is to correct the candidate's
roll order from the raw trace — so the only value a committed record can carry
is `0`. The field is an attestation that the guard ran, not a measurement.

It is **mandatory** for `injected-tape-runtime` traces. Its absence is not a
weaker assurance, it is none, so a trace without it is refused rather than
quietly ingested. The rule is scoped to that one method: a `passive-runtime`
capture injects no tape, so every draw is past its end and the count would be
meaningless, and a `synthetic-simulator` trace has no live RNG behind it to draw
from at all.

There is exactly one escape hatch, the ingest option
`{ allowMissingOverdraw: true }`. It exists for a single documented purpose:
many of the archived raw traces under the ignored `captures/` directory predate
the field, and regenerating divergence reports from them must not be blocked by
evidence they could not have recorded. (That archive is ignored and local, so
any ratio quoted here is a snapshot that drifts with every session; at the time
of writing 121 of the 168 archived traces carrying an `end` line at all report
`overdraw`.) The live capture path —
`tools/capture-session.mjs` and `tools/runtime-capture/campaign.mjs` — must never
pass it, and a test asserts that neither file mentions it. A record ingested
under the hatch carries **no** `capture.overdraw` at all rather than a
manufactured zero: it claims nothing, which is the truth about it.

**`launchNonce`** is minted inside the player, before the `Math` tap is
installed, from values the launcher does not supply. `sessionId` and
`observationId` are both operator strings, so the nonce is the one identity
field on a record that the operator did not choose. The promotion gate refuses
two observations that share one: the nonce is minted once per player launch, so
agreeing on it means one launch's evidence offered twice, however different the
two `sessionId`s look. It is not a security boundary — nothing in this chain is
— and it does not bind an observation to a distinct *process*, only to a
distinct player start.

**`staged`** is the wrapper's declaration of every combatant field *it* wrote
before the observed action, and the value that stuck once the game's own
construction had finished. It is a string, comma separated, in application
order:

```json
{"t":"end","installHashVerifiedAfter":null,"overdraw":0,"launchNonce":"417238-1900311477",
 "staged":"hero.strength=40,hero.attack=40,villain.helmet=6"}
```

The accepted grammar, defined once in `parseSs2StagedDeclaration`
(`src/golden/observation.js`) and applied to both the trace line and the record
field, so no record can carry a shape a trace could not:

- entries are `side.field=value`, joined by `,`, with **no whitespace anywhere**;
- `side` is `hero` or `villain`;
- `field` is `[a-z][a-z0-9_]*` — the same token shape the `set` paths use, not
  the closed projected-key list, because the armoured captures stage per-piece
  `*_defence` ratings the default watch list omits;
- `value` is a decimal number (optionally negative or fractional) or `true` /
  `false`, and nothing else. Every watched combatant field is numeric or
  boolean, and admitting free strings would let a `,` or an `=` into a value and
  make the list ambiguous to split;
- each `side.field` appears **once**, carrying the value that stuck;
- at most 512 characters.

Anything else is refused loudly at the line that carried it. That strictness is
deliberate: a half-parsed declaration *understates* staging, and understated
staging is the one failure this field exists to prevent.

**Absent means the wrapper staged nothing** — true of every trace and every one
of the 22 promoted goldens. The empty string is refused rather than accepted as
a synonym, so there is exactly one spelling of "staged nothing" and a reader can
never confuse it with "forgot to say".

Where the staged `state` dump watches a declared field, ingest cross-checks the
two and refuses a disagreement. That is what "the value that stuck" means: the
game's construction runs after the wrapper's write and may overwrite it, so a
declaration reporting what the wrapper *attempted* would quietly overstate the
staging. Fields the dump does not watch cannot be cross-checked and are taken on
the wrapper's word.

Note the two unrelated senses of "staged" that meet here. The `state` lines are
the pre-action dump — the scenario as it stood, however it came to stand that
way. `end.staged` is narrower and is about *authorship*: what the wrapper wrote.
A trace can have a full staged dump and no `end.staged` at all, and every trace
behind the 22 promoted goldens does.

**All three fields are optional in the record schema, and must stay optional.**
An observation's digest covers its own record, and every observation committed
before the fields existed was ingested by a version that validated and then
discarded them (or, for `staged`, by one that had no such field to discard).
Making any of them required would change those records' digests and invalidate
the provenance of every golden citing them. So a legacy record validates,
matches and promotes exactly as before; it simply carries no assurance on those
points. What forces *new* evidence to carry `overdraw` is the mandatory check at
ingest, not the schema. For the same reason the nonce gate binds only
observations that actually carry a nonce — absence is never read as a shared
value.

For `staged` the optionality is not only a compatibility measure: absence is the
substantive claim. No `staged` key means no wrapper wrote this scenario.

None of the three takes part in matching. `projectSs2ObservationForComparison`
and `matchSs2ObservationToFixture` both exclude the whole `capture` block, so
two observations that differ only in their nonce still match each other and the
fixture — and, less comfortably, so do two that differ only in whether the
wrapper wrote the scenario. That exclusion is why the promotion gate has to
compare `staged` itself; see below.

### Staging in the promotion gate

Two rules, both in `promoteSs2CandidateToGolden`.

**Every observation offered for one fixture must agree about staging.** The
comparison key is the declaration string, or "absent" for a capture that staged
nothing. This is **load-bearing, not a restatement of the scenario comparison.**
Nothing else in the pipeline looks at the field:
`matchSs2ObservationToFixture` compares scenario, samples, mutation trace,
events, result and final state, and never reads the `capture` block;
`projectSs2ObservationForComparison` excludes that block outright. So two
observations can agree on every compared channel — identical scenario *values*,
tape, mutations and final state — while one had those values written in by the
wrapper and the other got them from the game's own progression. The comparison
sees equal values; it cannot see unequal authorship. Offered together they would
produce a golden whose staging claim is true of half its evidence, which is
worse than either claim alone. A test pins exactly this: two such observations
match each other and both match the fixture, and promotion still refuses them.

**A golden promoted from staged evidence records it in `provenance.staged`**,
so the fixture says so on its own face rather than making a reader chase
observation ids into `test/observations/`. Unstaged promotions add no key at
all, which is what keeps the 22 committed goldens byte-identical and is also the
honest claim.

> **Outstanding.** `GOLDEN_PROVENANCE_KEYS` in `src/golden/run-1v1-fixture.js`
> is a closed set that does not yet admit `staged`, so promotion of staged
> evidence currently **fails loudly** with the exact change required rather than
> dropping the field — emitting a golden that silently read as game-produced is
> the outcome this whole field exists to prevent. Until that one-line schema
> change lands, a staged capture can be ingested, matched and inspected, but not
> promoted. Nothing about unstaged promotion is affected.

## Observation records

`test/observations/ss2-1v1/*.json`, schema `ss2-1v1-observation` version 1.
Each record carries the pinned build block, capture attestations, the target
fixture ID, the observed scenario, ordered samples with call sites, the
ordered mutation trace, semantic events, the result event (if any), the final
state projection, and a SHA-256 digest over the canonical-JSON record (sorted
keys). The digest covers the observation's identity, so independent
observations always digest uniquely — exactly what golden provenance requires.

The `capture` block's required members are `sessionId`, `captureToolVersion`,
`method`, `observedAt`, `installHashVerifiedBefore`, `installHashVerifiedAfter`
and `mutationGranularity`. It also admits exactly three optional members,
`overdraw`, `launchNonce` and `staged`, carried from the trace's `end` line and
described under
[the capture attestations](#the-three-capture-attestations-on-the-end-line);
`overdraw` may only be `0`, `launchNonce` must be a token, `staged` must satisfy
the declaration grammar, and no other key is accepted. **9 of the 67 committed
records carry the first two** — `obs-cachecold`, `obs-cachewarm`, `obs-iso2`,
`obs-par1`–`obs-par3` and `obs-pq1`–`obs-pq3`, all of them isolated-store or
concurrent sessions. The other 58 predate the fields, which is why the fields
are optional and why no committed record was rewritten to add them. **No
committed record carries `staged`**: nothing has been wrapper-staged yet, so
every record in the repository is evidence the game produced unaided.

One gap in that "holding only the repository" claim, found while checking the
attacker-side labels and recorded here so it is not rediscovered: the 22 goldens
cite 47 observation ids, and **three of them have no committed record** —
`obs-nav6` (one of the two behind `golden-prisoner-normal-kill-dir5`) and
`obs-diag` and `obs-gold3`, which are *both* of the observations behind
`golden-prisoner-normal-kill-dir6`. Each appears exactly once in the repository,
in the manifest that attests it. The golden carries their digests; the records
those digests cover are not here, so for `-dir6` neither piece of its evidence
can be re-read, re-matched, or checked for side labels from this repository
alone. The remaining 44 are committed and were checked.

## Matching rules

An observation matches a fixture when all of the following are exactly equal:

- scenario (numeric staged state, attacker side, attack direction). Note what
  the attacker-side half can and cannot fail on: `attackerSide` is compared
  declared-against-declared — an operator string on each side — so it fails when
  the operator's launcher flag disagrees with the fixture, and never when the
  *game* disagrees with either; see
  [the attacker side is declared, not observed](#the-attacker-side-is-declared-not-observed);
- ordered samples — label, source, bounds, and value, with cosmetic
  `armour-debris-*` opcode rolls excluded from both sides (no instrumentation
  can observe the opcode stream, and the rolls never change combat state).
  Note what this comparison can and cannot fail on: an injected run's sample
  fields are copied from the fixture's own tape, so in practice this clause
  tests the **number** of draws and their position, not their metadata (see
  [what a match establishes](#what-a-match-actually-establishes));
- ordered mutation trace on the `(sequence, path, before, after)` contract, plus
  the attribution: the fixture's static `reason` is **translated** through
  `SS2_HOOK_FOR_STATIC_REASON` into the hook a wrapper must report, and compared
  against the observation's. It used to be stripped from both sides, which made
  three fields forgeable; read
  [what an attributed mutation means](#what-an-attributed-mutation-means) before
  citing a hook as evidence about the build, because the translation constrains
  the tooling and not the build;
- semantic events against the fixture's derived expectation
  (`defender-blocked` for a miss; `defender-hurt` with the dispatched method
  for a hit; plus `death` and `overlay-label` for a lethal outcome);
- the result event and the final state projection.

`expected.calculation` and `expected.mutation` stay candidate-derived
summaries: they are not directly observable and are exercised by replaying
the candidate resolver, which promotion re-runs on every golden.

Matching compares scenario **values**, never their authorship — the whole
`capture` block is excluded — so a wrapper-staged observation matches a fixture
exactly as an unaided one does, which is correct: the game resolved both. What
authorship changes is what the resulting golden may claim, and that is enforced
at promotion, not here. See
[staging in the promotion gate](#staging-in-the-promotion-gate).

## Divergence handling

A mismatch never deletes evidence. `verify` and `promote` write a
`ss2-1v1-divergence` report (fixture ID, observation ID/digest, session, and
JSON-pointer differences) to `test/fixtures/ss2-1v1-divergences/`, and the raw
trace stays in `captures/`. The follow-up is always: keep the report, correct
the isolated candidate module/fixture to the observed behavior, add a
regression test, and only then attempt promotion again. Divergences correct
the isolated candidate only; they never reach into `classicStyleRules` or the
shared team resolver.

## Campaign automation

A single session is one command; a whole candidate family is one loop. The
loop exists because the wrapper **observes** `attack_direction` rather than
forcing it. The direction is drawn inside the game before the recording
window opens — overlay frame 52 `DoAction@0x240c7f` assigns
`attack_direction = randomBetween(9, 12)` for a power attack (`+0x608a`),
`randomBetween(5, 8)` for a normal attack (`+0x61f1`) and
`randomBetween(1, 4)` for a quick attack (`+0x635c`), with fixed values for
the single-direction actions (bash 23 at `+0x64c3`, taunt 20 at `+0x6981`,
bombard 21 at `+0x6c67`, snipe 22 at `+0x6c8c`, grievous 30). Arming happens
later, at `attack_chances`, so that draw comes from the live RNG and is not
on the injected tape. Which candidate a run is evidence for is therefore not
known until the trace has been read.

**The direction says which candidate, never which combatant.** Both fighters
dispatch through the same overlay code and therefore draw from the same bands,
so a direction in 5–8 is not evidence that the hero swung: `session-adc18` is a
villain swing at direction 5. On any route where the opponent takes turns, the
direction is an action identity and nothing more — see
[the attacker side is declared, not observed](#the-attacker-side-is-declared-not-observed).

The spell ingress has no direction chain at all — `magic_damage_character` is
reached without one — so a spell run is identified by its `spell_id` instead.
The driver treats the two uniformly; see [what a family
is](#what-a-family-is-exactly).

```text
run-campaign.ps1  (batch loop, -Concurrency sessions at once)
  -> run-capture.ps1 -SkipPipeline        one unattended session, raw log only
     (concurrently: each gets its own -SaveDirectory)
  -> campaign.mjs ingest-round            resolve, ingest, file the observation
  -> campaign.mjs settle                  build manifests, promote what qualifies
```

The **capture** half of a batch runs concurrently; `ingest-round` and `settle`
run after it, **serially**, because they are CPU-only, they mutate
`test/observations/`, and promotion reads the evidence set as a whole.
`-Concurrency` above 1 is refused for any navigator but `prisoner`: concurrent
sessions get isolated SharedObject stores, which fork the save, and the arena
route has to accumulate state across bouts. The operating detail is in
[`tools/runtime-capture/README.md`](../../tools/runtime-capture/README.md).

| File | Responsibility |
| --- | --- |
| `tools/runtime-capture/run-campaign.ps1` | the round loop: unique ids, `-Concurrency` sessions per batch, per-batch ingest and settle, coverage summary |
| `tools/runtime-capture/campaign.mjs` | `plan` (coverage), `seed` (which tape a round injects), `ingest-round` (file one session), `settle` (promote what qualifies) |
| `tools/runtime-capture/build-manifest.mjs` | derive a capture manifest from the observation records it attests |

### What a family is, exactly

A **family** is the set of candidate fixtures whose ids share a `-`-delimited
id segment and differ only in their **action identity** — the candidates one
staged scenario can produce.

**Membership is a segment boundary, not a raw string prefix.** `isFamilyMember`
accepts `candidate-<family>` exactly, or `candidate-<family>-<rest>`. The raw
prefix test this replaced was a live collision in this repository rather than a
hypothetical: `--family armour` also swept the five `candidate-armoured-*`
fixtures alongside the three `candidate-armour-*` ones, so a campaign staged
unarmoured would have ingested every round against armoured candidates too. The
exact-match arm is what keeps `candidate-prisoner-normal-kill` — the unsuffixed
direction-7 member — inside its own family, and what makes a whole candidate id
usable as a one-member family (`--family prisoner-normal-kill-dir6`). A
truncation of a real id now selects nothing rather than something.

**The family index is the action identity, not the attack direction.**
`actionIdentityFor(scenario, describe)` reads a fixture and an ingested record
identically, and returns exactly one of two keys:

| Ingress | Field | Key | Why |
| --- | --- | --- | --- |
| physical | `scenario.attackDirection` | `attack-direction:<n>` | the dispatcher and the death chain both read the `attack_direction` global |
| spell | `scenario.spellId` | `spell-id:<n>` | `magic_damage_character` has no direction chain at all; the wrapper emits `spell_id` instead |

It is **total** for both ingresses, because a scenario carries exactly one, and
it **throws** for neither or both — `validateSs2OneVsOneFixture` enforces that
invariant on the fixture side and `ingestSs2CaptureTrace` projects whichever
identity the target fixture stages. Indexing on `attackDirection` alone was a
defect rather than a simplification: a spell family carries no direction, so
all eight `candidate-spell-*` members collapsed onto the single key `undefined`
and the family looked malformed.

`ingest-round` ingests a session against every member and keeps the one that
MATCHES, so a run is only ever filed as evidence for a candidate it agrees with
in full; two matches would mean the members are not mutually exclusive, and
that is rejected as a malformed family. When nothing matches, the run is a real
divergence and the report is written against the member **for the action
identity the trace actually recorded** — resolved through the same key
`loadFamily` indexes by, so a spell trace resolves on its `spell_id` exactly as
a physical one resolves on its `attack_direction`. Every successfully ingested
record is consulted in turn, not only the first, because ingest projects the
identity the *target* fixture stages; the family's first member is the
last-resort fallback when the trace recorded an identity no member claims.

### Which families are single-tape campaigns, and which are not

`loadFamily` refuses a family whose members are not distinguishable by action
identity, because that key is what a divergence report is filed under — an
ambiguous index means a divergent run has no single candidate to be reported
against. Taking the eighteen first-segment names the 55 committed candidates
offer, **six** are refused for that reason:

| Refused family | Members | Colliding identity |
| --- | --- | --- |
| `armour` | 3 | all attack direction 5 |
| `armoured` | 5 | all attack direction 5 |
| `normal` | 2 | both attack direction 5 |
| `probe` | 10 | six at direction 5, two at 9, two at 1 |
| `spell` | 8 | five at spell id 30, two at 34, one at 32 |
| `tournament` | 3 | all attack direction 5 |

That is correct, not a limitation to be worked around. The ten probe arms
differ only in an *injected roll value*, so no scenario-derived key could
separate them, and `seed` refuses them independently on tape disagreement
anyway. They are run **one candidate at a time**, as one-member families
(`--family probe-normal-rollneeded-hit`), which is exactly how the ten probe
goldens were captured.

The families that do work as campaigns are the ones whose members genuinely
differ only in the direction the game drew: `prisoner-normal-kill`,
`prisoner-power-kill` and `prisoner-quick-kill`, four members each and one
shared tape. Note that the whole `prisoner` name — all twelve members — is a
valid *family* but not a valid *campaign*: its members carry three distinct
tapes, so `seed` refuses it.

`seed` refuses to nominate a tape when a family's members disagree about
their injectable samples. Injection is tape-positional, so a mismatched tape
would feed one direction's rolls into another's call order and the trace
would be an experiment rather than evidence.

`--manifest-prefix` is vestigial. It named the old `<prefix>-dir<n>.json`
manifest path and names nothing now that manifests are named after the
candidate they attest. It is still parsed rather than rejected — a script that
passes it should not die on "Unknown option" — but `settle` prints that it is
being ignored, because silently swallowing an operator's flag is its own
hazard.

`build-manifest.mjs` copies every manifest field out of the validated
observation records and originates only `createdAt`. Rebuilding the
hand-written `test/manifests/prisoner-dir6.json` from its two observations
reproduces its canonical digest
(`889e099e00f67b66199f7fc0b23642feb603362725197d9721dcb69e0bcefd6c`), which
is the digest `golden-prisoner-normal-kill-dir6` already cites. That rebuild
cannot be re-run from this repository today: both of those observation records
(`obs-diag`, `obs-gold3`) are uncommitted — see
[observation records](#observation-records).

`-SkipPipeline` on `run-capture.ps1`/`launch-capture.ps1` leaves the raw log
for the campaign driver. Without it the launcher verifies against the one
fixture it was given and writes a divergence report every time the game chose
a different — equally valid — direction, burying real disagreements in noise.

Nothing in the loop weakens the promotion gate: observations come from
`ingestSs2CaptureTrace`, matching from `matchSs2ObservationToFixture`, and
promotion from the same `promoteSs2CandidateToGolden` two-observation,
two-session gate the CLI uses.

### Hero action vocabulary

`getphase(whatsdoing)` accepts only the labels defined by the controller
frame currently in scope, read statically from sprite 862 (read-only
inspection; nothing exported):

| Controller frame | Labels |
| --- | --- |
| 1 `initialise` | `rest`, `runleft`, `runright`, `frozen`, `burning`, `poisoned`, `life_stolen`, `swap_weapons` |
| 5 `longrange_warrior` | `taunt`, `rest`, `jumpleft`, `jumpright`, `walkleft`, `walkright`, `chargeleft`, `chargeright`, `psyche_up`, `wincrowd` |
| 13 `closerange_warrior` | `power_attack`, `normal_attack`, `quick_attack`, `shove`, `jumpleft`, `jumpright`, `walkleft`, `walkright`, `psyche_up`, `wincrowd` |
| 20 `longrange_archer` | `bombardleft`, `bombardright`, `snipeleft`, `sniperight`, `taunt`, `rest`, `jumpleft`, `jumpright`, `walkleft`, `walkright`, `psyche_up`, `wincrowd` |
| 28 `closerange_archer` | `bash_attack`, `shove`, `taunt`, `jumpleft`, `jumpright`, `walkright`, `psyche_up`, `wincrowd` |

This is why `walkright*5,normal_attack` works: the walks carry the hero from
long range (frame 5) into close range (frame 13), where the three melee
attacks live. `power_attack` and `quick_attack` sit on that same frame and
need no new staging, so the normal-band family has power-band and quick-band
siblings reachable with the same gladiator. The archer actions (`bombard*`,
`snipe*`, `bash_attack`) require the bow weapon mode, so they are gated on a
gladiator that owns a bow, not on the wrapper.

## What remains

The first goldens are in, so what is left is breadth, not feasibility. In
rough order of cost:

1. **~~Power and quick bands.~~ Done.** Both bands were authored from the
   battle map and then run through `run-campaign.ps1` exactly as the normal
   band was. All twelve melee directions (1–4 quick, 5–8 normal, 9–12 power)
   are promoted goldens, backed by 25 normal-band, 12 power-band and 9
   quick-band observations from as many independent sessions.
2. **The spell ingress, which has never had a capture session.** Eight
   `candidate-spell-*` fixtures exist and no observation targets any of them.
   The driver already handles the ingress — `actionIdentityFor` keys a spell
   scenario on `spell_id` — but the eight members are not mutually exclusive
   by that key (five share spell id 30), so they are one-at-a-time captures
   rather than a campaign family.
3. **Single-direction actions.** Bash (23), bombard (21), snipe (22), taunt
   (20) and grievous (30) are one fixture each rather than a family.
   Bash/bombard/snipe need the bow weapon mode, so they need a gladiator that
   owns a bow — a staging problem, not a tooling one.
4. **Richer scenarios.** Every golden so far comes from one staged pair (the
   tutorial prisoner against a level-1 gladiator with no armour) — the probe
   arms included, which vary an injected roll value rather than the staging.
   Armour, status flags, and non-lethal outcomes are all still candidate-only,
   and the armour-first and equality-quirk fixtures are the ones most worth
   confirming live. `candidate-duel-firstblood-normal-kill` is the closest of
   the 33: it has one matching observation and needs one more independent
   session.
5. **Out of scope by design.** Range taunts and other opcode-rolled paths
   make no `randomBetween` calls, so no wrapper can inject or record them.

Staging requirements per fixture are in
[the staging guide](ss2-capture-staging.md).

The 2v2 and then 3v3 cooperative campaign targets are unchanged: one shared
resolver, team elimination, AI fill, controller-independent combatants, and a
single campaign settlement after the final animation acknowledgement, as
recorded in [the roadmap](../roadmap.md).
