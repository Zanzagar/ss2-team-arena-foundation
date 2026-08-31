/**
 * SS2 runtime-capture wrapper (ActionScript 2, AVM1).
 *
 * Independently authored instrumentation host for controlled 1v1 capture
 * sessions against the licensed Swords & Sandals II SWF identified in
 * docs/integration/ss2-build-fingerprint.json. It loads the installed file in
 * place (never a copy), never patches it, and emits only the JSONL trace
 * grammar from docs/integration/ss2-runtime-capture.md via trace().
 *
 * Capture model (single action): the wrapper hooks the battle controller at
 * _root.arena.gladiators.overlay (byte-verified instance path) and ARMS on
 * the first checkattackroll invocation: it dumps both combatants' state at
 * that instant, records every randomBetween roll and watched-field mutation
 * that happens inside that call (which per the byte-verified map includes
 * damagecharacter, armour removal, death, knockback, and enchantment), and
 * closes the trace automatically when the call returns. Rolls and mutations
 * outside the armed action (AI decision rolls, battlevalues churn, later
 * turns) are deliberately not part of the capture. Pressing END is only a
 * manual fallback for closing a trace early.
 *
 * The overlay timeline re-executes its frame-52 DoAction as the battle state
 * machine loops, which REASSIGNS the combat functions; every wrap is
 * therefore installed resiliently via Object.watch on the function slot so
 * vanilla's re-definitions get re-wrapped at assignment time (validated the
 * hard way: the first live session lost its hooks to exactly this).
 *
 * Runtime configuration arrives via FlashVars / loader query string — the
 * install path and session identity are never embedded in this file:
 *   gameUrl        file: URL of the installed swords_sandals2_download.swf
 *   observationId  token
 *   sessionId      token
 *   toolVersion    e.g. ss2-capture/0.1.0
 *   observedAt     ISO timestamp recorded by the operator
 *   hashBefore     "true" only after tools/capture-session.mjs verify-install
 *   attackerSide   "hero" (default) or "villain"
 *   injected       "true" => serve the fixture tape from randomBetween
 *   tape           comma list label:min:max:value in fixture order —
 *                  randomBetween samples ONLY, consumed exclusively inside
 *                  the armed action
 *   watchFields    comma list of game-object fields to watch (defaults below)
 *   navigate       "prisoner" — the staged tutorial fight (stepNavigator), or
 *                  "arena" — the leveled-gladiator route (stepArenaNavigator)
 *   arenaTarget    "level:<n>" drive duels until herolevel reaches n, or
 *                  "tournament" enter the ladder and fight it to rank 1
 *   arenaPolicy    "aggressive" — the arena route's fight policy; the prisoner
 *                  route keeps its explicit autopilot step list instead
 *   arenaCapture   "never" (default) | "champion" | "always" — which bout of a
 *                  multi-bout arena run may be recorded
 *   timeOfDayCeiling, sessionLimitSec
 *                  arena-route abort bounds; see GATE A
 *
 * FlashVars land as _root properties and timeline vars ARE _root properties,
 * so every FlashVar is read before any same-named variable is declared.
 *
 * The post-session hash attestation is NOT a launch parameter: the wrapper
 * emits the end line with a null placeholder, and capture-session.mjs ingest
 * re-runs the install hash check live and stamps the attestation only when
 * it passes.
 */

// ---------------------------------------------------------------------------
// Minimal JSON emitter (AS2 has no JSON object).
// ---------------------------------------------------------------------------
function jsonString(value) {
    var type = typeof value;
    if (value == null) return "null";
    if (type == "number" || type == "boolean") return String(value);
    if (type == "string") {
        var out = "\"";
        for (var i = 0; i < value.length; i++) {
            var c = value.charAt(i);
            if (c == "\"" || c == "\\") out += "\\" + c;
            else if (c == "\r") out += "\\r";
            else if (c == "\n") out += "\\n";
            else if (c == "\t") out += "\\t";
            else out += c;
        }
        return out + "\"";
    }
    if (value instanceof Array) {
        var items = [];
        for (var a = 0; a < value.length; a++) items.push(jsonString(value[a]));
        return "[" + items.join(",") + "]";
    }
    var pairs = [];
    for (var key in value) pairs.push(jsonString(key) + ":" + jsonString(value[key]));
    return "{" + pairs.join(",") + "}";
}

var traceClosed = false;
function emit(line) {
    if (traceClosed) return;
    trace(jsonString(line)); // Ruffle: RUST_LOG=avm_trace=info captures this
}

// Diagnostic milestones: kept in the raw log for debugging, stripped by
// delog before ingest. Each label is emitted once.
var dbgSeen = {};
function dbg(label) {
    if (dbgSeen[label] == true) return;
    dbgSeen[label] = true;
    trace("{\"t\":\"dbg\",\"at\":\"" + label + "\"}");
}

// ---------------------------------------------------------------------------
// Configuration (read every FlashVar before declaring same-named variables)
// ---------------------------------------------------------------------------
var rawTape = _root.tape;
var rawWatchFields = _root.watchFields;
var rawAutopilot = _root.autopilot;
var rawNavigate = _root.navigate;
// Arena-route configuration. Read here with every other FlashVar, because
// timeline variables ARE _root properties and a same-named declaration later
// in this file would shadow the launcher's value.
//   arenaTarget       "level:<n>"  drive duels until herolevel reaches n
//                     "tournament" enter the ladder and fight it to rank 1
//   arenaPolicy       "aggressive" (default) — close and attack every turn
//   arenaCapture      "never" (default for a levelling run) | "champion" |
//                     "always"
//   timeOfDayCeiling  abort if _global.time_of_day reaches this (default 150;
//                     the game's special event fires at 200)
//   sessionLimitSec   abort after this much wall clock (default 900)
var rawArenaTarget = _root.arenaTarget;
var rawArenaPolicy = _root.arenaPolicy;
var rawArenaCapture = _root.arenaCapture;
var rawTimeOfDayCeiling = _root.timeOfDayCeiling;
var rawSessionLimitSec = _root.sessionLimitSec;
var config = {
    gameUrl: _root.gameUrl,
    observationId: _root.observationId,
    sessionId: _root.sessionId,
    toolVersion: _root.toolVersion,
    observedAt: _root.observedAt,
    hashBefore: _root.hashBefore == "true",
    attackerSide: _root.attackerSide == "villain" ? "villain" : "hero",
    injected: _root.injected == "true"
};

var tape = [];      // [{label, min, max, value}] in fixture order
var tapeCursor = 0;
if (rawTape != undefined && rawTape != "") {
    var entries = rawTape.split(",");
    for (var t = 0; t < entries.length; t++) {
        var parts = entries[t].split(":");
        tape.push({ label: parts[0], min: Number(parts[1]), max: Number(parts[2]), value: Number(parts[3]) });
    }
}

var DEFAULT_WATCH_FIELDS = [
    // the 18 projected fields ...
    "hitpoints", "armourclass", "armourclass_max", "staminaleft",
    "burning", "frozen", "poison", "life_stolen", "taunted1", "taunted2",
    "helmet", "shoulderguard", "breastplate", "gauntlet", "greaves",
    "shinguard", "boot", "shield",
    // ... plus staged-scenario inputs so ingest chain checks always anchor
    "attack", "defence", "strength", "charisma", "magicka",
    "min_damage", "max_damage", "hitpointsmax", "staminamax", "ammo_left"
];

// Runtime-verified: vanilla leaves the status flags UNDEFINED until first
// set. The trace normalizes undefined to false for exactly these fields, in
// dumps and watch callbacks alike, so records satisfy the boolean schema.
var STATUS_DEFAULT_FALSE = {
    burning: true, frozen: true, poison: true, life_stolen: true,
    taunted1: true, taunted2: true
};
function normalizeFieldValue(name, value) {
    if (value === undefined && STATUS_DEFAULT_FALSE[name]) return false;
    return value;
}
// watchFields EXTENDS the default list; it does not replace it.
//
// Replacing was the original behaviour and it made the flag unusable for what
// it is needed for. The armoured candidates stage the per-piece <piece>_defence
// fields, which the default list omits, and ingest refuses a trace whose staged
// dump lacks a field the fixture stages - so those fixtures could not be
// captured at all. Replacing the list to add eight names would have dropped the
// twenty-eight the projection depends on.
//
// Extending also keeps the default a fixed point: a session that passes nothing
// watches exactly what every promoted golden was captured with, so the twenty-two
// already in the repository stay reproducible. Widening the DEFAULT itself would
// not have been safe - the watch fires per assignment, so a newly watched field
// the game happens to write during an armed action would add mutation lines and
// diverge every existing golden.
var watchFields = DEFAULT_WATCH_FIELDS;
if (rawWatchFields != undefined && rawWatchFields != "") {
    var extraFields = rawWatchFields.split(",");
    var seenField = {};
    for (var wf = 0; wf < DEFAULT_WATCH_FIELDS.length; wf++) {
        seenField[DEFAULT_WATCH_FIELDS[wf]] = true;
    }
    watchFields = DEFAULT_WATCH_FIELDS.concat([]);
    for (var xf = 0; xf < extraFields.length; xf++) {
        var extraName = extraFields[xf];
        if (extraName != "" && seenField[extraName] != true) {
            seenField[extraName] = true;
            watchFields.push(extraName);
        }
    }
    trace("{\"t\":\"dbg\",\"at\":\"watch-extended\",\"added\":" +
        (watchFields.length - DEFAULT_WATCH_FIELDS.length) + "}");
}

