# SS2 Team Arena roadmap

The destination remains cooperative SS2 campaign play with 2v2 and 3v3
battles. The 1v1 work is a parity gate for one shared resolver, not a reduction
of team scope or a separate game mode architecture.

## Delivery sequence

| Stage | Deliverable | Status |
| --- | --- | --- |
| 0. Deterministic foundation | Asset-free 1–3 combatants per team, AI, hot-seat/remote controller identities, replay, wire state, and state hashes | complete |
| 1. Licensed-build map | Battle entry, state objects, RNG, formulas, spells, results, clips, and Collection mod route | complete for the fingerprinted build |
| 2. 1v1 parity harness | Fingerprint-keyed static candidates, strict ordered RNG/mutation traces, isolated rule candidate, acknowledgement-token result bridge | complete (static candidates) |
| 3. Runtime golden capture | Repeat controlled attacks in the licensed build and promote matching candidates to runtime-observed goldens | in progress — pipeline, fifteen candidates, and a stub-validated Ruffle/FFDec capture vehicle are ready; the first licensed sessions are the remaining step (see `integration/ss2-runtime-capture.md`) |
| 4. SS2 adapter and UI seam | Convert vanilla combatants to canonical state; bind events to fighter clips, panels, and final result acknowledgement | planned |
| 5. 2v2 campaign co-op | Player-controlled allies, AI fill, two-team elimination, campaign roster/save/reward integration, and a four-slot arena | planned |
| 6. 3v3 campaign co-op | Up to three allied controllers or AI fills, six-slot arena, team targeting, persistence, and balance passes | planned |
| 7. Online synchronization | Host-authoritative transport, lobby/auth, reconnect, desync recovery, and observed-result diagnostics | planned |

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

Original game binaries and assets remain outside the repository. Distributable
work is limited to independently authored source, metadata, fixtures, and
patches.
