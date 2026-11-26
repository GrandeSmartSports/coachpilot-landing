// Rig Card waters: the WDFW lake rule reader in scripts/build-waters.mjs.
// A wrong verdict here can send someone to closed water, so every kind of
// entry the pamphlet has is pinned to a real excerpt of it.
// Run: node tests/rigs-waters.test.mjs   (no network)
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 400)); }
};

// Real rows from the three WDFW Westside Lakes Special Rules pages
// (eregulations.com/washington/fishing/westside-lakes-special-rules-a-e, -f-p
// and -q-z), copied 2026-11-26. Each table row is on one line; nothing else
// was changed. The rows above the first lake on each page (the rule-change
// table and the column heads) are kept, because the reader has to skip them.
const TEXT = String.raw`
<!-- westside-lakes-special-rules-a-e -->
<tr><td><h3>Topic</h3></td><td><h3>Previous (2025)</h3></td><td><h3>New (2026)</h3></td></tr>
<tr><td><strong>Baker Lake &ndash; Salmon Opening</strong></td><td>Opened July 12</td><td>Opens a day earlier, on July 11</td></tr>
<tr><td><strong>Baker Lake &ndash; Sockeye Daily Limit</strong></td><td>Daily limit: 6 sockeye</td><td>Daily limit reduced to 4 sockeye</td></tr>
<tr><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Species</span></p></td><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Date</span></p></td><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Additional Rules</span></p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">AMERICAN LAKE </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="ozf576ioxjdv"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Chumming permitted. </p></td></tr>
<tr><td><p>Kokanee</p></td><td><p>Year-round</p></td><td><p>No min. size. Combined daily limit of trout and kokanee is 5. </p></td></tr>
<tr><td><p>Trout</p></td><td><p>Year-round</p></td><td><p>No min. size. Combined daily limit of trout and kokanee is 5. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">BAKER LAKE </span>- WHATCOM CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="xiov1coapavl"></td></tr>
<tr><td colspan="3"><p><strong>CRC (825)</strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Chumming permitted. </p></td></tr>
<tr><td><p>Kokanee</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Min. size 8". Max. size 12". Daily limit 10. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Salmon</p></td><td><p>July 11-Aug. 31</p></td><td><p>Min. size 12". Daily limit 4 sockeye. Release all salmon other than sockeye. Each angler aboard a vessel may deploy salmon angling gear until the salmon limit for all anglers aboard has been achieved. </p></td></tr>
<tr><td colspan="3"><p><strong>200' radius around pump discharge at the south end of lake </strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>CLOSED WATERS. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">BALLINGER LAKE </span>- SNOHOMISH CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="yk4dj6vykms9"></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">BLACK LAKE </span>- THURSTON CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="awwwnimlhcmn"></td></tr>
<tr><td><p>Crappie</p></td><td><p>Year-round</p></td><td><p>Min. size 9". Daily limit 10. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">BOSWORTH LAKE </span>- SNOHOMISH CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="fyrr3v8gdwpi"></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">BRADLEY LAKE </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="gzk308jmq64b"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Open for juvenile anglers, senior anglers and anglers with a disability who possess a designated harvester companion card only. Two-Pole not allowed. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">CADY LAKE </span>- MASON CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="q3hpot5zb3xy"><img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="ikztlriwilbt"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Two-Pole not allowed. Internal combustion motors prohibited. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Fly fishing only. Catch-and-release. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">CALLIGAN LAKE </span>- KING CO.</p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Unlawful to use lead weights or lead jigs measuring 1 1/2” or less along the longest axis. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">CARLISLE LAKE </span>- LEWIS CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="etys3mt6jaoo"></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Salmon</p></td><td><p>Year-round</p></td><td><p>Landlocked salmon rules. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">CLEAR LAKE </span>- SKAGIT CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="oz9u2tuy80er"></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">CLEAR LAKE </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="poz9tl3r3e1q"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Chumming permitted. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">CLEAR LAKE </span>- THURSTON CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="m1mdx26damvs"></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">CRABAPPLE LAKE </span>- SNOHOMISH CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="ven3ml7rne8a"></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<!-- westside-lakes-special-rules-f-p -->
<tr><td><h3>Topic</h3></td><td><h3>Previous (2025)</h3></td><td><h3>New (2026)</h3></td></tr>
<tr><td><strong>Mineral Lake (Lewis Co.) &ndash; Game Fish Season End</strong></td><td>Season ended Sept. 30</td><td>Season extended to Oct. 31 (per the Sept. 29, 2026 correction)</td></tr>
<tr><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Species</span></p></td><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Date</span></p></td><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Additional Rules</span></p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">FORTSON MILL POND </span>- 1 - SNOHOMISH CO.</p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">FORTSON MILL POND </span>- 2 - SNOHOMISH CO.</p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Juvenile anglers only (under 15 years old). </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">FRANZ LAKE </span>- SKAMANIA CO.</p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>CLOSED WATERS. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">GENEVA LAKE </span>- KING CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="dn5789jgzkh6"></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">GIBBS LAKE </span>- JEFFERSON CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="sag3pkb2h04y"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Internal combustion motors prohibited. Two-Pole not allowed. Selective gear rules. </p></td></tr>
<tr><td><p>Trout</p></td><td><p>Year-round</p></td><td><p>Min. size 18". Daily limit 1. </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">GISSBURG POND, NORTH </span>- SNOHOMISH CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="jjuct0wqczrt"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Juvenile anglers only (under 15 years old). Two-Pole not allowed. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">HEINS LAKE </span>- KITSAP CO.</p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>CLOSED WATERS. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">HICKS LAKE </span>- THURSTON CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="n4m7url63hhj"></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">KITSAP LAKE </span>- KITSAP CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="y5s1abmj1q5p"></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">KOENEMAN LAKE </span>- KITSAP CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="y3adlappu15l"></td></tr>
<tr><td colspan="3"><p><strong>(Fern Lake) </strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Selective gear rules. Two-Pole not allowed. Internal combustion motors prohibited. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Catch-and-release. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">LAKE KAPOWSIN </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="sddw7eun7htz"></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">LONG LAKE </span>- KITSAP CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="0e9dqeqewevc"></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">LONG'S POND </span>- THURSTON CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="8enq6s51qncr"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Two-Pole not allowed. Open for juvenile anglers, senior anglers and anglers with a disability who possess a designated harvester companion card only. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">MARTHA LAKE </span>- SNOHOMISH CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="8dy42tiujmpu"></td></tr>
<tr><td colspan="3"><p><strong>Alderwood Manor </strong></p></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">MARTHA LAKE </span>- SNOHOMISH CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="cwpcukf0c5kh"></td></tr>
<tr><td colspan="3"><p><strong>Warm Beach </strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Selective gear rules. </p></td></tr>
<tr><td><p>Trout</p></td><td><p>Year-round</p></td><td><p>Min. size 14". Daily limit 2. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">MAYFIELD LAKE (RESERVOIR) </span>- LEWIS CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="r9uck52lr7f7"><img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="d7xlwbdn1hfj"></td></tr>
<tr><td colspan="3"><p><strong>from Mayfield Dam to Onion Rock Bridge CRC (563)</strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Two-Pole not allowed. Columbia River Salmon and Steelhead Endorsement (CRSSE) required (ages 15 and older). </p></td></tr>
<tr><td><p>Trout</p></td><td><p>Year-round</p></td><td><p>Min. size 8". Daily limit 10. Release wild cutthroat trout and wild rainbow trout. </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Salmon</p></td><td><p>Sept. 1-Dec. 31</p></td><td><p>Min. size 12". Daily limit 6. Up to 2 adults may be retained. Release all salmon other than hatchery Chinook and hatchery coho. </p></td></tr>
<tr><td colspan="3"><p><strong>from Mossyrock Dam downstream to the Tacoma Power safety signs at Onion Rock Bridge located just below the dam </strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>CLOSED WATERS. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">MISSION LAKE </span>- KITSAP CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="322lm1ki2lhe"></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">MISSION LOWER POND </span>- KITSAP CO.</p></td></tr>
<tr><td><p>Trout</p></td><td><p>Sat. before Memorial Day-Oct. 31</p></td><td><p>Min. size 8". Daily limit 2. </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Sat. before Memorial Day-Oct. 31</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Sat. before Memorial Day-Oct. 31</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Sat. before Memorial Day-Oct. 31</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Sat. before Memorial Day-Oct. 31</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Sat. before Memorial Day-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">MUNN LAKE </span>- THURSTON CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="hfnmgivko7lb"><img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="ribdsmsa0sah"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Internal combustion motors prohibited. Two-Pole not allowed. Selective gear rules. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Catch-and-release. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">NORTH LAKE </span>- KING CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="f3143xo8bzvl"></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">NORTHERN STATE HOSPITAL POND </span>- SKAGIT CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="gvqmems9pac8"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Juvenile anglers only (under 15 years old). Two-Pole not allowed. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<!-- westside-lakes-special-rules-q-z -->
<tr><td><h3>Topic</h3></td><td><h3>Previous (2025)</h3></td><td><h3>New (2026)</h3></td></tr>
<tr><td><strong>Lake Washington (North of Hwy. 520) &ndash; Salmon Opening</strong></td><td>Opened Sept. 16</td><td>Opens earlier, on Sept. 11</td></tr>
<tr><td><strong>Vancouver Lake &ndash; Closed Shoreline</strong></td><td>Closed area described as east and west of the flushing channel exit</td><td>Closed shoreline is now 400 feet north and south of the flushing channel exit</td></tr>
<tr><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Species</span></p></td><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Date</span></p></td><td class="table-h2"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">Additional Rules</span></p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">RATTLESNAKE LAKE </span>- KING CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="v54fm66adn86"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Selective gear rules. </p></td></tr>
<tr><td><p>Trout</p></td><td><p>Year-round</p></td><td><p>Min. size 14". Daily limit 2. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">RILEY LAKE </span>- SNOHOMISH CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="kyml8g3h8ykl"></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">SAMMAMISH, LAKE </span>- KING CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="lxmci0igi7wm"><img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="5k4vskwq7km1"></td></tr>
<tr><td colspan="3"><p><strong>CRC (763)</strong></p></td></tr>
<tr><td rowspan="2"><p>All species</p></td><td></td><td><p>Two-Pole not allowed. </p></td></tr>
<tr><td><p>Aug. 16-Nov. 30</p></td><td><p>CLOSED to fishing within 100 yards of the mouth of Issaquah Creek. </p></td></tr>
<tr><td><p>Kokanee</p></td><td><p>Year-round</p></td><td><p>Catch-and-release. </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td rowspan="2"><p>Other game fish</p></td><td><p>July 1-Nov. 30</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Dec. 1-June 30</p></td><td><p>Statewide min. size/daily limit. Except: Release all steelhead and rainbow trout over 20". </p></td></tr>
<tr><td rowspan="2"><p>Salmon</p></td><td><p>Oct. 1-Nov. 30</p></td><td><p>Min. size 12". Daily limit 4. Release all salmon other than coho. </p></td></tr>
<tr><td><p>Dec. 1-May 31</p></td><td><p>Min. size 12". Release all salmon other than hatchery coho. Salmon count as part of trout daily limit. No Catch Record Card required. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">SCANEWA, LAKE </span>- LEWIS CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="nil8i6j53eqi"><img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="qtmv5q9dexfc"></td></tr>
<tr><td colspan="3"><p><strong>(Cowlitz Falls Reservoir) CRC (559)</strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>The upstream boundary of the reservoir in the Cowlitz arm is the posted Lewis County PUD sign on Peters Rd. The upstream boundary of the reservoir in the Cispus arm is the posted markers at the Lewis Co. PUD kayak launch, approx. 1.5 miles upstream from the confluence of the Cowlitz and Cispus arms. Columbia River Salmon and Steelhead Endorsement (CRSSE) required (ages 15 and older). Two-Pole not allowed. </p></td></tr>
<tr><td><p>Trout</p></td><td><p>Year-round</p></td><td><p>Min. size 8". Daily limit 10. Except: Release wild cutthroat trout and wild rainbow trout. </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Salmon</p></td><td><p>Year-round</p></td><td><p>Min. size 12". Daily limit 6. Up to 2 adults may be retained. Release all salmon other than hatchery Chinook and hatchery coho. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">SPANAWAY LAKE AND OUTLET </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="qauffzlmr6s6"></td></tr>
<tr><td colspan="3"><p><strong>downstream to the dam (approx. 800') </strong></p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">TANWAX LAKE </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="cxrivzokl7lh"><img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="wyxy5uqssnd4"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Two-Pole not allowed. </p></td></tr>
<tr><td><p>Crappie</p></td><td><p>Year-round</p></td><td><p>Min. size 9". Daily limit 10. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">TAPPS, LAKE (RESERVOIR) </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="hoclisj5s3dq"></td></tr>
<tr><td colspan="3"><p><strong>and intake canal (open area includes intake canal to within 400' of screen at Dingle Basin) </strong></p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">WAPATO LAKE </span>- PIERCE CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/no_two-pole_icon.png" alt="No Two Pole Endorsement Icon - indicating two poles cannot be used in this waterbody." data-image="4kkd0m7kajj2"></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Open for juvenile anglers, senior anglers and anglers with a disability who possess a designated harvester companion card only. Two-Pole not allowed. </p></td></tr>
<tr><td><p>All game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><p class="table-subhead"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">WASHINGTON SHIP CANAL, LAKE </span>- KING CO.</p></td></tr>
<tr><td colspan="3"><p><strong>waters west of a north-south line 400' east of the eastern end of the northern wing wall of Chittenden Locks to Chittenden Locks </strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>CLOSED WATERS. </p></td></tr>
<tr><td colspan="3"><p><strong>waters east of a north-south line 400' east of the eastern end of the northern wing wall of Chittenden Locks to Fremont Bridge </strong></p></td></tr>
<tr><td><p>Kokanee</p></td><td><p>Year-round</p></td><td><p>Min. size 8". Max. size 18". Daily limit 5. </p></td></tr>
<tr><td rowspan="3"><p>Trout</p></td><td><p>Mar. 1-June 30</p></td><td><p>Min. size 12". Daily limit 5. Release rainbow trout over 20". </p></td></tr>
<tr><td><p>July 1-Nov. 30</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Dec. 1-Last Day of Feb.</p></td><td><p>Statewide min. size/daily limit. Except: Release rainbow trout over 20". </p></td></tr>
<tr><td rowspan="2"><p>Steelhead (hatchery)</p></td><td><p>July 1-Nov. 30</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Dec. 1-June 30</p></td><td><p>Release all steelhead. </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td colspan="3"><p><strong>waters east of the Fremont Ave. Bridge to the Montlake Blvd. Bridge </strong></p></td></tr>
<tr><td><p>All species</p></td><td></td><td><p>Chumming permitted. </p></td></tr>
<tr><td><p>Kokanee</p></td><td><p>Year-round</p></td><td><p>Min. size 8". Max. size 18". Daily limit 5. </p></td></tr>
<tr><td rowspan="3"><p>Trout</p></td><td><p>Mar. 1-June 30</p></td><td><p>Min. size 12". Daily limit 5. Release rainbow trout over 20". </p></td></tr>
<tr><td><p>July 1-Nov. 30</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Dec. 1-Last Day of Feb.</p></td><td><p>Statewide min. size/daily limit. Except: Release rainbow trout over 20". </p></td></tr>
<tr><td rowspan="2"><p>Steelhead (hatchery)</p></td><td><p>July 1-Nov. 30</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Dec. 1-June 30</p></td><td><p>Release all steelhead. </p></td></tr>
<tr><td><p>Smallmouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 15. Only 1 over 14" may be retained. </p></td></tr>
<tr><td><p>Largemouth bass</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. Max. size 12", except 1 over 17" may be retained. </p></td></tr>
<tr><td><p>Channel catfish</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 10. </p></td></tr>
<tr><td><p>Walleye</p></td><td><p>Year-round</p></td><td><p>No min. size. Daily limit 16. Only 1 over 22" may be retained. </p></td></tr>
<tr><td><p>Other game fish</p></td><td><p>Year-round</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td class="table-h4-westside-lakes" colspan="3"><span class="Table_Table_H2_Special-Rules_BoW-Name_Bold">WILDERNESS LAKE </span>- KING CO.<img src="https://www.eregulations.com/assets/images/books/wafw/26wafw/Boat_Ramp_Icon.png" alt="Public Boat Ramp Icon" data-image="za7wqn5ew6qk"></td></tr>
<tr><td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Statewide min. size/daily limit. </p></td></tr>
<tr><td><p>Salmon</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td><td><p>Landlocked salmon rules. </p></td></tr>
`;
// The three pages, apart, the way the build reads them.
const PAGES = TEXT.split(/<!-- [^>]+ -->/).filter((x) => x.trim());

