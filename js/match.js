/* ============================================================================
 * match.js
 * ----------------------------------------------------------------------------
 * Full match simulation producing a scoreline.
 *
 * WHAT IS FAITHFUL TO THE GUIDE (the inputs):
 *   - Rule 6: the EFFECTIVE mentality shifts by minute. We blend the manager's
 *     chosen mentality with rule 6's phase-of-match mentality.
 *   - Rule 5: strong spot (from fluidity, horizontal) and vertical strong band
 *     (from mentality). A team attacks best through its strong spot and worst
 *     through its weak spot; it defends worst at its own weak spot.
 *   - Rule 7 modifiers: 7a (attacking => weak defence), 7b (mentality>fluidity
 *     => cards/injuries), 7c (structured => worse decisions), 7d (mirror match
 *     => aggressive favours home / defensive favours away), 7e (bad weather
 *     favours aggression), 7g (defensive => fewer shots, needs better
 *     finishing), 7h (fluid+defensive => better form), 7i/7j (flavour).
 *   - Shape: attacker & defender counts, and support-duty balance.
 *
 * WHAT IS MODELLED (assumptions — the guide gives inputs, not the math):
 *   The functions that turn those inputs into per-minute shot volume, chance
 *   quality and finishing are heuristics. Every such constant is grouped in
 *   TUNING below and commented so it can be adjusted without hunting.
 *
 * The sim is SEEDED so a given configuration + seed always yields the same
 * match (reproducible "what if"), while a new seed gives a fresh match.
 * ==========================================================================*/

