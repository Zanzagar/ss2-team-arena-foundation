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

// ---------------------------------------------------------------------------
// Configuration (read every FlashVar before declaring same-named variables)
// ---------------------------------------------------------------------------
var rawTape = _root.tape;
var rawWatchFields = _root.watchFields;
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
var watchFields = rawWatchFields != undefined && rawWatchFields != ""
    ? rawWatchFields.split(",")
    : DEFAULT_WATCH_FIELDS;

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

var currentHook = "unattributed";   // set/cleared by function wraps
var battleHooked = false;
var actionDepth = 0;                // > 0 while inside the armed action
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
        if (actionDepth > 0) {
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
    hookSlots.push({ ownerGetter: ownerGetter, name: name, maker: maker });
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
        }
    }
}

function makeHookMaker(hookLabel, onEnter, onExit) {
    return function (original) {
        return function () {
            var previous = currentHook;
            currentHook = hookLabel;
            if (onEnter != undefined) onEnter(arguments);
            var result = original.apply(this, arguments);
            if (onExit != undefined) onExit();
            currentHook = previous;
            return result;
        };
    };
}

function makeRandomBetweenMaker(siteId) {
    return function (original) {
        return function (a, b) {
            // Rolls outside the armed action (AI decisions, cosmetics on
            // other turns) are neither injected nor recorded.
            if (actionDepth <= 0) return original(a, b);
            var sample = tape[tapeCursor];
            var matches = sample != undefined && sample.min == a && sample.max == b;
            var value;
            var label;
            if (config.injected && matches) {
                value = sample.value;
                label = sample.label;
            } else {
                // A bounds mismatch inside the action means the game diverged
                // from the candidate's expected roll order: fall back to the
                // live RNG and keep recording. A session with zero injected
                // samples is rejected by validation; the raw JSONL is then
                // the divergence evidence.
                value = original(a, b);
                label = matches ? sample.label : "unexpected-" + tapeCursor;
            }
            tapeCursor++;
            emit({
                t: "roll", label: label, source: "randomBetween",
                min: a, max: b, value: value,
                callSite: siteId, injected: config.injected && matches
            });
            return value;
        };
    };
}

function beginAction() {
    if (actionCaptured) return;
    actionCaptured = true;
    dumpSide("state", "hero");
    dumpSide("state", "villain");
    emit({ t: "var", name: "fight_mode", value: _global.fight_mode });
    var ov = overlayClip();
    emit({ t: "var", name: "attack_direction", value: ov.attack_direction });
    if (ov.criticalhit != undefined) {
        emit({ t: "var", name: "criticalhit", value: ov.criticalhit });
    }
}

function finishTrace() {
    if (finalsDumped) return;
    dumpSide("final", "hero");
    dumpSide("final", "villain");
    // The post-session hash check has not run yet; ingest re-runs it live
    // and refuses the trace when it fails.
    emit({ t: "end", installHashVerifiedAfter: null });
    finalsDumped = true;
    traceClosed = true;
}

function makeGotoMaker() {
    return function (original) {
        return function (label) {
            if (actionDepth > 0 && (label == "combatwon" || label == "combatlost")) {
                emit({ t: "event", type: "overlay-label", label: label });
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
    }
    if (villain != undefined && villain != watchedVillain) {
        for (var g = 0; g < watchFields.length; g++) villain.watch(watchFields[g], makeWatcher("villain"));
        watchedVillain = villain;
    }
}

function hookBattle() {
    var root = gameRoot();
    if (root == undefined || root.game == undefined) return;

    registerSlot(function () { return overlayClip(); }, "randomBetween", makeRandomBetweenMaker(OVERLAY_CALL_SITE));
    registerSlot(function () { return gameRoot(); }, "randomBetween", makeRandomBetweenMaker(ROOT_CALL_SITE));
    registerSlot(function () { return overlayClip(); }, "checkattackroll", function (original) {
        return function () {
            var previous = currentHook;
            currentHook = "check-attack-roll";
            var arming = !actionCaptured;
            if (arming) beginAction();
            actionDepth++;
            var result = original.apply(this, arguments);
            actionDepth--;
            currentHook = previous;
            if (arming && actionDepth == 0) finishTrace();
            return result;
        };
    });
    registerSlot(function () { return overlayClip(); }, "damagecharacter", makeHookMaker("damagecharacter"));
    registerSlot(function () { return overlayClip(); }, "magic_damage_character", makeHookMaker("damagecharacter"));
    registerSlot(function () { return overlayClip(); }, "remove_armour", makeHookMaker("remove-armour"));
    registerSlot(function () { return overlayClip(); }, "destroy_armour", makeHookMaker("remove-armour"));
    registerSlot(function () { return overlayClip(); }, "nextphase", makeHookMaker("next-phase"));
    registerSlot(function () { return overlayClip(); }, "check_spells", makeHookMaker("check-spells"));
    registerSlot(function () { return overlayClip(); }, "defender_hurt", makeHookMaker("damagecharacter", function (args) {
        if (actionDepth > 0) emit({ t: "event", type: "defender-hurt", method: String(args[0]) });
    }));
    registerSlot(function () { return overlayClip(); }, "defender_blocked", makeHookMaker("check-attack-roll", function () {
        if (actionDepth > 0) emit({ t: "event", type: "defender-blocked" });
    }));
    registerSlot(function () { return overlayClip(); }, "death", makeHookMaker("death", function (args) {
        if (actionDepth > 0) {
            var clip = args[0];
            var side = clip == gameRoot().arena.gladiators.villain ? "villain" : "hero";
            emit({ t: "event", type: "death", side: side });
        }
    }));
    registerSlot(function () { return overlayClip(); }, "gotoAndPlay", makeGotoMaker());

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
    if (!battleHooked) { hookBattle(); return; }
    sweepFieldWatches();
    sweepWraps();
};