// Importing the script must never run the build: no network, no rewrite of
// rigs/waters.js.
const before = readFileSync(resolve(ROOT, "rigs/waters.js"), "utf8");
const { lakeEntries, lakeRule, ruleFromEntries } = await import("../scripts/build-waters.mjs");
ok(readFileSync(resolve(ROOT, "rigs/waters.js"), "utf8") === before, "importing the build script does not run the build");
ok(typeof lakeRule === "function" && typeof lakeEntries === "function" && typeof ruleFromEntries === "function", "the rule reader is exported");

// A water as the castai-waters feed sends it.
const water = (wdfw, county, name) => ({ geo: "LTEST", wdfw, county, name: name || wdfw });
const rule = (wdfw, county, name) => lakeRule(PAGES, water(wdfw, county, name));
const inRange = (md, r) => (r[0] <= r[1] ? md >= r[0] && md <= r[1] : md >= r[0] || md <= r[1]);
const closedOn = (r, md) => (r.closed || []).some((x) => inRange(md, x));
const said = (r) => (r.lines || []).join(" | ");

// --- the pages become one entry per lake -----------------------------------
{
  const E = lakeEntries(PAGES);
  ok(E.length === 44, "one entry per lake heading", E.length);
  const swallowed = E.filter((e) => /CLOSED|WATERS/.test(e.name)).map((e) => e.name);
  ok(swallowed.length === 0, "no lake name swallows the last words of the lake above it", swallowed.join("; "));
  const geneva = E.find((e) => e.name === "GENEVA LAKE");
  ok(geneva && geneva.counties.join() === "KING", "Geneva Lake is its own entry, in King County", JSON.stringify(geneva).slice(0, 200));
  ok(E.some((e) => e.name === "FORTSON MILL POND - 1") && E.some((e) => e.name === "FORTSON MILL POND - 2"), "a dash inside a name stays in the name");
  const mayf = E.find((e) => e.name === "MAYFIELD LAKE (RESERVOIR)");
  ok(mayf && mayf.counties.join() === "LEWIS", "the county is read off the heading");
  ok(!E.some((e) => /Topic|Species|Salmon Opening/i.test(e.name)), "the rule-change table and the column heads are not lakes");
  ok(PAGES.length === 3 && lakeEntries(PAGES[0]).length + lakeEntries(PAGES[1]).length + lakeEntries(PAGES[2]).length === E.length, "a list of pages reads the same as each page alone");
  // Glued into one text, the last lake of a page picks up the opening rows of
  // the next page. Rows that do not belong hold that lake back, they are never guessed past.
  const glued = lakeRule(TEXT, water("CRABAPPLE LK (SNOH)", "Snohomish"));
  ok(lakeEntries(TEXT).length === E.length && glued.status === "check", "rows that do not belong to a lake hold it back", JSON.stringify(glued).slice(0, 200));
  ok(E.filter((e) => e.name === "MARTHA LAKE").length === 2, "both Martha Lakes are kept apart");
}

