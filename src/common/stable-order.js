/**
 * Locale-INDEPENDENT string ordering.
 *
 * ## Why this module exists at all
 *
 * `String.prototype.localeCompare` is ICU-locale-dependent. Two machines
 * running the same code on the same data can order the same two strings
 * differently, and every place this project sorted strings had independently
 * reached for it. That is a defect CLASS, not five defects, so the reason
 * lives here once instead of being re-argued at each site.
 *
 * Measured 2026-09-02 over the 86 distinct `sessionId`s in committed fixtures
 * (3,655 pairs), comparing `localeCompare(id, locale)` against the plain
 * comparator below:
 *
 * | locale | pairs ordered differently from `<` |
 * | --- | --- |
 * | en-US, en-GB, cs-CZ, sk-SK, lt-LT, et-EE, da-DK, sv-SE, tr-TR, de-DE, fr-FR, ig-NG, sq-AL | 0 |
 * | haw-US | 1 |
 * | **az-AZ** | **682** |
 *
 * Two things follow, and both matter:
 *
 * 1. **The swap is safe on the committed corpus.** `en-US` — what every
 *    existing digest was minted under — agrees with this comparator on all
 *    3,655 pairs, so replacing `localeCompare` changes no committed value.
 * 2. **The hazard was real, not theoretical.** An Azerbaijani-locale machine
 *    reorders 682 of those pairs. It was one locale away, not one bug away.
 *
 * Reproduce both columns with
 * `node tools/stable-order-locale-census.mjs`.
 *
 * ## What this deliberately does NOT do
 *
 * It does not normalise case, and it does not accept a non-string. Both are
 * real differences from `localeCompare` and both were measured rather than
 * assumed:
 *
 * - **Case.** `["alpha", "Beta"]` sorts to `["alpha", "Beta"]` under en-US
 *   collation and to `["Beta", "alpha"]` here, because `"B"` (0x42) sorts
 *   before `"a"` (0x61) by code unit. Callers whose ids can differ in case
 *   must decide what they want; this module will not decide for them, because
 *   silently case-folding an id is how an id collision becomes invisible.
 * - **Non-strings.** `"alpha".localeCompare(5)` is `1`; here it is `0` — a
 *   tie rather than an ordering, which a total order must not produce. So a
 *   caller sorting values that might not be strings has a validation problem
 *   this comparator will expose as an unstable sort rather than a throw.
 *
 * Node builtins only; no imports, so `tools/` can use it as freely as `src/`.
 */

/**
 * Total order over strings by UTF-16 code unit, identical on every machine.
 *
 * @param {string} left
 * @param {string} right
 * @returns {-1|0|1}
 */
export function byCodeUnit(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * The same order, keyed on a field — the shape most call sites want.
 *
 * @param {string} key
 * @returns {(left: object, right: object) => -1|0|1}
 */
export function byCodeUnitKey(key) {
  return (left, right) => byCodeUnit(left[key], right[key]);
}
