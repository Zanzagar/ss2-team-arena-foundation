export const meta = {
  name: 'question-fanout-audit',
  description: 'Investigate one topic via question-diverse agents, then one write-nothing adversarial verifier per claim; a wave with dead verifiers is UNVERIFIED',
  whenToUse: 'Any investigation or audit big enough for multiple agents. Encodes the SS2 field rules — AGENTS.md "Multi-agent runs" and docs/overnight-agent-plan.md "Standing rules": fan out on questions not replicas; verifiers break one named claim each; count started vs returned.',
  phases: [
    { title: 'Investigate', detail: 'one agent per QUESTION — distinct aims, never replicas' },
    { title: 'Verify', detail: 'one write-nothing verifier per claim, incl. one on the real entry point' },
  ],
}

// args: {
//   topic: string,                     // what this run is about (goes in every prompt)
//   questions: string[],               // DISTINCT aims — different entry points, methods, angles.
//                                      //   Never two agents with the same brief: agreement between
//                                      //   agents that share a brief is the correlated failure mode.
//   groundBrief?: string,              // shared HYPOTHESES. Investigators only -- deliberately NOT
//                                      //   given to verifiers, so a verifier re-derives rather than
//                                      //   inheriting the premise it is meant to break.
//   environment?: string,              // WHERE THINGS ARE and how to run them: paths, mounts, commands,
//                                      //   read-only boundaries. Goes to EVERY agent, verifiers included.
//                                      //   THIS FIELD EXISTS BECAUSE ITS ABSENCE COST A WHOLE WAVE.
//                                      //   Measured 2026-09-01: the verifier prompt was built from
//                                      //   `topic` alone, and that run's topic said "no local captures/
//                                      //   archive". The archive WAS readable, the groundBrief said so,
//                                      //   and verifiers never saw the groundBrief -- so a batch of them
//                                      //   concluded the data did not exist and returned BROKEN after
//                                      //   burning 240-second `find` timeouts. Environment facts are not
//                                      //   premises to be broken; withholding them does not decorrelate
//                                      //   anything, it just blinds the checker.
//                                      //   HAZARD, named by an independent Codex review: this is an
//                                      //   UNRESTRICTED string labelled "facts", inserted verbatim
//                                      //   into every verifier prompt, so it CAN smuggle a premise
//                                      //   ("the value is definitely 110") past the split it exists
//                                      //   to protect. The split is a convention, not an enforcement.
//                                      //   Keep this field to paths, commands and read-only
//                                      //   boundaries; anything a verifier could be asked to BREAK
//                                      //   belongs in groundBrief, where verifiers never see it.
//   entryPointQuestion?: string,       // end-to-end check via the REAL entry point (strongly recommended).
//                                      //   It is verified FIRST and survives any cap.
//   verifierBudget?: number,           // max verifiers to spawn (default 6, HARD-CAPPED at 6 below; a larger
//                                      //   request is clamped and logged). THIS FIELD EXISTS BECAUSE ITS
//                                      //   ABSENCE COST A FIVE-HOUR USAGE LIMIT on 2026-09-02: one verifier
//                                      //   per claim, uncapped, meant 29 investigators asked for 1,069 of
//                                      //   them. Claims are interleaved across questions and the count NOT
//                                      //   verified is logged and returned as `unverifiedClaims` — a capped
//                                      //   wave is complete-as-run, never complete-as-asked.
// }

if (!args || !args.topic || !Array.isArray(args.questions) || args.questions.length === 0) {
  throw new Error('args required: {topic, questions[], groundBrief?, entryPointQuestion?}')
}

// HARD CAPS, enforced here so that no brief, caller or session setting can
// exceed them through this script. Decided 2026-09-02 and recorded in
// claude-harness docs/adr/0001-verification-precedence.md: three CONCURRENT
// waves of 6 investigators + 12 verifiers spent ~30% of a week's model usage
// in under twenty minutes. A wave is the LAST resort after Pocock's skills and
// Codex review; run ONE at a time; say what it will spawn before launching it.
const MAX_QUESTIONS = 6
const MAX_VERIFIERS = 6
if (args.questions.length > MAX_QUESTIONS) {
  throw new Error(`question-fanout-audit refuses ${args.questions.length} questions: the hard cap is ${MAX_QUESTIONS} (docs/adr/0001). Reshape the wave; do not split it into concurrent waves.`)
}

const PREMISE_RULE = `Treat every fact in this brief as a hypothesis, including counts and quoted file contents. A premise that turns out to be wrong is a finding that OUTRANKS the task. Do not soften findings. Never run a state-mutating git command; scratch files go in the session scratchpad, never the repo.`

const FINDINGS = {
  type: 'object', required: ['answer', 'claims'],
  properties: {
    answer: { type: 'string', description: 'Dense findings for this question' },
    // maxItems is load-bearing, not tidiness. Without it agents returned a
    // median of 37 claims each and a maximum of 51, because "each load-bearing
    // claim" reads as "everything you measured" — environment facts included.
    // Every claim becomes a verifier, so 29 investigators asked for 1,069 of
    // them and the run died on a usage limit with 119 back. See the Sizing
    // section of docs/overnight-agent-plan.md, corrected 2026-09-02.
    claims: {
      type: 'array', maxItems: 6, items: { type: 'string' },
      description: 'AT MOST 6 claims, ranked most load-bearing first. A claim is something that would change ' +
        'code, a document or a decision if it were false — NOT an environment fact you checked along the way. ' +
        'Each becomes one adversarial verifier, so a claim nobody would act on wastes the whole budget for it. ' +
        'Put everything else in `answer`.'
    },
  },
}
const VERDICT = {
  type: 'object', required: ['verdict', 'evidence'],
  properties: {
    verdict: { type: 'string', enum: ['HOLDS', 'PARTIALLY-BROKEN', 'BROKEN'] },
    evidence: { type: 'string', description: 'What was actually run/read; the defect if broken' },
  },
}