(function (global) {
  'use strict';

  var E = global.ENGINE;

  // ---- Seeded RNG (mulberry32): deterministic per seed ----------------------
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Levels (shared with engine) ------------------------------------------
  var MENT = E.MENT_LEVEL;   // contain..overload => 0..6
  var FLUID = E.FLUID_LEVEL; // highly structured..very fluid => 0..4

  /* =====================  TUNING (modelled assumptions)  ==================== */
  var TUNING = {
    // Base expected shots per team per minute at "standard" mentality. Scaled
    // by all the factors below. ~90 * baseShotRate gives total shots ballpark.
    baseShotRate: 0.16,

    // Rule 7g: more attacking => more shots, more defensive => fewer shots.
    // Multiplier applied per step of effective mentality away from standard(3).
    shotsPerMentalityStep: 0.13,

    // Rule 7g: defensive play needs BETTER finishing to score (fewer, so each
    // must count). We model this as: base conversion, plus a bonus the more
    // defensive you are (you take higher-quality chances), but volume drops.
    baseConversion: 0.11,            // chance a given shot is a goal at standard
    defensiveFinishingBonus: 0.010,  // per step below standard
    attackingFinishingPenalty: 0.006,// per step above standard (rushed chances)

    // Attackers create, defenders deny. Net attacking edge per (yourAttackers -
    // oppDefenders) unit, folded into shot volume and quality.
    attackerEdge: 0.06,
    defenderSuppression: 0.05,

    // Rule 5: strong-vs-weak spot matchup. If my horizontal strong spot lines
    // up against your horizontal weak spot, my attack is amplified.
    spotMatchupBonus: 0.10,

    // Rule 7a: attacking/overload mentality weakens your own defence.
    attackingDefenceLeak: 0.10,

    // Rule 7d: mirror match. Aggressive favours home, defensive favours away.
    mirrorHomeAggressive: 0.08,
    mirrorAwayDefensive: 0.08,

    // Rule 7e: bad weather favours a more aggressive mentality (teams below
    // 'control' get a small penalty; aggressive teams unaffected/bonus).
    weatherAggressionBonus: 0.06,

    // Rule 7h: fluid + defensive => better form (small all-round lift).
    formBonus: 0.05,

    // Rule 7c: structured/highly structured => worse decisions (small quality
    // hit to conversion).
    structuredDecisionPenalty: 0.010,

    // Rule 7b: mentality higher than fluidity => cards/injuries. Per-minute
    // probability of a disciplinary/injury event when the condition holds, and
    // the temporary output penalty a card/injury imposes.
    cardBaseChancePerMin: 0.006,
    cardOutputPenalty: 0.12,

    // Home advantage baseline (even when not a mirror match) — small, standard
    // football modelling assumption.
    homeAdvantage: 0.04
  };
  /* ========================================================================= */

  // Effective mentality at a given minute: blend chosen mentality with rule 6
  // phase mentality. We average their numeric levels and round.
  function effectiveMentalityLevel(chosenMentality, minute) {
    var chosen = MENT[chosenMentality];
    var phase = MENT[E.mentalityForMinute(minute)];
    // Weight: 60% manager choice, 40% rule-6 phase (assumption; keeps the
    // manager's intent dominant while honouring rule 6's time effect).
    return chosen * 0.6 + phase * 0.4;
  }

  function levelToName(lvl) {
    var names = ['contain','defensive','counter','standard','control','attacking','overload'];
    var i = Math.max(0, Math.min(6, Math.round(lvl)));
    return names[i];
  }

  // Horizontal spot matchup: does my strong spot attack your weak spot?
  var HSPOT_INDEX = { 'left': 0, 'central left': 1, 'centre': 2, 'central right': 3, 'right': 4 };
  function spotMatchup(myStrongH, oppWeakH) {
    // Closer alignment (same side) = bigger amplification.
    var a = HSPOT_INDEX[myStrongH], b = HSPOT_INDEX[oppWeakH];
    if (a == null || b == null) return 0;
    var dist = Math.abs(a - b);       // 0..4
    return (2 - dist) / 2;            // +1 aligned, 0 at 2 apart, -1 opposite
  }

  // Build a static per-team profile from its analysis (shape + spots).
  function profile(team, analysis) {
    return {
      chosenMentality: team.mentality,
      fluidity: team.fluidity,
      home: !!team.home,
      attackers: analysis.attackerCount,
      defenders: analysis.defenderCount,
      spot: analysis.spot,
      mentLvl: MENT[team.mentality],
      fluidLvl: FLUID[team.fluidity]
    };
  }

  // Compute one team's expected goals contribution for a single minute against
  // the opponent. Returns { xShot, conversion } for that minute.
  function minuteOutput(att, def, minute, opts, state) {
    var eLvl = effectiveMentalityLevel(att.chosenMentality, minute);
    var stepFromStandard = eLvl - 3; // >0 attacking, <0 defensive

    // ---- shot volume ----
    var shots = TUNING.baseShotRate;
    // Rule 7g: attacking increases volume, defensive reduces it.
    shots *= (1 + stepFromStandard * TUNING.shotsPerMentalityStep);
    // Shape: my attackers vs your defenders.
    shots *= (1 + (att.attackers) * TUNING.attackerEdge
                 - (def.defenders) * TUNING.defenderSuppression);
    // Rule 5: strong spot vs opponent weak spot.
    shots *= (1 + spotMatchup(att.spot.horizontalStrong, def.spot.horizontalWeak) * TUNING.spotMatchupBonus);
    // Rule 7a: opponent attacking leaks defence -> more shots for me.
    if (def.mentLvl >= MENT.attacking) shots *= (1 + TUNING.attackingDefenceLeak);
    // Rule 7e: bad weather favours aggression; passive teams create less.
    if (opts.badWeather && eLvl < MENT.control) shots *= (1 - TUNING.weatherAggressionBonus);
    if (opts.badWeather && eLvl >= MENT.control) shots *= (1 + TUNING.weatherAggressionBonus * 0.5);
    // Rule 7h: fluid + defensive => better form.
    if (att.fluidLvl >= FLUID['fluid'] && att.mentLvl <= MENT.counter) shots *= (1 + TUNING.formBonus);
    // Home advantage + rule 7d mirror.
    if (att.home) shots *= (1 + TUNING.homeAdvantage);
    if (opts.mirror) {
      if (att.home && att.mentLvl >= MENT.control) shots *= (1 + TUNING.mirrorHomeAggressive);
      if (!att.home && att.mentLvl <= MENT.counter) shots *= (1 + TUNING.mirrorAwayDefensive);
    }
    // Card/injury temporary penalty.
    if (state.penaltyMinutes[att.home ? 'A' : 'B'] > 0) shots *= (1 - TUNING.cardOutputPenalty);
    if (shots < 0) shots = 0;
    // Realism clamp: no single minute should exceed ~0.30 shot probability, so
    // stacked aggressive modifiers can't produce absurd shot counts.
    if (shots > 0.30) shots = 0.30;

    // ---- conversion (chance quality/finishing) ----
    var conv = TUNING.baseConversion;
    // Rule 7g: defensive => better finishing needed & taken (higher per-shot),
    // attacking => rushed (lower per-shot).
    if (stepFromStandard < 0) conv += (-stepFromStandard) * TUNING.defensiveFinishingBonus;
    else conv -= stepFromStandard * TUNING.attackingFinishingPenalty;
    // Rule 7c: structured => worse decisions.
    if (att.fluidLvl <= FLUID['structured']) conv -= TUNING.structuredDecisionPenalty;
    // Shape edge also lifts quality a little.
    conv += (att.attackers - def.defenders) * 0.004;
    // Realism clamp: per-shot conversion stays in a believable band.
    if (conv < 0.03) conv = 0.03;
    if (conv > 0.20) conv = 0.20;

    return { shots: shots, conversion: conv, effLvl: eLvl };
  }

  // ---- Match object ----------------------------------------------------------
  function create(teamA, teamB, analA, analB, opts) {
    opts = opts || {};
    var mirror = E.isSame(teamA, teamB);
    var runOpts = { badWeather: !!opts.badWeather, mirror: mirror };
    var seed = (opts.seed != null) ? opts.seed : (Math.random() * 1e9) | 0;

    var pA = profile(teamA, analA);
    var pB = profile(teamB, analB);

    var state;
    function reset() {
      state = {
        minute: 0,
        score: { A: 0, B: 0 },
        shots: { A: 0, B: 0 },
        cards: { A: 0, B: 0 },
        injuries: { A: 0, B: 0 },
        penaltyMinutes: { A: 0, B: 0 }, // remaining minutes of output penalty
        events: [],
        finished: false,
        rng: makeRng(seed)
      };
    }
    reset();

    function rollCards(side, team) {
      // Rule 7b: mentality higher than fluidity => cards/injuries.
      var mLvl = MENT[team.mentality];
      var fNorm = (FLUID[team.fluidity] / 4) * 6;
      if (mLvl <= fNorm) return;
      if (state.rng() < TUNING.cardBaseChancePerMin) {
        // 65% card, 35% injury (assumption).
        var injury = state.rng() < 0.35;
        state.penaltyMinutes[side] = 6; // ~6 min of reduced output (assumption)
        if (injury) {
          state.injuries[side]++;
          state.events.push({ minute: state.minute, side: side, type: 'injury',
            text: 'Injury for Team ' + side + ' (mentality exceeds fluidity — rule 7b)' });
        } else {
          state.cards[side]++;
          state.events.push({ minute: state.minute, side: side, type: 'card',
            text: 'Booking for Team ' + side + ' (mentality exceeds fluidity — rule 7b)' });
        }
      }
    }

    function attackHalf(side, att, def, team) {
      var o = minuteOutput(att, def, state.minute, runOpts, state);
      // Number of shots this minute ~ Poisson-ish via the fractional rate.
      if (state.rng() < o.shots) {
        state.shots[side]++;
        var isGoal = state.rng() < o.conversion;
        if (isGoal) {
          state.score[side]++;
          state.events.push({ minute: state.minute, side: side, type: 'goal',
            text: 'GOAL — Team ' + side + ' (' + levelToName(o.effLvl) + ' phase)' });
        } else {
          state.events.push({ minute: state.minute, side: side, type: 'shot',
            text: 'Shot for Team ' + side });
        }
      }
    }

    function stepMinute() {
      if (state.finished) return snapshot();
      var before = state.events.length;
      state.minute++;

      // Decrement active penalties.
      ['A', 'B'].forEach(function (s) {
        if (state.penaltyMinutes[s] > 0) state.penaltyMinutes[s]--;
      });

      // Discipline rolls.
      rollCards('A', teamA);
      rollCards('B', teamB);

      // Each team attacks.
      attackHalf('A', pA, pB, teamA);
      attackHalf('B', pB, pA, teamB);

      if (state.minute >= 90) {
        state.finished = true;
        state.events.push({ minute: 90, side: null, type: 'ft',
          text: 'Full time: Team A ' + state.score.A + ' – ' + state.score.B + ' Team B' });
      }
      // Stash exactly the events produced this minute so a visualizer can
      // choreograph them without diffing the whole list.
      state.newEvents = state.events.slice(before);
      return snapshot();
    }

    function currentEffective() {
      return {
        A: levelToName(effectiveMentalityLevel(teamA.mentality, Math.max(1, state.minute))),
        B: levelToName(effectiveMentalityLevel(teamB.mentality, Math.max(1, state.minute)))
      };
    }

    function snapshot() {
      return {
        minute: state.minute,
        score: { A: state.score.A, B: state.score.B },
        shots: { A: state.shots.A, B: state.shots.B },
        cards: { A: state.cards.A, B: state.cards.B },
        injuries: { A: state.injuries.A, B: state.injuries.B },
        finished: state.finished,
        effective: currentEffective(),
        lastEvents: state.events.slice(-40),
        newEvents: (state.newEvents || []).slice(),
        seed: seed,
        mirror: mirror
      };
    }

    function runToEnd() {
      while (!state.finished) stepMinute();
      return snapshot();
    }

    return {
      stepMinute: stepMinute,
      runToEnd: runToEnd,
      reset: reset,
      snapshot: snapshot,
      seed: seed
    };
  }

  global.MATCH = { create: create, TUNING: TUNING, _makeRng: makeRng,
    _effectiveMentalityLevel: effectiveMentalityLevel };
})(window);
