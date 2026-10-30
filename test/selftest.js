/* ============================================================================
 * selftest.js — browser self-test. Runs assertions against the real loaded
 * modules and writes a summary into #selftest-out. Loaded only by test.html.
 * ==========================================================================*/
(function () {
  'use strict';
  var ENGINE = window.ENGINE, RESPONSIBILITIES = window.RESPONSIBILITIES,
      FORMATIONS = window.FORMATIONS, ROLES = window.ROLES;

  var pass = 0, fail = 0, log = [];
  function eq(name, got, want) {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; log.push('FAIL ' + name + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
  }
  function resp(flu, ment, player) { return RESPONSIBILITIES.resolve(flu, ment, player); }

  // Rule 1 — mentality from the midfield triangle (which of DM/MC/AMC present).
  // recommendedMentality(hasDM, hasMC, hasAMC).
  eq('rule1 DM+MC+AMC', ENGINE.recommendedMentality(true, true, true), 'attacking');
  eq('rule1 MC+AMC', ENGINE.recommendedMentality(false, true, true), 'control');
  eq('rule1 DM+AMC', ENGINE.recommendedMentality(true, false, true), 'standard');
  eq('rule1 DM+MC', ENGINE.recommendedMentality(true, true, false), 'counter');
  eq('rule1 MC', ENGINE.recommendedMentality(false, true, false), 'defensive');
  // Combinations the guide does not cover resolve to null (no recommendation).
  eq('rule1 DM only', ENGINE.recommendedMentality(true, false, false), null);
  eq('rule1 AMC only', ENGINE.recommendedMentality(false, false, true), null);
  eq('rule1 none', ENGINE.recommendedMentality(false, false, false), null);
  // midfieldBands detects DM/MC/AMC presence from a formation's slots.
  (function () {
    var b442 = ENGINE.midfieldBands(FORMATIONS.byName['4-4-2'].slots);
    eq('bands 442 MC', b442.hasMC, true);
    eq('bands 442 noAMC', b442.hasAMC, false);
    var b4231 = ENGINE.midfieldBands(FORMATIONS.byName['4-2-3-1'].slots);
    eq('bands 4231 AMC', b4231.hasAMC, true);
  })();
  // Defender counting from real formations (defenders = SW/CB/FB/WB/DM).
  function defCount(n) { return FORMATIONS.byName[n].slots.filter(ROLES.isDefenderSlot).length; }
  eq('rule2 442 def', defCount('4-4-2'), 4);            // structured
  eq('rule2 4231 def', defCount('4-2-3-1'), 4);         // structured
  eq('rule2 4231deep def', defCount('4-2-3-1 Deep'), 6);// fluid
  eq('rule2 diamond def', defCount('4-4-2 Diamond'), 5);// flexible
  eq('rule2 532wb def', defCount('5-3-2 (WB)'), 5);     // flexible
  // Rule 2 (lines-missing basis) — fluidity from number of horizontal lines
  // MISSING (of six: SW/Lib, CB/FB, DM/WB, CM/WM, W/AMC, ST).
  eq('rule2 0miss', ENGINE.recommendedFluidityFromLinesMissing(0), 'very fluid');
  eq('rule2 1miss', ENGINE.recommendedFluidityFromLinesMissing(1), 'fluid');
  eq('rule2 2miss', ENGINE.recommendedFluidityFromLinesMissing(2), 'flexible');
  eq('rule2 3miss', ENGINE.recommendedFluidityFromLinesMissing(3), 'structured');
  eq('rule2 4miss', ENGINE.recommendedFluidityFromLinesMissing(4), 'highly structured');
  // Lines present/missing from real formations.
  function linesMissing(n) { return ENGINE.countLinesMissing(FORMATIONS.byName[n].slots); }
  // 4-4-2: CB/FB + CM/WM + ST present -> 3 lines, 3 missing (structured).
  eq('rule2 442 lines', linesMissing('4-4-2'), 3);
  // 4-2-3-1: CB/FB + CM/WM + W/AMC + ST -> 4 present, 2 missing (flexible).
  eq('rule2 4231 lines', linesMissing('4-2-3-1'), 2);
  // 4-2-3-1 Deep: CB/FB + DM/WB + W/AMC + ST -> 4 present, 2 missing (flexible).
  eq('rule2 4231deep lines', linesMissing('4-2-3-1 Deep'), 2);
  // 4-4-2 Diamond: CB/FB + DM/WB + CM/WM + W/AMC + ST -> 5 present, 1 missing (fluid).
  eq('rule2 diamond lines', linesMissing('4-4-2 Diamond'), 1);
  // 3-1-4-2: CB/FB + DM/WB + CM/WM + ST -> 4 present, 2 missing (flexible).
  eq('rule2 3142 lines', linesMissing('3-1-4-2'), 2);
  // Sweeper role adds the SW/Lib line. A back-four 4-4-2 with a DC playing
  // Sweeper covers SW/Lib + CB/FB + CM/WM + ST -> 4 present, 2 missing.
  (function () {
    var slots = FORMATIONS.byName['4-4-2'].slots.map(function (s) { return { pos: s.pos, role: s.role }; });
    // Turn one centre-back into a Sweeper.
    for (var i = 0; i < slots.length; i++) { if (slots[i].pos === 'DC') { slots[i].role = 'Sweeper'; break; } }
    eq('rule2 sweeper adds line', ENGINE.countLinesMissing(slots), 2);
  })();
  // Rule 4 — support-duty ranges per fluidity (corrected orientation).
  eq('rule4 veryfluid', ENGINE.recommendedSupportDuties('very fluid', false), { min: 8, max: 9, note: '' });
  eq('rule4 fluid', ENGINE.recommendedSupportDuties('fluid', false), { min: 6, max: 7, note: '' });
  eq('rule4 flexible', ENGINE.recommendedSupportDuties('flexible', false), { min: 4, max: 5, note: '' });
  eq('rule4 structured', ENGINE.recommendedSupportDuties('structured', false), { min: 2, max: 3, note: '' });
  eq('rule4 highly', ENGINE.recommendedSupportDuties('highly structured', false), { min: 0, max: 1, note: '' });
  eq('rule4 highly max', ENGINE.recommendedSupportDuties('highly structured', false).max, 1);
  // "lower figure if 3 CBs" collapses the range to its minimum.
  eq('rule4 3cb lowers', ENGINE.recommendedSupportDuties('structured', true).max, 2);
  // Rule 5
  eq('rule5 flex centre', ENGINE.spots('flexible', 'standard').horizontalStrong, 'centre');
  eq('rule5 highly left', ENGINE.spots('highly structured', 'contain').horizontalStrong, 'left');
  eq('rule5 veryfluid right', ENGINE.spots('very fluid', 'overload').horizontalStrong, 'right');
  eq('rule5 overload ST', ENGINE.spots('flexible', 'overload').verticalStrong, 'ST');
  eq('rule5 counter CB', ENGINE.spots('flexible', 'counter').verticalStrong, 'CB');
  eq('rule5 contain GK', ENGINE.spots('flexible', 'contain').verticalStrong, 'GK');
  // Rule 6
  eq('rule6 10', ENGINE.mentalityForMinute(10), 'attacking');
  eq('rule6 30', ENGINE.mentalityForMinute(30), 'control');
  eq('rule6 50', ENGINE.mentalityForMinute(50), 'standard');
  eq('rule6 70', ENGINE.mentalityForMinute(70), 'counter');
  eq('rule6 85', ENGINE.mentalityForMinute(85), 'defensive');
  // Responsibility spot-checks
  eq('vf/contain GK', resp('very fluid', 'contain', { pos: 'GK', role: 'Goalkeeper', duty: 'Defend', lone: true }), 'Shield Goal');
  eq('vf/contain DMC', resp('very fluid', 'contain', { pos: 'DM', role: 'Defensive Midfielder', duty: 'Defend', lone: true }), 'Contain Attacking Movement');
  eq('vf/contain AMC', resp('very fluid', 'contain', { pos: 'AMC', role: 'Attacking Midfielder', duty: 'Support', lone: true }), 'Restrict Space Aggressively');
  eq('vf/contain SS', resp('very fluid', 'contain', { pos: 'AMC', role: 'Shadow Striker', duty: 'Attack', lone: true }), 'Disrupt Attacks');
  eq('vf/def Stopper', resp('very fluid', 'defensive', { pos: 'DC', role: 'Central Defender', duty: 'Stopper', lone: true }), 'Disrupt Attacks Judiciously');
  eq('vf/def Cover', resp('very fluid', 'defensive', { pos: 'DC', role: 'Central Defender', duty: 'Cover', lone: true }), 'Divert Attacking Movement');
  eq('vf/def Libero', resp('very fluid', 'defensive', { pos: 'DC', role: 'Libero', duty: 'Support', lone: true }), 'Restrict Space Cautiously');
  eq('vf/overload ST lone', resp('very fluid', 'overload', { pos: 'ST', role: 'Advanced Forward', duty: 'Attack', lone: true }), 'Bypass Last Defender');
  eq('fluid/std BBM', resp('fluid', 'standard', { pos: 'MC', role: 'Box to Box Midfielder', duty: 'Support', lone: true }), 'Keep Possession');
  eq('fluid/ctrl SK', resp('fluid', 'control', { pos: 'GK', role: 'Sweeper Keeper', duty: 'Support', lone: true }), 'Initiate Attacks');
  eq('flex/def WB defend', resp('flexible', 'defensive', { pos: 'WBL', role: 'Wing Back', duty: 'Defend', lone: true }), 'Restrict Space Aggressively');
  eq('flex/def WB support', resp('flexible', 'defensive', { pos: 'WBL', role: 'Wing Back', duty: 'Support', lone: true }), 'Disrupt Attacks Quickly');
  // MC on Attack duty gets the position line (no duty override for Attack here).
  eq('struct/att MC(A)', resp('structured', 'attacking', { pos: 'MC', role: 'Central Midfielder', duty: 'Attack', lone: true }), 'Spearhead Attacking Moves from the Hole');
  // MC on Support duty correctly takes the "Support Duty (All Roles)" override.
  eq('struct/att MC(S)', resp('structured', 'attacking', { pos: 'MC', role: 'Central Midfielder', duty: 'Support', lone: true }), 'Create Chances');
  eq('highly/overload AMC', resp('highly structured', 'overload', { pos: 'AMC', role: 'Attacking Midfielder', duty: 'Attack', lone: true }), 'Draw Off Defenders');
  // Formations
  var names = FORMATIONS.all.map(function (f) { return f.name; });
  eq('has 4-4-2', names.indexOf('4-4-2') !== -1, true);
  eq('has 4-3-3', names.indexOf('4-3-3') !== -1, true);
  eq('442 slots=11', FORMATIONS.byName['4-4-2'].slots.length, 11);
  var s442 = FORMATIONS.byName['4-4-2'].slots;
  eq('442 attackers', s442.filter(ROLES.isAttackerSlot).length, 2);
  eq('442 defenders', s442.filter(ROLES.isDefenderSlot).length, 4);
  FORMATIONS.all.forEach(function (f) {
    if (f.slots.length !== 11) { fail++; log.push('FAIL slots!=11: ' + f.name); }
    if (f.slots[0].pos !== 'GK') { fail++; log.push('FAIL no GK: ' + f.name); }
  });
  // Curated set: every formation has 11 players and a GK (checked above); we
  // expect a sane curated count (not the old mechanically-generated hundreds).
  eq('curated count in range', FORMATIONS.all.length >= 18 && FORMATIONS.all.length <= 40, true);

  // Narrow 4-3-3: three central strikers.
  eq('has 4-3-3 Narrow', names.indexOf('4-3-3 Narrow') !== -1, true);
  (function () {
    var s = FORMATIONS.byName['4-3-3 Narrow'].slots;
    eq('433narrow slots', s.length, 11);
    eq('433narrow attackers', s.filter(ROLES.isAttackerSlot).length, 3); // 3 ST
    eq('433narrow defenders', s.filter(ROLES.isDefenderSlot).length, 4); // back 4
    eq('433narrow strikers', s.filter(function (p) { return p.pos === 'ST'; }).length, 3);
  })();

  // Corrected formations consistent with the defender rule.
  function defOf(n) { return FORMATIONS.byName[n].slots.filter(ROLES.isDefenderSlot).length; }
  eq('has 4-4-2 Diamond', names.indexOf('4-4-2 Diamond') !== -1, true);
  eq('diamond has DM base (5 def)', defOf('4-4-2 Diamond'), 5);
  eq('true 3-5-2 = 3 def', defOf('3-5-2'), 3);
  eq('true 3-4-3 = 3 def', defOf('3-4-3'), 3);
  eq('5-3-2 WB = 5 def', defOf('5-3-2 (WB)'), 5);
  eq('4-2-3-1 Deep = 6 def', defOf('4-2-3-1 Deep'), 6);
  eq('4-2-2-2 Deep = 6 def', defOf('4-2-2-2 Deep'), 6);
  eq('has 4-3-2-1', names.indexOf('4-3-2-1') !== -1, true);
  eq('has 4-5-1', names.indexOf('4-5-1') !== -1, true);
  eq('has 3-4-2-1', names.indexOf('3-4-2-1') !== -1, true);
  eq('has 3-1-4-2', names.indexOf('3-1-4-2') !== -1, true);

  // ---- Match engine sanity ----
  var MATCH = window.MATCH;
  function buildTeam(formationName, fluidity, mentality, home) {
    var slots = FORMATIONS.slotsOf(formationName);
    return {
      formationName: formationName, fluidity: fluidity, mentality: mentality, home: !!home,
      players: slots.map(function (s) {
        var rd = ROLES.defaultRoleDuty(s.pos);
        return { pos: s.pos, lane: s.lane, band: s.band, role: rd.role, duty: rd.duty };
      })
    };
  }
  function analyse(t) { return ENGINE.analyseTeam(t, { sameAsOpponent: false, badWeather: false }); }

  var tA = buildTeam('4-3-3', 'flexible', 'standard', true);
  var tB = buildTeam('4-4-2', 'structured', 'counter', false);
  var aA = analyse(tA), aB = analyse(tB);

  // Determinism: same seed => identical result.
  var m1 = MATCH.create(tA, tB, aA, aB, { seed: 12345 }).runToEnd();
  var m2 = MATCH.create(tA, tB, aA, aB, { seed: 12345 }).runToEnd();
  eq('match deterministic score', [m1.score.A, m1.score.B], [m2.score.A, m2.score.B]);
  eq('match deterministic shots', [m1.shots.A, m1.shots.B], [m2.shots.A, m2.shots.B]);

  // Different seed can differ but must finish at 90 with sane scores.
  eq('match finishes at 90', m1.minute, 90);
  eq('match finished flag', m1.finished, true);
  eq('score A in range', m1.score.A >= 0 && m1.score.A <= 12, true);
  eq('score B in range', m1.score.B >= 0 && m1.score.B <= 12, true);
  eq('shots >= goals A', m1.shots.A >= m1.score.A, true);
  eq('shots >= goals B', m1.shots.B >= m1.score.B, true);

  // Directional: over many seeds, an attacking team should out-shoot the same
  // team set to contain (rule 7g: attacking => more shots).
  (function () {
    function totalShots(mentality, seeds) {
      var t = buildTeam('4-3-3', 'flexible', mentality, true);
      var opp = buildTeam('4-4-2', 'flexible', 'standard', false);
      var at = analyse(t), ao = analyse(opp);
      var sum = 0;
      for (var i = 0; i < seeds; i++) sum += MATCH.create(t, opp, at, ao, { seed: i * 7 + 1 }).runToEnd().shots.A;
      return sum;
    }
    var attackingShots = totalShots('attacking', 30);
    var containShots = totalShots('contain', 30);
    eq('attacking out-shoots contain', attackingShots > containShots, true);
  })();

  // Effective mentality blend is within [chosen, phase] bounds and numeric.
  var eff = MATCH._effectiveMentalityLevel('standard', 10);
  eq('effective mentality numeric', typeof eff === 'number' && eff >= 0 && eff <= 6, true);

  // ---- Striker guidance (advisory) ----
  function ST(role, duty, lane) { return { pos: 'ST', band: 'ST', lane: lane || 'C', role: role, duty: duty }; }
  var SG = ENGINE.strikerGuidance;
  // 0 strikers => satisfied, no recommendation.
  eq('sg 0', SG([]).satisfied, true);
  // 1 striker: DLF/TF on Attack satisfies; anything else does not.
  eq('sg 1 DLF-A ok', SG([ST('Deep Lying Forward', 'Attack')]).satisfied, true);
  eq('sg 1 TF-A ok', SG([ST('Target Forward', 'Attack')]).satisfied, true);
  eq('sg 1 Poacher not', SG([ST('Poacher', 'Attack')]).satisfied, false);
  eq('sg 1 DLF-S not', SG([ST('Deep Lying Forward', 'Support')]).satisfied, false);
  eq('sg 1 count', SG([ST('Poacher', 'Attack')]).count, 1);
  // 2 strikers: executioner + creator.
  eq('sg 2 ok', SG([ST('Poacher', 'Attack', 'CL'), ST('Target Forward', 'Support', 'CR')]).satisfied, true);
  eq('sg 2 AF+DLF ok', SG([ST('Advanced Forward', 'Attack', 'CL'), ST('Deep Lying Forward', 'Support', 'CR')]).satisfied, true);
  eq('sg 2 both attack not', SG([ST('Poacher', 'Attack', 'CL'), ST('Advanced Forward', 'Attack', 'CR')]).satisfied, false);
  eq('sg 2 no exec not', SG([ST('Target Forward', 'Support', 'CL'), ST('Deep Lying Forward', 'Support', 'CR')]).satisfied, false);
  // 3 strikers: middle executioner (Attack), flanks support.
  eq('sg 3 ok', SG([ST('Deep Lying Forward', 'Support', 'L'), ST('Poacher', 'Attack', 'C'), ST('Target Forward', 'Support', 'R')]).satisfied, true);
  eq('sg 3 mid support not', SG([ST('Deep Lying Forward', 'Support', 'L'), ST('Deep Lying Forward', 'Support', 'C'), ST('Target Forward', 'Support', 'R')]).satisfied, false);
  eq('sg 3 flank attack not', SG([ST('Poacher', 'Attack', 'L'), ST('Poacher', 'Attack', 'C'), ST('Target Forward', 'Support', 'R')]).satisfied, false);

  var out = document.getElementById('selftest-out');
  var head = pass + ' passed, ' + fail + ' failed (' + FORMATIONS.all.length + ' formations).';
  out.innerHTML = '<h2 style="color:' + (fail ? '#e23a3a' : '#2fae60') + '">' + head + '</h2>' +
    (log.length ? '<pre>' + log.join('\n') + '</pre>' : '<p>All good.</p>');
})();