// ---------------------------------------------------------------------------
// Autopilot: performs the session's actions by calling the SAME entry point
// the on-screen buttons call (getphase), so the game resolves everything
// natively - the wrapper presses buttons, it never fabricates outcomes. This
// is what makes unattended capture possible: the action icons are positioned
// relative to the gladiator and move as he walks, so screen-coordinate
// clicking cannot drive a multi-step fight, and OS input additionally
// requires the window to stay focused and unobscured.
//
// Format: autopilot=walkright*5,normal_attack
// ---------------------------------------------------------------------------
var autopilotSteps = [];
if (rawAutopilot != undefined && rawAutopilot != "") {
    var apParts = rawAutopilot.split(",");
    for (var ap = 0; ap < apParts.length; ap++) {
        var seg = apParts[ap].split("*");
        var repeat = seg.length > 1 ? Number(seg[1]) : 1;
        for (var rep = 0; rep < repeat; rep++) autopilotSteps.push(seg[0]);
    }
}
var autopilotIndex = 0;
var autopilotIdleTicks = 0;
var autopilotCooldown = 0;
var autopilotWaitTicks = 0;
var autopilotAborted = false;
// Menu ticks a step may spend waiting for its controller before the run is
// declared unreachable. Ticks accrue only while the controller is settled on
// a menu frame that does not define the step, so this is not a wall-clock
// timeout: walk and attack animations (frame >= 52) do not count against it.
var AUTOPILOT_WAIT_LIMIT = 900;

// ---------------------------------------------------------------------------
// Which actions each controller offers.
//
// getphase only writes decisionA; whether that decision resolves into
// anything is decided by the controller frame in scope, and the controllers
// are not interchangeable. Read statically from sprite 862 (read-only
// inspection, nothing exported): each label below is a getphase argument
// that controller's own buttons pass.
//
// The controller plays THROUGH its label's span and rests on the span's last
// frame while it waits for input - a live session settles on 12
// (longrange_warrior) and 19 (closerange_warrior), never on the label frames
// 5 and 13 - so the lookup has to be by span, not by label frame.
//
// Verified controller labels: initialise 1, longrange_warrior 5,
// closerange_warrior 13, longrange_archer 20, closerange_archer 28,
// heroactions 52, combatwon 62, combatlost 74.
// ---------------------------------------------------------------------------
var CONTROLLERS = [
    // Byte-verified: frames 1-4 contain no Stop, so the controller never
    // RESTS on the initialise span - it passes straight through to the
    // selector at frame 4. The autopilot fires only on a settled menu frame,
    // so nothing here is reachable by it, and the entry exists to make that
    // diagnosis explicit rather than to offer these as steps. The labels are
    // the forced phases frame 1 issues to itself (empty-ammo swap, forced
    // rest, taunted run, and the four damage-over-time flags), not buttons.
    // swap_weapons is deliberately absent: no controller frame wires it, and
    // its only manual route is the swap_inventory button on frame 1.
    { name: "initialise", from: 1, to: 4, actions: {} },
    { name: "longrange_warrior", from: 5, to: 12, actions: {
        taunt: true, rest: true, jumpleft: true, jumpright: true,
        walkleft: true, walkright: true, chargeleft: true, chargeright: true,
        psyche_up: true, wincrowd: true } },
    { name: "closerange_warrior", from: 13, to: 19, actions: {
        power_attack: true, normal_attack: true, quick_attack: true,
        shove: true, jumpleft: true, jumpright: true, walkleft: true,
        walkright: true, psyche_up: true, wincrowd: true } },
    { name: "longrange_archer", from: 20, to: 27, actions: {
        bombardleft: true, bombardright: true, snipeleft: true,
        sniperight: true, taunt: true, rest: true, jumpleft: true,
        jumpright: true, walkleft: true, walkright: true,
        psyche_up: true, wincrowd: true } },
    // Two different frame numbers are true of this controller and must not be
    // conflated. Its label OWNS frames 28-51 (the next label, heroactions, is
    // at 52), but it RESTS on 37, where its Stop is; frame 51 carries a second
    // Stop no mapped path reaches. This lookup maps a frame to its controller,
    // so it wants the span it owns - the playhead can legitimately be anywhere
    // inside it while the controller builds its buttons, and calling frames
    // 38-51 "no controller" would accrue wait ticks against a step that is
    // about to become available. Confirmed with the project's own tool:
    // node tools/inspect-swf.mjs <swf> --labels --timeline 'sprite:862'
    { name: "closerange_archer", from: 28, to: 51, actions: {
        bash_attack: true, shove: true, taunt: true, jumpleft: true,
        jumpright: true, walkright: true, psyche_up: true, wincrowd: true } }
];

// The frame gate is necessary but not sufficient: several labels carry their
// own byte-verified availability conditions on top of the controller.
// wincrowd needs herolevel >= 3 everywhere; psyche_up needs HEROLEVEL >= 7 on
// the warrior frames and >= 3 on the archer frames (an earlier revision of
// this comment misattributed those two constants to a stamina percentage -
// they are level gates); taunt and rest share one slot, and THAT is the
// stamina-driven choice, selected by whether stamina is at least half.
//
// So a step can sit on the right controller and still not be wired. The table
// above models the controller, not these conditions, so such a step is issued
// and getphase sets a decision nothing dispatches. That failure looks like a
// stall rather than a wait, because the controller IS the expected one -
// check the trace for an autopilot line with no following action-armed.
//
// Open question worth settling before trusting the gate too far: the map's
// byte-verified reading is that the phase machine never consults the
// controller frame, which would mean getphase accepts a label whatever is on
// screen, and the controller only decides which BUTTONS exist. If so this
// gate is stricter than the build. Being stricter is the safe direction - it
// fails loudly instead of silently - but it has not been tested by issuing a
// label to a controller that does not offer it.

function controllerForFrame(frame) {
    for (var ci = 0; ci < CONTROLLERS.length; ci++) {
        var controller = CONTROLLERS[ci];
        if (frame >= controller.from && frame <= controller.to) return controller;
    }
    return undefined;
}

// An unknown label is passed through rather than blocked: this table is a
// map of what the build offers, not a whitelist the wrapper enforces, and
// blocking would make the wrapper the reason a new action cannot be probed.
var knownAutopilotAction = {};
for (var ci2 = 0; ci2 < CONTROLLERS.length; ci2++) {
    for (var actionName in CONTROLLERS[ci2].actions) knownAutopilotAction[actionName] = true;
}

// Distinct overlay frames are logged once each: the controller sits on its
// menu frames (button-building labels below heroactions=52) while waiting
// for input, which is the readiness gate the autopilot uses.
var seenFrames = {};
function dbgFrame(f) {
    if (seenFrames[f] == true) return;
    seenFrames[f] = true;
    trace("{\"t\":\"dbg\",\"at\":\"frame\",\"f\":" + f + "}");
}

// Root-timeline position, logged once per distinct frame. This is the
// screen-free way to observe menu navigation: an operator (or an automated
// route) can confirm progress from the log alone, with no screenshots.
var seenRootFrames = {};
function dbgRootFrame() {
    var root = gameRoot();
    if (root == undefined) return;
    var f = root._currentframe;
    if (f == undefined || seenRootFrames[f] == true) return;
    seenRootFrames[f] = true;
    trace("{\"t\":\"dbg\",\"at\":\"rootframe\",\"f\":" + f + "}");
}

// ---------------------------------------------------------------------------
// Navigator: walks the game from its title screen to the tutorial prisoner
// battle using the game's OWN navigation calls, so no synthetic clicks and
// therefore no window focus are needed - the whole run is unattended and the
// desktop stays usable. Each step reproduces exactly what the corresponding
// button does (byte-verified; DefineButton2 actions cannot be invoked, so
// those are replicated statement for statement) and waits on a state check
// rather than a timer.
//
//   step 0  title idle        -> gotoAndPlay("new_or_continue")     [button 1502]
//   step 1  frame >= 52       -> gotoAndPlay("load_saved_gladiators")[button 1535]
//   step 2  slot handlers up  -> get_char1.onRelease()               [slot clip]
//   step 3  hero loaded       -> replicate the confirm button        [button 1669]
//   step 4                    -> set up the misc fight, arena_intro  [sprite 1788 frame 78]
//   step 5  frame == 220      -> gotoAndPlay("arena")                [button 2128]
//   step 6  battle_started    -> hand over to the autopilot
// ---------------------------------------------------------------------------
var navStep = 0;
var navCooldown = 0;
var navDiagCount = 0;
function dbgNav(label) {
    trace("{\"t\":\"dbg\",\"at\":\"nav\",\"step\":\"" + label + "\"}");
}

