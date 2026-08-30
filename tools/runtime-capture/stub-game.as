/**
 * Independently authored stub "game" for wrapper vehicle validation.
 *
 * Mimics only the STRUCTURE the capture wrapper hooks (game.hero/villain
 * objects, arena.overlay with a randomBetween function, the battle flow of
 * one lethal exchange) and replays the exact numbers of the committed
 * candidate-lethal-result fixture. It contains no game content of any kind;
 * its whole purpose is that the wrapper's trace of this stub must ingest and
 * MATCH that fixture before any real capture is trusted.
 *
 * Traces produced against this stub are validation artifacts only: keep
 * their ids prefixed "stubcheck-" and never place their observation records
 * under test/observations/.
 */

// Runtime-verified quirks mirrored here so the gate exercises them: status
// flags stay UNDEFINED until something sets them (the wrapper must emit
// false), and gladiator_dir lives on the fighter CLIPS, not these objects.
var game = {
    hero: {
        attack: 11, defence: 11, strength: 5, charisma: 5, magicka: 0,
        min_damage: 12, max_damage: 20,
        hitpoints: 60, hitpointsmax: 60, staminaleft: 20, staminamax: 100,
        armourclass: 0, armourclass_max: 0,
        helmet: 0, shoulderguard: 0, breastplate: 0, gauntlet: 0,
        greaves: 0, shinguard: 0, boot: 0, shield: 0
    },
    villain: {
        attack: 11, defence: 11, strength: 0, charisma: 0, magicka: 0,
        min_damage: 1, max_damage: 1,
        hitpoints: 12, hitpointsmax: 40, staminaleft: 20, staminamax: 100,
        armourclass: 0, armourclass_max: 0,
        burning: true,
        helmet: 0, shoulderguard: 0, breastplate: 0, gauntlet: 0,
        greaves: 0, shinguard: 0, boot: 0, shield: 0
    }
};

this.createEmptyMovieClip("arena", 1);
arena.createEmptyMovieClip("gladiators", 2);
arena.gladiators.createEmptyMovieClip("hero", 301);
arena.gladiators.createEmptyMovieClip("villain", 300);
arena.gladiators.hero.gladiator_dir = "right";
arena.gladiators.villain.gladiator_dir = "left";
// Matches the byte-verified vanilla path: the overlay controller is a child
// of arena.gladiators, attached at depth 40000.
arena.gladiators.createEmptyMovieClip("overlay", 40000);

var stubRoot = this;
var ov = arena.gladiators.overlay;
ov.attack_direction = 5;
_global.fight_mode = "misc";

ov.randomBetween = function (a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
};

// Vanilla-ordered death boundary: clear statuses (frozen, burning, poison,
// life_stolen; hero's group first), then taunts per field, then the overlay
// result label.
ov.death = function (whichcharacter, how_died) {
    stubRoot.game.hero.frozen = false;
    stubRoot.game.hero.burning = false;
    stubRoot.game.hero.poison = false;
    stubRoot.game.hero.life_stolen = false;
    stubRoot.game.villain.frozen = false;
    stubRoot.game.villain.burning = false;
    stubRoot.game.villain.poison = false;
    stubRoot.game.villain.life_stolen = false;
    stubRoot.game.hero.taunted1 = false;
    stubRoot.game.villain.taunted1 = false;
    stubRoot.game.hero.taunted2 = false;
    stubRoot.game.villain.taunted2 = false;
    this.gotoAndPlay("combatwon");
};

// Builders let the stub simulate vanilla's frame-52 re-execution, which
// REASSIGNS the combat functions mid-battle: the wrapper's resilient wraps
// must survive that clobber for the gate to pass.
function buildDamagecharacter() {
    return function (damage) {
        stubRoot.game.villain.hitpoints = stubRoot.game.villain.hitpoints - damage;
        if (stubRoot.game.villain.hitpoints <= 0) {
            this.death(stubRoot.arena.gladiators.villain, "slain");
        }
    };
}

function buildCheckattackroll() {
    // One lethal exchange replaying candidate-lethal-result's tape order:
    // hit, damage, critical, deflection, removal, dispatch, knockback,
    // enchantment (death fires inside the dispatch, before the last two).
    return function () {
        var diceroll = this.randomBetween(1, 100);
        var damage = this.randomBetween(12, 20);
        var critical = this.randomBetween(1, 20);
        if (diceroll >= 50) {
            this.randomBetween(1, 100); // critical deflection
            this.randomBetween(1, 100); // armour removal chance (<= 66: none)
            this.defender_hurt("normal", damage);
            this.randomBetween(1, 4); // knockback
            this.randomBetween(1, 100); // enchantment potency
        } else {
            this.defender_blocked();
        }
    };
}

// Mirrors the real timeline: the overlay clip exists for several frames
// BEFORE its combat functions are defined (frame-52 semantics), so the
// wrapper must hook the empty clip and wrap the functions at assignment.
function defineOverlayFunctions() {
    ov.getphase = function (whatsdoing) {};
    ov.randomBetween = function (a, b) {
        return Math.floor(Math.random() * (b - a + 1)) + a;
    };
    ov.damagecharacter = buildDamagecharacter();
    ov.defender_hurt = function (method, damage) {
        this.damagecharacter(damage);
    };
    ov.defender_blocked = function () {};
    ov.checkattackroll = buildCheckattackroll();
}

// Decoy rolls before the action: real battles roll AI-decision dice outside
// checkattackroll, which the wrapper must neither inject nor record.
var stubFrame = 0;
this.onEnterFrame = function () {
    stubFrame++;
    if (stubFrame == 3) {
        // Frame-52 moment: everything gets defined at once.
        defineOverlayFunctions();
    }
    if (stubFrame == 5) {
        _global.battle_started = true;
        ov.randomBetween(1, 100);
        ov.randomBetween(1, 100);
    }
    if (stubFrame == 7) {
        // Simulate the overlay timeline looping through frame 52 again.
        ov.checkattackroll = buildCheckattackroll();
        ov.damagecharacter = buildDamagecharacter();
    }
    if (stubFrame == 9) {
        // Real actions arm at getphase before any roll happens.
        ov.getphase("normal_attack");
    }
    if (stubFrame == 10) {
        ov.checkattackroll();
        this.onEnterFrame = undefined;
    }
};
