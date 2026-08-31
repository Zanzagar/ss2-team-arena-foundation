/**
 * The closed set of observation records that predate `capture.launchNonce`.
 *
 * WHY A FROZEN LIST RATHER THAN AN OPTIONAL FIELD.
 *
 * `launchNonce` is minted inside the player from values the launcher does not
 * supply. `observationId` and `sessionId` are both operator strings; the nonce
 * is the one identity on a record that the operator did not choose, which is
 * why the promotion gate refuses two observations that share one.
 *
 * That gate only ever bound records that CARRIED a nonce, so the cheapest
 * forgery walked straight past it: take one record, copy it, change the
 * observation and session ids, and DELETE the nonce key from the copy. Nothing
 * downstream can catch that. The pairwise agreement gate cannot — copies agree
 * by construction, which is precisely what it checks for. The matcher cannot —
 * both copies match the candidate, which is what makes them look like evidence.
 * The manifest cannot — it is hand-authored and will happily attest two
 * sessions. `cc42503` closed the same hole at INGEST by requiring the nonce on
 * every `injected-tape-runtime` trace, but ingest is not the only door into a
 * promotion: a record is committed JSON, and the promotion gate has to be able
 * to judge one it did not build.
 *
 * So the waiver for a missing nonce is enumerated instead of inferred. These
 * are the 58 records committed before `cc42503` made the field mandatory, named
 * by digest — an observation's digest covers its whole record and is verified
 * against the contents by `validateSs2Observation`, so an entry here names one
 * exact record byte for byte, not a reusable label. A copy of a listed record
 * with a new id is a different digest and is refused.
 *
 * THE LIST MAY ONLY EVER SHRINK. Nothing captured from here on can qualify:
 * ingest refuses to emit a nonce-free `injected-tape-runtime` record at all.
 * Adding a line to this file is therefore a claim that a record predating
 * 2026-08-30 23:18 was overlooked, and it should be reviewed as one. Entries
 * leave when the record they name is re-captured with a nonce.
 *
 * WHAT THIS DOES NOT CLOSE, stated plainly because the gate reads stronger than
 * it is: a forger who copies a record and MINTS A FRESH NONCE for the copy
 * still promotes. The nonce is unverifiable text once it is off the wrapper —
 * no repository-side check can tell a nonce the player minted from one a person
 * typed. What the enumeration buys is that the forgery now requires writing a
 * false nonce rather than deleting a true one, which is a lie a reviewer can be
 * pointed at rather than an absence nobody can see. Binding a nonce to its
 * session in the capture manifest would force the same lie in two places; it
 * would not make it checkable, and it is not attempted here.
 */

/**
 * Digests of every committed observation that carries no `capture.launchNonce`.
 * Generated from `test/observations/ss2-1v1/` at the commit that introduced
 * this file; regenerate ONLY to remove entries.
 */