phase('Investigate')
const ground = args.groundBrief ? `\nGROUND BRIEF (hypotheses, not truth):\n${args.groundBrief}\n` : ''
// Environment reaches EVERY agent. See the `environment` note in the args block.
const env = args.environment ? `\nENVIRONMENT (where things are; facts, not hypotheses):\n${args.environment}\n` : ''
const briefs = args.questions.map((q, i) => `TOPIC: ${args.topic}${env}${ground}\nYOUR QUESTION (yours alone — answer THIS, not the general topic): ${q}\n${PREMISE_RULE}\nReturn via StructuredOutput.`)
log(`Dispatching ${briefs.length} question agents (started must equal ${briefs.length})…`)
const answers = await parallel(briefs.map((b, i) => () => agent(b, { label: `q${i + 1}`, phase: 'Investigate', schema: FINDINGS })))

// Accounting: started vs returned. A null is a dead agent, not a skippable item.
const dead = answers.map((a, i) => (a ? null : i + 1)).filter(Boolean)
if (dead.length) log(`WARNING: question agents died: q${dead.join(', q')} — their questions are UNANSWERED, not empty`)

// INTERLEAVED, NOT FLATTENED. Flattening in question order let q1's fifty-one
// claims eat the whole budget: on 2026-09-02 the capture-prep wave returned 1
// verdict of 295 started, and a wave with dead verifiers is UNVERIFIED. Taking
// one claim per question per pass means a budget cut anywhere still leaves
// every question with its most load-bearing claim checked.
const perQuestion = answers.map((a, i) => (a ? a.claims.map((c) => ({ from: `q${i + 1}`, claim: c })) : []))
const interleaved = []
for (let rank = 0; rank < Math.max(0, ...perQuestion.map((q) => q.length)); rank += 1) {
  for (const q of perQuestion) if (q[rank]) interleaved.push(q[rank])
}
// The entry point goes FIRST: it is the only claim that exercises the real
// thing end to end, so it must survive any cap.
if (args.entryPointQuestion) interleaved.unshift({ from: 'entry-point', claim: args.entryPointQuestion })

const requestedBudget = Number.isInteger(args.verifierBudget) ? args.verifierBudget : MAX_VERIFIERS
const budget = Math.min(requestedBudget, MAX_VERIFIERS)
if (requestedBudget > MAX_VERIFIERS) log(`verifierBudget ${requestedBudget} requested; CLAMPED to the hard cap ${MAX_VERIFIERS} (docs/adr/0001)`)
const claims = interleaved.slice(0, budget)
const dropped = interleaved.length - claims.length
// NO SILENT CAPS. A cap nobody is told about reads as "everything was checked",
// which is the same lie as a dead verifier reported as a pass.
log(`${interleaved.length} claims emitted; verifying ${claims.length} (budget ${budget})` +
  (dropped > 0 ? ` — ${dropped} NOT VERIFIED, lowest-ranked first, per question` : ''))

phase('Verify')
const verdicts = await parallel(
  claims.map((c, i) => () =>
    agent(
      `TOPIC: ${args.topic}${env}\nYou are a WRITE-NOTHING adversarial verifier. You have ONE job: try to BREAK this single claim (from ${c.from}):\n"${c.claim}"\nDrive the real code/data yourself — do not trust any prior agent's report. ${c.from === 'entry-point' ? 'Specifically: exercise the REAL entry point end-to-end, not the internal functions others measured.' : ''}\nFor any assertion you rely on, name the one-line mutation that should break it and check that it does. A HOLDS verdict with evidence is as valuable as a break. ${PREMISE_RULE}\nReturn via StructuredOutput.`,
      { label: `verify:${c.from}#${i + 1}`, phase: 'Verify', schema: VERDICT }
    ).then((v) => ({ ...c, ...(v || { verdict: 'AGENT-DIED', evidence: 'verifier did not return' }) }))
  )
)

// A partly-failed verifier wave is worse than a failed one: never report confident-unverified.
const deadVerifiers = verdicts.filter((v) => v.verdict === 'AGENT-DIED')
const status = dead.length || deadVerifiers.length ? 'UNVERIFIED-PARTIAL' : 'VERIFIED'
if (status !== 'VERIFIED') log(`Wave status: ${status} — ${dead.length} question agents and ${deadVerifiers.length} verifiers died. Treat ALL findings as unverified; resume with resumeFromRunId.`)

return {
  status,
  // `unverifiedClaims` is reported even when the wave is VERIFIED, because a
  // capped wave is complete-as-run and NOT complete-as-asked. Reporting only
  // `status` would let a budget cut read as full coverage.
  unverifiedClaims: dropped,
  started: { questions: briefs.length, verifiers: claims.length },
  returned: { questions: briefs.length - dead.length, verifiers: claims.length - deadVerifiers.length },
  answers: answers.map((a, i) => ({ question: args.questions[i], ...(a || { answer: 'AGENT DIED — unanswered' }) })),
  verdicts,
}
