---
name: ss2-progression-design
description: Resolve and record SS2 Endless progression-system decisions through owner-guided design-tree rounds. Use for progression direction, economy, rewards, pacing, build-system tradeoffs, or implementation-readiness decisions under docs/design; exclude vanilla parity or capture work and unapproved implementation.
---

# SS2 progression design

Move one active owner-decision frontier to exact, durable wording without
turning a designed rule into runtime evidence or authorization to build it.

## Orient

Read the current handoff and `HANDOFF.md` living head as `AGENTS.md` requires.
Then load the
[owner packet](../../../docs/design/endless-progression-owner-packet.md), the
[decision record](../../../docs/design/endless-progression-decisions.md), and
only the linked system/readiness sections needed by the active decision.

Name the session's destination and boundary. The owner packet is a worksheet;
the decision record is authoritative only after its acceptance protocol is
complete. Endless design stays quarantined from vanilla candidates, captures,
fixtures, manifests, and goldens.

## Work the frontier

Map the active cluster as a **design tree**. Its **frontier** is every owner
decision whose prerequisites are settled. Recompute it after every answer.

- Re-derive repository facts and label their status with the packet's
  `[V]`, `[D]`, `[A]`, and `[U]` vocabulary. Resolve lookup questions directly;
  the owner supplies product choices, not facts available in the repository.
- Probe each frontier decision with at least one concrete exploit, fault,
  migration, or boundary scenario. A direction is not closed while its state
  transition, ordering, negative cases, or authority remain implicit.
- Ask the whole current frontier in one numbered round. Give bounded choices,
  a replacement path, and a recommended answer with its tradeoff. A question
  that depends on an unanswered choice belongs to a later round.
- Keep progression design as one human-in-the-loop reasoning lane. Independent
  review checks a named claim or material diff later; owner decisions are never
  delegated, and design work is not a reason to launch an evidence wave.

The frontier is empty only when every branch required for the destination has
exact semantics, unresolved `[U]` items are named as blockers, and no choice is
silently supplied by the agent.

## Close a decision

Replay the complete normative wording before editing the record. Wait for the
owner's explicit `accepted`, `rejected`, or
`revise — accepted replacement: <complete rule>` disposition; an option label
or bare acknowledgement selects direction but does not close it.

After explicit acceptance, update the authoritative record, its derived summary,
and directly affected readiness indexes together, carrying owner and UTC date.
Report remaining blockers and keep implementation blocked until the owner gives
separate authorization. End the working session through the repository's dated
handoff protocol.