function stepNavigator() {
    if (rawNavigate != "prisoner") return;
    if (navStep > 6) return;
    var root = gameRoot();
    if (root == undefined) return;
    if (navCooldown > 0) { navCooldown--; return; }

    if (navStep == 0) {
        // Frame 10 performs the SharedObject read; so_local proves it ran.
        if (root.so_local == undefined) return;
        dbgNav("title");
        root.gotoAndPlay("new_or_continue");
        navStep = 1; navCooldown = 15; return;
    }
    if (navStep == 1) {
        // Frame 35 defines the routines used below; the screen settles at 52.
        if (root._currentframe < 52) return;
        dbgNav("new_or_continue");
        root.gotoAndPlay("load_saved_gladiators");
        navStep = 2; navCooldown = 15; return;
    }
    if (navStep == 2) {
        if (typeof root.get_char1.onRelease != "function") return;
        if (root.so_local.max_gladiators == undefined) return;
        if (root.so_local.max_gladiators < 1) return;
        dbgNav("slot-list");
        root.get_char1.onRelease();
        navStep = 3; navCooldown = 15; return;
    }
    if (navStep == 3) {
        // initcharacter populates the combat object field by field; counting
        // properties is naming-agnostic (character_name is written later, by
        // skincharacter, so it is not a usable readiness signal).
        var heroProps = 0;
        var firstNames = "";
        for (var k in root.game.hero) {
            heroProps++;
            if (heroProps <= 5) firstNames += k + " ";
        }
        if (heroProps < 6) {
            if (navDiagCount < 4) {
                navDiagCount++;
                trace("{\"t\":\"dbg\",\"at\":\"navdiag\",\"props\":" + heroProps +
                    ",\"names\":\"" + firstNames + "\"" +
                    ",\"charToLoad\":\"" + String(root.char_to_load) + "\"" +
                    ",\"slotFrame\":\"" + String(root.get_char1._currentframe) + "\"" +
                    ",\"heroDNA\":\"" + String(_global.heroDNA).substr(0, 20) + "\"}");
                navCooldown = 25;
            }
            return;
        }
        trace("{\"t\":\"dbg\",\"at\":\"navdiag\",\"props\":" + heroProps + ",\"names\":\"" + firstNames + "\"}");
        dbgNav("hero-loaded");
        _global.current_character = root.char_to_load;
        _global.gamephase = 1;
        _global.time_of_day = 24;
        root.game.hero.score = 0;
        root.hero.removeMovieClip();
        root.delete_tooltips();
        navStep = 4; navCooldown = 10; return;
    }
    if (navStep == 4) {
        // Hand control back to the game's own frames instead of shortcutting
        // to arena_intro. daybreak -> (frame 113 routes a level-1 hero to)
        // dungeon -> the prologue clip, which skins the hero, builds the
        // villain via unleash_hell(0) and sets the fight mode itself before
        // jumping to arena_intro.
        //
        // Skipping those frames tripped the game's own character validation
        // ("your character has been corrupted ... character tampering"),
        // which is exactly the outcome this project must never provoke: the
        // save is untouched, but a run that lands on that screen is not
        // vanilla behaviour and its evidence would be worthless. The
        // prologue self-advances, so an unattended run simply waits it out.
        dbgNav("daybreak");
        root.gotoAndPlay("daybreak");
        navStep = 5; navCooldown = 30; return;
    }
    if (navStep == 5) {
        // Frame 220 is arena_intro's Stop: the game has by then run its own
        // setup and validation for both fighters.
        if (root._currentframe != 220) {
            if (navDiagCount < 8) {
                navDiagCount++;
                trace("{\"t\":\"dbg\",\"at\":\"navdiag\",\"waitingAt\":" +
                    root._currentframe + "}");
                navCooldown = 90;
            }
            return;
        }
        dbgNav("versus");
        trace("{\"t\":\"dbg\",\"at\":\"navdiag\",\"heroLevel\":\"" +
            String(root.game.hero.herolevel) + "\",\"fightMode\":\"" +
            String(_global.fight_mode) + "\",\"villainName\":\"" +
            String(root.game.villain.character_name) + "\"}");
        _global.fightselected = false;
        root.gotoAndPlay("arena");
        navStep = 6; navCooldown = 30; return;
    }
    if (navStep == 6) {
        if (_global.battle_started != true) return;
        dbgNav("battle-ready");
        navStep = 7;
    }
}

// ===========================================================================
// Arena navigator (navigate=arena): the LEVELED-gladiator route.
//
// stepNavigator above is a one-shot linear walk to a single staged fight.
// This route LOOPS - town square -> foyer -> fight -> reward -> (level up) ->
// town square - so it is written as a state machine over the screen the game
// is actually resting on, and re-entering a screen is ordinary rather than a
// special case. Mapped in docs/integration/ss2-arena-route.md; every action
// below names the DefineButton2 whose body it replicates statement for
// statement, so the two can be diffed.
//
// This is the first thing this project runs that can permanently change the
// licensed save: root frame 150 calls save_character() and flushes the
// SharedObject on EVERY town-square entry (route map section 8). Four hazards
// an adversarial audit found are therefore enforced here as hard gates,
// marked GATE A..D. None of them may be relaxed without new evidence.
//
//   GATE A  time_of_day advances on a 1.5s WALL-CLOCK setInterval during
//           everything except the battle. At >= 200 the game enters a special
//           event that permanently mutates charisma, magicka or gold and then
//           SAVES it through town square. Re-assert 24 at each town-square
//           rest (the write buttons 1669 and 2283 both make), log it, and
//           abort well below 200.
//   GATE B  root frames 160-169 are that special event. Reaching them at all
//           is a failed run: abort, never advance through them.
//   GATE C  button 2283 gates on the DISPLAY MIRROR _root.statpoints, kept by
//           an enterFrame clip action - not game.hero.statpoints. Pressing in
//           the same execution slot as the four decrements takes the refusal
//           arm and parks forever, so the press waits for the mirror to read
//           zero on a LATER frame.
//   GATE D  the daybreak wait must abort and log, never re-issue
//           gotoAndPlay("daybreak"). Re-entering the span mid-way retains the
//           existing day_night clip and can flip its parity to a permanent
//           hang.
// ===========================================================================
var ARENA_DEFAULT_TIME_OF_DAY_CEILING = 150;
var ARENA_DEFAULT_SESSION_LIMIT_SEC = 900;
var ARENA_DAYBREAK_LIMIT_TICKS = 4000;
var ARENA_MIRROR_LIMIT_TICKS = 1800;

var arenaMode = (rawNavigate == "arena");
var arenaTargetLevel = 0;
var arenaWantTournament = false;
if (rawArenaTarget != undefined && rawArenaTarget != "") {
    if (rawArenaTarget == "tournament") {
        arenaWantTournament = true;
    } else {
        var arenaTargetParts = rawArenaTarget.split(":");
        if (arenaTargetParts[0] == "level") arenaTargetLevel = Number(arenaTargetParts[1]);
    }
}
// Capture is OFF by default on this route. A levelling run is not evidence -
// it is staging - and a trace emitted from one would be an observation of a
// fight nobody chose. "champion" arms only for the tournament rank-1 bout,
// which is the one reproducible armoured opponent in the build.
var arenaCaptureMode = (rawArenaCapture == undefined || rawArenaCapture == "") ? "never" : rawArenaCapture;
// The policy is arena-route-only, and forced off elsewhere rather than merely
// left unset: a stray arenaPolicy on a prisoner run would replace that route's
// explicit step list with a greedy fight, and every one of the twenty-two
// promoted goldens depends on the step list being exactly what was asked for.
var arenaPolicy = (rawArenaPolicy == undefined || rawArenaPolicy == "") ? "" : rawArenaPolicy;
if (!arenaMode) arenaPolicy = "";
if (arenaMode && arenaPolicy == "" && autopilotSteps.length == 0) arenaPolicy = "aggressive";
var arenaTimeCeiling = Number(rawTimeOfDayCeiling);
if (!(arenaTimeCeiling > 0)) arenaTimeCeiling = ARENA_DEFAULT_TIME_OF_DAY_CEILING;
var arenaSessionLimitMs = Number(rawSessionLimitSec) * 1000;
if (!(arenaSessionLimitMs > 0)) arenaSessionLimitMs = ARENA_DEFAULT_SESSION_LIMIT_SEC * 1000;

var arenaPhase = "boot";
var arenaCooldown = 0;
var arenaStopped = false;
var arenaStartMs = getTimer();
var arenaDaybreakTicks = 0;
var arenaMirrorWaitTicks = 0;
var arenaMirrorZeroTicks = 0;
var arenaPointsSpent = 0;
var arenaBoutsFought = 0;

// String(Number(undefined)) is "NaN", which is not JSON. Diagnostic lines are
// stripped by delog, but a malformed one is unreadable by any tool, so every
// numeric field goes through here.
function jnum(value) {
    var n = Number(value);
    if (n != n) return "null";
    return String(n);
}

function arenaLog(step, extra) {
    var root = gameRoot();
    var hero = (root == undefined) ? undefined : root.game.hero;
    trace("{\"t\":\"dbg\",\"at\":\"arena\",\"step\":\"" + step + "\"" +
        ",\"root\":" + (root == undefined ? "null" : jnum(root._currentframe)) +
        ",\"level\":" + (hero == undefined ? "null" : jnum(hero.herolevel)) +
        ",\"tod\":" + jnum(_global.time_of_day) +
        ",\"ms\":" + jnum(getTimer()) +
        (extra == undefined ? "" : "," + extra) + "}");
}