export const SS2_PRE_NONCE_OBSERVATION_DIGESTS = Object.freeze(new Set([
  // obs-pr-power-rollneeded-hit-33
  "00baf7dd520156b4695a7e388a35ad93e6aa1e3e38169350bdaa148ee9d5a671",
  // obs-qk3
  "08a30be6fe86be409b52f9fdb7b73379c4ffc7c051a0471e8b8f481e15abab76",
  // obs-nav6
  "093609b25b79ffcd2e754aaa9e7b5474adb1b4523522debc07b296bca1bd9a91",
  // obs-pr-power-rollneeded-miss-33
  "0a0c31cfac83f257ea8f65881ecf193fde6156ab0d7fea58790b5907b5c1707d",
  // obs-pr-deflection-threshold-cleared-2
  "0ffcb2f1146fbad4c781018e5239ff2891ee73dccb7024eda8599ac1a1a4ed79",
  // obs-pw5
  "12e01e8759300fcd54563264b9adea7215d944366adbe91ae3c1149866d75d45",
  // obs-fps240
  "1782c24764f84d96dd62e37f1ba1662921d049b997bdac0e1da0572541926baa",
  // obs-pr-armour-removal-gate-above-1
  "1cb339f5003e68fe11f2e8fe2121996b9b97cb33fdfcaae3727843def8709b61",
  // obs-pr-deflection-threshold-critical-32
  "1d2c403d6206a38a0fd8a78207963e78be9b5a443e218114fb74dc5355356ef0",
  // obs-pr-quick-rollneeded-miss-45
  "1dd8798e2e23a71f1fa4627a928ad0cde027dc75abaf06671dbb8e42b4f360b4",
  // obs-fr3
  "1ee5157e722c3280910e98701cea28566b04316c4edc21ba4e7c246f701e62e4",
  // obs-pr-normal-rollneeded-hit-1
  "22169c646d8bd43cae2e261637c257e9f069929d11d02da47ffb86617adaec08",
  // obs-pr-power-rollneeded-hit-3
  "23a152769e3a65594b21ba705701882c9eff61acee75e372812c2066db22ccfb",
  // obs-gold3
  "296fb8bb88db24094de5fd3c3bf7469eb22d525c52e8721657d5fd4432c48939",
  // obs-pr-quick-rollneeded-miss-3
  "2e68e4cf6340c793288ee6132b82cc132c889d7d4cc62a160ccd8b64e4399e08",
  // obs-diag
  "35243cba349b523414b2cf06ea6a149b93d75ab28227d4fc1545508fb97d18d8",
  // obs-fr1
  "368ffc291825344027a005087763b3de095c737d1d197c00e0663b2055f16cfc",
  // obs-camp4
  "3c41f3f5cbf92d5796d4e170331153b6111f01a62a86113f0694a38c2c09ad3e",
  // obs-pw12
  "44734c412eb9f50c97e7b393712acfd5ca9399fc6be6eebddfa3c5ba055dadd6",
  // obs-pw10
  "48518f0a46ddeee0f3538bf36964cf78f07a32b7715280435a0118179ec25498",
  // obs-pr-armour-removal-gate-above-9
  "4b22461fdab114eb6f005992296b3d2b378026759e9ee492ff68264cd3d6d203",
  // obs-pw3
  "657f4c019d581e64093c8b2227f5965e01b45a0abc7a980d2fa382661b65ad1a",
  // obs-pr-deflection-threshold-cleared-33
  "693937482918ac7f6ae324af8df568d468d6eb77c82c989c5cbca574d0685806",
  // obs-wfctl
  "6aa388d19f9db350d6ada6ccfa4741daf74c018cf37fa6fd5e3a7a306dc447ab",
  // obs-camp2
  "722a2215214d2879fe406627321d4d3d13cc1dad03c7ae7c2579e3607c72598b",
  // obs-pr-quick-rollneeded-hit-5
  "727170897912fb8b93c5419a1fd4e6f01a2adbc05efe1d58beaad225d788d5db",
  // obs-camp1
  "736f7c696f0cc8020623f42de2d46b4a2fb2de143850cdb4ae1a1b9801b0b799",
  // obs-qk9
  "76749cca57d8f1a3cc1df135cbd64387c160b1834293d55de74974d89fa57556",
  // obs-qk8
  "82f0703a5e8bd7e7405ae1eb4eedf304defcfbabd6dc9f54a05f1a3e25433999",
  // obs-qk6
  "83356704afaaa988288734f4a24ecc0380432336d9079441812e8bc79f0332b7",
  // obs-pr-armour-removal-gate-below-32
  "84afbba75fcc63cd89db796455090c419419a2753e622527301e87b2799786da",
  // obs-pw1
  "87f18a7d84c8b173d42754cccd5937824cdddd9f9a37d0dea144ee4a02183910",
  // obs-pw4
  "90f2ad8ef57255316afe9f34f7eb4c48882ded6b23d3e71afe3629e7f836044c",
  // obs-camp3
  "92142707a3f21b485a0add1b1ecb6685652be77f7508f5eb95a6d868ef30b8ef",
  // obs-fps480
  "942e1d41dab4bc7abb002d0356386024024f1bb0e3c08c696d42b446c34da187",
  // obs-pr-normal-rollneeded-miss-9
  "98158e16e13bb1ae450e918106b48e41ea834c6d40790e202f91f764f915c243",
  // obs-qk1
  "9fd151971d606529475c605b62251c07944d9bd300a17319d8a6ba1dc235dd84",
  // obs-fr2
  "a0c8d48edb1cfddeca7379cdbe41dd6dd2dd638d6aa6fef1700bdead672cf99b",
  // obs-qk2
  "a220054fed88b429aa7a6f8800bced4bd1c539eadad4151f31620cab7c51c21f",
  // obs-pr-deflection-threshold-critical-1
  "a3cac985717d6c5bde963282a749d649065f873e02257fcd11b6103d470088ac",
  // obs-pw6
  "a3cd62403ea1b74cc3a2b847869edda8ed108811d25a9fac1cace5a0260b37bb",
  // obs-qk7
  "a6e36581bf57b7de7b8bf317a047f19f3f4edf975328bf66ff4c155ebe76f3f8",
  // obs-pw9
  "a8b73a95f6cc4224e2ea134a1ea794f19f29061e52637cb01033e2c16bf6552c",
  // obs-pr-armour-removal-gate-below-9
  "ad3b47bdd41116f1ef19647ae4b6a6697b2f62fe8f14ae47f6d4354e1d0e3e55",
  // obs-pw11
  "b0b4c69d5339b17b622cf7bc52aff3703862ae09a928c4c4a308f804aa07c204",
  // obs-pw2
  "b31604757553e912673f565dc893ed57bc9b30fe4f1ab925b6e4f809f6590f29",
  // obs-pr-quick-rollneeded-hit-31
  "b3df9d01f65107bad372cf09a6a89cec6f9a8ea4e6531cd89aec950fc37e90c2",
  // obs-pw8
  "b97a3cc66080e21b87ae865e30381999370147c54efcf12800733b51335f84a1",
  // obs-pr-power-rollneeded-miss-14
  "bd9d830eb9afbef532b5f4fc1575e54546ca0166b6b9172e57d742f1425f1ad1",
  // obs-pr-normal-rollneeded-miss-30
  "cbc7500d0cbdf293449a9e38ccdbaa07bb12ce42a3c56697aee0d17c234b4e34",
  // obs-qk4
  "d507272ef40168e449d35d49206d7a9b21a4cc0d675789bf69e4af5f29709951",
  // obs-pr-normal-rollneeded-hit-32
  "d66013a487a5e789ebb78b13748859641398942db14cb4132676776cf17d6ffe",
  // obs-pw7
  "e6019670153ca5125ba6a376e6f2dea88c99b839072141600392a53084625101",
  // obs-20260830-t1
  "efd3bb6bbf46c0ba88a4bed3a983f2d0917770a86a4d8483caed44cd689fe05e",
  // obs-20260830-u1
  "f381023de3b8d54e6815933eb0843a1e9ff781c7f4ceb27c8d2e1ce1006f0112",
  // obs-20260830-e1
  "f3ababc8cdd76344fc591379a8f9141baacac5bef092d527e2bde7d71e15b1df",
  // obs-qk5
  "f41cf825b61ccfd28986b473cd938d090c3213a21707d12eb2dd13b8c18e8294",
  // obs-fps960
  "f7676e5afb90accede163e8f695835606aba7177f091ed234fa94e0ecf62470d"
]));
