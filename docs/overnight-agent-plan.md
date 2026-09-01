# Overnight agent plan

A ready-to-run fan-out for a large parallel session. Rewritten 2026-08-31 after
two such runs actually happened — **23 agents, then 20** — so the sizing, the
track list and the claim list below are records rather than estimates. Read
[`HANDOFF.md`](../HANDOFF.md) first; everything here assumes its state.

The two runs are recoverable, and every number in this file was derived from
them rather than remembered:

These two runs were made from the OneDrive tree, which has since been retired,
so the project directory below is the one that tree's path produced. **Derive
the directory rather than copying this one** — Claude Code names it after the
absolute path of the tree it was launched in, with separators flattened, so it
moved when the tree moved (Windows now `C:\ss2-capture`, WSL
`~/projects/swords-and-sandals-2-multiplayer`). See
[`handoffs/README.md`](handoffs/README.md) § Frontmatter for the rule.

```
%USERPROFILE%\.claude\projects\C--Users-corey-OneDrive-Documents-ChatGPT-SS2-Multiplayer-Mod\
  5132b52c-36d1-4d07-830e-7fb04e25e78e\subagents\workflows\
    wf_9ade3160-946\   23 agents, 2026-08-31 04:40Z-05:40Z
    wf_e692e46d-461\   20 agents, 2026-08-31 10:12Z-
```

Each `agent-*.jsonl` holds that agent's whole transcript, first message
(its brief) included.

## The two points that survive unchanged

Everything else in the previous version of this file has been overtaken. These
two have not, and both were reconfirmed by the runs.

### No agent may launch Ruffle

Every capture is serial and supervised, and no track below produces runtime
evidence. What the tracks produce is everything that makes the next supervised
capture session cheap: fixtures derived from the map, staging plans, audits, and
the code the pipeline needs. Forty-three agents have now run under this rule,
and the one thing that made it survivable is that the rule was in every brief
verbatim rather than assumed.

One exception is defensible. Isolated-store sessions (`-SaveDirectory`) provably
cannot touch the licensed save — verified live: three concurrent sessions
completed, all matched promoted goldens, and the master `ss2_data.sol` was
byte-identical afterwards. So a *tightly scoped* capture agent restricted to
`-Concurrency` prisoner-family rounds is justifiable if throughput is wanted.
**The arena route must never be in an unattended run**: it is the only thing
that writes the licensed save, and it has already twice been saved from
corrupting a gladiator by a guard rather than by a plan.

Note what the rule costs, because it is not free. Several of the sharpest
findings below end in "and the confirming run is one arena round" — a
write-nothing auditor can prove a guard is dead but cannot prove a fixed one
fires. That gap is structural and is the main reason the supervised window is
the scarce resource, not the agent count.

### The limit is the file graph, not the budget

With no cap on agent count, the binding constraint is **exclusive file
ownership**. Two writers on one file corrupt each other's work, and the moment
tracks are invented to fill a quota their briefs go vague — and a vague brief is
where the value collapses. Both runs bear this out; see *Sizing* below for what
the graph actually measures.

## What became of the eight original tracks

All eight are closed as written. Six landed; two were overtaken by better
evidence. The column that matters is the third one.

| # | Original track | Landed as | What replaced it |
| --- | --- | --- | --- |
| 1 | Spell ingress hook | `7601888` | Done and **not sufficient**, which the commit said at the time. The hook label and the `magic-damage` event are correct; the family is still unreachable because `attack_chances` is not reachable on a hero cast turn and `spell_id` does not exist in the build, so the emit sits on a permanently dead path. Run 2 added that `campaign.mjs plan` cannot even *express* this: it reports only flag-fixable blockers for all eight spell members. Successor work is a blocker vocabulary that can say "the ingress cannot arm", plus the byte-backed arming point (`cast_spell_icon`). |
| 2 | Per-slot AI fill | `193e54d` | Done. The retirement half — dropping `battle-host.js`'s `aiFillWithResources` workaround — is the track a wrong file path cost, twice over; see *Briefs* below. Re-issued in run 2 with the correct three-file slice. |
| 3 | Audit of the golden pipeline | `cc42503` | Done, and it keeps paying. Two forgeries closed there; a third (hook attribution stripped from both sides) is open in HANDOFF; run 2 found a fourth that needs **no forgery at all** — a miss-family fixture has an empty mutation trace, and every remaining compared channel is side-blind. |
| 4 | Audit of capture attestation | `cc42503` | Done. It found the launch-nonce gate was opt-out. |
| 5 | Test-suite hardening sweep | `320451e`, `test/ss2-assertion-quality.test.js` | Landed, and **do not treat the class as closed**. Run 2 found three more assertions that cannot fail *in the file a hardening pass had just rewritten*, plus one digest check left behind a branch that is still dead by construction. This is a standing track, not a completed one. |
| 6 | `ss2-capture-staging.md` reconciliation | `0a3076c` | Done, re-issued in run 2 for the arena-era facts. |
| 7 | Battle-map completion | `0a3076c` | Done, re-issued in run 2. |
| 8 | Isolated capture campaign (throughput) | — | **Overtaken.** Twenty-two supervised `run-arena.ps1` rounds ran instead, and they produced the session's biggest finding. Throughput was never the binding constraint; *attribution* is. More prisoner-family rounds would have added nothing that twenty-two arena rounds did not. |