function arenaAbort(reason, extra) {
    if (arenaStopped) return;
    arenaStopped = true;
    arenaPhase = "aborted";
    autopilotAborted = true;
    arenaLog("ABORT:" + reason, extra);
}

function arenaFinish(root, why) {
    if (arenaStopped) return;
    arenaStopped = true;
    arenaPhase = "done";
    autopilotAborted = true;
    arenaLog("TARGET-REACHED:" + why,
        "\"vitality\":" + jnum(root.game.hero.vitality) +
        ",\"hitpointsmax\":" + jnum(root.game.hero.hitpointsmax) +
        ",\"gold\":" + jnum(root.game.hero.goldpieces) +
        ",\"experience\":" + jnum(root.game.hero.experience) +
        ",\"bouts\":" + arenaBoutsFought);
}

/**
 * The tournament field is pre-generated once, at foyer frame 22, and is
 * inspectable only in the window before the first bout. Ranks 2..N come from
 * randomise_gladiator and are regenerated on every fresh launch, so they can
 * never clear the two-session gate; rank 1 comes from unleash_hell() and its
 * hard-coded DNA. Dumping the whole field is what makes that claim checkable
 * from a run's own log instead of from the map alone.
 */
function arenaLogLadder(root) {
    var count = Number(root.foyer.tournament_max_gladiators);
    if (!(count > 0)) return;
    for (var rank = 1; rank <= count; rank++) {
        var villain = root.game["villain" + rank];
        if (villain == undefined) continue;
        trace("{\"t\":\"dbg\",\"at\":\"arena\",\"step\":\"ladder\",\"rank\":" + rank +
            ",\"hitpointsmax\":" + jnum(villain.hitpointsmax) +
            ",\"armourclass\":" + jnum(villain.armourclass) +
            ",\"attack\":" + jnum(villain.attack) +
            ",\"defence\":" + jnum(villain.defence) +
            ",\"minDamage\":" + jnum(villain.min_damage) +
            ",\"maxDamage\":" + jnum(villain.max_damage) +
            ",\"helmet\":" + jnum(villain.helmet) +
            ",\"greaves\":" + jnum(villain.greaves) + "}");
    }
}

/** Every-tick hazard checks. False means the run is over. */
function arenaGuards(root) {
    var frame = root._currentframe;
    // GATE B - the special event screens. A generic advance step here would
    // press special_button1/special_button2 and take a permanent stat change.
    if (frame >= 160 && frame <= 169) {
        arenaAbort("special-event-screen", "\"frame\":" + jnum(frame));
        return false;
    }
    // Terminal screens: gameover (235), bugs (242), gameover_demo (252),
    // enter_highscore (263). Nothing on this route is above 234.
    if (frame >= 235) {
        arenaAbort("terminal-screen", "\"frame\":" + jnum(frame));
        return false;
    }
    // GATE A - both halves. The clock ceiling is the game's own state; the
    // wall clock catches a stall that never advances it.
    var tod = Number(_global.time_of_day);
    if (tod == tod && tod >= arenaTimeCeiling) {
        arenaAbort("time-of-day-ceiling",
            "\"tod\":" + jnum(tod) + ",\"ceiling\":" + jnum(arenaTimeCeiling));
        return false;
    }
    if (getTimer() - arenaStartMs > arenaSessionLimitMs) {
        arenaAbort("session-wall-clock", "\"limitMs\":" + jnum(arenaSessionLimitMs));
        return false;
    }
    return true;
}

function arenaReachedTarget(root) {
    if (arenaWantTournament) return false;
    if (!(arenaTargetLevel > 0)) return false;
    return Number(root.game.hero.herolevel) >= arenaTargetLevel;
}

/** A fresh bout re-arms the fight policy; the prisoner route never loops. */
function arenaResetAutopilot() {
    autopilotIndex = 0;
    autopilotIdleTicks = 0;
    autopilotCooldown = 0;
    autopilotWaitTicks = 0;
    autopilotAborted = false;
}