// --- F1: closed-season lakes are never open all year -----------------------
// Each of these is "All game fish" or "Other game fish", 4th Sat. in Apr. to
// Oct. 31, statewide limits. Geneva and Hicks sit right under a lake whose
// only rule is CLOSED WATERS, which is what broke the old reader.
for (const [wdfw, county] of [["LK GENEVA (KING)", "King"], ["HICKS LK (THUR)", "Thurston"], ["BOSWORTH LK (SNOH)", "Snohomish"],
  ["CRABAPPLE LK (SNOH)", "Snohomish"], ["RILEY LK (SNOH)", "Snohomish"], ["NORTH LK (KING)", "King"], ["CLEAR LK (PIER)", "Pierce"],
  ["CLEAR LK (THUR)", "Thurston"], ["WILDERNESS LK (KING)", "King"], ["MISSION LK (KITS)", "Kitsap"]]) {
  const r = rule(wdfw, county);
  ok(r.status === "ok" && r.open === "spring", `${wdfw}: open the 4th Saturday in April to Oct 31 only`, JSON.stringify(r));
  ok(!(r.lines || []).some((l) => /^Open all year/.test(l)) && /^Open the 4th Saturday in April to Oct 31 only\./.test((r.lines || [])[0] || ""),
    `${wdfw}: the first rule line is its own season, never "Open all year"`, said(r));
  ok(closedOn(r, "11-26") && closedOn(r, "01-15") && closedOn(r, "04-20") && !closedOn(r, "05-15") && !closedOn(r, "10-31"),
    `${wdfw}: closed Nov 1 through mid April, open in summer`, JSON.stringify(r.closed));
}

