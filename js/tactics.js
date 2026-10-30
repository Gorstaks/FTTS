// tactics.js – Loads tactical rule data from tactics_rules.json and
// exposes helper functions that mirror the existing engine logic but use
// the external configuration. This file is loaded before app.js (see index.html).

(function (global) {
  'use strict';

  // Path to the JSON file containing the rule tables.
  var RULES_URL = 'tactics_rules.json?v=17';

  // Store the loaded data.
  var tacticsData = null;

  // Helper to fetch JSON.
  function loadRules(callback) {
    if (tacticsData) { callback(tacticsData); return; }
    fetch(RULES_URL)
      .then(function (resp) { return resp.json(); })
      .then(function (json) { tacticsData = json; callback(tacticsData); })
      .catch(function (err) {
        console.error('Failed to load tactical rules:', err);
        tacticsData = {};
        callback(tacticsData);
      });
  }

  // Public API – mirrors the functions in engine.js but uses the loaded JSON.
  // Rule 1: mentality from the midfield triangle (which of DM/MC/AMC present).
  var TRIANGLE_FALLBACK = {
    'DMMCAMC': 'attacking',
    'MCAMC': 'control',
    'DMAMC': 'standard',
    'DMMC': 'counter',
    'MC': 'defensive'
  };
  function triangleKey(hasDM, hasMC, hasAMC) {
    return (hasDM ? 'DM' : '') + (hasMC ? 'MC' : '') + (hasAMC ? 'AMC' : '');
  }
  function recommendedMentality(hasDM, hasMC, hasAMC) {
    var key = triangleKey(hasDM, hasMC, hasAMC);
    if (tacticsData && tacticsData.mentality_by_triangle) {
      return tacticsData.mentality_by_triangle[key] || null;
    }
    return TRIANGLE_FALLBACK[key] || null;
  }

  function recommendedFluidityFromLinesMissing(linesMissing) {
    if (tacticsData && tacticsData.fluidity_by_missing_lines) {
      return tacticsData.fluidity_by_missing_lines[linesMissing] || '';
    }
    // Fallback mapping per user rules.
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

  function recommendedSupportDuties(fluidity, threeCentreBacks) {
    if (tacticsData && tacticsData.supportDuties) {
      var base = tacticsData.supportDuties[fluidity] || [4, 5];
      var min = base[0], max = base[1];
      var note = '';
      if (threeCentreBacks) { max = min; note = 'Using the lower figure because of 3 centre-backs.'; }
      return { min: min, max: max, note: note };
    }
    var base = {
      'very fluid': [8, 9],
      'fluid': [6, 7],
      'flexible': [4, 5],
      'structured': [2, 3],
      'highly structured': [0, 1]
    }[fluidity] || [4, 5];
    var min = base[0], max = base[1];
    var note = '';
    if (threeCentreBacks) { max = min; note = 'Using the lower figure because of 3 centre-backs.'; }
    return { min: min, max: max, note: note };
  }

  global.TACTICS = {
    load: loadRules,
    recommendedMentality: recommendedMentality,
    recommendedFluidityFromLinesMissing: recommendedFluidityFromLinesMissing,
    recommendedSupportDuties: recommendedSupportDuties
  };
})(window);