function stepArenaNavigator() {
    if (!arenaMode) return;
    if (arenaStopped) return;
    var root = gameRoot();
    if (root == undefined) return;
    if (!arenaGuards(root)) return;
    if (arenaCooldown > 0) { arenaCooldown--; return; }
    var frame = root._currentframe;

    if (arenaPhase == "boot") {
        // Frame 10 performs the SharedObject read; so_local proves it ran.
        if (root.so_local == undefined) return;
        arenaLog("title");
        root.gotoAndPlay("new_or_continue");
        arenaPhase = "slots"; arenaCooldown = 15; return;
    }
    if (arenaPhase == "slots") {
        if (frame < 52) return;
        arenaLog("new_or_continue");
        root.gotoAndPlay("load_saved_gladiators");
        arenaPhase = "load"; arenaCooldown = 15; return;
    }
    if (arenaPhase == "load") {
        if (typeof root.get_char1.onRelease != "function") return;
        if (root.so_local.max_gladiators == undefined) return;
        if (root.so_local.max_gladiators < 1) return;
        arenaLog("slot-list");
        root.get_char1.onRelease();
        arenaPhase = "confirm"; arenaCooldown = 15; return;
    }
    if (arenaPhase == "confirm") {
        // initcharacter populates the combat object field by field; counting
        // properties is naming-agnostic, exactly as in stepNavigator.
        var heroProps = 0;
        for (var heroKey in root.game.hero) heroProps++;
        if (heroProps < 6) return;
        // Frame 113 routes on herolevel and NEITHER arm fires for 0,
        // undefined or a non-number - the playhead would then run on into the
        // dungeon span and play the prologue regardless. Refuse to jump until
        // the value is a number.
        var loadedLevel = Number(root.game.hero.herolevel);
        if (loadedLevel != loadedLevel || loadedLevel < 1) {
            arenaAbort("herolevel-not-a-number",
                "\"raw\":\"" + String(root.game.hero.herolevel) + "\"");
            return;
        }
        arenaLog("hero-loaded", "\"props\":" + heroProps +
            ",\"currentTournament\":" + jnum(root.game.hero.current_tournament) +
            ",\"vitality\":" + jnum(root.game.hero.vitality) +
            ",\"gold\":" + jnum(root.game.hero.goldpieces));
        if (arenaReachedTarget(root)) { arenaFinish(root, "already-at-level"); return; }
        // button 1669, verbatim.
        _global.current_character = root.char_to_load;
        root.delete_tooltips();
        _global.gamephase = 1;
        root.hero.removeMovieClip();
        _global.time_of_day = 24;
        root.game.hero.score = 0;
        root.gotoAndPlay("daybreak");
        arenaPhase = "daybreak"; arenaDaybreakTicks = 0; arenaCooldown = 10; return;
    }
    if (arenaPhase == "daybreak") {
        // Frame 113 routes: herolevel > 1 -> townsquare (150), == 1 -> dungeon
        // (114). Both arms additionally require day_night._currentframe == 80
        // EXACTLY, and day_night stops at 107 and never returns, so a phase
        // slip hangs the screen forever.
        if (frame >= 150 && frame <= 159) {
            arenaLog("routed-townsquare"); arenaPhase = "town"; return;
        }
        if (frame >= 114 && frame <= 149) {
            arenaLog("routed-dungeon-prologue");
            arenaPhase = "prologue"; return;
        }
        arenaDaybreakTicks++;
        if (arenaDaybreakTicks > ARENA_DAYBREAK_LIMIT_TICKS) {
            // GATE D. Abort and log; do NOT re-issue gotoAndPlay("daybreak").
            arenaAbort("daybreak-timeout",
                "\"frame\":" + jnum(frame) +
                ",\"dayNight\":" + jnum(root.day_night._currentframe) +
                ",\"ticks\":" + arenaDaybreakTicks);
        }
        return;
    }
    if (arenaPhase == "prologue") {
        // The level-1 arm. The prologue skins the hero, builds the prisoner
        // via unleash_hell(0) and sets fight_mode itself before jumping to
        // arena_intro. It self-advances; nothing here may hurry it.
        if (frame >= 214 && frame <= 220) { arenaPhase = "intro"; }
        return;
    }
    if (arenaPhase == "town") {
        if (frame < 150 || frame > 159) return;
        // GATE A - re-assert the clock the way buttons 1669 and 2283 do, and
        // record both sides of the write so a reader can see it happened.
        var todBefore = _global.time_of_day;
        _global.time_of_day = 24;
        arenaLog("townsquare",
            "\"todBefore\":" + jnum(todBefore) + ",\"todAfter\":24" +
            ",\"gold\":" + jnum(root.game.hero.goldpieces) +
            ",\"bouts\":" + arenaBoutsFought);
        if (arenaReachedTarget(root)) { arenaFinish(root, "level"); return; }
        root.clicksound2.start();
        root.gotoAndPlay("foyer");                        // button 1800
        arenaPhase = "foyer"; arenaCooldown = 20; return;
    }
    if (arenaPhase == "foyer") {
        if (frame != 208) return;
        var foyer = root.foyer;
        if (foyer == undefined) return;
        if (foyer._currentframe != 21) return;            // browse has settled
        var required = Number(foyer.tournament_level_required);
        var heroLevel = Number(root.game.hero.herolevel);
        arenaLog("foyer-browse",
            "\"required\":" + jnum(required) +
            ",\"duelVisible\":" + (foyer.duel_button._visible == true ? "true" : "false") +
            ",\"tournamentNumber\":" + jnum(foyer.tournament_number) +
            ",\"ranking\":" + jnum(root.game.hero.tournament_ranking) +
            ",\"inProgress\":" + (_global.tournament_in_progress == true ? "true" : "false"));
        if (arenaWantTournament) {
            // The tournament button refuses with a bubble message below the
            // gate, so the check is the game's own and must pass first.
            if (!(heroLevel >= required)) {
                arenaAbort("tournament-gate-not-met",
                    "\"level\":" + jnum(heroLevel) + ",\"required\":" + jnum(required));
                return;
            }
            _global.fight_mode = "tournament";            // button 2069
            foyer.gotoAndPlay("tournament");
            foyer.play();
            arenaPhase = "ladder"; arenaCooldown = 20; return;
        }
        // The duel and tournament options are mutually exclusive: the duel
        // button is hidden exactly when herolevel >= tournament_level_required.
        if (foyer.duel_button._visible != true) {
            arenaAbort("duel-button-hidden",
                "\"level\":" + jnum(heroLevel) + ",\"required\":" + jnum(required));
            return;
        }
        _global.fight_mode = "duel";                      // button 2066, verbatim
        var maxArena;
        if      (heroLevel < 15) maxArena = 2;
        else if (heroLevel < 27) maxArena = 3;
        else if (heroLevel < 36) maxArena = 4;
        else if (heroLevel < 48) maxArena = 5;
        else                     maxArena = 6;
        // The body draws a real RandomNumber here; AS2 random(n) compiles to
        // the same opcode. Substituting a constant would make the venue a
        // wrapper decision rather than the game's.
        _global.current_arena = 1 + random(maxArena);
        root.clicksound2.start();
        root.gotoAndPlay("arena_intro");
        arenaPhase = "intro"; arenaCooldown = 20; return;
    }
    if (arenaPhase == "ladder") {
        var ladderFoyer = root.foyer;
        if (ladderFoyer == undefined || ladderFoyer._currentframe != 36) return;
        if (root.game.villain == undefined) return;
        arenaLogLadder(root);
        arenaLog("ladder-ready",
            "\"ranking\":" + jnum(root.game.hero.tournament_ranking) +
            ",\"maxGladiators\":" + jnum(ladderFoyer.tournament_max_gladiators) +
            ",\"arena\":" + jnum(_global.current_arena));
        root.gotoAndPlay("arena_intro");                  // button 2071
        arenaPhase = "intro"; arenaCooldown = 20; return;
    }
    if (arenaPhase == "intro") {
        if (frame != 220) return;                         // arena_intro's Stop
        arenaLog("versus",
            "\"fightMode\":\"" + String(_global.fight_mode) + "\"" +
            ",\"arena\":" + jnum(_global.current_arena) +
            ",\"ranking\":" + jnum(root.game.hero.tournament_ranking) +
            ",\"villainName\":\"" + String(root.game.villain.character_name) + "\"" +
            ",\"villainHitpointsmax\":" + jnum(root.game.villain.hitpointsmax) +
            ",\"villainArmourclass\":" + jnum(root.game.villain.armourclass));
        _global.fightselected = false;                    // button 2128
        root.gotoAndPlay("arena");
        arenaPhase = "fight"; arenaCooldown = 30; return;
    }
    if (arenaPhase == "fight") {
        if (_global.battle_started != true) return;
        arenaBoutsFought++;
        arenaResetAutopilot();
        arenaLog("battle-ready", "\"bout\":" + arenaBoutsFought +
            ",\"policy\":\"" + arenaPolicy + "\"" +
            ",\"captureMode\":\"" + arenaCaptureMode + "\"");
        arenaPhase = "in-battle"; return;
    }
    if (arenaPhase == "in-battle") {
        var arenaClip = root.arena;
        if (arenaClip == undefined) return;
        var arenaFrame = Number(arenaClip._currentframe);
        // Arena clip labels: combat_exp 222 (Stop 249), combat_lost 250
        // (Stop 334). The loss span is terminal for this run - button 2244's
        // body is not mapped, and guessing at it is exactly the class of
        // shortcut this project does not take.
        if (arenaFrame >= 250) {
            arenaAbort("battle-lost", "\"arenaFrame\":" + jnum(arenaFrame) +
                ",\"bout\":" + arenaBoutsFought);
            return;
        }
        if (arenaClip.fight_win_stuff == undefined) return;
        if (arenaClip.fight_win_stuff.button_yes._visible != true) return;
        arenaPhase = "reward"; return;
    }
    if (arenaPhase == "reward") {
        var rewardArena = root.arena;
        if (rewardArena == undefined) return;
        var winPanel = rewardArena.fight_win_stuff;
        if (winPanel == undefined) return;
        // The reward button only EXISTS after the two-second exp-bar tween
        // finishes, and nextleveltext is written inside that tween's callback -
        // so this visibility check is what stops the branch selection racing
        // the string it reads.
        if (winPanel.button_yes._visible != true) return;
        var nextLevelText = String(winPanel.nextleveltext);
        var rewardLevel = Number(root.game.hero.herolevel);
        var currentTournament = Number(root.game.hero.current_tournament);
        var ranking = Number(root.game.hero.tournament_ranking);
        var gameMode = String(_global.game_mode != undefined ? _global.game_mode : root.game_mode);
        arenaLog("reward",
            "\"nextleveltext\":\"" + nextLevelText + "\"" +
            ",\"gameMode\":\"" + gameMode + "\"" +
            ",\"experience\":" + jnum(root.game.hero.experience) +
            ",\"experienceneeded\":" + jnum(root.game.hero.experienceneeded) +
            ",\"gold\":" + jnum(root.game.hero.goldpieces) +
            ",\"ranking\":" + jnum(ranking) +
            ",\"currentTournament\":" + jnum(currentTournament));
        // button 775. Exactly one arm, chosen the way the button chooses it.
        root.clicksound2.start();
        if (currentTournament >= 19 && ranking <= 2) {
            arenaAbort("final-victory-arm",
                "\"currentTournament\":" + jnum(currentTournament));
            return;
        }
        if (nextLevelText == "YOU HAVE LEVELLED UP!" &&
            ((gameMode == "demo" && rewardLevel < 12) ||
             (gameMode == "full" && rewardLevel < 50))) {
            root.game.hero.experience = root.game.hero.experienceneeded + 1;
            root.game.hero.herolevel++;
            root.battlevalues(root.game.hero);
            root.constructDNA();
            arenaPointsSpent = 0;
            arenaMirrorWaitTicks = 0;
            arenaMirrorZeroTicks = 0;
            root.gotoAndPlay("levelup");
            arenaPhase = "levelup"; arenaCooldown = 20; return;
        }
        if (_global.tournament_in_progress == true) {
            root.gotoAndPlay("foyer");
            arenaPhase = "foyer"; arenaCooldown = 20; return;
        }
        if (_global.tournament_complete == true) {
            _global.tournament_complete = null;
            _global.time_of_day = 1 + random(23);
            _global.day++;
            var chanceOfRain = 1 + random(100);
            _global.rain_chance = chanceOfRain > 80;
            _global.special_for_day = false;
            root.game.hero.days_in_arena = _global.day;
            _global.cloudframe = 1 + random(16);
            _global.special_event = 0;
            _global.special_event_happening = false;
            root.gotoAndPlay("daybreak");
            arenaPhase = "daybreak"; arenaDaybreakTicks = 0; arenaCooldown = 20; return;
        }
        root.gotoAndPlay("townsquare");
        arenaPhase = "town"; arenaCooldown = 20; return;
    }
    if (arenaPhase == "levelup") {
        if (frame != 234) return;                         // the levelup span's Stop
        var levelHero = root.game.hero;
        // Root frame 227 sets statpoints = 4 on entry. Spend them ONE PER
        // TICK: the stat button's body is two statements with no call, which
        // makes this the least faithful step on the whole route, and four
        // presses in one execution slot is further from four button presses
        // than four presses in four slots.
        if (Number(levelHero.statpoints) > 0) {
            root.clicksound.start();                      // button 1596's body,
            levelHero.vitality++;                         // with vitality for
            levelHero.statpoints--;                       // strength
            arenaPointsSpent++;
            arenaMirrorWaitTicks = 0;
            arenaMirrorZeroTicks = 0;
            arenaLog("levelup-point",
                "\"spent\":" + arenaPointsSpent +
                ",\"vitality\":" + jnum(levelHero.vitality) +
                ",\"statpointsHero\":" + jnum(levelHero.statpoints) +
                ",\"statpointsRoot\":" + jnum(root.statpoints));
            arenaCooldown = 2;
            return;
        }
        // GATE C. Button 2283 reads _root.statpoints, the display mirror an
        // enterFrame clip action maintains - not game.hero.statpoints. Require
        // the mirror to read zero on two consecutive later frames before
        // pressing; taking the refusal arm parks the run forever, and a run
        // parked on the level-up screen holds a half-levelled gladiator.
        arenaMirrorWaitTicks++;
        if (Number(root.statpoints) == 0) arenaMirrorZeroTicks++;
        else arenaMirrorZeroTicks = 0;
        if (arenaMirrorZeroTicks < 2) {
            if (arenaMirrorWaitTicks == 1 || arenaMirrorWaitTicks == 600) {
                arenaLog("levelup-mirror-wait",
                    "\"statpointsRoot\":" + jnum(root.statpoints) +
                    ",\"statpointsRootRaw\":\"" + String(root.statpoints) + "\"" +
                    ",\"ticks\":" + arenaMirrorWaitTicks);
            }
            if (arenaMirrorWaitTicks > ARENA_MIRROR_LIMIT_TICKS) {
                // Either the mirror lives somewhere else than the audit found,
                // or it never clears. Both are findings, not things to press
                // through: the raw value is logged so one dry run settles it.
                arenaAbort("levelup-mirror-never-cleared",
                    "\"statpointsRootRaw\":\"" + String(root.statpoints) + "\"" +
                    ",\"statpointsHero\":" + jnum(levelHero.statpoints));
            }
            return;
        }
        // button 2283, the non-refusal arm.
        root.specials_gained_mov.removeMovieClip();
        root.backup_char(levelHero);
        root.clicksound2.start();
        root.hero.removeMovieClip();
        root.restore_char(levelHero);
        var newLevel = Number(levelHero.herolevel);
        arenaLog("levelup-confirm",
            "\"level\":" + jnum(newLevel) +
            ",\"vitality\":" + jnum(levelHero.vitality) +
            ",\"hitpointsmax\":" + jnum(levelHero.hitpointsmax) +
            ",\"mirrorWaitTicks\":" + arenaMirrorWaitTicks);
        if (arenaReachedTarget(root)) {
            // Still take the button's own arm: leaving the playhead parked on
            // the level-up screen would leave statpoints spent but the level
            // unbacked-up.
            if (newLevel == 2) {
                _global.day = 1;
                _global.time_of_day = 24;
                root.gotoAndPlay("daybreak");
            } else if (_global.tournament_in_progress == true) {
                root.backup_character(levelHero);
                root.gotoAndPlay("foyer");
            } else {
                root.gotoAndPlay("townsquare");
            }
            arenaFinish(root, "level");
            return;
        }
        if (newLevel == 2) {
            _global.day = 1;
            _global.time_of_day = 24;
            root.gotoAndPlay("daybreak");
            arenaPhase = "daybreak"; arenaDaybreakTicks = 0; arenaCooldown = 20; return;
        }
        if (_global.tournament_in_progress == true) {
            root.backup_character(levelHero);
            root.gotoAndPlay("foyer");
            arenaPhase = "foyer"; arenaCooldown = 20; return;
        }
        root.gotoAndPlay("townsquare");
        arenaPhase = "town"; arenaCooldown = 20; return;
    }
}