// --- closed waters ----------------------------------------------------------
for (const [wdfw, county] of [["FRANZ LK (SKAM)", "Skamania"], ["HEINS LK (KITS)", "Kitsap"]]) {
  const r = rule(wdfw, county);
  ok(r.status === "closed" && /closed waters/i.test(r.why), `${wdfw}: closed waters`, JSON.stringify(r));
}

// --- kids, seniors and disabled anglers only, in all three wordings ---------
for (const [wdfw, county] of [["BRADLEY LK (PIER)", "Pierce"], ["WAPATO LK (PIER)", "Pierce"], ["LONGS PD (THUR)", "Thurston"]]) {
  const r = rule(wdfw, county);
  ok(r.status === "closed" && /juvenile, senior/i.test(r.why), `${wdfw}: juvenile, senior and disabled anglers only`, JSON.stringify(r));
}
for (const [wdfw, county] of [["GISSBURG PD NORTH (SNOH)", "Snohomish"], ["NORTHERN STATE HOSPITAL PD (SKAG)", "Skagit"], ["FORTSON MILL PD 2 (SNOH)", "Snohomish"]]) {
  const r = rule(wdfw, county);
  ok(r.status === "closed" && /juvenile anglers only/i.test(r.why) && !/senior/i.test(r.why), `${wdfw}: juvenile anglers only (under 15)`, JSON.stringify(r));
}