## What two real runs cost

Both runs were `claude-opus-5` throughout. Token counts are the four API
counters summed; the fourth (cache read) dominates, which is exactly why the old
estimate in this file was wrong by two orders of magnitude.

| | Run 1 | Run 2 (auditor wave) |
| --- | --- | --- |
| Agents | 23, in three waves (11 / 6 / 6) | 10, one wave |
| Wall clock, first byte to last | **59.8 min** | **24.9 min** |
| Per-agent duration, min / median / max | 7.0 / 13.8 / 25.8 min | 9.0 / 16.0 / 24.8 min |
| Per-agent turns, min / max | 63 / 212 | 38 / 131 |
| Unique tokens per agent (cache-create + output) | 170k / 425k / 649k | 233k / 411k / 517k |
| Unique tokens, whole run | **9.41M** | 3.76M |
| Billed tokens per agent, min / median / max | 4.3M / 13.5M / 47.8M | 3.0M / 15.3M / 17.9M |
| Billed tokens, whole run | **343.2M** | 121.3M |
| Of which cache reads | 333.8M (97.3%) | 117.6M (96.9%) |

Run 2's writer wave (10 agents, launched 25 minutes after its auditors) was
still in flight when this file was written, so its totals are not recorded here.
At 7 minutes in it had spent 79.8M billed tokens across the ten.

Three things follow.

- **The old figure — "150k–380k tokens each, so twenty is roughly 3–6M" — was
  measuring only unique tokens, and it was roughly right about those** (measured
  170k–649k, median 425k). It ignored cache reads entirely, and cache reads are
  97% of the volume. Plan with both numbers: unique tokens track how much
  *thinking* was done; billed tokens track what the run costs.
- **Wall clock is set by the slowest agent in a wave, not by the count.** Run 1's
  first wave was 11 agents in 17.9 minutes; its second was 6 agents in 25.9,
  because one agent ran 25.8 minutes alone. Adding agents to a wave is close to
  free in time. Adding waves is not.
- **Agent count is a weak predictor of cost.** Run 1's three waves cost 134.1M
  (11 agents), 141.1M (6) and 68.0M (6); run 2's auditor wave cost 121.3M (10).
  Depth of investigation is the strong predictor: the single most expensive
  agent in run 1 spent 47.8M over 212 turns, more than the whole six-agent
  verifier wave.

## What the two runs taught about briefs

This is where the value was won and lost, and it is the part of this document
most worth reading before writing any agent prompt.

**1. A brief naming ONE specific claim is the whole technique.** Every
substantive finding in both runs came from a brief of the form "here is one
sentence someone asserted; try to break it". Run 2's ten auditors returned two
HOLDS, three PARTIALLY-BROKEN and five BROKEN, and the eight non-clean verdicts
each named a defect nobody had suspected: a guard reading a path the game never
writes, a comparison channel that compares the fixture to itself, three more
assertions that cannot fail, a planner that refuses to read evidence it wrote
itself. The two HOLDS were worth as much as the breaks: one unblocked eight
fixtures the project was about to give up on, and the other upheld its claim
only after discovering that the guard it defends reads an object the game never
writes. **A verdict of HOLDS is not a wasted agent.**

