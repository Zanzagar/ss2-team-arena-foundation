# SS2 Team Arena roadmap

The destination remains cooperative SS2 campaign play with 2v2 and 3v3
battles. The 1v1 work is a parity gate for one shared resolver, not a reduction
of team scope or a separate game mode architecture.

## Delivery sequence

| Stage | Deliverable | Status |
| --- | --- | --- |
| 0. Deterministic foundation | Asset-free 1–3 combatants per team, AI, hot-seat/remote controller identities, replay, wire state, and state hashes | complete |
| 0b. Team-resolver seam | One shared resolver in `src/team/` for 1v1/2v2/3v3, injected rule set, ordered authoritative RNG channel, seat/controller split, AI fill, team elimination, once-only settlement | complete, running placeholder rules |
| 1. Licensed-build map | Battle entry, state objects, RNG, formulas, spells, results, clips, and Collection mod route | complete for the fingerprinted build |
| 2. 1v1 parity harness | Fingerprint-keyed static candidates, strict ordered RNG/mutation traces, isolated rule candidate, acknowledgement-token result bridge | complete (static candidates) |
| 3. Runtime golden capture | Repeat controlled attacks in the licensed build and promote matching candidates to runtime-observed goldens | first golden promoted (`golden-prisoner-normal-kill-dir6`, two independent unattended observations); capture runs are fully automated, so the remaining work is breadth — more actions and scenarios through the same loop |
| 4. SS2 adapter and UI seam | Convert vanilla combatants to canonical state; bind events to fighter clips, panels, and final result acknowledgement | planned; the engine-side contract it binds to is fixed (see below) |
| 5. 2v2 campaign co-op | Player-controlled allies, AI fill, two-team elimination, campaign roster/save/reward integration, and a four-slot arena | mechanics landed asset-free; campaign roster/save/reward integration and the arena UI are not started |
| 6. 3v3 campaign co-op | Up to three allied controllers or AI fills, six-slot arena, team targeting, persistence, and balance passes | same: the six-slot resolver path runs and replays deterministically; persistence, UI, and balance are not started |
| 7. Online synchronization | Host-authoritative transport, lobby/auth, reconnect, desync recovery, and observed-result diagnostics | planned; the controller-independent combat hash and the ordered RNG journal it needs exist |

Stage 0b is a structural stage, not a parity stage. It changes nothing about
what is verified: the only runtime-verified behaviour in this repository is
still the single golden `golden-prisoner-normal-kill-dir6`, and Stage 3 remains
breadth work. Every formula the resolver runs today is a placeholder and is
labelled as one in code, in the wire state, and in the docs.

## Campaign co-op constraints

- Every 1v1, 2v2, and 3v3 action must converge on the same resolver and ordered
  authoritative RNG channel once runtime parity is established.
- An individual knockout emits a combatant-defeated event. Campaign settlement
  and rewards occur once, only after an entire team is eliminated and the final
  animation is acknowledged.
- Controller identity is independent of combatant identity. A campaign team can
  mix local, hot-seat, remote, and AI-controlled allies without a second combat
  implementation.
- Campaign saves add a separate team-battle record and migration version; they
  do not overwrite vanilla save fields while the adapter is experimental.
- Online co-op is a transport stage after local deterministic 2v2/3v3 behavior,
  not a different ruleset.

## How the constraints are met today

| Constraint | Where it lives | State |
| --- | --- | --- |
| one shared resolver and ordered RNG channel | `src/team/resolver.js`, `src/team/rng.js` | done; `src/engine.js` is a façade over it and 1v1 has no separate path |
| knockout ≠ settlement | `src/team/elimination.js`, `src/team/settlement.js` | done; a knockout emits `defeated` only |
| settle once, after elimination *and* acknowledgement | `src/team/settlement.js` | done; two gates, private latch, repeats return `false` |
| controller identity independent of combatants | `src/team/controllers.js` | done; seat → controller registry, excluded from the combat hash |
| AI fill for empty slots, no second path | `src/team/roster.js` | done; filled fighters use the same constructor and protocol |
| verified rules replace placeholders by injection | `src/team/rule-set.js` | seam done; **no verified rule set exists yet** |
| campaign roster/save/reward integration | — | not started |
| six-slot arena layout, clips, panels | — | not started (Stage 4) |
| host-authoritative transport | — | not started (Stage 7) |

The rule-set interface, the event and acknowledgement protocol, the settlement
guarantee, and the controller/combatant split are specified in
[the adapter contract](ss2-adapter-contract.md).

Original game binaries and assets remain outside the repository. Distributable
work is limited to independently authored source, metadata, fixtures, and
patches.