// --- lakes the PowerBait card cannot be sent to ------------------------------
{
  const munn = rule("MUNN LK (THUR)", "Thurston");
  ok(munn.status === "check" && /catch-and-release/i.test(munn.why) && /selective gear/i.test(munn.why), "Munn Lake: catch and release, selective gear, held back", JSON.stringify(munn));
  const fern = rule("KOENEMAN LK (KITS)", "Kitsap");
  ok(fern.status === "check" && /catch-and-release/i.test(fern.why), "Koeneman Lake: catch and release, held back", JSON.stringify(fern));
  const rattle = rule("RATTLESNAKE LK (KING)", "King");
  ok(rattle.status === "check" && /selective gear/i.test(rattle.why), "Rattlesnake Lake: selective gear rules, held back", JSON.stringify(rattle));
  const gibbs = rule("GIBBS LK (JEFF)", "Jefferson");
  ok(gibbs.status === "check" && /selective gear/i.test(gibbs.why), "Gibbs Lake: selective gear rules, held back", JSON.stringify(gibbs));
  const cady = rule("CADY LK (MASO)", "Mason");
  ok(cady.status === "check" && /fly fishing only/i.test(cady.why), "Cady Lake: fly fishing only, held back", JSON.stringify(cady));
  const calligan = rule("CALLIGAN LK (KING)", "King");
  ok(calligan.status === "check" && /lead/i.test(calligan.why), "Calligan Lake: no small lead weights, so no sliding sinker card", JSON.stringify(calligan));
  const scanewa = rule("LAKE SCANEWA (LEWIS)", "Lewis", "Scanewa Lake (Lake Scanewa)");
  ok(scanewa.status === "check" && /endorsement/i.test(scanewa.why), "Lake Scanewa: needs the Columbia River endorsement, held back", JSON.stringify(scanewa));
  ok(!/East of the mountains/.test(scanewa.why), "a county code written out in full (LEWIS) is still a westside county", scanewa.why);
  const american = rule("AMERICAN LK (PIER)", "Pierce");
  ok(american.status === "check" && /trout limit/i.test(american.why), "American Lake: its own trout limit, so the 5 a day card is not sent", JSON.stringify(american));
}