**2. Check every path in the brief against the tree before launch.** In run 1 a
writer was briefed with `src/team/battle-host.js`. That file does not exist; the
file is `src/adapter/battle-host.js`. The agent did the right thing — it
verified the premise, found the path wrong, refused to edit a file outside its
stated ownership, and reported. But the track produced one test instead of the
change, and the whole slice had to be re-issued in run 2. One `git ls-files`
before launch would have bought it back. **A wrong path in a brief costs the
whole track, and a well-behaved agent cannot rescue it** — the better the agent,
the more certainly it stops.

**3. A writer slice must contain every file the change makes red.** The same
track failed a second way: `test/team-resolver.test.js` was handed over as the
paired test, but it does not import `battle-host.js` at all, and the three
assertion sites that pin the workaround all live in
`test/ss2-adapter-integration.test.js` — one of them an entire test that pins the
defect being removed. A source edit and the test rewrite it forces have to land
in one owner's hands. Run 2's re-issue owns all three files.

**4. A brief's premise is a hypothesis, and the agent must be free to overturn
it.** Run 2's direction-5 brief asked its deciding question as "of the 124
observations carrying `attack_direction` 5, how many are live hero attacks *as
opposed to injected-tape simulations*". Both halves were wrong: the auditor could
not reproduce 124 (41 of the archive's direction-5 traces are stub runs where
`stub-game.as:51` hard-codes the value), and the opposition does not exist,
because the direction is drawn *before* the tape's arming latch and so is a live
draw in every trace. **Answered on the brief's own terms the check returns zero
and blocks eight reachable fixtures on a false negative.** It returned 17.
State a brief's premises as premises, and say in the prompt that overturning one
is a finding.

**5. Update the claim list at the moment claims are handed out.** The brief for
this rewrite proposed four claims to add to the auditor list — mislabelled
traces reaching a golden, direction-5 reachability, the save-state guards, and
`campaign.mjs plan` completeness. All four had been dispatched to auditors in
the same wave and their verdicts are recorded below. No harm done here, but a
list that lags the dispatch by one wave is how two agents get the same question.

**6. Add a verifier wave.** Run 1 ran six writers and then one adversarial
verifier per writer, each told to check ownership, re-run the suite, and attack
the writer's central claim. **All six returned PARTIALLY-BROKEN** — every writer
output had something wrong in it — while confirming zero ownership violations
across the whole run. A verifier wave costs about half a writer wave (68.0M
billed tokens for six, 16.0 minutes) and it caught something six times out of
six. It is the cheapest quality step in the run.

## Standing rules — paste into every agent prompt

- You own ONLY the files listed under YOUR FILES. Touch nothing else. If you
  become convinced another file must change, STOP that part and say so
  prominently in your report.
- NEVER run a state-mutating git command. Read-only git is fine. The main
  session owns git and commits everything.
- NEVER launch Ruffle. Never write to the game installation, the Ruffle save
  (`%LOCALAPPDATA%\ruffle\SharedObjects`) or the snapshots
  (`%LOCALAPPDATA%\ss2-capture-snapshots`).
- READ-ONLY static inspection of the installed SWF is permitted and is how the
  maps were made: `node tools/inspect-swf.mjs "<swf>" --references '<name>'
  --around 90`. You may READ. You may NOT copy, export, patch or write any part
  of the SWF or any decompiled game script anywhere. Only frame labels, symbol
  names, character ids, instruction offsets and derived numbers may enter a
  document.
- Never hand-write a golden fixture, an observation record or a capture
  manifest. Those come from the pipeline only.
- THE DESIGN TRACK IS QUARANTINED. Do not read `docs/design/**` unless the brief
  says to.
- For any assertion you add or change, name the one-line implementation mutation
  that should break it, and check that it does. This project's signature defect
  is an assertion that cannot fail; six audits have each found one and each was
  hiding a real bug.
- Tests: `node --test --test-concurrency=1` (node >= 26; no dependencies to
  install). Concurrency 1 because the machine is memory-starved with many agents
  and parallel spawns intermittently fail with `spawn UNKNOWN`, which is not a
  code failure. **In a Windows-native session `node` is not on PATH** — use the
  codex runtime's, resolved not pinned since the directory moves on update:
  `'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'`.
  A tree WITHOUT the gitignored `captures/` archive correctly reports 1 skipped;
  that is the archive existence check, not a defect.
- Leave the suite green and report the exact count. If it is already red when
  you arrive, say so and name the failing file — in a parallel run that is
  usually another writer mid-edit, and it is not yours to fix.
