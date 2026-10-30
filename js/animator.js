/* ============================================================================
 * animator.js
 * ----------------------------------------------------------------------------
 * FM-style animated 2D match visualizer.
 *
 * DESIGN:
 *   - js/match.js is the AUTHORITATIVE, seeded, guide-based result engine. It
 *     decides shots/goals/cards per minute. This animator is a *visualizer*
 *     that plays those events out with moving players, a ball, and set pieces,
 *     so what you see always agrees with the scoreline.
 *   - Coordinates are normalized: x in [0,1] along the length (x=0 = Team A's
 *     own goal, x=1 = Team B's own goal); y in [0,1] across the width.
 *     Team A attacks +x (right), Team B attacks -x (left).
 *   - A lightweight phase state machine handles open play, shots, and set
 *     pieces (kickoff, throw-in, corner, goal kick, half-time, full-time).
 *
 * WHAT IS MODELLED (presentation only): moment-to-moment player movement, ball
 * passing/carrying, pressing, and set-piece choreography. None of it changes
 * the scoreline — goals come only from the sim's events.
 * ==========================================================================*/

(function (global) {
  'use strict';

  var E = global.ENGINE;

  // Resting depth per band (fraction of own half -> forward). For Team A this
  // is measured from x=0 (their goal) toward x=1.
  var BAND_DEPTH = { GK: 0.05, D: 0.22, DM: 0.34, M: 0.48, AM: 0.64, ST: 0.78 };
  var LANE_Y = { L: 0.16, CL: 0.34, C: 0.5, CR: 0.66, R: 0.84 };
  var MENT_PUSH = {
    contain: -0.10, defensive: -0.06, counter: -0.02,
    standard: 0.0, control: 0.05, attacking: 0.10, overload: 0.15
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  // Build base (formation) targets for one team in normalized coords.
  // side: 'A' attacks +x, 'B' attacks -x.
  function baseTargets(team, side) {
    return team.players.map(function (p) {
      var depth = BAND_DEPTH[p.band] != null ? BAND_DEPTH[p.band] : 0.5;   // 0..1 forwardness
      var laneY = LANE_Y[p.lane] != null ? LANE_Y[p.lane] : 0.5;
      // Strikers are central by nature: compress the ST band toward the middle
      // so "narrow" fronts (e.g. three central STs) don't hug the touchline.
      if (p.band === 'ST') laneY = 0.5 + (laneY - 0.5) * 0.42;
      // Map forwardness to x based on side.
      var x = side === 'A' ? depth : (1 - depth);
      var y = side === 'A' ? laneY : (1 - laneY);
      return { pos: p.pos, role: p.role, duty: p.duty, band: p.band, bx: x, by: y };
    });
  }

  function create(canvas, teamA, teamB, analA, analB, sim, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    // Logical coordinate space (independent of physical resolution).
    var LOGICAL_W = 900, LOGICAL_H = 600;
    var W = LOGICAL_W, H = LOGICAL_H, M = 28;   // pitch margin px (logical)
    var pw = W - 2 * M, ph = H - 2 * M;

    // Scale the backing store to device pixels so everything stays crisp.
    function setupHiDPI() {
      var rect = canvas.getBoundingClientRect();
      var cssW = rect.width || LOGICAL_W, cssH = rect.height || LOGICAL_H;
      var dpr = global.devicePixelRatio || 1;
      var needW = Math.round(cssW * dpr), needH = Math.round(cssH * dpr);
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW; canvas.height = needH;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(canvas.width / LOGICAL_W, canvas.height / LOGICAL_H);
    }
    setupHiDPI();

    // Normalized -> pixels. x length axis, y width axis.
    function px(nx) { return M + nx * pw; }
    function py(ny) { return M + ny * ph; }

    var baseA = baseTargets(teamA, 'A');
    var baseB = baseTargets(teamB, 'B');

    // Player runtime objects.
    function mkPlayers(base, side) {
      return base.map(function (b, i) {
        return {
          side: side, idx: i, pos: b.pos, role: b.role, duty: b.duty, band: b.band,
          bx: b.bx, by: b.by,          // formation anchor
          x: b.bx, y: b.by,            // current
          tx: b.bx, ty: b.by           // target this frame
        };
      });
    }
    var players = { A: mkPlayers(baseA, 'A'), B: mkPlayers(baseB, 'B') };

    // Ball + match phase.
    var ball = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, moving: false, speed: 0, trail: [] };
    var possession = 'A';
    var carrier = null;                // player object in possession
    var phase = 'kickoff';             // kickoff|open|shot|throwin|corner|goalkick|halftime|fulltime
    var phaseTimer = 0;                // seconds remaining in a scripted phase
    var effA = teamA.mentality;
    var effB = teamB.mentality;

    // Sim clock. We advance simMinute over real time; when it ticks we pull the
    // sim's authoritative events for that minute and choreograph them.
    var simMinute = 0;
    var minuteAccumulator = 0;         // real seconds accrued toward next minute
    var secondsPerMinute = opts.secondsPerMinute || 1.2;  // set by speed control
    var finished = false;
    var pendingGoalSide = null;        // set when a goal must be shown then kicked off
    var lastSnap = sim.snapshot();

    var listeners = { event: [], score: [], end: [] };
    function emit(kind, payload) { (listeners[kind] || []).forEach(function (f) { f(payload); }); }
    function on(kind, fn) { if (listeners[kind]) listeners[kind].push(fn); }

    // ---- helpers to find players -------------------------------------------
    function goalX(side) { return side === 'A' ? 1 : 0; }      // attacking target goal
    function ownGoalX(side) { return side === 'A' ? 0 : 1; }
    function other(side) { return side === 'A' ? 'B' : 'A'; }

    function nearestToBall(side) {
      var best = null, bd = 1e9;
      players[side].forEach(function (p) {
        if (p.pos === 'GK') return;
        var d = dist(p.x, p.y, ball.x, ball.y);
        if (d < bd) { bd = d; best = p; }
      });
      return best;
    }
    function furthestForward(side) {
      var best = null, bx = -1;
      players[side].forEach(function (p) {
        var fwd = side === 'A' ? p.x : (1 - p.x);
        if (fwd > bx) { bx = fwd; best = p; }
      });
      return best;
    }

    function pushFor(side) {
      var name = side === 'A' ? effA : effB;
      return MENT_PUSH[name] != null ? MENT_PUSH[name] : 0;
    }

    // Assign each player a target for this frame based on possession + ball.
    // Key goals: keep the team's WIDTH (players hold their lane) so play can go
    // out wide; only the carrier and the nearest presser truly chase the ball.
    function computeTargets(dt) {
      ['A', 'B'].forEach(function (side) {
        var attacking = (side === possession);
        var push = pushFor(side) * (attacking ? 1 : 0.6);
        var presser = nearestToBall(other(possession)); // used by defending side
        players[side].forEach(function (p) {
          if (p.pos === 'GK') {
            p.tx = ownGoalX(side) + (side === 'A' ? 0.03 : -0.03);
            p.ty = clamp(lerp(0.5, ball.y, 0.30), 0.34, 0.66);
            return;
          }
          // Base anchor shifted by mentality push (toward attacking goal).
          var ax = p.bx + (side === 'A' ? push : -push);
          var ay = p.by;   // hold your lane by default -> preserves width

          if (p === carrier) {
            // Carrier is at the ball.
            ax = ball.x; ay = ball.y;
          } else if (!attacking && p === presser) {
            // Only the designated presser closes the ball down.
            ax = ball.x; ay = ball.y;
          } else {
            // Off-ball: drift only slightly toward the ball's third for shape,
            // but KEEP your lane so wings stay wide. Wide players hold width.
            var isWide = (p.by < 0.28 || p.by > 0.72);
            var lateralPull = attacking
              ? (isWide ? 0.02 : 0.08)     // wide players keep width
              : (isWide ? 0.06 : 0.14);    // defenders tuck in a bit more
            ay = lerp(ay, ball.y, lateralPull);
            // Attackers make forward runs relative to ball advancement.
            if (attacking) {
              var ballFwd = side === 'A' ? ball.x : (1 - ball.x);
              var mine = side === 'A' ? ax : (1 - ax);
              if (p.band === 'ST' || p.band === 'AM') {
                mine = Math.max(mine, ballFwd + 0.08);
              } else if (p.band === 'M' || p.band === 'DM') {
                mine = Math.max(mine, ballFwd - 0.06);
              }
              ax = side === 'A' ? mine : (1 - mine);
            }
          }
          p.tx = clamp(ax, 0.02, 0.98);
          p.ty = clamp(ay, 0.05, 0.95);
        });
      });
    }

    function movePlayers(dt) {
      var speed = 0.55; // normalized units/sec baseline
      ['A', 'B'].forEach(function (side) {
        players[side].forEach(function (p) {
          var dx = p.tx - p.x, dy = p.ty - p.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          var step = speed * dt;
          if (d <= step || d < 1e-4) { p.x = p.tx; p.y = p.ty; }
          else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
        });
      });
    }

    // ---- ball movement ------------------------------------------------------
    function kickBall(tx, ty, speed) {
      ball.tx = clamp(tx, -0.05, 1.05);
      ball.ty = clamp(ty, -0.05, 1.05);
      ball.speed = speed;
      ball.moving = true;
    }
    function moveBall(dt) {
      if (carrier && !ball.moving) {
        // Ball travels with carrier.
        ball.x = carrier.x; ball.y = carrier.y;
        return;
      }
      if (!ball.moving) return;
      var dx = ball.tx - ball.x, dy = ball.ty - ball.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var step = ball.speed * dt;
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 14) ball.trail.shift();
      if (d <= step || d < 1e-4) { ball.x = ball.tx; ball.y = ball.ty; ball.moving = false; }
      else { ball.x += (dx / d) * step; ball.y += (dy / d) * step; }
    }

    // ---- open-play behaviour: pass toward goal or dribble -------------------
    var actionTimer = 0;
    function openPlayTick(dt) {
      if (phase !== 'open') return;
      if (ball.moving) return;

      // Ensure a carrier from the team in possession.
      if (!carrier || carrier.side !== possession) {
        carrier = nearestToBall(possession) || players[possession][5];
        ball.x = carrier.x; ball.y = carrier.y;
      }

      actionTimer -= dt;
      if (actionTimer > 0) return;
      actionTimer = 0.45 + Math.random() * 0.6;   // decide again periodically

      // Pressed? If a defender is very close, maybe lose possession.
      var presser = nearestToBall(other(possession));
      if (presser && dist(presser.x, presser.y, ball.x, ball.y) < 0.045) {
        if (Math.random() < 0.45) { turnover(); return; }
      }

      function fwd(p) { return possession === 'A' ? p.x : (1 - p.x); }
      var mates = players[possession].filter(function (p) { return p !== carrier && p.pos !== 'GK'; });
      var carrierFwd = fwd(carrier);
      var carrierWide = (carrier.by < 0.28 || carrier.by > 0.72);

      // Score each mate as a pass option. Reward: progress toward goal, being
      // open (space from nearest opponent), and — crucially — using the WINGS.
      var scored = mates.map(function (p) {
        var progress = fwd(p) - carrierFwd;             // + = ahead of ball
        var opp = nearestOpp(p);
        var space = opp ? dist(p.x, p.y, opp.x, opp.y) : 0.3;
        var wide = (p.by < 0.28 || p.by > 0.72) ? 1 : 0;
        // Switch of play: reward a big lateral change now and then.
        var lateral = Math.abs(p.y - carrier.y);
        var s = progress * 1.4 + space * 1.2
              + wide * 0.35                              // bias toward wingers
              + (carrierWide ? 0 : lateral * 0.5)        // switch out to a wing
              + Math.random() * 0.5;                     // variety
        return { p: p, s: s, progress: progress };
      }).sort(function (a, b) { return b.s - a.s; });

      var choice = scored[0];
      var target = choice ? choice.p : carrier;

      // Shoot only when close AND fairly central (realistic shot locations).
      var central = Math.abs(carrier.y - 0.5) < 0.18;
      if (carrierFwd > 0.80 && central && Math.random() < 0.25) {
        shootAtGoal();
        return;
      }

      // Occasionally the carrier drives forward a step instead of passing.
      if (choice && choice.progress < 0.02 && Math.random() < 0.35) {
        var nx = possession === 'A' ? Math.min(0.96, carrier.x + 0.10)
                                    : Math.max(0.04, carrier.x - 0.10);
        pendingReceiver = carrier;
        kickBall(nx, carrier.y + (Math.random() - 0.5) * 0.06, 0.8);
        carrier = null;
        return;
      }

      // Pass to the chosen target.
      carrier = null;
      var passSpeed = 0.9 + Math.random() * 0.5;
      kickBall(target.x, target.y, passSpeed);
      pendingReceiver = target;
    }

    function nearestOpp(p) {
      var opp = other(p.side || possession);
      var best = null, bd = 1e9;
      players[opp].forEach(function (o) {
        var d = dist(p.x, p.y, o.x, o.y);
        if (d < bd) { bd = d; best = o; }
      });
      return best;
    }

    var pendingReceiver = null;
    function onBallArrive() {
      if (pendingReceiver) {
        carrier = pendingReceiver; pendingReceiver = null;
        ball.x = carrier.x; ball.y = carrier.y;
      }
    }

    function turnover() {
      possession = other(possession);
      carrier = nearestToBall(possession);
      if (carrier) { ball.x = carrier.x; ball.y = carrier.y; }
      ball.moving = false;
    }

    // ---- shooting (visual) --------------------------------------------------
    // The RESULT of any shot (goal/miss) is decided by the sim's events, not
    // here. This just animates a shot toward goal, then set-piece resolves.
    var shotResolver = null;
    function shootAtGoal(forcedResult) {
      phase = 'shot';
      var gx = goalX(possession);
      var gy = 0.5 + (Math.random() - 0.5) * 0.16;
      carrier = null;
      kickBall(gx, gy, 1.8);
      shotResolver = forcedResult || null;
    }

    // ---- set pieces ---------------------------------------------------------
    function beginKickoff(byside) {
      phase = 'kickoff'; phaseTimer = 0.8;
      ball.x = 0.5; ball.y = 0.5; ball.moving = false; ball.trail = [];
      possession = byside;
      // Reset to formation anchors.
      ['A', 'B'].forEach(function (s) {
        players[s].forEach(function (p) {
          p.x = p.bx + (s === 'A' ? pushFor(s) : -pushFor(s)) * 0.3;
          p.y = p.by;
        });
      });
      carrier = nearestToBall(byside);
    }

    function beginThrowIn(side, atY) {
      phase = 'throwin'; phaseTimer = 0.9;
      possession = side;
      ball.moving = false;
      ball.x = clamp(ball.x, 0.08, 0.92);
      ball.y = atY < 0.5 ? 0.01 : 0.99;   // ball on the touchline
      carrier = nearestToBall(side);
      if (carrier) { carrier.x = ball.x; carrier.y = ball.y; }
    }

    function beginCorner(side) {
      phase = 'corner'; phaseTimer = 1.0;
      possession = side;
      var gx = goalX(side);
      ball.x = gx; ball.y = Math.random() < 0.5 ? 0.02 : 0.98;
      ball.moving = false;
      // Pack the box.
      players[side].forEach(function (p, i) {
        if (p.pos === 'GK') return;
        p.tx = lerp(gx, side === 'A' ? 0.86 : 0.14, 0.3);
        p.ty = 0.35 + (i % 5) * 0.075;
      });
      carrier = null;
    }

    function beginGoalKick(side) {
      phase = 'goalkick'; phaseTimer = 0.9;
      possession = side;
      var gk = players[side].filter(function (p) { return p.pos === 'GK'; })[0];
      ball.x = ownGoalX(side) + (side === 'A' ? 0.06 : -0.06);
      ball.y = 0.5; ball.moving = false;
      carrier = gk;
    }

    // Resolve a scripted phase after its timer, returning to open play.
    function resolvePhase() {
      if (phase === 'kickoff' || phase === 'throwin' || phase === 'goalkick') {
        phase = 'open';
        // Play a first pass forward.
        if (carrier) {
          var mate = furthestForward(possession);
          carrier2pass(mate);
        }
      } else if (phase === 'corner') {
        phase = 'shot';
        // Cross/shot into the mouth; result decided by sim (usually a miss).
        var gx = goalX(possession);
        kickBall(gx, 0.5, 1.4);
        shotResolver = pendingCornerResult; pendingCornerResult = null;
      }
    }
    function carrier2pass(mate) {
      if (!carrier || !mate) return;
      carrier = null; pendingReceiver = mate;
      kickBall(mate.x, mate.y, 1.0);
    }

    // ---- shot outcome: called when a shot's ball reaches the goal ----------
    var pendingCornerResult = null;
    function onShotArrive() {
      var result = shotResolver; shotResolver = null;
      var scoringSide = possession;
      if (result === 'goal') {
        emit('event', { type: 'goal', side: scoringSide });
        emit('score', null);
        // Flash handled in draw via goalFlash.
        goalFlash = 0.8;
        beginKickoff(other(scoringSide));   // conceding team kicks off
      } else {
        // Miss/save -> becomes a goal kick or corner.
        if (Math.random() < 0.35) { pendingCornerResult = null; beginCorner(scoringSide); }
        else beginGoalKick(other(scoringSide));
      }
    }

    // ---- authoritative event intake ----------------------------------------
    // Called each time the sim minute advances; schedules visuals.
    var eventQueue = [];
    function ingest(snap) {
      (snap.newEvents || []).forEach(function (ev) {
        if (ev.type === 'goal' || ev.type === 'shot') {
          eventQueue.push(ev);
        } else if (ev.type === 'card' || ev.type === 'injury') {
          emit('event', ev);
        } else if (ev.type === 'ft') {
          emit('event', ev);
        }
      });
    }

    // If idle in open play and an authoritative shot/goal is queued, stage it.
    function maybeStageQueued() {
      if (phase !== 'open' || ball.moving) return;
      if (!eventQueue.length) return;
      var ev = eventQueue.shift();
      possession = ev.side;
      // Move ball to an attacking area then shoot with the known result.
      var adv = ev.side === 'A' ? 0.78 : 0.22;
      carrier = nearestToBall(ev.side) || players[ev.side][9];
      if (carrier) { carrier.x = adv; ball.x = adv; ball.y = clamp(0.5 + (Math.random()-0.5)*0.3, 0.2, 0.8); }
      shootAtGoal(ev.type === 'goal' ? 'goal' : 'miss');
    }

    // ---- out-of-play detection (open play only) -----------------------------
    function checkBounds() {
      if (phase !== 'open') return;
      // Touchlines (y).
      if (ball.y <= 0.005 || ball.y >= 0.995) {
        // Throw-in to the team NOT last in possession.
        beginThrowIn(other(possession), ball.y);
        return;
      }
      // Goal lines (x) without a goal event -> corner or goal kick.
      if (ball.x <= 0.005) {
        // Went out at Team A's goal line. If B attacking -> corner to B.
        if (possession === 'B') beginCorner('B'); else beginGoalKick('A');
      } else if (ball.x >= 0.995) {
        if (possession === 'A') beginCorner('A'); else beginGoalKick('B');
      }
    }

    // ---- main tick ----------------------------------------------------------
    var goalFlash = 0;
    function tick(dt) {
      if (finished) { draw(); return; }

      // Advance authoritative sim clock.
      minuteAccumulator += dt;
      while (minuteAccumulator >= secondsPerMinute && !finished) {
        minuteAccumulator -= secondsPerMinute;
        lastSnap = sim.stepMinute();
        simMinute = lastSnap.minute;
        effA = lastSnap.effective.A; effB = lastSnap.effective.B;
        ingest(lastSnap);
        if (simMinute === 45 && phase === 'open') { /* brief halftime cue */ halftimeCue = 1.2; }
        if (lastSnap.finished) { finished = true; phase = 'fulltime'; emit('end', lastSnap); }
      }

      // Ball arrival callbacks.
      var wasMoving = ball.moving;
      moveBall(dt);
      if (wasMoving && !ball.moving) {
        if (phase === 'shot') onShotArrive();
        else onBallArrive();
      }

      // Phase logic.
      if (phaseTimer > 0) {
        phaseTimer -= dt;
        if (phaseTimer <= 0) resolvePhase();
      } else {
        openPlayTick(dt);
        maybeStageQueued();
        checkBounds();
      }

      computeTargets(dt);
      movePlayers(dt);

      if (goalFlash > 0) goalFlash -= dt;
      if (halftimeCue > 0) halftimeCue -= dt;

      draw();
    }

    // ---- drawing ------------------------------------------------------------
    var halftimeCue = 0;
    function drawPitch() {
      ctx.fillStyle = '#14532d';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      var stripes = 14;
      for (var i = 0; i < stripes; i += 2)
        ctx.fillRect(M + (i / stripes) * pw, M, pw / stripes, ph);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
      ctx.strokeRect(M, M, pw, ph);
      ctx.beginPath(); ctx.moveTo(W / 2, M); ctx.lineTo(W / 2, H - M); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.min(pw, ph) * 0.10, 0, 7); ctx.stroke();
      var boxW = pw * 0.10, boxH = ph * 0.55;
      ctx.strokeRect(M, H / 2 - boxH / 2, boxW, boxH);
      ctx.strokeRect(W - M - boxW, H / 2 - boxH / 2, boxW, boxH);
      // goals
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeRect(M - 5, H / 2 - ph * 0.09, 5, ph * 0.18);
      ctx.strokeRect(W - M, H / 2 - ph * 0.09, 5, ph * 0.18);
    }

    function drawPlayer(p, color) {
      var x = px(p.x), y = py(p.y), r = 11;
      ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.pos, x, y);
    }

    function draw() {
      drawPitch();
      // ball trail
      for (var i = 0; i < ball.trail.length; i++) {
        var t = ball.trail[i];
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,' + (i / ball.trail.length * 0.3) + ')';
        ctx.arc(px(t.x), py(t.y), 3, 0, 7); ctx.fill();
      }
      players.A.forEach(function (p) { drawPlayer(p, '#3b82f6'); });
      players.B.forEach(function (p) { drawPlayer(p, '#ef4444'); });
      // ball
      ctx.beginPath(); ctx.fillStyle = '#fff';
      ctx.arc(px(ball.x), py(ball.y), 5, 0, 7); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = '#111'; ctx.stroke();

      if (goalFlash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (goalFlash * 0.4) + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 34px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('GOAL!', W / 2, H / 2);
      }
      if (halftimeCue > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 26px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Half time', W / 2, H / 2);
      }
      // Labels
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 12px system-ui,sans-serif';
      ctx.textAlign = 'left'; ctx.fillText('Team A →', M + 4, 16);
      ctx.textAlign = 'right'; ctx.fillText('← Team B', W - M - 4, 16);
    }

    // ---- loop control -------------------------------------------------------
    var raf = null, last = 0, running = false;
    function frame(ts) {
      if (!running) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      tick(dt * (opts.timeScale || 1));
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; last = 0; beginKickoff('A'); raf = requestAnimationFrame(frame); }
    function resume() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
    function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }
    function setSpeed(secPerMin, timeScale) {
      secondsPerMinute = secPerMin;
      opts.timeScale = timeScale || 1;
    }
    function getMinute() { return simMinute; }
    function snap() { return lastSnap; }
    function drawStatic() { draw(); }

    return {
      start: start, pause: pause, resume: resume, setSpeed: setSpeed,
      getMinute: getMinute, snapshot: snap, on: on, drawStatic: drawStatic,
      isFinished: function () { return finished; }
    };
  }

  global.ANIMATOR = { create: create };
})(window);