/**
 * Fight policy for the arena route. The prisoner route's fixed step list
 * cannot serve a duel: the opponent is generated at the hero's own level,
 * fights back, and the bout runs many turns. This is deliberately the
 * smallest policy that can win one - close the distance, then attack - and it
 * issues nothing the controller in scope does not offer, so it can only ever
 * press buttons the player could press.
 *
 * rest and taunt share one controller slot, chosen by whether stamina is at
 * least half, and the wrapper cannot see which is wired. Issuing the wrong one
 * sets a decision nothing dispatches, so neither is ever issued: overlay frame
 * 1 issues its own forced-rest phase when stamina runs out, and letting the
 * game handle that is both safer and more faithful.
 */
function arenaPolicyStep(controller) {
    if (controller == undefined) return undefined;
    if (controller.actions.normal_attack == true) return "normal_attack";
    var gladiators = gameRoot().arena.gladiators;
    if (gladiators != undefined) {
        var heroX = Number(gladiators.hero._x);
        var villainX = Number(gladiators.villain._x);
        if (heroX == heroX && villainX == villainX) {
            var toward = (villainX >= heroX) ? "walkright" : "walkleft";
            if (controller.actions[toward] == true) return toward;
        }
    }
    if (controller.actions.walkright == true) return "walkright";
    if (controller.actions.walkleft == true) return "walkleft";
    return undefined;
}

function stepAutopilot() {
    if (autopilotAborted) return;
    if (arenaPolicy == "" && autopilotIndex >= autopilotSteps.length) return;
    if (_global.battle_started != true) return;
    var ov = overlayClip();
    if (ov == undefined || typeof ov.getphase != "function") return;
    if (autopilotCooldown > 0) { autopilotCooldown--; return; }
    var frame = ov._currentframe;
    dbgFrame(frame);
    // heroactions and the result labels: the controller is busy resolving the
    // previous decision, so nothing is pressable.
    if (frame >= 52) { autopilotIdleTicks = 0; return; }
    autopilotIdleTicks++;
    if (autopilotIdleTicks < 8) return;

    var controller = controllerForFrame(frame);
    if (arenaPolicy != "") {
        // Policy mode: no step list to walk, so there is nothing to fall off
        // the end of. The policy only ever returns an action the controller in
        // scope offers, which makes the availability check below redundant for
        // this path - an undefined step means "this controller offers nothing
        // I know how to use", which is a wait, not a failure, until the limit.
        var policyStep = arenaPolicyStep(controller);
        if (policyStep == undefined) {
            autopilotWaitTicks++;
            if (autopilotWaitTicks == 1 || autopilotWaitTicks == AUTOPILOT_WAIT_LIMIT / 2) {
                trace("{\"t\":\"dbg\",\"at\":\"autopilot-wait\",\"step\":\"(policy)\"" +
                    ",\"frame\":" + frame + ",\"controller\":\"" +
                    (controller == undefined ? "none" : controller.name) +
                    "\",\"ticks\":" + autopilotWaitTicks + "}");
            }
            if (autopilotWaitTicks >= AUTOPILOT_WAIT_LIMIT) {
                trace("{\"t\":\"dbg\",\"at\":\"autopilot-unavailable\",\"step\":\"(policy)\"" +
                    ",\"frame\":" + frame + ",\"controller\":\"" +
                    (controller == undefined ? "none" : controller.name) + "\"}");
                autopilotAborted = true;
            }
            return;
        }
        autopilotIndex++;
        autopilotIdleTicks = 0;
        autopilotWaitTicks = 0;
        autopilotCooldown = 30;
        trace("{\"t\":\"dbg\",\"at\":\"autopilot\",\"step\":\"" + policyStep +
            "\",\"n\":" + autopilotIndex + ",\"frame\":" + frame +
            ",\"controller\":\"" + controller.name + "\",\"policy\":\"" + arenaPolicy + "\"}");
        ov.getphase(policyStep);
        return;
    }

    var step = autopilotSteps[autopilotIndex];

    // The step is only issued to a controller that offers it. Firing
    // regardless is what an unattended run cannot afford: getphase would set
    // a decision this controller never dispatches, the run would stall with
    // no trace and no reason, and the session would have to be diagnosed
    // from the frame log by hand.
    if (knownAutopilotAction[step] == true &&
        (controller == undefined || controller.actions[step] != true)) {
        autopilotWaitTicks++;
        if (autopilotWaitTicks == 1 || autopilotWaitTicks == AUTOPILOT_WAIT_LIMIT / 2) {
            trace("{\"t\":\"dbg\",\"at\":\"autopilot-wait\",\"step\":\"" + step +
                "\",\"frame\":" + frame + ",\"controller\":\"" +
                (controller == undefined ? "none" : controller.name) +
                "\",\"ticks\":" + autopilotWaitTicks + "}");
        }
        if (autopilotWaitTicks >= AUTOPILOT_WAIT_LIMIT) {
            // Fail loudly and stop: a half-performed action sequence would
            // still emit a trace, and a trace of the wrong action is worse
            // evidence than no trace at all.
            trace("{\"t\":\"dbg\",\"at\":\"autopilot-unavailable\",\"step\":\"" + step +
                "\",\"frame\":" + frame + ",\"controller\":\"" +
                (controller == undefined ? "none" : controller.name) + "\"}");
            autopilotAborted = true;
        }
        return;
    }
    if (knownAutopilotAction[step] != true) {
        // Probing a label this wrapper does not know about: allowed, but the
        // log has to say so, or an unrecognised typo reads as a game bug.
        dbg("autopilot-unknown:" + step);
    }

    autopilotIndex++;
    autopilotIdleTicks = 0;
    autopilotWaitTicks = 0;
    autopilotCooldown = 30;
    trace("{\"t\":\"dbg\",\"at\":\"autopilot\",\"step\":\"" + step + "\",\"n\":" + autopilotIndex +
        ",\"frame\":" + frame + ",\"controller\":\"" +
        (controller == undefined ? "none" : controller.name) + "\"}");
    ov.getphase(step);
}

// Block-level call sites for the wrapped randomBetween definitions.
var OVERLAY_CALL_SITE = "overlay:862/frame:52/DoAction@0x240c7f";
var ROOT_CALL_SITE = "root:0/frame:35/DoAction@0x40198e";