// --- lakes whose rule depends on where or when you stand ---------------------
{
  const mayfield = rule("MAYFIELD RES (LEWI)", "Lewis");
  ok(mayfield.status === "check" && /part of the lake/i.test(mayfield.why), "Mayfield Lake: one part is closed waters, held back", JSON.stringify(mayfield));
  const baker = rule("BAKER LK (WHAT)", "Whatcom");
  ok(baker.status === "check", "Baker Lake: closed around the pump discharge, held back", JSON.stringify(baker));
  const samm = rule("LK SAMMAMISH (KING)", "King");
  ok(samm.status === "check", "Lake Sammamish: two seasons and a closed creek mouth, held back", JSON.stringify(samm));
  const lower = rule("MISSION LOWER PD (KITS)", "Kitsap");
  ok(lower.status === "check", "Mission Lower Pond: a season the reader does not know, held back", JSON.stringify(lower));
  // Lake Union has no heading of its own. It is the stretch of the Lake
  // Washington Ship Canal between the Fremont and Montlake bridges.
  const union = rule("LK UNION (KING)", "King", "Lake Union");
  ok(union.status === "check" && /part of the lake/i.test(union.why), "Lake Union is read under the Lake Washington Ship Canal, held back", JSON.stringify(union).slice(0, 200));
  const martha = rule("MARTHA LK (SNOH)", "Snohomish");
  ok(martha.status === "check" && /more than one/i.test(martha.why), "Martha Lake: two lakes by that name in Snohomish County, held back", JSON.stringify(martha));
}

