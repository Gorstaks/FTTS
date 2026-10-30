/* ============================================================================
 * responsibilities.js
 * ----------------------------------------------------------------------------
 * Faithful encoding of the guide's rule-8 responsibility tables.
 *
 * Structure:
 *   RESP[fluidity][mentality] = [ matcher, ... ]
 *
 * Each matcher is [criteria, phrase] where criteria may specify:
 *   pos   : position code or array of codes (e.g. 'DL' matches DL & DR via mirror)
 *   role  : exact role name
 *   duty  : 'Defend' | 'Support' | 'Attack' | 'Stopper' | 'Cover'
 *   lone  : true (lone striker only) / false (multiple strikers) / undefined (any)
 *   prio  : specificity; higher wins. Auto-derived if absent.
 *
 * The resolver picks the highest-priority matcher that matches a given player.
 *
 * NOTE ON FIDELITY: the guide lists many lines role-first (e.g. "Advanced
 * Playmaker (All Duties)") and duty-first (e.g. "Stopper Duty (All Roles)").
 * These are encoded literally. Where the guide gives a position default AND a
 * role/duty override, the more specific one is given higher priority so it wins.
 * Position codes here use canonical forms: DL(=DR), WBL(=WBR), ML(=MR),
 * AML(=AMR). GK, DC, DM, MC, AMC, ST are central/single.
 * ==========================================================================*/

