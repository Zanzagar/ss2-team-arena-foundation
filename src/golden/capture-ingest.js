/**
 * Normalizes one raw instrumentation trace (JSON lines) into a validated
 * runtime observation record.
 *
 * The raw trace is produced by the read-only capture wrapper described in
 * docs/integration/ss2-runtime-capture.md. Raw traces stay outside Git; only
 * the normalized, independently authored observation record is committed.
 *
 * Line grammar (one JSON object per line):
 *   meta   first line: session/observation identity and attestations
 *   state  staged pre-action dump, one per side
 *   var    named scalar (attack_direction, spell_id, fight_mode, criticalhit)
 *   roll   one ordered RNG sample with call-site metadata
 *   set    one watched property assignment (hook = wrapper attribution)
 *   event  semantic event (defender-hurt/defender-blocked/magic-damage/
 *          death/overlay-label)
 *   final  post-action dump, one per side
 *   end    last line: closing hash attestation, the over-draw count, the
 *          player-minted launch nonce, and the wrapper's staging declaration
 */

import {
  ObservationCaptureMethod,
  SS2_OBSERVATION_KIND,
  SS2_OBSERVATION_SCHEMA_VERSION,
  SS2_PROJECTED_COMBATANT_KEYS,
  canonicalJsonStringify,
  computeSs2ObservationDigest,
  parseSs2StagedDeclaration,
  validateSs2Observation
} from "./observation.js";
import {
  SS2_BUILD_SHA256,
  SS2_STEAM_BUILD_ID,
  validateSs2OneVsOneFixture
} from "./run-1v1-fixture.js";

export const SS2_CAPTURE_TRACE_VERSION = 1;

const META_KEYS = Object.freeze([
  "attackerSide",
  "captureToolVersion",
  "installHashVerifiedBefore",
  "method",
  "mutationGranularity",
  "observationId",
  "observedAt",
  "schemaVersion",
  "sessionId",
  "t"
]);
const HOOK_PATTERN = /^[a-z][a-z-]{0,63}$/;
const SET_PATH_PATTERN = /^\/(?:hero|villain)\/([a-z][a-z0-9_]*)$/;
const LAUNCH_NONCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class CaptureTraceError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

function fail(lineNumber, message) {
  throw new CaptureTraceError(`Capture trace line ${lineNumber}: ${message}`);
}

function parseLines(rawText) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    throw new CaptureTraceError("The capture trace is empty.");
  }
  const lines = [];
  const textLines = rawText.split(/\r?\n/);
  for (let index = 0; index < textLines.length; index += 1) {
    const text = textLines[index].trim();
    if (text.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new CaptureTraceError(`Capture trace line ${index + 1} is not valid JSON.`, { cause: error });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.t !== "string") {
      fail(index + 1, "every line must be an object with a t field.");
    }
    lines.push({ lineNumber: index + 1, entry: parsed });
  }
  if (lines.length === 0) throw new CaptureTraceError("The capture trace is empty.");
  return lines;
}

function sameJson(left, right) {
  return canonicalJsonStringify(left ?? null) === canonicalJsonStringify(right ?? null);
}

function readMeta(lines) {
  const { lineNumber, entry } = lines[0];
  if (entry.t !== "meta") fail(lineNumber, "the first line must be a meta line.");
  const keys = Object.keys(entry).sort();
  const expected = [...META_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail(lineNumber, "the meta line has unexpected or missing fields.");
  }
  if (entry.schemaVersion !== SS2_CAPTURE_TRACE_VERSION) {
    fail(lineNumber, `trace schemaVersion must be ${SS2_CAPTURE_TRACE_VERSION}.`);
  }
  if (entry.attackerSide !== "hero" && entry.attackerSide !== "villain") {
    fail(lineNumber, "meta.attackerSide must be hero or villain.");
  }
  if (entry.installHashVerifiedBefore !== true) {
    fail(lineNumber, "the installed hash must be verified before the session (installHashVerifiedBefore=true).");
  }
  return entry;
}

/**
 * The one archived-trace escape hatch, named once.
 *
 * It waives the ABSENCE of an attestation, never a malformed or non-zero one,
 * and it exists solely so raw traces captured before these fields existed can
 * be re-ingested for divergence-report regeneration. The live capture path must
 * never pass it, which a tripwire test asserts.
 */
function allowsMissingAttestations(options) {
  return options.allowMissingOverdraw === true;
}

