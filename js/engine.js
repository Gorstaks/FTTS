/* ============================================================================
 * engine.js
 * ----------------------------------------------------------------------------
 * The rules engine. Pure functions that apply the guide (rules 1-7) to a team
 * configuration and produce recommendations, strong/weak spot, per-minute
 * mentality plan, per-player responsibilities, and warnings.
 *
 * A team config:
 *   {
 *     formationName: '4-4-2',
 *     fluidity: 'flexible',
 *     mentality: 'standard',
 *     players: [ { pos, lane, band, role, duty }, ... ]  // parallel to slots
 *     home: true/false
 *   }
 * ==========================================================================*/

(function (global) {
  'use strict';

  var R = global.ROLES;
  var RESP = global.RESPONSIBILITIES;

  // ---- RULE 1: recommended mentality from midfield triangles -----------------
  // Mentality is set by which of the three central-midfield bands are present
  // in the formation: DM (defensive midfield), MC (central midfield) and AMC
  // (attacking midfield). The guide maps the combinations as:
  //   DM + MC + AMC = attacking
  //   MC + AMC      = control
  //   DM + AMC      = standard
  //   DM + MC       = counter
  //   MC            = defensive
  // (A higher/connected spine => a more attacking mentality; a gap between the
  // bands => a more contained one.)
  //
  // The guide specifies exactly those five combinations. The remaining subsets
  // (DM only, AMC only, and none of the three) are not covered by the guide, so
  // they resolve to null and the caller omits the Rule-1 recommendation.
  function mentalityKey(hasDM, hasMC, hasAMC) {
    return (hasDM ? 'DM' : '') + (hasMC ? 'MC' : '') + (hasAMC ? 'AMC' : '');
  }
  var MENTALITY_BY_TRIANGLE = {
    'DMMCAMC': 'attacking',
    'MCAMC': 'control',
    'DMAMC': 'standard',
    'DMMC': 'counter',
    'MC': 'defensive'
  };
  // Resolve recommended mentality from the three midfield-band flags.
  function recommendedMentality(hasDM, hasMC, hasAMC) {
    return MENTALITY_BY_TRIANGLE[mentalityKey(hasDM, hasMC, hasAMC)] || null;
  }

  // Detect which of the three central-midfield bands a formation's slots cover.
  //   DM  : any DM slot.
  //   MC  : any MC slot.
  //   AMC : any AMC slot.
  function midfieldBands(slots) {
    var hasDM = false, hasMC = false, hasAMC = false;
    slots.forEach(function (s) {
      if (s.pos === 'DM') hasDM = true;
      else if (s.pos === 'MC') hasMC = true;
      else if (s.pos === 'AMC') hasAMC = true;
    });
    return { hasDM: hasDM, hasMC: hasMC, hasAMC: hasAMC };
  }

  // ---- RULE 2 (horizontal-lines basis) ---------------------------------------
  // The guide sets fluidity by the number of HORIZONTAL LINES MISSING from the
  // formation. There are six possible lines (spine, top to bottom):
  //   1. SW/Lib   — a Sweeper or Libero sitting behind the back line
  //   2. CB/FB    — the back line (DC/DL/DR, i.e. the D band)
  //   3. DM/WB    — the holding band (DM, WBL/WBR)
  //   4. CM/WM    — central/wide midfield (MC, ML/MR)
  //   5. W/AMC    — wingers and the attacking-midfield hole (AML/AMR, AMC)
  //   6. ST       — the strikers
  // Missing lines = 6 - lines present.
  //   0 lines missing = very fluid
  //   1 line  missing = fluid
  //   2 lines missing = flexible
  //   3 lines missing = structured
  //   4 lines missing = highly structured
  var LINE_IDS = ['SW', 'CBFB', 'DMWB', 'CMWM', 'WAMC', 'ST'];
  var TOTAL_LINES = LINE_IDS.length; // 6

  // Which horizontal line does a given slot occupy?
  //   - A Sweeper/Libero role (played from a DC slot) is the SW/Lib line.
  //   - Everything else is keyed off its position code.
  function lineOfSlot(slot) {
    if (slot.role === 'Sweeper' || slot.role === 'Libero' || slot.pos === 'SW') return 'SW';
    switch (slot.pos) {
      case 'DL': case 'DC': case 'DR': return 'CBFB';
      case 'DM': case 'WBL': case 'WBR': return 'DMWB';
      case 'MC': case 'ML': case 'MR': return 'CMWM';
      case 'AML': case 'AMR': case 'AMC': return 'WAMC';
      case 'ST': return 'ST';
      default: return null; // GK is not one of the six outfield lines
    }
  }

  // Count how many of the six lines are PRESENT in a set of slots.
  function countLinesPresent(slots) {
    var seen = {};
    slots.forEach(function (s) {
      var line = lineOfSlot(s);
      if (line) seen[line] = true;
    });
    return LINE_IDS.filter(function (id) { return seen[id]; }).length;
  }

  // Count how many of the six lines are MISSING.
  function countLinesMissing(slots) {
    return TOTAL_LINES - countLinesPresent(slots);
  }

  // Map lines-missing -> recommended fluidity (rule 2).
    // Map lines-missing -> recommended fluidity (rule 2). Uses external tactics data if available.
  function recommendedFluidityFromLinesMissing(linesMissing) {
    // Prefer external JSON via TACTICS module.
    if (global.TACTICS && typeof global.TACTICS.recommendedFluidityFromLinesMissing === 'function') {
      var external = global.TACTICS.recommendedFluidityFromLinesMissing(linesMissing);
      if (external) return external;
    }
    // Fallback to built‑in mapping (matches guide).
    switch (linesMissing) {
      case 0: return 'highly structured';
      case 1: return 'structured';
      case 2: return 'flexible';
      case 3: return 'fluid';
      case 4: return 'very fluid';
      default:
        return linesMissing < 0 ? 'highly structured' : 'very fluid';
    }
  }

  // ---- RULE 3: fluidity meaning (informational) ------------------------------
  var FLUIDITY_MEANING = {
    'highly structured': 'players play assigned roles',
    'structured': 'players play assigned roles and duties',
    'flexible': 'players play assigned duties, but can bypass role',
    'fluid': 'players can bypass role and duty',
    'very fluid': 'players can bypass role and duty and mentality'
  };

  // ---- RULE 4: recommended number of support duties from fluidity ------------
  // (lower figure if 3 CBs). Returns a {min,max} range and a note.
  function recommendedSupportDuties(fluidity, threeCentreBacks) {
    var base = {
      'very fluid': [8, 9],
      'fluid': [6, 7],
      'flexible': [4, 5],
      'structured': [2, 3],
      'highly structured': [0, 1]
    }[fluidity] || [4, 5];
    var min = base[0], max = base[1];
    var note = '';
    if (threeCentreBacks) {
      // "lower figure if 3 CB's" -> lean to the lower bound.
      max = min;
      note = 'Using the lower figure because of 3 centre-backs.';
    }
    return { min: min, max: max, note: note };
  }

  // ---- RULE 5: strong spot / weak spot ---------------------------------------
  // Strong spot has two mappings in the guide: one by fluidity (horizontal),
  // one by mentality (vertical band). We surface both.
  var FLUIDITY_SPOT = {
    'highly structured': 'left',
    'structured': 'central left',
    'flexible': 'centre',
    'fluid': 'central right',
    'very fluid': 'right'
  };
  var FLUIDITY_SPOT_OPPOSITE = {
    'left': 'right',
    'central left': 'central right',
    'centre': 'centre',
    'central right': 'central left',
    'right': 'left'
  };
  // Mentality -> vertical strong band (guide rule 5 second list).
  var MENTALITY_SPOT = {
    'overload': 'ST',
    'attacking': 'AMC',
    'control': 'MC',
    'standard': 'DM',
    'counter': 'CB',
    'defensive': 'SW',
    'contain': 'GK'
  };
  // Opposite vertical band (weak spot) - invert along the spine.
  var MENTALITY_SPOT_OPPOSITE = {
    'ST': 'GK',
    'AMC': 'SW',
    'MC': 'CB',
    'DM': 'DM',
    'CB': 'MC',
    'SW': 'AMC',
    'GK': 'ST'
  };

  function spots(fluidity, mentality) {
    var hStrong = FLUIDITY_SPOT[fluidity] || 'centre';
    var vStrong = MENTALITY_SPOT[mentality] || 'MC';
    return {
      horizontalStrong: hStrong,
      horizontalWeak: FLUIDITY_SPOT_OPPOSITE[hStrong] || 'centre',
      verticalStrong: vStrong,
      verticalWeak: MENTALITY_SPOT_OPPOSITE[vStrong] || 'MC'
    };
  }

  // ---- RULE 6: mentality efficiency by match minute --------------------------
  // 1-20 attacking, 20-40 control, 40-60 standard, 60-80 counter, 80-end defensive
  var MENTALITY_TIMELINE = [
    { from: 1, to: 20, mentality: 'attacking' },
    { from: 20, to: 40, mentality: 'control' },
    { from: 40, to: 60, mentality: 'standard' },
    { from: 60, to: 80, mentality: 'counter' },
    { from: 80, to: 90, mentality: 'defensive' }
  ];
  function mentalityForMinute(minute) {
    for (var i = 0; i < MENTALITY_TIMELINE.length; i++) {
      var seg = MENTALITY_TIMELINE[i];
      if (minute >= seg.from && minute <= seg.to) return seg.mentality;
    }
    return minute > 90 ? 'defensive' : 'attacking';
  }

  // A rough ordering used to compare "how attacking" two mentalities are.
  var MENT_LEVEL = {
    contain: 0, defensive: 1, counter: 2, standard: 3,
    control: 4, attacking: 5, overload: 6
  };
  var FLUID_LEVEL = {
    'highly structured': 0, 'structured': 1, 'flexible': 2,
    'fluid': 3, 'very fluid': 4
  };

  // ---- RULE 7: warnings ------------------------------------------------------
  function warnings(cfg, opts) {
    opts = opts || {};
    var w = [];
    // 7a: attacking mentality => weak spot is defense.
    if (cfg.mentality === 'attacking' || cfg.mentality === 'overload') {
      w.push({ level: 'caution', text:
        'Attacking mentality leaves your defence as the weak spot; consider whether you want to play this aggressively.' });
    }
    // 7b: mentality higher than fluidity => cards/injuries.
    // Compare the "aggressiveness" of mentality vs the "freedom" of fluidity.
    // Guide phrasing: if mentality is higher than fluidity. We map both onto a
    // 0..6 / 0..4 scale and normalise fluidity to the mentality scale.
    var mLvl = MENT_LEVEL[cfg.mentality];
    var fLvlNorm = (FLUID_LEVEL[cfg.fluidity] / 4) * 6;
    if (mLvl > fLvlNorm) {
      w.push({ level: 'risk', text:
        'Mentality is higher than fluidity — players are more likely to pick up cards or get injured.' });
    }
    // 7c: more structured => bad decisions.
    if (cfg.fluidity === 'structured' || cfg.fluidity === 'highly structured') {
      w.push({ level: 'info', text:
        'More structured fluidity means players make worse individual decisions.' });
    }
    // 7g: more defensive => fewer shots, need better finishing.
    if (mLvl <= MENT_LEVEL.counter) {
      w.push({ level: 'info', text:
        'Playing more defensively reduces your shots — you will need better finishing.' });
    }
    // 7h: more fluid and more defensive => better form.
    if (FLUID_LEVEL[cfg.fluidity] >= FLUID_LEVEL['fluid'] && mLvl <= MENT_LEVEL.counter) {
      w.push({ level: 'good', text:
        'More fluid and more defensive tends to yield better form.' });
    }
    // 7d: both teams same => aggressive favors home, defensive favors away.
    if (opts.sameAsOpponent) {
      if (mLvl >= MENT_LEVEL.control) {
        w.push({ level: 'info', text:
          'Both teams play alike and this is an aggressive tactic — favours the home team.' });
      } else {
        w.push({ level: 'info', text:
          'Both teams play alike and this is a defensive tactic — favours the away team.' });
      }
    }
    // 7e: bad weather favors more aggressive mentality.
    if (opts.badWeather && mLvl < MENT_LEVEL.control) {
      w.push({ level: 'info', text:
        'Bad weather favours a more aggressive mentality than you have set.' });
    }
    // 7f: team instructions should be none unless the assistant advises a
    // situational adjustment. Surfaced as a standing reminder.
    w.push({ level: 'info', text:
      'Leave team instructions on none unless your assistant advises a ' +
      'situational adjustment.' });
    // 7i / 7j: conceptual clarification of what "defensive" vs "aggressive"
    // actually mean in this guide, shown against the chosen mentality so the
    // player reads it in context.
    if (mLvl <= MENT_LEVEL.counter) {
      w.push({ level: 'info', text:
        'Defending here means dominating the ball, not sitting in your half.' });
    } else {
      w.push({ level: 'info', text:
        'An aggressive tactic means sitting in your half and skipping play.' });
    }
    return w;
  }

  // ---- Support-duty counting (actual, from player choices) -------------------
  function countSupportDuties(players) {
    return players.filter(function (p) { return p.duty === 'Support'; }).length;
  }

  function countThreeCentreBacks(players) {
    return players.filter(function (p) {
      return p.pos === 'DC';
    }).length === 3;
  }

  // Number of strikers (ST band) determines lone vs multiple for the tables.
  function strikerCount(players) {
    return players.filter(function (p) { return p.pos === 'ST'; }).length;
  }

  // ---- Striker-role guidance (advisory) --------------------------------------
  // "Striker" = literal centre-forward (ST slot). Wingers/AMC do NOT count.
  //   1 striker  : must create for himself -> Deep Lying Forward (Attack) or
  //                Target Forward (Attack).
  //   2 strikers : one executioner (Poacher / Advanced Forward) + one creator
  //                (Target Forward Support / Deep Lying Forward Support).
  //   3 strikers : the middle one is the executioner; the left & right support.
  var EXECUTIONER_ROLES = ['Poacher', 'Advanced Forward'];
  var CREATOR_ROLES = ['Target Forward', 'Deep Lying Forward', 'Complete Forward', 'False Nine'];

  function isExecutioner(p) {
    return EXECUTIONER_ROLES.indexOf(p.role) !== -1 && p.duty === 'Attack';
  }
  function isSelfCreator(p) {
    // A lone striker creating for himself: DLF/TF on Attack.
    return (p.role === 'Deep Lying Forward' || p.role === 'Target Forward') && p.duty === 'Attack';
  }
  function isCreator(p) {
    return CREATOR_ROLES.indexOf(p.role) !== -1 && p.duty === 'Support';
  }

  function strikerGuidance(players) {
    // Collect ST slots in left->right order by lane so we can name middle/wide.
    var laneOrder = { L: 0, CL: 1, C: 2, CR: 3, R: 4 };
    var sts = players
      .filter(function (p) { return p.pos === 'ST'; })
      .slice()
      .sort(function (a, b) {
        return (laneOrder[a.lane] || 2) - (laneOrder[b.lane] || 2);
      });
    var n = sts.length;
    if (n === 0) {
      return { count: 0, ok: true, recommendation: null, satisfied: true };
    }

    if (n === 1) {
      var s = sts[0];
      var ok = isSelfCreator(s);
      return {
        count: 1,
        recommendation: 'Lone striker should create chances for himself — play ' +
          'Deep Lying Forward (Attack) or Target Forward (Attack).',
        satisfied: ok
      };
    }

    if (n === 2) {
      var hasExec = sts.some(isExecutioner);
      var hasCreator = sts.some(isCreator);
      return {
        count: 2,
        recommendation: 'With two strikers, pair an executioner (Poacher or ' +
          'Advanced Forward) with a creator (Target Forward or Deep Lying ' +
          'Forward on Support).',
        satisfied: hasExec && hasCreator
      };
    }

    // 3+ strikers: middle = executioner, flanking = support.
    var middle = sts[Math.floor((n - 1) / 2)];
    var flanks = sts.filter(function (p) { return p !== middle; });
    var midOk = isExecutioner(middle);
    var flanksOk = flanks.every(function (p) { return p.duty === 'Support'; });
    return {
      count: n,
      recommendation: 'With three strikers, the central one is the executioner ' +
        '(Poacher or Advanced Forward on Attack) and the left/right strikers ' +
        'support him.',
      satisfied: midOk && flanksOk
    };
  }

  // ---- Resolve responsibilities for every player -----------------------------
  function resolveResponsibilities(cfg) {
    var lone = strikerCount(cfg.players) === 1;
    return cfg.players.map(function (p) {
      var phrase = RESP.resolve(cfg.fluidity, cfg.mentality, {
        pos: p.pos,
        role: p.role,
        duty: p.duty,
        lone: lone
      });
      return {
        pos: p.pos,
        role: p.role,
        duty: p.duty,
        responsibility: phrase || '(no specific instruction)'
      };
    });
  }

  // ---- Full analysis for one team --------------------------------------------
  function analyseTeam(cfg, opts) {
    var slots = cfg.players;
    var attackerCount = slots.filter(R.isAttackerSlot).length;
    var defenderCount = slots.filter(R.isDefenderSlot).length;
    var linesMissing = countLinesMissing(slots);
    var linesPresent = TOTAL_LINES - linesMissing;
    var threeCB = countThreeCentreBacks(slots);

    // Rule 1: mentality is driven by which midfield bands (DM/MC/AMC) are present.
    var bands = midfieldBands(slots);
    var recMent = recommendedMentality(bands.hasDM, bands.hasMC, bands.hasAMC);
    // Rule 2: fluidity is driven by the number of horizontal lines MISSING.
    var recFlu = recommendedFluidityFromLinesMissing(linesMissing);
    var supRange = recommendedSupportDuties(cfg.fluidity, threeCB);
    var actualSupport = countSupportDuties(slots);
    var spot = spots(cfg.fluidity, cfg.mentality);

    var extraWarnings = warnings(cfg, opts);

    // Advisory: mentality/fluidity deviate from recommendation?
    var advisories = [];
    if (recMent && cfg.mentality !== recMent) {
      var presentBands = []
        .concat(bands.hasDM ? ['DM'] : [])
        .concat(bands.hasMC ? ['MC'] : [])
        .concat(bands.hasAMC ? ['AMC'] : []);
      advisories.push('Rule 1 suggests "' + recMent + '" mentality for a ' +
        (presentBands.join(' + ') || 'no midfield band') +
        ' midfield; you picked "' + cfg.mentality + '".');
    }
    if (cfg.fluidity !== recFlu) {
      advisories.push('Rule 2 suggests "' + recFlu + '" fluidity for ' +
        linesMissing + ' line(s) missing; you picked "' +
        cfg.fluidity + '".');
    }
    if (actualSupport < supRange.min || actualSupport > supRange.max) {
      advisories.push('Rule 4 suggests ' + supRange.min +
        (supRange.max !== supRange.min ? '-' + supRange.max : '') +
        ' support duties for "' + cfg.fluidity + '"; you have ' + actualSupport + '.'
        + (supRange.note ? ' ' + supRange.note : ''));
    }

    // Striker-role guidance (advisory) — only flag when NOT satisfied.
    var strikers = strikerGuidance(slots);
    if (strikers.recommendation && !strikers.satisfied) {
      advisories.push(strikers.recommendation);
    }

    return {
      attackerCount: attackerCount,
      defenderCount: defenderCount,
      linesPresent: linesPresent,
      linesMissing: linesMissing,
      totalLines: TOTAL_LINES,
      threeCentreBacks: threeCB,
      midfieldBands: bands,
      recommendedMentality: recMent,
      recommendedFluidity: recFlu,
      fluidityMeaning: FLUIDITY_MEANING[cfg.fluidity],
      supportDutyRange: supRange,
      actualSupportDuties: actualSupport,
      spot: spot,
      strikerGuidance: strikers,
      responsibilities: resolveResponsibilities(cfg),
      advisories: advisories,
      warnings: extraWarnings
    };
  }

  // Compare two teams to detect the rule-7d "both teams play the same" case.
  function isSame(a, b) {
    return a.formationName === b.formationName &&
      a.fluidity === b.fluidity &&
      a.mentality === b.mentality;
  }

  global.ENGINE = {
    recommendedMentality: recommendedMentality,
    midfieldBands: midfieldBands,
    recommendedFluidityFromLinesMissing: recommendedFluidityFromLinesMissing,
    countLinesPresent: countLinesPresent,
    countLinesMissing: countLinesMissing,
    lineOfSlot: lineOfSlot,
    TOTAL_LINES: TOTAL_LINES,
    recommendedSupportDuties: recommendedSupportDuties,
    FLUIDITY_MEANING: FLUIDITY_MEANING,
    spots: spots,
    mentalityForMinute: mentalityForMinute,
    MENTALITY_TIMELINE: MENTALITY_TIMELINE,
    warnings: warnings,
    analyseTeam: analyseTeam,
    isSame: isSame,
    strikerGuidance: strikerGuidance,
    MENT_LEVEL: MENT_LEVEL,
    FLUID_LEVEL: FLUID_LEVEL
  };
})(window);
