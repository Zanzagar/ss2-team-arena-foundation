# SS2 adapter contract

This project is deliberately separated from the original game. It contains no
SS2 code, artwork, audio, or distributed SWF. A licensed installation is needed
before the adapter work can begin.

## What the adapter must do

1. Extract an SS2 gladiator and AI opponent into the engine's combatant shape.
   Preserve equipment and stats; do not import a guessed damage formula.
2. Start the team arena as a *new* battle mode, without changing the vanilla
   1v1 path until the mode is stable.
3. Replace the prototype rules in `src/engine.js` with formulas measured from
   the licensed build. Use golden tests: the same single attack in vanilla and
   team mode must have the same hit/damage outcome with the same random roll.
4. Bind each engine event to an SS2 animation and UI update. Positions must be
   calculated from a six-slot arena layout, not hard-coded left/right globals.
5. Persist roster, health, statuses, initiative cursor, seed, and event log in
   a separate team-battle save record. Existing SS2 saves must remain readable.

## What to locate in the SWF

- the battle scene entry point and its completion callback;
- the two combatant data objects and all references that assume `player` or
  `enemy` rather than a combatant id;
- RNG calls, damage/hit/spell logic, status handling, rewards, and save code;
- movie clips for fighter pose/weapon overlays and health UI;
- the launcher/menu code that selects a SWF from the Collection's mods folder.

## Networking boundary

The engine exposes a JSON-safe state and action protocol. A future host should
be authoritative: clients submit `{ actorId, type, targetId, spellKind? }`, the
host validates and applies it, then broadcasts the event and `stateHash`.
Clients never decide combat outcomes. This keeps hot-seat, LAN, and online
play on one rules path and avoids trusting client-side damage rolls.

## First integration checkpoint

With a supplied licensed SS2 build, complete a 1v1 adapter first and compare it
with vanilla combat. Then render two static allies, progress to 2v2 with the
second ally controlled by AI, then enable 2v2 campaign co-op, 3v3 campaign
co-op, and remote clients. These stages share one verified resolver; 1v1 is a
parity gate, not the final scope.

The licensed build's read-only static map is now recorded in
[the SS2 battle map](integration/ss2-battle-map.md). Its formulas are evidence
for the 1v1 golden harness; they must not replace the prototype rules until the
observed roll and mutation order is verified end to end.

The isolated [golden harness](integration/ss2-golden-harness.md) now enforces
the build identity, candidate-versus-observed provenance, and exact named roll
order. The longer delivery sequence is tracked in [the roadmap](roadmap.md).
