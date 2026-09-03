# Codex progression-workflow assessment

**Verdict (2026-09-02): adapt now; do not install the upstream workflow
unchanged.** Dedicated Codex progression work should use Matt Pocock's
design-tree/frontier discipline, but SS2's existing owner packet and decision
record remain the workflow's durable state. Wayfinder tickets, the upstream
reviewer, and automatic research/implementation orchestration would duplicate
or weaken safeguards already specific to this repository.

This assessment distinguishes two Codex roles:

1. **Indirect reviewer:** Claude invokes Codex for FLAG-only adversarial review.
   Its findings remain claims to verify and are never auto-applied.
2. **Direct design agent:** Codex collaborates with the owner on Endless
   progression decisions in this repository. This lane uses the new
   [`$ss2-progression-design`](../../.agents/skills/ss2-progression-design/SKILL.md)
   adapter.

## What the source material supports

Pocock's current public method is intentionally a set of small, editable,
composable skill files. Its main engineering sequence is
grill-with-docs → to-spec → to-tickets → implement → code-review, with
Wayfinder, research, and prototype used to shape uncertain work. That is the
author's stated method, not evidence that the entire sequence improves game
systems design. [AI Hero overview](https://www.aihero.dev/skills),
[source repository](https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76).

The strongest fit is the reusable **grilling** primitive: model a design tree,
ask the whole currently unblocked frontier in rounds, give a recommendation,
find environmental facts without making the owner do lookup work, and leave
product choices to the owner. That is already close to the SS2 owner packet's
shape. [Grilling source](https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/productivity/grilling/SKILL.md).

Wayfinder is useful for a genuinely foggy, multi-session epic, but it makes a
tracker map and one-question child issues the canonical state. SS2 already has
that information in a more exact form: its packet is the guided worksheet, its
decision record is the authority, and its readiness record is the blocker
index. Migrating those into tickets would create two sources of truth.
[Wayfinder source](https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/wayfinder/SKILL.md),
[owner packet](endless-progression-owner-packet.md),
[decision record](endless-progression-decisions.md).

Pocock's domain-modeling discipline also transfers selectively: sharpen terms,
test concrete boundary scenarios, and record only hard-to-reverse, surprising
tradeoffs. It does not justify adding a parallel `CONTEXT.md` or ADR tree when
the current design documents already own that vocabulary and decision history.
[Domain-modeling source](https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/domain-modeling/SKILL.md).

## What the local audit changed

The premise that SS2's Claude sessions already exercise the Pocock spine did
not survive inspection. The harness has twelve core skills linked into
`~/.claude/skills`, but direct Codex had only two harness-derived user skills:
`diagnosing-bugs` and `writing-for-agents`. Across the retained Claude
transcript corpus for the two SS2 project paths—2,148 JSONL files and 136,558
parsed records—the only explicit `Skill` tool call was `artifact-design`; no
Pocock skill call appeared. The same corpus contained 28 `Workflow` calls.
This measures explicit tool calls, not every prompt fragment that may ever have
been loaded, so it is evidence of non-use rather than proof of non-exposure.

That result matters: the repository cannot attribute its outcomes to a
Pocock-first workflow merely because the skills were installed or named in an
ADR. It also explains why a model-discoverable repo adapter is preferable here
to another human-only slash command.

The local Git state exposed a second false premise. This design branch has no
`.claude/` tree, while [`AGENTS.md`](../../AGENTS.md) claimed its
`.claude/settings.json` enforced Git policy on Claude, Codex, and a human
identically. The arena branch's file is Claude Code configuration and cannot
mediate a direct Codex process or a human terminal. The policy remains shared;
the enforcement substrate does not. The instruction has been corrected at its
authoritative location.

## Adopt, defer, and exclude

| Upstream element | Disposition for direct Codex progression work | Reason |
| --- | --- | --- |
| Grilling design tree and frontier | **Adapt now** | It matches owner-led direction work and exposes hidden prerequisites. |
| Domain-language and sparse-decision discipline | **Adapt now** | Useful, but current SS2 documents remain the source of truth. |
| Writing-for-agents pointers and checkable completion | **Adapt now** | Keeps the always-loaded rule short and puts the full workflow in a discoverable skill. |
| Wayfinder tracker map | **Do not migrate this effort** | The packet/record/readiness trio already fills the role with stronger acceptance semantics. |
| to-spec and to-tickets | **Defer** | Relevant only after owner decisions close and implementation is separately authorized. |
| TDD | **Defer to implementation** | Valuable at independently grounded seams; it cannot generate its own oracle. |
| Pocock code-review | **Exclude here** | Sharing it would erode the independence of Claude's Codex adversarial-review lane. |
| Upstream research, prototype, and implement orchestration | **Exclude unchanged** | They spawn agents, write artifacts, create branches, or commit under rules that conflict with SS2's tighter authority boundaries. |
| Global `~/.agents/skills` migration | **Separate harness task** | It affects every project and requires restored OpenAI metadata, router rewrites, and local handoff fixes. |

## Codex-native implementation

Codex supports repository skills under `.agents/skills`, reads their short
descriptions before loading their full instructions, and supports UI/invocation
metadata in `agents/openai.yaml`. A repo skill is therefore the narrowest
portable implementation of behavior that is unique to SS2.
[OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills).

The adapter is model-discoverable so a future direct Codex session does not
depend on the owner remembering a command. It requires:

- one owner-guided decision frontier at a time;
- repository facts re-derived and separated from product choices;
- concrete exploit, fault, migration, and boundary scenarios;
- exact normative replay before the authoritative record changes;
- continued design/evidence quarantine and separate implementation authority;
- one human-in-the-loop reasoning lane, with independent review reserved for a
  later named claim or material diff.

This complements `AGENTS.md`, which Codex loads as repository instructions; it
does not attempt to imitate Claude hooks or settings. Codex hooks and project
configuration live under Codex's own substrate, and subagents add cost and are
best reserved for genuinely independent, bounded work.
[OpenAI AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[OpenAI subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents),
[OpenAI hooks documentation](https://learn.chatgpt.com/docs/hooks).

## Evidence limits and revisit conditions

No first-party reproducible benchmark currently establishes the end-to-end
chain's quality for Codex or game-economy design. Upstream has open proposals
for behavioral evaluation and a small contributor TDD experiment, while an
open workflow report describes the danger of letting the same spec author
define both work and its only acceptance test.
[evaluation proposal](https://github.com/mattpocock/skills/issues/722),
[TDD experiment proposal](https://github.com/mattpocock/skills/issues/514),
[independent-acceptance report](https://github.com/mattpocock/skills/issues/791).

Accordingly, this adoption asserts **fit**, not proven superiority. Keep the
adapter only if real progression sessions show that it catches hidden decisions,
preserves exact owner choices, avoids evidence contamination, and improves
handoff continuity. Revisit global installation when the `claude-harness`
itself has a Codex-aware installer and restored `agents/openai.yaml`; revisit
to-spec/to-tickets/TDD only after the direction record is closed and the owner
authorizes implementation.
