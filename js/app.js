/* ============================================================================
 * app.js
 * ----------------------------------------------------------------------------
 * UI wiring: builds the two team panels (formation / fluidity / mentality +
 * per-player role & duty), renders advisories, and drives the pitch canvas.
 * ==========================================================================*/

(function (global) {
  'use strict';

  // Surface any error on-page so failures are never silent.
  function showErr(msg) {
    var bar = document.getElementById('errbar');
    if (bar) { bar.style.display = 'block'; bar.textContent = 'Error: ' + msg; }
  }
  global.addEventListener('error', function (e) {
    showErr((e.message || 'unknown') + (e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''));
  });

  var F = global.FORMATIONS;
  var R = global.ROLES;
  var E = global.ENGINE;
  var PITCH = global.PITCH;
  var MATCH = global.MATCH;

  // Team state.
  function makeTeam(defaultFormation, home) {
    var slots = F.slotsOf(defaultFormation);
    return {
      formationName: defaultFormation,
      fluidity: 'flexible',
      mentality: 'standard',
      home: home,
      players: slots.map(function (s) {
        var rd = R.defaultRoleDuty(s.pos);
        return { pos: s.pos, lane: s.lane, band: s.band, role: rd.role, duty: rd.duty };
      })
    };
  }

  var teamA = makeTeam('4-4-2', true);
  var teamB = makeTeam('4-3-3', false);

  var options = { badWeather: false };

  // ---- DOM helpers -----------------------------------------------------------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function option(value, label, selected) {
    var o = el('option', { value: value });
    o.textContent = label || value;
    if (selected) o.selected = true;
    return o;
  }

  // ---- Build formation <select> with optgroups -------------------------------
  function buildFormationSelect(team, onChange) {
    var sel = el('select', { class: 'sel-formation' });
    F.grouped().forEach(function (group) {
      var og = el('optgroup', { label: group.label });
      group.formations.forEach(function (f) {
        og.appendChild(option(f.name, f.name, f.name === team.formationName));
      });
      sel.appendChild(og);
    });
    sel.addEventListener('change', function () {
      team.formationName = sel.value;
      var slots = F.slotsOf(team.formationName);
      team.players = slots.map(function (s) {
        var rd = R.defaultRoleDuty(s.pos);
        return { pos: s.pos, lane: s.lane, band: s.band, role: rd.role, duty: rd.duty };
      });
      onChange(true);
    });
    return sel;
  }

  function buildSimpleSelect(cls, values, current, onPick) {
    var sel = el('select', { class: cls });
    values.forEach(function (v) {
      sel.appendChild(option(v, capitalize(v), v === current));
    });
    sel.addEventListener('change', function () { onPick(sel.value); });
    return sel;
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- Per-player role & duty rows ------------------------------------------
  function buildPlayerRows(team, onChange) {
    var wrap = el('div', { class: 'player-rows' });
    team.players.forEach(function (p, idx) {
      var row = el('div', { class: 'player-row' });
      row.appendChild(el('span', { class: 'pos-badge', text: p.pos }));

      // Role select
      var roleSel = el('select', { class: 'sel-role' });
      var roleOpts = R.rolesForPos(p.pos);
      roleOpts.forEach(function (ro) {
        roleSel.appendChild(option(ro.role, ro.role, ro.role === p.role));
      });

      // Duty select (depends on role)
      var dutySel = el('select', { class: 'sel-duty' });
      function refreshDuties() {
        dutySel.innerHTML = '';
        var current = roleOpts.filter(function (ro) { return ro.role === p.role; })[0];
        var duties = current ? current.duties : ['Support'];
        if (duties.indexOf(p.duty) === -1) p.duty = duties[0];
        duties.forEach(function (d) {
          dutySel.appendChild(option(d, d, d === p.duty));
        });
      }
      refreshDuties();

      roleSel.addEventListener('change', function () {
        p.role = roleSel.value;
        refreshDuties();
        onChange(false);
      });
      dutySel.addEventListener('change', function () {
        p.duty = dutySel.value;
        onChange(false);
      });

      row.appendChild(roleSel);
      row.appendChild(dutySel);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // ---- Advisory / analysis panel --------------------------------------------
  function buildAnalysis(team, analysis) {
    var box = el('div', { class: 'analysis' });

    function line(label, value, cls) {
      var d = el('div', { class: 'aline ' + (cls || '') });
      d.appendChild(el('span', { class: 'alabel', text: label }));
      d.appendChild(el('span', { class: 'avalue', text: value }));
      return d;
    }

    var mb = analysis.midfieldBands || {};
    var bandList = []
      .concat(mb.hasDM ? ['DM'] : [])
      .concat(mb.hasMC ? ['MC'] : [])
      .concat(mb.hasAMC ? ['AMC'] : []);
    box.appendChild(line('Midfield triangle (DM/MC/AMC)',
      bandList.length ? bandList.join(' + ') : 'none'));
    box.appendChild(line('Defenders (SW/CB/FB/WB/DM)', String(analysis.defenderCount)));
    box.appendChild(line('Lines present / missing',
      analysis.linesPresent + ' / ' + analysis.linesMissing +
      ' (of ' + analysis.totalLines + ')'));
    box.appendChild(line('Rule 1 → mentality',
      analysis.recommendedMentality || '— (combination not in guide)'));
    box.appendChild(line('Rule 2 → fluidity',
      analysis.recommendedFluidity + ' (' + analysis.linesMissing + ' missing)'));
    box.appendChild(line('Fluidity means', analysis.fluidityMeaning || '—'));
    var sup = analysis.supportDutyRange;
    box.appendChild(line('Rule 4 → support duties',
      (sup.min === sup.max ? sup.min : sup.min + '-' + sup.max) +
      ' (you have ' + analysis.actualSupportDuties + ')'));
    box.appendChild(line('Strong spot',
      analysis.spot.horizontalStrong + ' / ' + analysis.spot.verticalStrong));
    box.appendChild(line('Weak spot',
      analysis.spot.horizontalWeak + ' / ' + analysis.spot.verticalWeak));

    // Striker-role guidance line (shows count + whether current picks match).
    if (analysis.strikerGuidance && analysis.strikerGuidance.count > 0) {
      var sg = analysis.strikerGuidance;
      box.appendChild(line('Strikers (' + sg.count + ')',
        sg.satisfied ? '✓ roles match' : '⚠ see advisory',
        sg.satisfied ? 'ok' : 'warnrow'));
    }

    if (analysis.advisories.length) {
      box.appendChild(el('div', { class: 'sub', text: 'Advisories' }));
      analysis.advisories.forEach(function (a) {
        box.appendChild(el('div', { class: 'advisory', text: a }));
      });
    }
    if (analysis.warnings.length) {
      box.appendChild(el('div', { class: 'sub', text: 'Warnings (rule 7)' }));
      analysis.warnings.forEach(function (w) {
        box.appendChild(el('div', { class: 'warn warn-' + w.level, text: w.text }));
      });
    }
    return box;
  }

  // ---- Mentality timeline (rule 6) ------------------------------------------
  function buildTimeline() {
    var box = el('div', { class: 'timeline' });
    box.appendChild(el('div', { class: 'sub', text: 'Rule 6 — mentality efficiency by minute' }));
    var strip = el('div', { class: 'tl-strip' });
    E.MENTALITY_TIMELINE.forEach(function (seg) {
      var cell = el('div', { class: 'tl-cell tl-' + seg.mentality });
      cell.appendChild(el('div', { class: 'tl-min', text: seg.from + '–' + seg.to + "'" }));
      cell.appendChild(el('div', { class: 'tl-ment', text: capitalize(seg.mentality) }));
      strip.appendChild(cell);
    });
    box.appendChild(strip);
    return box;
  }

  // ---- Panel builder ---------------------------------------------------------
  function buildPanel(containerId, team, label) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';

    var head = el('div', { class: 'panel-head' });
    head.appendChild(el('h2', { text: label }));
    container.appendChild(head);

    var controls = el('div', { class: 'controls' });

    var fRow = el('div', { class: 'ctrl-row' });
    fRow.appendChild(el('label', { text: 'Formation' }));
    fRow.appendChild(buildFormationSelect(team, refresh));
    controls.appendChild(fRow);

    var flRow = el('div', { class: 'ctrl-row' });
    flRow.appendChild(el('label', { text: 'Fluidity' }));
    flRow.appendChild(buildSimpleSelect('sel-fluidity', R.FLUIDITIES, team.fluidity,
      function (v) { team.fluidity = v; refresh(false); }));
    controls.appendChild(flRow);

    var mRow = el('div', { class: 'ctrl-row' });
    mRow.appendChild(el('label', { text: 'Mentality' }));
    mRow.appendChild(buildSimpleSelect('sel-mentality', R.MENTALITIES, team.mentality,
      function (v) { team.mentality = v; refresh(false); }));
    controls.appendChild(mRow);

    container.appendChild(controls);

    container.appendChild(el('div', { class: 'sub', text: 'Players — role & duty' }));
    container.appendChild(buildPlayerRows(team, refresh));

    // analysis placeholder (filled by refresh)
    var analysisHost = el('div', { class: 'analysis-host', id: containerId + '-analysis' });
    container.appendChild(analysisHost);
  }

  // ---- Full refresh ----------------------------------------------------------
  var canvas;

  function refresh(structuralChange) {
    if (structuralChange) {
      // Rebuild player rows (formation changed) — rebuild whole panels.
      buildPanel('panelA', teamA, 'Team A (home)');
      buildPanel('panelB', teamB, 'Team B (away)');
    }

    var sameOpp = E.isSame(teamA, teamB);
    var optsA = { sameAsOpponent: sameOpp, badWeather: options.badWeather };
    var optsB = { sameAsOpponent: sameOpp, badWeather: options.badWeather };

    var analA = E.analyseTeam(teamA, optsA);
    var analB = E.analyseTeam(teamB, optsB);

    // Fill analysis hosts.
    var hostA = document.getElementById('panelA-analysis');
    var hostB = document.getElementById('panelB-analysis');
    if (hostA) { hostA.innerHTML = ''; hostA.appendChild(buildAnalysis(teamA, analA)); }
    if (hostB) { hostB.innerHTML = ''; hostB.appendChild(buildAnalysis(teamB, analB)); }

    // Cache latest analyses for the match engine.
    lastAnalA = analA;
    lastAnalB = analB;

    // If tactics changed while a match exists (running, paused or finished),
    // tear it down so the next Play rebuilds from the new settings, and return
    // to the static tactical view.
    if (match.started || match.anim || match.sim) {
      if (match.anim) match.anim.pause();
      stopPoll();
      match.anim = null; match.sim = null; match.snap = null; match.started = false;
      var sc = document.getElementById('sb-score');
      if (sc) { sc.textContent = '0 – 0'; document.getElementById('sb-clock').textContent = "0'"; }
      var ms = document.getElementById('match-stats'); if (ms) ms.innerHTML = '';
      var fd = document.getElementById('feed'); if (fd) fd.innerHTML = '';
      var ea = document.getElementById('sb-eff-a'); if (ea) ea.textContent = teamA.mentality;
      var eb = document.getElementById('sb-eff-b'); if (eb) eb.textContent = teamB.mentality;
      setControls(false, false);
    }

    // Static tactical view (shown when no match is animating).
    var showResp = document.getElementById('toggleResp').checked;
    PITCH.render(canvas, teamA, analA, teamB, analB, showResp, null, null);
  }

  // ==========================================================================
  // Match simulation controls
  // ==========================================================================
  // match holds the animator + underlying sim + the latest snapshot painted.
  var match = { anim: null, sim: null, snap: null, poll: null, started: false };
  var lastAnalA = null, lastAnalB = null;

  // Speed selector value -> { secPerMin: sim-seconds per match-minute, timeScale }.
  // Lower secPerMin = faster match. Instant (0) skips animation entirely.
  function speedMap(v) {
    switch (v) {
      case 400: return { secPerMin: 2.4, timeScale: 1 };   // Slow
      case 150: return { secPerMin: 1.2, timeScale: 1 };   // Normal
      case 40:  return { secPerMin: 0.45, timeScale: 1 };  // Fast
      default:  return { secPerMin: 1.2, timeScale: 1 };
    }
  }

  function fmtEvent(ev) {
    var side = ev.side ? ('team-' + ev.side.toLowerCase()) : '';
    var cls = 'ev ev-' + ev.type + ' ' + side;
    return '<div class="' + cls + '"><span class="ev-min">' +
      (ev.minute ? ev.minute + "'" : '') + '</span> ' + ev.text + '</div>';
  }

  // Paint scoreboard/stats/feed from a sim snapshot (authoritative numbers).
  function paintSnap(s) {
    if (!s) return;
    document.getElementById('sb-score').textContent = s.score.A + ' – ' + s.score.B;
    document.getElementById('sb-clock').textContent = s.minute + "'";
    document.getElementById('sb-eff-a').textContent = s.effective.A;
    document.getElementById('sb-eff-b').textContent = s.effective.B;
    document.getElementById('match-stats').innerHTML =
      '<span>Shots ' + s.shots.A + '–' + s.shots.B + '</span>' +
      '<span>Cards ' + s.cards.A + '–' + s.cards.B + '</span>' +
      '<span>Injuries ' + s.injuries.A + '–' + s.injuries.B + '</span>' +
      (s.mirror ? '<span class="mirror">mirror match</span>' : '') +
      '<span class="seed">seed ' + s.seed + '</span>';
    document.getElementById('feed').innerHTML =
      s.lastEvents.slice().reverse().map(fmtEvent).join('');
  }

  function stopPoll() { if (match.poll) { clearInterval(match.poll); match.poll = null; } }

  function setControls(running, finished) {
    document.getElementById('btnPlay').disabled = running || finished;
    document.getElementById('btnPause').disabled = !running;
    document.getElementById('btnReset').disabled = !(running || finished || match.started);
  }

  function buildSim() {
    var seedInput = document.getElementById('matchSeed').value;
    var opts = { badWeather: options.badWeather };
    if (seedInput !== '') opts.seed = parseInt(seedInput, 10) >>> 0;
    return MATCH.create(teamA, teamB, lastAnalA, lastAnalB, opts);
  }

  function startMatch() {
    try {
      if (!MATCH || !global.ANIMATOR) { showErr('Match engine not loaded.'); return; }
      if (!lastAnalA || !lastAnalB) refresh(false);

      var v = parseInt(document.getElementById('matchSpeed').value, 10);

      // Instant: run the sim to the end, show final numbers, no animation.
      if (v === 0) {
        var simI = buildSim();
        var snap = simI.runToEnd();
        paintSnap(snap);
        match.sim = simI; match.snap = snap; match.started = true; match.anim = null;
        setControls(false, true);
        return;
      }

      // Resume an existing paused animation.
      if (match.anim && !match.anim.isFinished() && match.started) {
        match.anim.resume();
        startPoll();
        setControls(true, false);
        return;
      }

      // Fresh animated match.
      match.sim = buildSim();
      var sp = speedMap(v);
      match.anim = global.ANIMATOR.create(canvas, teamA, teamB, lastAnalA, lastAnalB,
        match.sim, { secondsPerMinute: sp.secPerMin, timeScale: sp.timeScale });
      match.anim.on('end', function (s) {
        match.snap = s; paintSnap(s); stopPoll(); setControls(false, true);
      });
      match.started = true;
      match.anim.start();
      startPoll();
      setControls(true, false);
    } catch (err) {
      showErr('startMatch: ' + (err && err.message ? err.message : err));
    }
  }

  // Poll the animator's authoritative snapshot to refresh the HUD.
  function startPoll() {
    stopPoll();
    match.poll = setInterval(function () {
      if (!match.anim) return;
      match.snap = match.anim.snapshot();
      paintSnap(match.snap);
    }, 120);
  }

  function pauseMatch() {
    if (match.anim) match.anim.pause();
    stopPoll();
    setControls(false, match.anim ? match.anim.isFinished() : false);
  }

  function resetMatch() {
    if (match.anim) match.anim.pause();
    stopPoll();
    match.anim = null; match.sim = null; match.snap = null; match.started = false;
    document.getElementById('sb-score').textContent = '0 – 0';
    document.getElementById('sb-clock').textContent = "0'";
    document.getElementById('sb-eff-a').textContent = teamA.mentality;
    document.getElementById('sb-eff-b').textContent = teamB.mentality;
    document.getElementById('match-stats').innerHTML = '';
    document.getElementById('feed').innerHTML = '';
    setControls(false, false);
    refresh(false);
  }

  // ---- Init ------------------------------------------------------------------
  function init() {
    canvas = document.getElementById('pitch');

    // Weather toggle & responsibility toggle.
    document.getElementById('toggleWeather').addEventListener('change', function (e) {
      options.badWeather = e.target.checked;
      refresh(false);
    });
    document.getElementById('toggleResp').addEventListener('change', function () {
      refresh(false);
    });

    // Match controls.
    document.getElementById('btnPlay').addEventListener('click', startMatch);
    document.getElementById('btnPause').addEventListener('click', pauseMatch);
    document.getElementById('btnReset').addEventListener('click', resetMatch);
    document.getElementById('matchSpeed').addEventListener('change', function () {
      // Apply the new speed live to a running/paused animation.
      var v = parseInt(document.getElementById('matchSpeed').value, 10);
      if (match.anim && v !== 0) {
        var sp = speedMap(v);
        match.anim.setSpeed(sp.secPerMin, sp.timeScale);
      }
    });

    // Re-render the static view on resize so HiDPI stays crisp. (During an
    // animated match the animator owns the canvas and re-scales itself.)
    var resizeTimer = null;
    global.addEventListener('resize', function () {
      if (match.anim) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { refresh(false); }, 150);
    });

    // Mentality timeline (shared, rule 6).
    document.getElementById('timeline').appendChild(buildTimeline());

    buildPanel('panelA', teamA, 'Team A (home)');
    buildPanel('panelB', teamB, 'Team B (away)');
    refresh(false);
  }

  global.addEventListener('DOMContentLoaded', init);
})(window);
