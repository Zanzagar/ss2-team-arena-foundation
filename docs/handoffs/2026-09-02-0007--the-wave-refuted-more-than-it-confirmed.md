---
handoff:      2026-09-02-0007--the-wave-refuted-more-than-it-confirmed
written:      2026-09-02 00:07 -0400
sessionStart: 2026-09-01 23:10 -0400
sessionId:    d8905702-de09-4ab4-8d71-5177f2da3cd2 (https://claude.ai/code/session_01MxEfjRa4SvMdK1WMKk8h3U)
agentRuns:    wf_35a0c78d-005 (question-diverse investigation of ranked items 2-5 + capture prep)
              8 briefs, 8 started, 8 returned, 24 verifiers launched, 0 dead.
              **VERIFIED. 17 of 24 claims BROKEN, 21 premise failures reported.**
              Every load-bearing result was re-derived by the main session from
              the hash-verified SWF or by direct measurement before anything
              was changed.
branch:       arena/champion-capture
commits:      c22e549, b7641da, 20aab4d, 1106ccd (4, NOT pushed —
              `github/arena/champion-capture` is still at 2f8e4b8)
suite:        703 tests / 702 passed / 0 failed / 1 skipped (WSL, fresh-clone
              profile), from 693 at session start
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-02-0130--ss2-rules-and-the-wave-that-broke-it (its ranked
              items 2, 3 and 5; item 4 is answered but left to the owner)
---
# Handoff — the wave refuted more of the brief than it confirmed

**Read the filename dates before you `ls`.** The brief this supersedes is
stamped `2026-09-02-0130` and was committed at **2026-09-01 22:58 -0400** — its
stamp is the UTC time wearing a `-0400` label. So it sorts AFTER this file
despite being older, and `ls docs/handoffs/` points at the wrong brief. **This is
the second time this exact bug has shipped** (the head records the
`-1950-`/`-1550-` rename of 2026-09-01). Nothing was renamed this time; the
older file carries a forward pointer instead. **Stamp handoffs in LOCAL time and
check with `git log --date=iso-local`.**

## The one-sentence version

Ranked item 2 was a false alarm and the code was already right; the real defect
was three lines below it; ranked item 3 was five files rather than two and one of
them sits inside 22 goldens' provenance digest; ranked item 5's premise was
false; and the remedy this project had written down for ranked item 4 points the
wrong way.

## What the wave broke, and what that changed

**17 of 24 claims BROKEN.** Not "the agents were wrong" — the briefs were. The
questions that produced the most were the ones aimed at something nobody had
asked, exactly as `AGENTS.md` predicts.

### Item 2 — `activeEnchantment` — REFUTED, then fixed for a different reason

The standing flag was that `equipped_weapon === 2` pairs the SECONDARY
enchantment type with the PRIMARY potency. **It is faithful to the build and
must not be "fixed".** `damagecharacter`'s proc gate is
`randomBetween(1,100) < game_attacker.weapon_enchantment_potency * 10`
(`+0x1bf1`, `+0x1c09..+0x1c22`) — the primary field, read unconditionally, in a
gate hoisted OUT of and evaluated BEFORE the first `equipped_weapon` test at
`+0x1c27`. Only the TYPE branches. `secondary_weapon_enchantment_potency` is
read nowhere in `damagecharacter`, and `magicweapon_percentage` occurs exactly
twice in the whole build — one write, one read — so there is exactly one
enchantment roll. `ss2-battle-map.md:1485` already said so in prose.

**This is last session's `+0x51d5` lesson running backwards.** That session
overruled a correct map from memory. This one was handed a plausible bug report
against correct code. Same defence both times: read the bytes. The offsets are
now quoted at the function so the next reader has to delete a derivation.

**The real defect, which nobody had named:** each status arm is
`(equipped_weapon == 1 && weapon_enchantment_type == N) ||
(equipped_weapon == 2 && secondary_weapon_enchantment_type == N)`, so any other
`equipped_weapon` applies NO status — while the module treated "not 2" as
"primary" and applied one. Fixed, data-neutral (all 12 corpus values are 1),
three tests, both mutants die.

### Item 3 — `localeCompare` — DONE, and it was bigger than "one line each"

Five files, not two. **`tools/runtime-capture/build-manifest.mjs:136` orders
capture sessions, and that order is inside the digest all 22 promoted goldens
cite as `provenance.captureManifestSha256`.** Two machines could mint two
different, equally "correct" digests for byte-identical evidence — and the
comment four lines above it exists to prevent that class one layer higher.

Measured over the 86 committed sessionIds (3,655 pairs): en-US and eleven other
locales agree with code-unit order on every pair; **haw-US reorders 1, az-AZ
reorders 682.** The fix is provably free, and verified directly rather than
inferred: **22 of 22 committed manifests still rebuild to the digest their
golden cites**, and 0 of 22 reorder under six locales. The tiebreak is not
vacuous — there are exactly 2 `observedAt` ties in the corpus.

`initiativeOrder` was worse than the recorded "hash diverges": it drives
`currentCombatant` and `advanceTurn`, so **the winner flips** while the RNG
stream stays bit-identical.

### Item 5 — the adapter gap — the source comment was FALSE

`src/team/ss2-rules.js:86` said "A battle built through `src/adapter/` therefore
cannot feed this rule set". It can: `declaredFillResources` reads `resources`
straight off `team.aiFill`, bypassing `CANONICAL_RESOURCE_SOURCES` for AI-filled
slots. I built one and it resolved actions with real vanilla writes and
`unmapped: []`. Only the **supplied-gladiator** path is blocked. The throw that
actually fires names `max_damage, min_damage`, not `maximumHealth`'s.

Gap 3 was false too: `weapon_min_damage`/`weapon_max_damage` ARE derivable from
a character record — `_root["weapon" + <char>.weapon][3]`/`[4]` (`+0x31be`,
`+0x31da`) into a static literal table in the same root-frame-35 block
(`weapon24 = Array(3, "Hatchet", 4, 8, 32, 1)` at `+0x41c6`). What is missing is
that `weapon` is not declarable and the table is not transcribed. **An open
omission, not a closed impossibility** — and the difference decides whether
anyone tries.

### Item 4 — the RNG tape — ANSWERED, and the answer inverts. **Your call.**

The collision is real and reproduced: two battles whose tapes differ only in an
unconsumed sample both hash to `2b429191`. But this project's written remedy —
"a digest of the samples" — **hands every receiver a brute-forceable commitment
to undrawn randomness** (two remaining samples recovered in 600 candidates), and
splitting wire from hash does not fix it, because peers must exchange the hash
for a desync check to exist. **The leak-free maximum is a digest of the CONSUMED
PREFIX**, which cannot see a future divergence but closes every past one —
including the case all three candidate designs miss, two tapes whose
already-drawn sample differed while producing identical state.

**The decision is "detect future divergence early and leak future rolls, or
detect only past divergence and leak nothing".** Nothing was landed.

## Capture prep — a blocker that was never real

**`run-arena.ps1` accepts `-WatchFields` (`:137`), forwards it (`:295`), and
carries `-StageHero`/`-StageVillain` (`:100-101`) AND its own snapshot guard.**
Three live docs said otherwise and would have sent a supervised window to the
unguarded vehicle. It is exercised, not merely declared: five archived
rufflelogs emit `{"t":"dbg","at":"watch-extended","added":11}`.

So the two removal fixtures need one command on the GUARDED vehicle, with the
identical flag for both:

```
-WatchFields "helmet_defence,shoulderguard_defence"
```

What is still true of `launch-capture.ps1`: it alone passes `-ArenaPolicy ''`
with `-Autopilot`, so only the two DIRECTION-5 armoured members clear the
guarded vehicle.

**Do not expect the window to yield an observation.** `-WatchFields` is
necessary and not sufficient: both fixtures pin `staminaleft 105` on both sides,
which held in 0 of 38 armed rounds, and the reports also diverge on
`attackDirection`, `mutationTrace/0/*`, `finalState/hero/hitpoints`,
`finalState/villain/armourclass`, `events/0/method` and `samples/length`.
Raisable without the schema change: pin the approach-step count, and extend the
runbook's `-StageVillain` string to `speed` and `strength` — `applyStageSide`
has no whitelist, so it can already write them.

## Highest-value work, ranked

1. **CAPTURE AN ARMOURED FIXTURE — still first, and now unblocked at the vehicle
   level.** The command is above. Supervised, serial, save-mutating; needs the
   owner. Sync `/mnt/c/ss2-capture` first — it is at `98482b6`, many commits
   behind.
2. **Decide item 4** (consumed-prefix digest vs. remainder digest). One
   paragraph of your judgement unblocks a resolver-contract change that is
   otherwise fully costed.
3. **Model enchantment DAMAGE.** `weapon_enchantment_damage` (`+0x320c`) and
   `secondary_weapon_enchantment_damage` (`+0x3326`) are both dropped, so an
   enchanted weapon applies a status and deals no magic damage. The secondary is
   missing from the adapter catalogue too — an asymmetry, not a decision.
4. **Transcribe the static weapon table** and make `weapon` declarable, which
   closes gap 3 rather than restating it.
5. **The `COMBATANT_KEYS` schema question is unchanged and still yours.**

## Traps from this session

- **A PLAUSIBLE BUG REPORT AGAINST CORRECT CODE IS AS DANGEROUS AS A WRONG MAP.**
  Item 2's "fix" would have de-aligned the module from the build. The only thing
  that stopped it was reading the bytes — twice, independently.
- **MY OWN TESTS WERE SATURATED AND I NEARLY SHIPPED THEM.** Restoring
  `localeCompare` left the tests *named for* locale-independence GREEN, because
  the assertions ran in an en-US process. They now run the real code in a child
  under `LC_ALL=az-AZ`, each with a vacuity guard that fails if ICU stops
  reordering the chosen pair. **A test named for a property is not that
  property — run the mutant.**
- **THE HIGHEST-VALUE SITE HAD NO TEST AT ALL, AND ONLY A MUTATION FOUND IT.**
  Reverting the manifest tiebreak and running all of `capture-campaign.test.js`
  under `az-AZ` passed **76 of 76**.
- **AN ORACLE COMPUTED FROM THE TABLE UNDER TEST IS NOT AN ORACLE.** Five of the
  eight `SS2_ARMOUR_DVAL` constants could be set to 500 with the suite green.
  For build DATA the fix is a literal pin with the offset, not desaturation —
  the only honest oracle for build data is the build.
- **A CLAMP CAN SATURATE A TEST MORE THOROUGHLY THAN A FIXTURE VALUE.** 265 of
  326 invocations of the phase-transition heal have zero headroom and write
  nothing, including every odd-stamina one, which is why `ceil -> floor` and
  even `+ (stamina % 2) * 1000` both passed.
- **`/mnt/d` FAILING DOES NOT MEAN `D:` IS UNPLUGGED, AND I REPORTED IT WRONG.**
  The drive is attached and healthy; `D:\ss2-backups` holds all seven expected
  directories. The failure is a stale WSL 9p mount. **Check `D:` from Windows.**
  A session that reads `/mnt/d` and reports the backup gone is raising a
  data-loss scare that is not real.
- **AN "OPEN" WORKLIST ITEM ASKING YOU TO REDO FINISHED WORK COSTS MORE THAN A
  MISSING ONE.** `ss2-arena-route.md` item 9 asked for a table fix that had
  already landed. Check the target before actioning an item; strike closed items
  rather than deleting them.

## Hard rules (unchanged)

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map** — and when you think the map is
  wrong, read the bytes before writing the code that says so. **When you think
  the CODE is wrong, read the bytes before changing it.**
- A rule set may never claim a tier it has not earned.
- `validate-vehicle.ps1` must PASS after ANY wrapper edit.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.**