- Scratch files go in the session scratchpad, never in the repo.
- Do not soften findings. A brief that turns out to be wrong is a finding, not a
  failure.

Two rules for whoever WRITES the briefs, which are worth as much as the rules
above:

- **Check paths in BOTH directions before launch.** (a) Every path a brief names
  resolves in `git ls-files`. (b) Every file the subject matter touches appears in
  SOME brief — derive that set from an UNFILTERED `git ls-files`, and whenever you
  filter it (`grep -v`, a glob, a directory prefix) print what the filter REMOVED
  and read that list. Direction (b) is the one that has actually failed:
  `git ls-files test | grep -v fixtures` silently ate three real test files, and
  concluding a file does not exist because your own filter removed it produces no
  error and no stop — just a quietly narrower slice.
- Give each writer every file its change makes red, and say which of them is
  co-owned with nobody.
- **Count the agents that actually started, and check every one returned.** An
  orchestrator can drop a whole stage silently: `pipeline([null], stage1, stage2)`
  treats a null item as already-dropped and runs no stage, so a writer and its
  three verifiers never spawn and the run still reports success. A wave that
  silently spawned nothing returns FAST, which this document otherwise teaches you
  to read as a good outcome ("wall clock is set by the slowest agent, not by the
  count"). After every launch, assert the started count equals the number of briefs
  you wrote, and record both. For a writer → verifier shape use `await agent(...)`
  then `parallel(...)`, never a `pipeline` seeded from a value that can be null.
- **A partly-failed wave is worse than a failed one.** On 2026-08-31 an analysis
  phase completed while all four of its adversarial verifiers died on a usage
  limit. The workflow reported COMPLETED and returned four confident,
  unverified reports — the exact shape of a result you would act on. Check
  per-agent state, not just the run's status; resume with `resumeFromRunId`,
  which replays the completed agents from cache for free.

## Sizing

**Writers are capped by the file graph.** Measured, not estimated: the
repository tracks 35 source files under `src/`, 18 `test/*.test.js` files, 20
scripts under `tools/`, and 21 documents outside the quarantined design track. A
writer track needs a coherent slice of those plus the tests that pin it, which
supports **ten to twelve** genuinely disjoint slices. Run 2 ran exactly ten and
they did not collide:

```
src/golden/observation.js + promote-1v1-golden.js + 2 tests
src/adapter/battle-host.js + ss2-adapter-integration + team-resolver tests
tools/runtime-capture/campaign.mjs + test/capture-campaign.test.js
tools/runtime-capture/validate-vehicle.ps1
tools/runtime-capture/run-capture.ps1
test/ss2-capture-attestation.test.js
docs/integration/ss2-battle-map.md
docs/integration/ss2-capture-staging.md
docs/integration/ss2-runtime-capture.md
docs/overnight-agent-plan.md
```

Note the shape of the first two: a source file and *all* the tests it can
redden. Slices that split a source file from its pinning test are the ones that
fail.

**Adversarial verifiers have no such cap, because they write nothing.** They
cannot conflict with a writer or with each other, so they can be run as widely
as there are sharp questions to ask — and running SEVERAL independent auditors
against the SAME target is a quality technique rather than duplication. Run 2
proved the overlap is the check: two auditors given different claims arrived
independently at the same critical fact about `game_attacker` — that the read
targets the wrong object — from different directions, and both warned, without
having seen each other's work, that the fix HANDOFF proposes would on its own be
a total capture outage on every route.

**The shape that works, from two runs:**

1. Auditors — as many as there are load-bearing claims, one claim each. 10–11
   is comfortable; it is also the cheapest wave per finding.
2. Writers — up to ten disjoint slices, briefed from what the auditors found.
3. Verifiers — one per writer. Six for six caught something every time.

Twenty to twenty-five agents total is comfortable and takes about an hour of
wall clock. Forty is possible if the extra ones are auditors with genuinely
distinct questions, and pointless if they are auditors with the same question.

## Claims already handed to an auditor

Struck from the open list. Each was attacked by a write-nothing auditor and the
verdict is recorded here so nobody spends a wave re-asking it.

| Claim | Verdict |
| --- | --- |
| A candidate becomes golden only via two matching observations from two independent sessions | **BROKEN twice.** The launch-nonce gate was opt-out (`cc42503`); and the gate never compares observations to each other, so one poisoned trace plus one genuine one clears it. |
| The wrapper never decides an outcome; it only presses the game's own entry points | Attacked against the byte map (`b8d0d94`); differences found and fixed. |
| The 22 goldens are byte-identical and their provenance is intact | **HOLDS.** All 22 re-derived; all 47 cited observations resolve. |
| `validate-vehicle.ps1` passing means the wrapper is sound | **BROKEN.** It catches 0 of the 6 defects found live, and `isNum` has zero reachable call sites in a stub run. Now says so in its own PASS output. |
| The `isNum` guard is used everywhere it is needed | **BROKEN.** One site survives at `ss2-capture-wrapper.as:1407`. |
| No design-track content has leaked into any fixture or observation | **HOLDS.** Attacked four ways with authorised access to `docs/design/**`; PR #1's diff touches no fixture, observation, manifest, `src/golden` or capture tool, and no design coinage appears anywhere under `test/`, `src/` or `tools/`. The single numeric overlap found resolves in the safe direction: it reached the design from the integration map, not the reverse. |
| The champion was decoded from the map before it was seen | **BROKEN**, and corrected in HANDOFF: the formulas were pre-registered, the DNA index map was written 42 minutes after the last draw. Postdiction, not prediction. |
| The fifteen impossible-hero fixtures are a forced contradiction | **HOLDS**, and got worse: the champion family adds five more, taking it to twenty. |
| A hero `normal_attack` can produce `attack_direction` 5, so the direction-5 fixtures are reachable | **HOLDS (high).** `randomBetween(5,8)` is inclusive at both bounds, byte-verified at all three definition sites; 17 live captures record a hero swing at 5. The eleven arena hero swings that never showed a 5 are a 4.2% event. **More rounds are worth running.** |
| A mislabelled villain-swing trace could never be promoted to a golden | **BROKEN.** Three promoted `*-rollneeded-miss` goldens have an empty mutation trace, and for a miss every other compared channel is side-blind. A concrete matching pair was constructed. |
| The new `Test-SaveIntact` guards refuse every damaged save and no legitimate one | **BROKEN both ways.** A save zeroed from byte 128, a consistently truncated save and a non-SharedObject carrying four marker strings all pass; a healthy save merely held open throws, and one caught mid-flush is misdiagnosed as TRUNCATED. |
| `campaign.mjs plan` names every reason a family is currently unreachable | **BROKEN.** `plan --family armoured-deflection-threshold-cleared --json` returns `"blockers": []` for the fixture HANDOFF names as the next step, while six divergence reports for it sit committed in the repo — `computeCoverage` never reads that directory. Reproduced first-hand while writing this file. |
| Parallel capture cannot touch the licensed save | **HOLDS for the save, BROKEN for the neighbour.** Three concurrent isolated sessions left the master `ss2_data.sol` byte-identical; but `run-arena.ps1` can still destroy a concurrent isolated session — see the next row. |
| `run-arena.ps1` now closes only its own Ruffle window | **PARTIALLY BROKEN.** The pid-scoped close works, but WINDOW-GONE routes deterministically back into the blanket kill. |
| Stripping SGR escapes cannot alter how any evidence parses | **PARTIALLY BROKEN.** Extensionally true over all 837 archived files, but the stated cause (raised `RUST_LOG`) is falsified by 34 logs, and the strip can convert a counted parse failure into a silent payload rewrite. |
| After hardening, no assertion in `test/ss2-divergence-corpus.test.js` can pass unconditionally | **BROKEN.** Three still cannot fail, and all 81 committed report digests can be replaced with `a`×64 with the suite green. |
| The wrong-side guard is skipped on the arena route specifically | **BROKEN, and worse than stated.** `game_attacker` is an overlay-clip variable; `gameRoot().game_attacker` is a path the game never writes, so the guard is dead on EVERY route. Independently verified here: `capture-refused-wrong-side` appears in 0 of 268 archived `.rufflelog` files, against 1091 `capture-refused-unstaged`. **HANDOFF's "six such lines exist in older prisoner-route captures" is a misread of three compiled wrapper copies and needs correcting by its owner.** |

## Claims worth handing to an auditor now, one each

Each is currently asserted somewhere, is load-bearing, and has not been
attacked. The first four were generated by the audits above and are the sharpest.

1. **"Reading `overlayClip().game_attacker` and refusing when it is unresolved
   fixes the wrong-side defect at no cost."** Two auditors converged on this fix
   and neither attacked it. It predicts ~11 arms per 20 arena rounds instead of
   20, and retried arms seeing a hero the villain already dented. Attack the
   prediction, and attack the claim that a short live run could tell a working
   guard from the dead one.
2. **"`/samples` is the only self-comparing channel in
   `matchSs2ObservationToFixture`."** `min`, `max`, `value`, `label`, `callSite`
   and `injected` were all found to be the fixture read back rather than
   observations of the game. Sweep the remaining channels — `events`,
   `finalState`, `scenario`, `resultEvent` — and establish for each whether it
   carries anything the game produced.
3. **"The vehicle gate exercises every wrapper branch the live route uses."** It
   was audited once and found narrow; it is now known to be narrower still,
   because `stub-game.as:51` presents `attack_direction = 5` as a hard-coded
   constant, so every direction-reading branch is validated at one value
   forever. Enumerate what else the stub pins to a constant.
4. **"The armoured and tournament families are producible by the current
   tooling."** HANDOFF calls them the cheapest real evidence and the next step.
   The identical claim about the champion family was broken this session by
   arithmetic — `attack 3`, `defence 3`, `staminamax 150` and `hitpointsmax 250`
   are unreachable for any gladiator this tooling can build. Run the same check
   on all eight remaining fixtures BEFORE the next supervised window is spent.
5. **"Translating hook `reason` through the hook table closes the third
   forgery."** HANDOFF prescribes the fix; nobody has attacked the fix. Include
   its explicit warning not to substitute a `callSite` comparison, and check
   whether the translation is itself constant-versus-constant.
6. **"Every committed divergence report is tied to real evidence."** The digest
   check is dead by construction, the raw-trace census covers only the probe
   family, and a fully forged armoured report is accepted by the whole suite
   (620 tests at `2d0b077`; re-measure rather than quoting this).
   Attack the fix as well as the defect: a census widened to all families must
   not fire on a machine that legitimately holds one family's evidence and not
   another's.
7. **"`-ArenaStagedLevel` gates on the quantity the fixtures constrain."** It
   tests `herolevel` while the fixtures constrain `hitpointsmax = herolevel*10 +
   vitality*20`, so a bout can pass the gate and diverge anyway. Establish
   whether any fixture-free gate can do this job, or whether the gate is only a
   diagnostic.
8. **"Colour in Ruffle's output is governed by something this repository
   controls."** The stated cause was falsified and the real trigger is unpinned:
   colour splits cleanly on wall clock at 2026-08-31 01:51:20 and on nothing
   else, in a file-redirected stdout. Whoever attacks this needs one Ruffle
   launch with and without `NO_COLOR`, so it belongs to the supervised session,
   not to an agent.
9. **"The arena route cannot corrupt the save."** Re-ask it: the previous audit
   predates `save-state.ps1`'s new guards, and the restore path still never
   checks that the live save is covered by the snapshot tree.
10. **"Ingest refuses a mis-staged scenario."** Carried over from the previous
    version of this list and still not attacked. `779db70` landed the staging
    validation; nobody has thrown deliberately malformed traces at
    `capture-ingest.js`'s chain validation. Now sharper than when it was
    written, because the same file was just shown to copy `attackerSide`
    through unchallenged.
11. **"The suite's size is its strength."** Re-measure first — it was 620 at
    `2d0b077`, and this line said 586 for three sessions after that stopped being
    true. Quote what your own run prints. The suite grew by ratchet, one hardening
    pass at a time. Ask what fraction of it would still pass against a stub
    implementation of `src/golden/**`, the way the pipeline audit asked it of
    the golden tests alone.

## What NOT to give an unattended agent

- Anything using `run-arena.ps1`, `-Navigate arena`, `-StageGold`,
  `-ShopWeapon` or `-StageHero`. That path writes the licensed save.
- `tools/runtime-capture/ss2-capture-wrapper.as` while a supervised capture
  session is in progress — the main session edits it and re-validates the
  vehicle after every change. Both runs froze it, and both produced wrapper
  findings that had to be reported rather than fixed. That is the correct
  trade, but it means a wrapper fix wave has to be scheduled deliberately,
  between capture sessions, with the gate re-run.
- Authoring a candidate fixture from anything other than the map. The
  discipline is absolute: a candidate fitted to an observation makes its own
  confirmation meaningless.
- Any brief whose paths have not been checked against `git ls-files`.