// --- open all year, with a special rule that does not change a bait trip -----
{
  const tanwax = rule("TANWAX LK (PIER)", "Pierce");
  ok(tanwax.status === "ok" && tanwax.open === "all" && !tanwax.closed, "Tanwax Lake: open all year", JSON.stringify(tanwax));
  ok(tanwax.lines[0] === "Open all year." && /Two-Pole not allowed/.test(said(tanwax)) && /crappie: Min\. size 9"\. Daily limit 10\./i.test(said(tanwax)),
    "Tanwax carries its own rules in the pamphlet's words: no two-pole, crappie 9 in and 10 a day", said(tanwax));
  const black = rule("BLACK LK (THUR)", "Thurston");
  ok(black.status === "ok" && black.open === "all" && /crappie: Min\. size 9"/i.test(said(black)), "Black Lake: open all year, with the crappie size limit", JSON.stringify(black));
  for (const [wdfw, county] of [["BALLINGER LK (SNOH)", "Snohomish"], ["KITSAP LK (KITS)", "Kitsap"], ["LK KAPOWSIN (PIER)", "Pierce"], ["CLEAR LK (SKAG)", "Skagit"], ["FORTSON MILL PD 1 (SNOH)", "Snohomish"]]) {
    const r = rule(wdfw, county);
    ok(r.status === "ok" && r.open === "all" && /largemouth bass: /i.test(said(r)) && !/no special rule/i.test(said(r)),
      `${wdfw}: open all year, and it shows its real special rules`, JSON.stringify(r).slice(0, 300));
  }
  const carlisle = rule("CARLISLE LK (LEWI)", "Lewis");
  ok(carlisle.status === "ok" && carlisle.open === "all" && /salmon: Landlocked salmon rules/i.test(said(carlisle)), "Carlisle Lake: open all year", JSON.stringify(carlisle));
  const spanaway = rule("SPANAWAY LK (PIER)", "Pierce");
  ok(spanaway.status === "ok" && spanaway.open === "all", "Spanaway Lake is found under \"Spanaway Lake and outlet\"", JSON.stringify(spanaway));
  const tapps = rule("LK TAPPS (PIER)", "Pierce");
  ok(tapps.status === "ok" && tapps.open === "all", "Lake Tapps is found under \"Tapps, Lake (Reservoir)\"", JSON.stringify(tapps));
  const every = [tanwax, black, carlisle, spanaway, tapps];
  ok(every.every((r) => (r.lines || []).every((l) => l.indexOf(String.fromCharCode(8212)) === -1 && l.length <= 200)), "rule lines are short and plain");
}

// --- no entry at all: the statewide lake rule ---------------------------------
for (const [wdfw, county] of [["BONNEY LK (PIER)", "Pierce"], ["LK DESIRE (KING)", "King"], ["LONG LK (THUR)", "Thurston"], ["ALDER LK (THUR/PIER)", "Pierce"]]) {
  const r = rule(wdfw, county);
  ok(r.status === "ok" && r.open === "all" && /no special rule for this lake/.test(said(r)), `${wdfw}: no entry, open all year under the statewide lake rule`, JSON.stringify(r));
}

// --- the safe default: not sure means held back, never ok ---------------------
{
  // A name that is close to an entry but not the same lake for certain.
  for (const [wdfw, county, what] of [["FORTSON MILL PD (SNOH)", "Snohomish", "which Fortson Mill pond"], ["GISSBURG PD (SNOH)", "Snohomish", "which Gissburg pond"],
    ["FERN LK (KITS)", "Kitsap", "the pamphlet lists it as another name for Koeneman Lake"]]) {
    const r = rule(wdfw, county);
    ok(r.status === "check", `${wdfw}: held back (${what})`, JSON.stringify(r));
  }
  const chelan = rule("LK CHELAN (CHEL)", "Chelan");
  ok(chelan.status === "check" && /East of the mountains/.test(chelan.why), "an eastside lake is held back: those rules are not read", JSON.stringify(chelan));
  // A page that did not load, or loaded as something else, holds every lake back.
  const bonney = water("BONNEY LK (PIER)", "Pierce");
  for (const [text, what] of [["", "an empty page"], ["<html><body><h1>503 Service Unavailable</h1></body></html>", "an error page"],
    [TEXT.replace(/<[^>]+>/g, " "), "a page with its table markup gone"], [null, "no page at all"]]) {
    const r = lakeRule(text, bonney);
    ok(r.status === "check", `${what}: even a lake with no special rule is held back`, JSON.stringify(r));
  }
  ok(ruleFromEntries([], bonney).status === "check", "no entries to read from: held back");

  // If the pamphlet's markup drifts, a lake must not fall out of the list
  // and come back as "no special rule". These three pages are the real ones
  // with one made-up change each.
  const geneva = water("LK GENEVA (KING)", "King"), hicks = water("HICKS LK (THUR)", "Thurston"), riley = water("RILEY LK (SNOH)", "Snohomish");
  ok(TEXT.includes("GENEVA LAKE </span>- KING CO.") && TEXT.includes("HICKS LAKE </span>- THURSTON CO.<img") && TEXT.includes("FORTSON MILL POND </span>- 1 - SNOHOMISH CO.") && TEXT.includes("<td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td>"),
    "the drift tests have real rows to change");
  const reworded = PAGES.map((x) => x.replace("GENEVA LAKE </span>- KING CO.", "GENEVA LAKE </span>- KING COUNTY"));
  const g = lakeRule(reworded, geneva);
  ok(g.status === "check", "a heading written a new way: the lake is held back, not read as having no rule", JSON.stringify(g));
  ok(lakeRule(reworded, hicks).status === "ok" && lakeRule(reworded, hicks).open === "spring" && lakeRule(reworded, bonney).status === "ok", "and the other lakes still read as before");
  const split = PAGES.map((x) => x.replace("HICKS LAKE </span>- THURSTON CO.<img", "HICKS LAKE </span>- THURSTON CO.</td><td><img"));
  const h = lakeRule(split, hicks);
  ok(h.status === "check", "a heading row with an extra cell: the lake is held back", JSON.stringify(h));
  const wide = PAGES.map((x) => x.split("<td><p>All game fish</p></td><td><p>4th Sat. in Apr.-Oct. 31</p></td>").join("<td><p>All game fish</p></td><td></td><td><p>4th Sat. in Apr.-Oct. 31</p></td>"));
  const w4 = [geneva, hicks, riley].map((x) => lakeRule(wide, x).status);
  ok(w4.every((s) => s === "check"), "a rule row with a column the reader does not know: held back", w4.join(","));
  // A name the stocking list writes as one word and the pamphlet as two.
  const twoWords = PAGES.map((x) => x.replace("FORTSON MILL POND </span>- 1 - SNOHOMISH CO.", "FIVE MILE LAKE </span>- SNOHOMISH CO."));
  const five = lakeRule(twoWords, water("FIVEMILE LK (SNOH)", "Snohomish"));
  ok(five.status === "check", "one word here, two words there: held back, not read as having no rule", JSON.stringify(five));
  const fiveNamed = lakeRule(twoWords, water("FIVEMILE LK (SNOH)", "Snohomish", "Five Mile Lake"));
  ok(fiveNamed.status === "ok" && !/no special rule/.test(said(fiveNamed)), "and when the feed's own name matches, that entry is the one read", JSON.stringify(fiveNamed).slice(0, 200));
  // Nothing with a hard word anywhere in its entry is ever sent out.
  const E = lakeEntries(PAGES), bad = [], shapes = [];
  for (const e of E) {
    const county = e.counties[0].charAt(0) + e.counties[0].slice(1).toLowerCase();
    const r = lakeRule(PAGES, { geo: "LX", wdfw: e.name, name: e.name, county });
    const body = e.sections.map((s) => s.note + " " + s.rows.map((x) => x.rule).join(" ")).join(" ");
    if (/closed|closure|juvenile|senior|selective gear|fly fishing only|catch-and-release|endorsement|lead weights/i.test(body) && r.status === "ok") bad.push(e.name);
    if (!["ok", "check", "closed"].includes(r.status)) shapes.push(e.name + " status " + r.status);
    if (r.status === "ok" && !["all", "spring"].includes(r.open)) shapes.push(e.name + " open " + r.open);
    if (r.status === "ok" && r.open === "spring" && !(r.closed && r.closed.length)) shapes.push(e.name + " spring with no closed dates");
    if (r.status !== "ok" && !r.why) shapes.push(e.name + " held back with no reason");
  }
  ok(bad.length === 0, "no lake with a closure, an age limit or a gear rule in its entry comes out ok", bad.join("; "));
  ok(shapes.length === 0, "every verdict is ok (all year or spring, with dates) or held back with a reason", shapes.join("; "));
}

// --- the built snapshot, rigs/waters.js ---------------------------------------
{
  const ctx = {}; ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync(resolve(ROOT, "rigs/waters.js"), "utf8"), ctx);
  const S = ctx.RIG.watersSnapshot, by = (re) => S.waters.find((w) => re.test(w.wdfw || ""));
  ok(S && S.waters.length > 0, "the snapshot has waters", S && S.waters.length);
  const shapes = S.waters.filter((w) => !w.rule || !["ok", "check", "closed"].includes(w.rule.status) ||
    (w.rule.status === "ok" ? !["all", "spring"].includes(w.rule.open) || (w.rule.open === "spring" && !(w.rule.closed || []).length) : !w.rule.why));
  ok(shapes.length === 0, "every water in the snapshot has a whole verdict", shapes.map((w) => w.name).join("; "));
  const hard = S.waters.filter((w) => w.rule.status === "ok" && /closed|closure|juvenile|senior|selective gear|fly fishing only|catch-and-release|endorsement/i.test((w.rule.lines || []).join(" ")));
  ok(hard.length === 0, "no listed water carries a closure, an age limit or a gear rule", hard.map((w) => w.name).join("; "));
  // Lakes come and go with the plants, so each of these only speaks when its lake is in today's snapshot.
  for (const re of [/^KITSAP LK/, /^BALLINGER LK/, /^LK KAPOWSIN/]) {
    const w = by(re);
    ok(!w || (w.rule.status === "ok" && w.rule.open === "all" && !/no special rule/.test(w.rule.lines.join(" "))), `snapshot: ${re.source.slice(1)} shows its real special rules`, w && JSON.stringify(w.rule).slice(0, 200));
  }
  for (const re of [/^LK GENEVA/, /^HICKS LK/, /^BOSWORTH LK/, /^CRABAPPLE LK/, /^RILEY LK/, /^NORTH LK \(KING\)/, /^WILDERNESS LK/, /^CLEAR LK \(PIER\)/]) {
    const w = by(re);
    ok(!w || (w.rule.status === "ok" && w.rule.open === "spring"), `snapshot: ${re.source.slice(1)} is spring only`, w && JSON.stringify(w.rule).slice(0, 200));
  }
  for (const re of [/^BRADLEY LK/, /^WAPATO LK/, /^MUNN LK/, /^CADY LK/, /^RATTLESNAKE LK/, /^MAYFIELD RES/]) {
    const w = by(re);
    ok(!w || w.rule.status !== "ok", `snapshot: ${re.source.slice(1)} is held back`, w && JSON.stringify(w.rule).slice(0, 200));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