emit({
    t: "meta",
    schemaVersion: 1,
    observationId: config.observationId,
    sessionId: config.sessionId,
    captureToolVersion: config.toolVersion,
    method: config.injected ? "injected-tape-runtime" : "passive-runtime",
    observedAt: config.observedAt,
    mutationGranularity: "property-watch",
    installHashVerifiedBefore: config.hashBefore,
    attackerSide: config.attackerSide
});

// ---------------------------------------------------------------------------
// Load the installed game in place on its own level.
// ---------------------------------------------------------------------------
loadMovieNum(config.gameUrl, 1);

// Draws the armed window made after the tape ran out; reported on the end
// line. See finishTrace.
var overdrawCount = 0;
// Minted inside the player, from values the launcher does not supply, so an
// observation carries at least one field the operator did not choose. This is
// not a security boundary - nothing here is - but sessionId and observationId
// are both operator strings, and independence should not rest entirely on
// them.
// Evaluated here, well before the Math tap is installed, so this is the
// player's own RNG and consumes nothing from the tape.
var launchNonce = String(getTimer()) + "-" + String(Math.floor(Math.random() * 2147483647));

var currentHook = "unattributed";   // set/cleared by function wraps
var battleHooked = false;
var actionDepth = 0;                // > 0 while inside checkattackroll
var armed = false;                  // recording window is open
var actionCaptured = false;         // one action per session
var finalsDumped = false;

function gameRoot() { return _level1; }
function gameObject(side) { return gameRoot().game[side == "hero" ? "hero" : "villain"]; }
// Byte-verified: root frame 221 runs
// _root.arena.gladiators.attachMovie("overlay", "overlay", 40000).
function overlayClip() { return gameRoot().arena.gladiators.overlay; }

function dumpSide(kind, side) {
    var source = gameObject(side);
    var fields = {};
    for (var i = 0; i < watchFields.length; i++) {
        var name = watchFields[i];
        var value = normalizeFieldValue(name, source[name]);
        if (value !== undefined) fields[name] = value;
    }
    // Runtime-verified: gladiator_dir lives on the fighter CLIP, not the
    // persistent stat object (fall back to the stat object if present).
    var clip = gameRoot().arena.gladiators[side];
    var facing = clip != undefined ? clip.gladiator_dir : undefined;
    if (facing === undefined) facing = source.gladiator_dir;
    if (facing !== undefined) fields.gladiator_dir = facing;
    emit({ t: kind, side: side, fields: fields });
}

// Object.watch on stat fields: fires per assignment; recorded only while the
// armed action is executing.
function makeWatcher(side) {
    return function (prop, oldValue, newValue) {
        if (armed) {
            emit({
                t: "set",
                path: "/" + side + "/" + prop,
                before: normalizeFieldValue(prop, oldValue),
                after: normalizeFieldValue(prop, newValue),
                hook: currentHook
            });
        }
        return newValue;
    };
}

/**
 * Wraps survive vanilla re-definition via a per-frame SWEEP, not slot
 * watches: probed live, Ruffle silently DROPS scope-style assignments onto
 * watched movieclip slots (the game's own frame-52 definitions were being
 * voided), so watching function slots breaks the game. The sweep re-wraps
 * any unmarked function every frame; the mapped roll calls fire
 * mid-animation, many ticks after definition, so the one-frame window never
 * loses an action.
 */
var hookSlots = [];
function registerSlot(ownerGetter, name, maker) {
    // Frame-defined functions are pinned (see pinSlot); native clip methods
    // such as gotoAndPlay are never re-defined and must not be watched.
    hookSlots.push({ ownerGetter: ownerGetter, name: name, maker: maker, pin: true });
}
function registerNativeSlot(ownerGetter, name, maker) {
    hookSlots.push({ ownerGetter: ownerGetter, name: name, maker: maker, pin: false });
}
// Pinning: probed live, Ruffle DROPS scope-style assignments onto watched
// slots. Installing the watch AFTER the game's first definition therefore
// freezes our wrapper in place - the frame-52 re-definitions that would
// otherwise strip it (define-and-call is atomic, so a per-frame sweep loses
// that race) are discarded, and the game's own calls reach our wrapper.
// This is exactly the arrangement of the one fully successful live capture
// (session-20260830-e). The initial definition is never blocked because the
// watch is only installed once the function exists.
function pinSlot(owner, name, wrapped) {
    owner.watch(name, function (prop, oldValue, newValue) {
        return wrapped;
    });
}

function sweepWraps() {
    for (var i = 0; i < hookSlots.length; i++) {
        var slot = hookSlots[i];
        var owner = slot.ownerGetter();
        if (owner == undefined) continue;
        var current = owner[slot.name];
        if (typeof current == "function" && current.__ss2w != true) {
            var wrapped = slot.maker(current);
            wrapped.__ss2w = true;
            owner[slot.name] = wrapped;
            if (slot.pin == true) pinSlot(owner, slot.name, wrapped);
            dbg("wrapped:" + slot.name);
        }
    }
}

function makeHookMaker(hookLabel, onEnter, onExit) {
    return function (original) {
        return function () {
            var previous = currentHook;
            currentHook = hookLabel;
            if (armed) dbg("called:" + hookLabel);
            if (onEnter != undefined) onEnter(arguments);
            var result = original.apply(this, arguments);
            if (onExit != undefined) onExit();
            currentHook = previous;
            return result;
        };
    };
}

function makeRandomBetweenMaker(siteId) {
    // Diagnostic passthrough only: the tape is served and recorded at the
    // Math.random tap below, which the frame-52 atomic re-definitions
    // cannot shadow. Serving it here too would double-consume the tape.
    return function (original) {
        return function (a, b) {
            if (armed) dbg("called:randomBetween");
            return original(a, b);
        };
    };
}

// Byte-verified: frame 52 re-defines checkattackroll/randomBetween and
// calls them in the SAME script execution, so slot wraps cannot interpose
// on that path. Math.random is the one shared singleton underneath every
// randomBetween body; while armed, the tape is served and recorded THERE.
// For a tape entry (a, b, v), returning (v - a + 0.5) / (b - a + 1) makes
// floor(r * (b - a + 1)) + a yield exactly v.
var originalMathRandom = Math.random;
function tappedRandom() {
    dbg("mrand-first");
    if (!armed) return originalMathRandom();
    var sample = tape[tapeCursor];
    if (config.injected && sample != undefined) {
        tapeCursor++;
        var span = sample.max - sample.min + 1;
        emit({
            t: "roll", label: sample.label, source: "randomBetween",
            min: sample.min, max: sample.max, value: sample.value,
            callSite: OVERLAY_CALL_SITE, injected: true
        });
        return (sample.value - sample.min + 0.5) / span;
    }
    // Tape exhausted or passive: record the raw uniform draw in the
    // diagnostics log; the integer roll it produced is reconstructed
    // during analysis from the surrounding evidence. Counted as well as
    // logged - delog strips dbg lines, so without the count an armed window
    // that drew more times than the candidate models would leave no trace of
    // having done so.
    if (armed) overdrawCount++;
    var raw = originalMathRandom();
    trace("{\"t\":\"dbg\",\"at\":\"mrand\",\"r\":" + raw + ",\"cursor\":" + tapeCursor + "}");
    tapeCursor++;
    return raw;
}

// Probed live: each level keeps its OWN Math, so tapping the wrapper's
// Math.random never sees the game's rolls. Instead a tapped Math clone is
// planted as a timeline variable on the game's root and overlay clips -
// bare `Math` lookups from their frame-defined functions resolve the
// shadow before the movie globals, atomic re-definitions included.
var tappedMath = null;
function buildTappedMath() {
    if (tappedMath != null) return;
    tappedMath = {
        abs: Math.abs, acos: Math.acos, asin: Math.asin, atan: Math.atan,
        atan2: Math.atan2, ceil: Math.ceil, cos: Math.cos, exp: Math.exp,
        floor: Math.floor, log: Math.log, max: Math.max, min: Math.min,
        pow: Math.pow, round: Math.round, sin: Math.sin, sqrt: Math.sqrt,
        tan: Math.tan,
        E: Math.E, LN10: Math.LN10, LN2: Math.LN2, LOG10E: Math.LOG10E,
        LOG2E: Math.LOG2E, PI: Math.PI, SQRT1_2: Math.SQRT1_2,
        SQRT2: Math.SQRT2,
        random: tappedRandom
    };
    dbg("tapped-math-built");
}
function shadowMathScopes() {
    buildTappedMath();
    var root = gameRoot();
    if (root != undefined && root.Math != tappedMath) {
        root.Math = tappedMath;
        dbg("math-shadowed:root");
    }
    var overlay = overlayClip();
    if (overlay != undefined && overlay.Math != tappedMath) {
        overlay.Math = tappedMath;
        dbg("math-shadowed:overlay");
    }
}

/**
 * Whether this action may be recorded at all.
 *
 * Every route other than `navigate=arena` is unchanged: it returns true, so
 * the twenty-two promoted goldens stay reproducible byte for byte.
 *
 * The arena route is different because it fights MANY bouts per process and
 * only one of them is ever evidence. A levelling run is staging, not
 * observation, and a trace emitted from a duel would be an observation of an
 * opponent nobody chose and nobody can reproduce (randomise_gladiator draws
 * through the RandomNumber opcode, which no instrumentation can intercept).
 * "champion" arms only for the tournament rank-1 bout - the hero reaches
 * tournament_ranking <= 2 exactly when foyer frame 22 has bound
 * _root.game.villain to the champion built by unleash_hell() from hard-coded
 * DNA, which is the one reproducible armoured opponent in the build.
 */
