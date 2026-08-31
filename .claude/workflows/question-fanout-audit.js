export const meta = {
  name: 'question-fanout-audit',
  description: 'Investigate one topic via question-diverse agents, then one write-nothing adversarial verifier per claim; a wave with dead verifiers is UNVERIFIED',
  whenToUse: 'Any investigation or audit big enough for multiple agents. Encodes the SS2 field rules (docs/multi-agent-field-rules.md): fan out on questions not replicas; verifiers break one named claim each; count started vs returned.',
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
//   groundBrief?: string,              // shared facts, if any. Injected as HYPOTHESES, not truth.
//   entryPointQuestion?: string,       // end-to-end check via the REAL entry point (strongly recommended)
// }

if (!args || !args.topic || !Array.isArray(args.questions) || args.questions.length === 0) {
  throw new Error('args required: {topic, questions[], groundBrief?, entryPointQuestion?}')
}

const PREMISE_RULE = `Treat every fact in this brief as a hypothesis, including counts and quoted file contents. A premise that turns out to be wrong is a finding that OUTRANKS the task. Do not soften findings. Never run a state-mutating git command; scratch files go in the session scratchpad, never the repo.`

const FINDINGS = {
  type: 'object', required: ['answer', 'claims'],
  properties: {
    answer: { type: 'string', description: 'Dense findings for this question' },
    claims: { type: 'array', items: { type: 'string' }, description: 'Each load-bearing claim as ONE checkable sentence' },
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
const briefs = args.questions.map((q, i) => `TOPIC: ${args.topic}${ground}\nYOUR QUESTION (yours alone — answer THIS, not the general topic): ${q}\n${PREMISE_RULE}\nReturn via StructuredOutput.`)
log(`Dispatching ${briefs.length} question agents (started must equal ${briefs.length})…`)
const answers = await parallel(briefs.map((b, i) => () => agent(b, { label: `q${i + 1}`, phase: 'Investigate', schema: FINDINGS })))

// Accounting: started vs returned. A null is a dead agent, not a skippable item.
const dead = answers.map((a, i) => (a ? null : i + 1)).filter(Boolean)
if (dead.length) log(`WARNING: question agents died: q${dead.join(', q')} — their questions are UNANSWERED, not empty`)

const claims = answers.flatMap((a, i) => (a ? a.claims.map((c) => ({ from: `q${i + 1}`, claim: c })) : []))
if (args.entryPointQuestion) claims.push({ from: 'entry-point', claim: args.entryPointQuestion })
log(`${claims.length} claims to verify.`)

phase('Verify')
const verdicts = await parallel(
  claims.map((c, i) => () =>
    agent(
      `TOPIC: ${args.topic}\nYou are a WRITE-NOTHING adversarial verifier. You have ONE job: try to BREAK this single claim (from ${c.from}):\n"${c.claim}"\nDrive the real code/data yourself — do not trust any prior agent's report. ${c.from === 'entry-point' ? 'Specifically: exercise the REAL entry point end-to-end, not the internal functions others measured.' : ''}\nFor any assertion you rely on, name the one-line mutation that should break it and check that it does. A HOLDS verdict with evidence is as valuable as a break. ${PREMISE_RULE}\nReturn via StructuredOutput.`,
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
  started: { questions: briefs.length, verifiers: claims.length },
  returned: { questions: briefs.length - dead.length, verifiers: claims.length - deadVerifiers.length },
  answers: answers.map((a, i) => ({ question: args.questions[i], ...(a || { answer: 'AGENT DIED — unanswered' }) })),
  verdicts,
}