function readEnd(lines, meta, options) {
  const { lineNumber, entry } = lines[lines.length - 1];
  if (entry.t !== "end") fail(lineNumber, "the last line must be an end line.");
  const allowed = new Set(["t", "installHashVerifiedAfter", "overdraw", "launchNonce", "staged"]);
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) fail(lineNumber, `the end line carries an unexpected field ${key}.`);
  }
  if (!Object.hasOwn(entry, "installHashVerifiedAfter")) {
    fail(lineNumber, "the end line must carry installHashVerifiedAfter.");
  }
  // `null` is the wrapper's placeholder: the after-attestation cannot be
  // known while the game is still running, so ingest must supply it from a
  // live verify-install run.
  if (entry.installHashVerifiedAfter !== true && entry.installHashVerifiedAfter !== null) {
    fail(lineNumber, "installHashVerifiedAfter must be true or the null placeholder.");
  }
  // `overdraw` is the count of draws the armed window made after the injected
  // tape ran out. They are invisible in the trace itself — they fall through to
  // the live RNG and are logged only as `dbg` lines, which delog strips — so a
  // run that drew more times than the candidate models would otherwise be
  // indistinguishable from one that matched it. That is a divergence, and it is
  // refused here rather than silently matched.
  //
  // Because the field is the ONLY evidence on that point, its absence is not a
  // lesser form of assurance, it is none at all. So an injected-tape trace must
  // carry it. Passive captures are exempt because the count is meaningless for
  // them (with no tape, every draw is past its end), and the simulator's
  // synthetic traces are exempt because nothing in them can draw at all — see
  // simulate-capture-trace.js, which emits `overdraw: 0` regardless because it
  // is the wrapper's executable specification of this same end line.
  if (!Object.hasOwn(entry, "overdraw")) {
    if (meta.method === ObservationCaptureMethod.INJECTED_TAPE && !allowsMissingAttestations(options)) {
      fail(
        lineNumber,
        `an ${ObservationCaptureMethod.INJECTED_TAPE} trace must carry end.overdraw. It is the only ` +
        "record that the armed window made no draw after the tape ran out; a trace without it " +
        "carries no assurance on that point at all. Archived traces from wrappers predating the " +
        "field can still be re-ingested for divergence-report regeneration by passing the ingest " +
        "option { allowMissingOverdraw: true }, which the live capture path must never pass."
      );
    }
  } else {
    if (!Number.isInteger(entry.overdraw) || entry.overdraw < 0) {
      fail(lineNumber, "end.overdraw must be a non-negative integer.");
    }
    if (entry.overdraw > 0) {
      fail(
        lineNumber,
        `the armed window made ${entry.overdraw} draw(s) after the injected tape was exhausted, ` +
        "so the action drew more randomness than the target candidate models. This is a " +
        "divergence: correct the candidate's roll order from the raw trace."
      );
    }
  }
  // Minted inside the player from values the launcher does not supply, so a
  // record carries one identity field the operator did not choose. Validated
  // against the record's own token pattern here so a malformed nonce is
  // reported against the trace line that carried it rather than surfacing much
  // later as a schema error on a record ingest itself built.
  //
  // MANDATORY on the same terms as overdraw, and for a sharper reason. An
  // adversarial pass demonstrated the forgery this field exists to stop, and
  // showed it still worked: take one raw trace, copy it, change the observation
  // and session ids, and DELETE the launchNonce key from the second copy. Both
  // ingest, both promote, and the result is a golden claiming two independent
  // sessions whose comparison projections are byte-identical. The gate only
  // fired when the forger left the nonce in.
  //
  // Absence was accepted because the field arrived after the wrapper had
  // already emitted traces without it. That is what the archived-trace hatch is
  // for; it is not a reason to leave the check optional forever.
  if (!Object.hasOwn(entry, "launchNonce")) {
    if (meta.method === ObservationCaptureMethod.INJECTED_TAPE && !allowsMissingAttestations(options)) {
      fail(
        lineNumber,
        `an ${ObservationCaptureMethod.INJECTED_TAPE} trace must carry end.launchNonce. It is the ` +
        "only identity on a record that the operator did not choose, and two observations offered " +
        "as independent evidence are checked against it. A trace that omits it can be duplicated " +
        "into a second session for free. Archived traces predating the field can still be " +
        "re-ingested for divergence-report regeneration by passing { allowMissingOverdraw: true }, " +
        "which the live capture path must never pass."
      );
    }
  } else if (typeof entry.launchNonce !== "string" || !LAUNCH_NONCE_PATTERN.test(entry.launchNonce)) {
    fail(lineNumber, "end.launchNonce must be a token string when present.");
  }
  return entry;
}