function captureAllowedNow() {
    if (!arenaMode) return true;
    if (arenaCaptureMode == "always") return true;
    if (arenaCaptureMode == "champion") {
        var hero = gameRoot().game.hero;
        if (hero == undefined) return false;
        var ranking = Number(hero.tournament_ranking);
        return (ranking == ranking && ranking <= 2 && _global.tournament_in_progress == true);
    }
    return false;
}

function beginAction() {
    if (actionCaptured) return;
    // Checked before the latch, deliberately: a bout that is not the capture
    // target must leave the wrapper able to arm on a LATER bout.
    if (!captureAllowedNow()) return;
    actionCaptured = true;
    armed = true;
    dbg("action-armed");
    dumpSide("state", "hero");
    dumpSide("state", "villain");
    emit({ t: "var", name: "fight_mode", value: _global.fight_mode });
    var ov = overlayClip();
    emit({ t: "var", name: "attack_direction", value: ov.attack_direction });
    if (ov.criticalhit != undefined) {
        emit({ t: "var", name: "criticalhit", value: ov.criticalhit });
    }
    // The spell ingress has no direction chain, so a cast is identified by
    // the inventory id the caller used. Without this line ingest cannot
    // project scenario.spellId and no spell trace can ever be evidence.
    // Recorded whenever the game has one; a physical action leaves it unset.
    if (ov.spell_id != undefined) {
        emit({ t: "var", name: "spell_id", value: ov.spell_id });
    } else if (_global.spell_id != undefined) {
        emit({ t: "var", name: "spell_id", value: _global.spell_id });
    }
}

function finishTrace() {
    if (finalsDumped) return;
    armed = false;
    dumpSide("final", "hero");
    dumpSide("final", "villain");
    // The post-session hash check has not run yet; ingest re-runs it live
    // and refuses the trace when it fails.
    //
    // overdraw is the count of draws the armed window made AFTER the tape ran
    // out. It has to be reported, because those draws are otherwise invisible:
    // they fall through to the live RNG and are logged only as dbg lines,
    // which delog strips. A run that drew more times than the candidate models
    // would then be indistinguishable from one that matched it. launchNonce is
    // minted here rather than supplied, so a record carries one field the
    // operator did not choose.
    emit({
        t: "end",
        installHashVerifiedAfter: null,
        overdraw: overdrawCount,
        launchNonce: launchNonce
    });
    finalsDumped = true;
    traceClosed = true;
}

var resultSeen = false;
function makeGotoMaker() {
    return function (original) {
        return function (label) {
            if (armed && (label == "combatwon" || label == "combatlost")) {
                emit({ t: "event", type: "overlay-label", label: label });
                // The close is deferred one tick (driver loop): the mapped
                // post-death knockback and enchantment rolls arrive later in
                // the same script and belong to the action.
                resultSeen = true;
            }
            return original.apply(this, arguments);
        };
    };
}

// Field watches on the persistent stat OBJECTS are safe (the game writes
// them via member access, which watch handles); they are re-installed
// whenever the game swaps in fresh objects (new battle, new opponent).
var watchedHero = null;
var watchedVillain = null;
function sweepFieldWatches() {
    var hero = gameObject("hero");
    var villain = gameObject("villain");
    if (hero != undefined && hero != watchedHero) {
        for (var f = 0; f < watchFields.length; f++) hero.watch(watchFields[f], makeWatcher("hero"));
        watchedHero = hero;
        dbg("watching:hero");
    }
    if (villain != undefined && villain != watchedVillain) {
        for (var g = 0; g < watchFields.length; g++) villain.watch(watchFields[g], makeWatcher("villain"));
        watchedVillain = villain;
        dbg("watching:villain");
    }
    if (overlayClip() != undefined) dbg("overlay-exists");
}

function hookBattle() {
    var root = gameRoot();
    if (root == undefined) return;
    dbg("level1-exists");
    if (root.game == undefined) return;
    dbg("game-exists");

    registerSlot(function () { return overlayClip(); }, "randomBetween", makeRandomBetweenMaker(OVERLAY_CALL_SITE));
    registerSlot(function () { return gameRoot(); }, "randomBetween", makeRandomBetweenMaker(ROOT_CALL_SITE));
    // getphase(whatsdoing) begins every action; it only contributes the
    // phase_action metadata line. Recording arms at checkattackroll - the
    // roll/mutation scope proven against live melee captures. Range actions
    // that skip checkattackroll (e.g. taunts) roll through the raw
    // RandomNumber opcode and are observed to be uncapturable by function
    // wraps; they are out of tape scope by design.
    registerSlot(function () { return overlayClip(); }, "getphase", function (original) {
        return function () {
            var previous = currentHook;
            currentHook = "getphase";
            emit({ t: "var", name: "phase_action", value: String(arguments[0]) });
            var result = original.apply(this, arguments);
            currentHook = previous;
            return result;
        };
    });
    // attack_chances is defined at overlay frame 1 (never re-defined
    // mid-battle) and is the first call of every attack resolution: the
    // reliable arming point even when the atomic frame-52 path shadows the
    // checkattackroll wrap itself.
    registerSlot(function () { return overlayClip(); }, "attack_chances", function (original) {
        return function () {
            dbg("called:attack_chances");
            // attack_chances also renders the action buttons' percentages;
            // the resolution path is distinguished by attack_direction being
            // set just before the roll (observed live: the UI path leaves
            // it null and arming there captures nothing).
            var ov = overlayClip();
            if (!actionCaptured && ov != undefined && typeof ov.attack_direction == "number") {
                beginAction();
            }
            return original.apply(this, arguments);
        };
    });
    registerSlot(function () { return overlayClip(); }, "checkattackroll", function (original) {
        return function () {
            var previous = currentHook;
            currentHook = "check-attack-roll";
            dbg("called:checkattackroll");
            if (!actionCaptured) beginAction();
            actionDepth++;
            var result = original.apply(this, arguments);
            actionDepth--;
            currentHook = previous;
            if (armed && actionDepth == 0) finishTrace();
            return result;
        };
    });
    registerSlot(function () { return overlayClip(); }, "damagecharacter", makeHookMaker("damagecharacter"));
    registerSlot(function () { return overlayClip(); }, "magic_damage_character", makeHookMaker("damagecharacter"));
    registerSlot(function () { return overlayClip(); }, "remove_armour", makeHookMaker("remove-armour"));
    registerSlot(function () { return overlayClip(); }, "destroy_armour", makeHookMaker("remove-armour"));
    // The phase boundary: an armed action that never reached checkattackroll
    // (e.g. a range taunt) is complete when nextphase runs - close the trace
    // BEFORE it, so its stamina/regen accounting stays outside the
    // single-action scope, matching the fixture boundary.
    registerSlot(function () { return overlayClip(); }, "nextphase", function (original) {
        return function () {
            if (armed && actionDepth == 0) finishTrace();
            var previous = currentHook;
            currentHook = "next-phase";
            var result = original.apply(this, arguments);
            currentHook = previous;
            return result;
        };
    });
    registerSlot(function () { return overlayClip(); }, "check_spells", makeHookMaker("check-spells"));
    registerSlot(function () { return overlayClip(); }, "defender_hurt", makeHookMaker("damagecharacter", function (args) {
        if (armed) emit({ t: "event", type: "defender-hurt", method: String(args[0]) });
    }));
    registerSlot(function () { return overlayClip(); }, "defender_blocked", makeHookMaker("check-attack-roll", function () {
        if (armed) emit({ t: "event", type: "defender-blocked" });
    }));
    registerSlot(function () { return overlayClip(); }, "death", makeHookMaker("death", function (args) {
        if (armed) {
            var clip = args[0];
            var side = clip == gameRoot().arena.gladiators.villain ? "villain" : "hero";
            emit({ t: "event", type: "death", side: side });
        }
    }));
    registerNativeSlot(function () { return overlayClip(); }, "gotoAndPlay", makeGotoMaker());

    battleHooked = true;
}

// END key: manual fallback to close a trace that did not auto-finish.
var keyListener = {
    onKeyDown: function () {
        if (Key.getCode() == Key.END && actionCaptured) finishTrace();
    }
};
Key.addListener(keyListener);

// Driver loop: register the slots once the game exists, then sweep every
// frame - re-wrapping any function the timeline (re)defined and re-watching
// stat objects the game swapped. The armed action closes the trace itself.
this.onEnterFrame = function () {
    dbgRootFrame();
    stepNavigator();
    stepArenaNavigator();
    if (!battleHooked) { hookBattle(); return; }
    // Lethal close for actions the atomic frame-52 path resolved without
    // our checkattackroll wrap: one tick after the result label.
    if (armed && resultSeen && actionDepth == 0) finishTrace();
    sweepFieldWatches();
    sweepWraps();
    shadowMathScopes();
    stepAutopilot();
};