(function (global) {
  'use strict';

  // --- matcher builders (concise) --------------------------------------------
  function P(pos, phrase)             { return { pos: pos, phrase: phrase }; }
  function Pd(pos, duty, phrase)      { return { pos: pos, duty: duty, phrase: phrase }; }
  function R(role, phrase)            { return { role: role, phrase: phrase }; }
  function Rd(role, duty, phrase)     { return { role: role, duty: duty, phrase: phrase }; }
  function Rl(role, lone, phrase)     { return { role: role, lone: lone, phrase: phrase }; }
  function Du(duty, phrase)           { return { duty: duty, phrase: phrase }; }
  // Dul encodes the guide's "<Duty> Duty (Lone/Multiple Strikers)" lines, which
  // ALWAYS refer to the strikers. Scope them to the ST band so they never leak
  // onto outfield players who happen to share the same duty.
  function Dul(duty, lone, phrase)    { return { pos: 'ST', duty: duty, lone: lone, phrase: phrase }; }

  /* To keep this maintainable and 100% traceable to the guide, each mentality
   * block is written as an ordered list. Earlier, more-specific entries are
   * given higher priority automatically by the resolver based on how many
   * fields they constrain (role+duty+lone > role+duty > role/duty > pos).
   */

  var RESP = {
    'very fluid': {
      contain: [
        P('GK', 'Shield Goal'),
        P('SW', 'Obstruct Shots'),
        P('DC', 'Obstruct Shots'),
        Du('Stopper', 'Divert Attacking Movement'),
        P('DL', 'Slow Attacking Movement'),
        P('DM', 'Contain Attacking Movement'),
        P('WBL', 'Divert Attacking Movement'),
        P('MC', 'Restrict Space Cautiously'),
        P('ML', 'Restrict Space'),
        P('AMC', 'Restrict Space Aggressively'),
        R('Shadow Striker', 'Disrupt Attacks'),
        P('AML', 'Disrupt Attacks Judiciously'),
        Rl('Advanced Forward', true, 'Disrupt Attacks'),
        Pd('ST', 'Attack', 'Recover Possession')
      ],
      defensive: [
        P('GK', 'Limit Pressure'),
        P('SW', 'Divert Attacking Movement'),
        R('Libero', 'Restrict Space Cautiously'),
        P('DC', 'Restrict Space Cautiously'),
        Du('Cover', 'Divert Attacking Movement'),
        Du('Stopper', 'Disrupt Attacks Judiciously'),
        P('DL', 'Restrict Space'),
        P('DM', 'Restrict Space Aggressively'),
        R('Half Back', 'Restrict Space'),
        P('WBL', 'Disrupt Attacks Judiciously'),
        P('MC', 'Disrupt Attacks'),
        R('Deep Lying Playmaker', 'Disrupt Attacks Judiciously'),
        P('ML', 'Disrupt Attacks Quickly'),
        P('AMC', 'Recover Possession After Defensive Transition'),
        R('Advanced Playmaker', 'Disrupt Attacks Quickly'),
        R('Shadow Striker', 'Recover Possession Immediately'),
        P('AML', 'Recover Possession'),
        Rl('False Nine', true, 'Recover Possession'),
        Rl('Trequartista', true, 'Recover Possession'),
        Dul('Attack', false, 'Keep Possession Under Pressure'),
        Dul('Support', false, 'Recover Possession'),
        Dul('Defend', false, 'Recover Possession'),
        Rl('Advanced Forward', true, 'Recover Possession Immediately')
      ],
      counter: [
        P('GK', 'Distribute Safely'),
        P('SW', 'Restrict Space Aggressively'),
        R('Libero', 'Disrupt Attacks Judiciously'),
        P('DC', 'Disrupt Attacks Judiciously'),
        Du('Cover', 'Restrict Space'),
        Du('Stopper', 'Disrupt Attacks Quickly'),
        P('DL', 'Disrupt Attacks'),
        P('DM', 'Disrupt Attacks Quickly'),
        R('Half Back', 'Disrupt Attacks'),
        P('WBL', 'Recover Possession After Defensive Transition'),
        P('MC', 'Recover Possession'),
        R('Deep Lying Playmaker', 'Recover Possession After Defensive Transition'),
        P('ML', 'Recover Possession Immediately'),
        P('AMC', 'Keep Possession Away From Pressure'),
        R('Advanced Playmaker', 'Keep Possession Away From Pressure'),
        R('Shadow Striker', 'Keep Possession Under Pressure'),
        P('AML', 'Keep Possession'),
        Rl('Advanced Forward', true, 'Keep Possession Under Pressure'),
        Rl('False Nine', true, 'Keep Possession'),
        Rl('Trequartista', true, 'Keep Possession'),
        Dul('Attack', false, 'Shuttle Ball'),
        Dul('Support', false, 'Keep Possession Away From Pressure'),
        Dul('Defend', false, 'Keep Possession Away From Pressure')
      ],
      standard: [
        P('GK', 'Cycle Possession'),
        P('SW', 'Disrupt Attacks'),
        R('Libero', 'Recover Possession After Defensive Transition'),
        P('DC', 'Recover Possession After Defensive Transition'),
        Du('Cover', 'Disrupt Attacks'),
        Du('Stopper', 'Recover Possession Immediately'),
        P('DL', 'Recover Possession'),
        P('DM', 'Recover Possession Immediately'),
        R('Half Back', 'Recover Possession After Defensive Transition'),
        P('WBL', 'Keep Possession Away From Pressure'),
        P('MC', 'Keep Possession'),
        R('Deep Lying Playmaker', 'Recover Possession Immediately'),
        P('ML', 'Keep Possession Under Pressure'),
        P('AMC', 'Shuttle Ball Into Space'),
        R('Advanced Playmaker', 'Keep Possession Under Pressure'),
        R('Shadow Striker', 'Shuttle Ball Through Defence'),
        P('AML', 'Shuttle Ball'),
        Rl('Advanced Forward', true, 'Shuttle Ball Through Defence'),
        Rl('False Nine', true, 'Shuttle Ball Into Space'),
        Rl('Trequartista', true, 'Shuttle Ball Into Space'),
        Dul('Attack', false, 'Spearhead Attacking Moves'),
        Dul('Support', false, 'Shuttle Ball Into Space'),
        Dul('Defend', false, 'Shuttle Ball Into Space')
      ],
      control: [
        P('GK', 'Cycle Possession'),
        P('SW', 'Recover Possession'),
        R('Libero', 'Keep Possession Away From Pressure'),
        P('DC', 'Keep Possession Away From Pressure'),
        Du('Cover', 'Recover Possession'),
        Du('Stopper', 'Keep Possession Under Pressure'),
        P('DL', 'Keep Possession'),
        P('DM', 'Keep Possession Under Pressure'),
        R('Half Back', 'Keep Possession Away From Pressure'),
        P('WBL', 'Shuttle Ball Into Space'),
        P('MC', 'Shuttle Ball'),
        R('Deep Lying Playmaker', 'Keep Possession Under Pressure'),
        P('ML', 'Shuttle Ball Through Defence'),
        P('AMC', 'Spearhead Attacking Moves from the Hole'),
        R('Advanced Playmaker', 'Shuttle Ball Through Defence'),
        R('Shadow Striker', 'Spearhead Attacking Moves Closer to Defence'),
        P('AML', 'Spearhead Attacking Moves'),
        Rd('Defensive Winger', 'Defend', 'Suppress Counterattacks'),
        Du('Support', 'Create Chances'),
        Rl('Advanced Forward', true, 'Spearhead Attacking Moves Closer to Defence'),
        Dul('Attack', false, 'Penetrate Gaps'),
        Rl('Defensive Forward', true, 'Suppress Counterattacking Outlets'),
        Rl('Defensive Forward', false, 'Suppress Counterattacking Options'),
        Rl('False Nine', true, 'Create Chances Patiently'),
        Rl('Trequartista', true, 'Create Chances Patiently')
      ],
      attacking: [
        P('GK', 'Initiate Attacks'),
        P('SW', 'Keep Possession'),
        R('Libero', 'Shuttle Ball Into Space'),
        P('DC', 'Shuttle Ball Into Space'),
        Du('Cover', 'Keep Possession Away From Pressure'),
        Du('Stopper', 'Shuttle Ball'),
        P('DL', 'Shuttle Ball'),
        P('DM', 'Shuttle Ball Through Defence'),
        R('Half Back', 'Shuttle Ball Into Space'),
        P('WBL', 'Spearhead Attacking Moves from the Hole'),
        P('MC', 'Spearhead Attacking Moves'),
        R('Deep Lying Playmaker', 'Shuttle Ball Through Defence'),
        P('ML', 'Spearhead Attacking Moves Closer to Defence'),
        P('AMC', 'Penetrate Gaps Intermittently'),
        R('Advanced Playmaker', 'Create Chances Urgently'),
        R('Enganche', 'Force Half Chances When Necessary'),
        R('Shadow Striker', 'Penetrate Gaps'),
        R('Trequartista', 'Force Half Chances When Necessary'),
        P('AML', 'Penetrate Gaps'),
        Rd('Defensive Winger', 'Defend', 'Isolate Midfielders'),
        Rl('Advanced Forward', true, 'Penetrate Gaps Persistently'),
        Dul('Attack', false, 'Draw Off Defenders'),
        Rl('Defensive Forward', true, 'Isolate Holding Midfielders'),
        Rl('Defensive Forward', false, 'Suppress Counterattacking Outlets'),
        Rl('False Nine', true, 'Force Half Chances When Necessary')
      ],
      overload: [
        P('GK', 'Support Attacks'),
        P('SW', 'Shuttle Ball Through Defence'),
        Rd('Libero', 'Attack', 'Spearhead Attacking Moves'),
        Rd('Libero', 'Support', 'Create Chances'),
        P('DC', 'Suppress Counterattacks'),
        Du('Cover', 'Shuttle Ball'),
        P('DL', 'Spearhead Attacking Moves Closer to Defence'),
        P('DM', 'Force Half Chances When Necessary'),
        R('Half Back', 'Suppress Counterattacks'),
        P('WBL', 'Penetrate Gaps'),
        P('MC', 'Penetrate Gaps Persistently'),
        R('Advanced Playmaker', 'Force Half Chances Without Hesitation'),
        R('Deep Lying Playmaker', 'Force Half Chances When Necessary'),
        P('ML', 'Draw Off Defenders'),
        P('AMC', 'Overload Defenders'),
        R('Enganche', 'Test Defence'),
        R('Trequartista', 'Test Defence'),
        P('AML', 'Challenge Defenders'),
        Rd('Defensive Winger', 'Defend', 'Hassle Defenders Relentlessly'),
        Rl('Advanced Forward', true, 'Bypass Last Defender'),
        Dul('Attack', false, 'Bypass Last Defender'),
        Rl('Defensive Forward', true, 'Force Clearance'),
        Rl('Defensive Forward', false, 'Hassle Dawdling Defenders'),
        Rl('False Nine', true, 'Test Defence'),
        Dul('Support', false, 'Draw Off Defenders')
      ]
    }
  };

  /* --------------------------------------------------------------------------
   * The remaining fluidity blocks (fluid, flexible, structured, highly
   * structured) are attached from responsibilities-data2.js so this file stays
   * navigable. They register onto RESP via FTS_registerResp().
   * ------------------------------------------------------------------------*/

  // Canonicalize position code (mirror right->left) for matching.
  function canonPos(pos) {
    if (pos === 'DR') return 'DL';
    if (pos === 'WBR') return 'WBL';
    if (pos === 'MR') return 'ML';
    if (pos === 'AMR') return 'AML';
    if (pos === 'SW' ) return 'SW';
    return pos;
  }

  // Some guide lines say "SW"/"Sweeper Keeper"/"Libero"/"Halfback" against a
  // position; map special position aliases used in tables.
  function matchesPos(critPos, slotPos) {
    var c = canonPos(critPos);
    var s = canonPos(slotPos);
    if (c === s) return true;
    // 'SW' criterion applies to a DC playing the Sweeper role - handled by role.
    return false;
  }

  // Duty matching: Stopper/Cover are DC sub-duties; treat them distinctly.
  function matchesDuty(critDuty, player) {
    if (!critDuty) return true;
    if (critDuty === 'Stopper') return player.duty === 'Stopper';
    if (critDuty === 'Cover') return player.duty === 'Cover';
    // For Defend/Support/Attack, a DC on Stopper/Cover still counts as Defend-ish
    // only when the guide explicitly says "Defend Duty". We keep them separate:
    return player.duty === critDuty;
  }

  // Compute specificity so the most specific matcher wins.
  //
  // Weighting rationale (matches the guide's structure):
  //   - A bare position line (e.g. "DC") is the DEFAULT for that slot -> weakest.
  //   - A duty line (e.g. "Cover Duty (All Roles)") OVERRIDES the position
  //     default, so duty must outrank a bare position.
  //   - A role line (e.g. "Advanced Playmaker (All Duties)") overrides both.
  //   - lone/striker-context and combinations add further specificity.
  function specificity(m) {
    var s = 0;
    if (m.pos === 'SW') s += 4;      // SW line is role-gated (Sweeper) -> role-level
    else if (m.pos) s += 1;          // bare position default = weakest
    if (m.duty) s += 2;              // duty override beats a bare position
    if (m.role) s += 4;              // role override beats duty
    if (m.lone !== undefined) s += 1;
    return s;
  }

  function matcherApplies(m, player) {
    if (m.pos && !matchesPos(m.pos, player.pos)) {
      // Allow role-named "positions" like SW/Libero to be handled via role.
      if (m.pos === 'SW') {
        if (player.role !== 'Sweeper') return false;
      } else {
        return false;
      }
    }
    if (m.role && m.role !== player.role) return false;
    if (m.duty && !matchesDuty(m.duty, player)) return false;
    if (m.lone !== undefined && m.lone !== player.lone) return false;
    return true;
  }

  /* Resolve the responsibility phrase for a player.
   * player = { pos, role, duty ('Defend'|'Support'|'Attack'|'Stopper'|'Cover'),
   *            lone (bool: lone striker) }
   */
  function resolve(fluidity, mentality, player) {
    var block = RESP[fluidity] && RESP[fluidity][mentality];
    if (!block) return null;
    var best = null, bestScore = -1, bestIdx = -1;
    for (var i = 0; i < block.length; i++) {
      var m = block[i];
      if (!matcherApplies(m, player)) continue;
      var score = specificity(m);
      // Tie-break: later entry wins (guide lists specific overrides after
      // general defaults within the same specificity bucket).
      if (score > bestScore || (score === bestScore && i > bestIdx)) {
        best = m; bestScore = score; bestIdx = i;
      }
    }
    return best ? best.phrase : null;
  }

  // Allow the second data file to register more fluidity blocks.
  function registerResp(fluidity, data) {
    RESP[fluidity] = data;
  }

  global.RESP_BUILD = { P: P, Pd: Pd, R: R, Rd: Rd, Rl: Rl, Du: Du, Dul: Dul };
  global.RESPONSIBILITIES = {
    RESP: RESP,
    resolve: resolve,
    registerResp: registerResp
  };
})(window);