/**
 * `end.staged` — the wrapper's declaration of every combatant field IT wrote
 * before the observed action, and the value that stuck once the game's own
 * construction had finished, in application order.
 *
 * Staging is a scenario INPUT, not a fabricated outcome: the game still
 * resolves the action, and the mutation trace, the events and the final state
 * are still measured. But a scenario the wrapper wrote is a materially
 * different kind of evidence from one the game produced unaided — nobody has
 * shown the game's own progression can reach it — and the declaration is the
 * only thing that lets a reviewer holding the repository tell them apart.
 *
 * Absent means nothing was staged, which is true of every trace and every
 * golden that existed before this field. The grammar itself lives in
 * observation.js so the trace and the record are checked against one
 * definition; a malformed declaration is refused loudly rather than
 * half-parsed, because a half-read declaration understates staging, and
 * understated staging is the exact failure this field exists to prevent.
 */
function readStagedDeclaration(entry, lineNumber) {
  if (!Object.hasOwn(entry, "staged")) return null;
  let entries;
  try {
    entries = parseSs2StagedDeclaration(entry.staged, "end.staged");
  } catch (error) {
    fail(lineNumber, error.message);
  }
  return { text: entry.staged, entries };
}

function projectFields(fields, requiredKeys, context, lineNumber) {
  const projection = {};
  for (const key of requiredKeys) {
    if (!Object.hasOwn(fields, key)) {
      fail(lineNumber, `${context} is missing the required field ${key}.`);
    }
    projection[key] = fields[key];
  }
  return projection;
}

/**
 * Convert one raw capture trace into a validated observation record for the
 * given target fixture. The fixture determines which staged fields become the
 * observation scenario; the recorded values are always the observed ones, so
 * a mis-staged scenario surfaces later as an explicit fixture mismatch.
 *
 * Two unrelated senses of "staged" meet here. The trace's `state` lines are the
 * pre-action dump — the scenario as it stood, however it came to stand that
 * way. `end.staged` is narrower and is about authorship: the fields the WRAPPER
 * itself wrote. A trace can have a full staged dump and no `end.staged` at all,
 * and every trace behind the 22 promoted goldens does.
 *
 * Options:
 * - `installHashVerifiedAfter` — supply the live post-session hash result when
 *   the trace carries the wrapper's `null` placeholder.
 * - `allowMissingOverdraw` — accept an `injected-tape-runtime` trace whose end
 *   line has no `overdraw`. This exists for exactly one purpose: the archived
 *   raw traces under the ignored `captures/` directory predate the field (113
 *   of 177 carry it; the rest do not), and regenerating divergence reports from
 *   them must not be blocked by evidence they could not have recorded. The live
 *   capture path — `tools/capture-session.mjs` and
 *   `tools/runtime-capture/campaign.mjs` — must never pass it, and does not: a
 *   record ingested under this option carries no `capture.overdraw`, so it
 *   openly claims nothing rather than claiming zero.
 */
export function ingestSs2CaptureTrace(rawText, fixture, options = {}) {
  validateSs2OneVsOneFixture(fixture);
  const lines = parseLines(rawText);
  const meta = readMeta(lines);
  const end = readEnd(lines, meta, options);
  // Parsed here rather than inside readEnd because the declared values are
  // cross-checked against the staged state dumps further down, once they exist.
  const stagedDeclaration = readStagedDeclaration(end, lines[lines.length - 1].lineNumber);
  const installHashVerifiedAfter =
    end.installHashVerifiedAfter === true || options.installHashVerifiedAfter === true;
  if (!installHashVerifiedAfter) {
    throw new CaptureTraceError(
      "The trace carries the null after-attestation placeholder; ingest requires a live " +
      "post-session hash verification (options.installHashVerifiedAfter=true from verify-install)."
    );
  }

  const staged = { hero: null, villain: null };
  const finals = { hero: null, villain: null };
  const vars = new Map();
  const samples = [];
  const events = [];
  const rawMutations = [];
  const chain = new Map();
  let sawAction = false;
  let deathEvent = null;
  let resultObject = null;

  const chainKeyValue = (path, fallbackKnown, fallbackValue) => {
    if (chain.has(path)) return { known: true, value: chain.get(path) };
    return { known: fallbackKnown, value: fallbackValue };
  };

  for (const { lineNumber, entry } of lines.slice(1, -1)) {
    switch (entry.t) {
      case "meta":
        fail(lineNumber, "only the first line may be a meta line.");
        break;
      case "end":
        fail(lineNumber, "only the last line may be an end line.");
        break;
      case "state": {
        if (sawAction) fail(lineNumber, "state dumps must precede the observed action.");
        if (entry.side !== "hero" && entry.side !== "villain") fail(lineNumber, "state.side must be hero or villain.");
        if (staged[entry.side]) fail(lineNumber, `duplicate staged state dump for ${entry.side}.`);
        if (!entry.fields || typeof entry.fields !== "object" || Array.isArray(entry.fields)) {
          fail(lineNumber, "state.fields must be an object.");
        }
        staged[entry.side] = { fields: entry.fields, lineNumber };
        break;
      }
      case "var": {
        if (typeof entry.name !== "string") fail(lineNumber, "var.name must be a string.");
        vars.set(entry.name, entry.value);
        break;
      }
      case "roll": {
        sawAction = true;
        const { t, ...sample } = entry;
        samples.push(sample);
        break;
      }
      case "set": {
        sawAction = true;
        if (typeof entry.path !== "string") fail(lineNumber, "set.path must be a string.");
        if (typeof entry.hook !== "string" || !HOOK_PATTERN.test(entry.hook)) {
          fail(lineNumber, "set.hook must be a lowercase hook attribution token.");
        }
        if (!Object.hasOwn(entry, "before") || !Object.hasOwn(entry, "after")) {
          fail(lineNumber, "set lines must carry explicit before and after values.");
        }
        const fieldMatch = SET_PATH_PATTERN.exec(entry.path);
        if (!fieldMatch) fail(lineNumber, `set.path ${entry.path} is not a watched combatant field path.`);
        const side = entry.path.split("/")[1];
        const field = fieldMatch[1];
        const stagedSide = staged[side];
        const prior = chainKeyValue(
          entry.path,
          Boolean(stagedSide && Object.hasOwn(stagedSide.fields, field)),
          stagedSide?.fields?.[field]
        );
        if (prior.known && !sameJson(prior.value, entry.before)) {
          fail(
            lineNumber,
            `broken mutation chain for ${entry.path}: before=${JSON.stringify(entry.before)} ` +
            `but the prior value was ${JSON.stringify(prior.value)}.`
          );
        }
        chain.set(entry.path, entry.after);
        if (!sameJson(entry.before, entry.after)) {
          rawMutations.push({ path: entry.path, before: entry.before, after: entry.after, reason: entry.hook });
        }
        break;
      }
      case "event": {
        sawAction = true;
        const { t, ...event } = entry;
        if (event.type === "death") {
          if (deathEvent) fail(lineNumber, "a controlled 1v1 action can record at most one death event.");
          deathEvent = { event, lineNumber };
        }
        if (event.type === "overlay-label") {
          if (!deathEvent) fail(lineNumber, "an overlay-label event requires a preceding death event.");
          if (resultObject) fail(lineNumber, "duplicate overlay-label event.");
          const loserSide = deathEvent.event.side;
          const winnerSide = loserSide === "hero" ? "villain" : "hero";
          const overlayLabel = winnerSide === "hero" ? "combatwon" : "combatlost";
          const arenaLabel = winnerSide === "hero" ? "combat_won" : "combat_lost";
          if (event.label !== overlayLabel) {
            fail(
              lineNumber,
              `overlay label ${JSON.stringify(event.label)} does not match the observed death of ${loserSide}.`
            );
          }
          // reason and howDied are derived from the recorded evidence per
          // the byte-verified defeat gate: elimination vs first blood from
          // the loser's post-damage hitpoints; duels always yield; outside
          // duels the physical ingress dispatches the death string by
          // attack_direction and the spell ingress always uses "slain".
          const loserHpPath = `/${loserSide}/hitpoints`;
          const loserHp = chain.has(loserHpPath)
            ? chain.get(loserHpPath)
            : staged[loserSide]?.fields?.hitpoints;
          if (typeof loserHp !== "number") {
            fail(lineNumber, "cannot determine the loser's hitpoints for result synthesis.");
          }
          const fightMode = vars.get("fight_mode");
          const direction = vars.get("attack_direction");
          // Which ingress produced the damage decides which dispatch applies,
          // and the recorded dispatch event is the direct evidence of it: the
          // spell ingress emits `magic-damage` where the physical one emits
          // `defender-hurt`. Map lines 313-318: "Otherwise `damagecharacter`
          // dispatches by `attack_direction` ... `magic_damage_character` has
          // no direction chain and always uses `slain` outside duels." Keying
          // the spell arm on `attack_direction` instead would be wrong twice
          // over: it is a stale global during a cast, and its mapped inventory
          // ids collide with the physical chain (id 30 = fireball would read as
          // the grievous arm).
          const spellIngress = events.some((event) => event.type === "magic-damage");
          let howDied;
          // The duel arm is on the shared gate and so covers both ingresses
          // (map lines 313-315): duel kills never route to slain.
          if (fightMode === "duel") howDied = "yield";
          else if (spellIngress) howDied = "slain";
          else if (Number.isInteger(direction) && direction <= 12) howDied = "slain";
          else if (direction === 20) howDied = "taunt";
          else if (Number.isInteger(direction) && direction >= 21 && direction <= 23) howDied = "arrow";
          else if (direction === 30) howDied = "grievous";
          else {
            fail(
              lineNumber,
              `no death dispatch arm for fight_mode ${JSON.stringify(fightMode)} ` +
              `and attack_direction ${JSON.stringify(direction)}.`
            );
          }
          resultObject = {
            status: "pending-animation",
            completionToken: `ss2-1v1:${winnerSide}:${loserSide}:${arenaLabel}`,
            winnerSide,
            loserSide,
            reason: loserHp <= 0 ? "elimination" : "first-blood",
            howDied,
            overlayLabel,
            arenaLabel
          };
          rawMutations.push({ path: "/result", before: null, after: resultObject, reason: "result-bridge" });
        }
        events.push(event);
        break;
      }
      case "final": {
        if (entry.side !== "hero" && entry.side !== "villain") fail(lineNumber, "final.side must be hero or villain.");
        if (finals[entry.side]) fail(lineNumber, `duplicate final state dump for ${entry.side}.`);
        if (!entry.fields || typeof entry.fields !== "object" || Array.isArray(entry.fields)) {
          fail(lineNumber, "final.fields must be an object.");
        }
        finals[entry.side] = { fields: entry.fields, lineNumber };
        break;
      }
      default:
        fail(lineNumber, `unsupported line type: ${JSON.stringify(entry.t)}.`);
    }
  }

  for (const side of ["hero", "villain"]) {
    if (!staged[side]) throw new CaptureTraceError(`The trace has no staged state dump for ${side}.`);
    if (!finals[side]) throw new CaptureTraceError(`The trace has no final state dump for ${side}.`);
    // Every projected field needs a staged anchor so the mutation-chain and
    // final-dump consistency checks can never be silently skipped.
    projectFields(
      staged[side].fields,
      SS2_PROJECTED_COMBATANT_KEYS,
      `the staged ${side} state`,
      staged[side].lineNumber
    );
  }
  if (deathEvent && !resultObject) {
    throw new CaptureTraceError("A death event was recorded without its overlay-label result transition.");
  }
  // The declaration says what stuck; the staged dump is the same moment, read
  // back off the live objects. Where the dump watches the field, the two must
  // agree — a write the game overwrote during construction is precisely what
  // "the value that stuck" is there to catch, and a declaration that reported
  // the value the wrapper *attempted* would quietly overstate the staging.
  // Fields the dump does not watch (the per-piece `*_defence` ratings, unless
  // the operator passed -WatchFields) cannot be cross-checked and are taken on
  // the wrapper's word.
  if (stagedDeclaration) {
    for (const write of stagedDeclaration.entries) {
      const dump = staged[write.side].fields;
      if (!Object.hasOwn(dump, write.field)) continue;
      if (!sameJson(dump[write.field], write.value)) {
        throw new CaptureTraceError(
          `end.staged claims ${write.side}.${write.field}=${JSON.stringify(write.value)} stuck, but the ` +
          `staged ${write.side} dump read back ${JSON.stringify(dump[write.field])}. The declaration must ` +
          "record the value present after the game's own construction finished, not the value the " +
          "wrapper attempted to write."
        );
      }
    }
  }

  const scenario = {
    attackerSide: meta.attackerSide,
    result: null,
    hero: projectFields(
      staged.hero.fields,
      Object.keys(fixture.scenario.hero),
      "the staged hero state",
      staged.hero.lineNumber
    ),
    villain: projectFields(
      staged.villain.fields,
      Object.keys(fixture.scenario.villain),
      "the staged villain state",
      staged.villain.lineNumber
    )
  };
  // The action identity is projected onto whichever one the target fixture
  // stages, exactly as fightMode and transient below are: a spell action has a
  // caller inventory id and no attack direction (map line 317), so requiring
  // `attack_direction` of a spell trace would refuse valid evidence.
  if (fixture.scenario.spellId !== undefined) {
    if (!vars.has("spell_id")) {
      throw new CaptureTraceError("The trace never recorded the spell_id variable.");
    }
    scenario.spellId = vars.get("spell_id");
  } else {
    scenario.attackDirection = vars.get("attack_direction");
    if (scenario.attackDirection === undefined) {
      throw new CaptureTraceError("The trace never recorded the attack_direction variable.");
    }
  }
  if (fixture.scenario.transient !== undefined) {
    if (!vars.has("criticalhit")) {
      throw new CaptureTraceError("The target fixture needs the transient criticalhit variable, which was not recorded.");
    }
    scenario.transient = { criticalhit: vars.get("criticalhit") };
  }
  if (fixture.scenario.fightMode !== undefined) {
    if (!vars.has("fight_mode")) {
      throw new CaptureTraceError("The target fixture stages a fightMode, which was not recorded.");
    }
    scenario.fightMode = vars.get("fight_mode");
  }

  const finalState = { result: resultObject ?? null };
  for (const side of ["hero", "villain"]) {
    finalState[side] = projectFields(
      finals[side].fields,
      SS2_PROJECTED_COMBATANT_KEYS,
      `the final ${side} state`,
      finals[side].lineNumber
    );
    for (const field of SS2_PROJECTED_COMBATANT_KEYS) {
      const path = `/${side}/${field}`;
      const expected = chain.has(path)
        ? chain.get(path)
        : Object.hasOwn(staged[side].fields, field)
          ? staged[side].fields[field]
          : undefined;
      if (expected !== undefined && !sameJson(expected, finalState[side][field])) {
        throw new CaptureTraceError(
          `Unobserved mutation of ${path}: the final dump shows ${JSON.stringify(finalState[side][field])} ` +
          `but the watched chain ends at ${JSON.stringify(expected)}.`
        );
      }
    }
  }

  const record = {
    schemaVersion: SS2_OBSERVATION_SCHEMA_VERSION,
    kind: SS2_OBSERVATION_KIND,
    observationId: meta.observationId,
    build: {
      fingerprintSchemaVersion: 1,
      steamBuildId: SS2_STEAM_BUILD_ID,
      ss2Sha256: SS2_BUILD_SHA256
    },
    capture: {
      sessionId: meta.sessionId,
      captureToolVersion: meta.captureToolVersion,
      method: meta.method,
      observedAt: meta.observedAt,
      installHashVerifiedBefore: meta.installHashVerifiedBefore,
      installHashVerifiedAfter,
      mutationGranularity: meta.mutationGranularity,
      // Carried, not discarded. These three are the only evidence in a
      // committed record that the over-draw guard ran, that the run was a
      // distinct player launch, and that the scenario was (or was not) written
      // in by the wrapper — so a reviewer holding nothing but the repository
      // can check them. All are omitted when the trace did not carry them,
      // which is what keeps every observation committed before the fields
      // existed byte-identical: an observation's digest covers its own record,
      // so a field present on legacy records would rewrite all of their digests
      // and invalidate the provenance of every golden citing them. For `staged`
      // the omission is also the substantive claim rather than a compatibility
      // convenience: absent means the game produced this scenario unaided.
      ...(Object.hasOwn(end, "overdraw") ? { overdraw: end.overdraw } : {}),
      ...(Object.hasOwn(end, "launchNonce") ? { launchNonce: end.launchNonce } : {}),
      ...(stagedDeclaration ? { staged: stagedDeclaration.text } : {})
    },
    target: { fixtureId: fixture.fixtureId },
    scenario,
    samples,
    mutationTrace: rawMutations.map((mutation, index) => ({ sequence: index + 1, ...mutation })),
    events,
    resultEvent: resultObject ? { type: "battle-result-pending", ...resultObject } : null,
    finalState
  };
  record.digest = computeSs2ObservationDigest(record);
  return validateSs2Observation(record);
}
