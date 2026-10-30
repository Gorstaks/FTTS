/* ============================================================================
 * formations.js
 * ----------------------------------------------------------------------------
 * Defines every realistic football formation as a set of position slots.
 *
 * A formation is 1 GK + 10 outfield players distributed across vertical bands.
 * Each slot has:
 *   - pos:  a position code (see POSITIONS in roles.js)
 *   - band: vertical band, one of GK, D, DM, M, AM, ST
 *   - lane: horizontal lane, one of L, CL, C, CR, R  (used for drawing & spot)
 *
 * Attacker count = number of W (AML/AMR) + AMC + ST slots (used by the match
 *   sim; guide rule 1 now keys off the DM/MC/AMC midfield triangle instead).
 * Defender count  (guide rule 2) = number of DC/DL/DR (CB/FB) + WB + DM slots.
 *
 * Formations are grouped so the UI can list common ones first, then group the
 * rest by number of defenders (3, 4, 5). `group` and `common` support that.
 * ==========================================================================*/

(function (global) {
  'use strict';

  // Helper to build a slot quickly.
  function S(pos, band, lane) {
    return { pos: pos, band: band, lane: lane };
  }

  // GK is implicit in every formation; we still list it as a slot.
  var GK = S('GK', 'GK', 'C');

  /* Each formation entry:
   *   name:    display label, e.g. "4-4-2"
   *   common:  true if it should appear in the "Common" group
   *   defs:    number of defenders (for grouping) - computed but stored for sort
   *   slots:   array of 10 outfield slots (GK added automatically)
   */
  var RAW = [
    // -------------------- COMMON --------------------
    {
      name: '4-4-2', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','CR'), S('MR','M','R'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      name: '4-4-1-1', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','CR'), S('MR','M','R'),
        S('AMC','AM','C'),
        S('ST','ST','C')
      ]
    },
    {
      // Standard 4-2-3-1: the double pivot are central midfielders (MC) sitting
      // deep, NOT dedicated defensive midfielders. Defenders (rule 2) = 4.
      name: '4-2-3-1', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('MC','M','CL'), S('MC','M','CR'),
        S('AML','AM','L'), S('AMC','AM','C'), S('AMR','AM','R'),
        S('ST','ST','C')
      ]
    },
    {
      // "Deep" variant: the double pivot are dedicated DMs. Since DM counts as a
      // defender (rule 2), this is a 6-DEFENDER shape (back 4 + 2 DM). This
      // matches the FM "4-2-3-1 DM" convention where the pivot sits in the DM
      // strata; here named "Deep" per the user's convention.
      name: '4-2-3-1 Deep', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('DM','DM','CL'), S('DM','DM','CR'),
        S('AML','AM','L'), S('AMC','AM','C'), S('AMR','AM','R'),
        S('ST','ST','C')
      ]
    },
    {
      name: '4-3-3', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('MC','M','L'), S('MC','M','C'), S('MC','M','R'),
        S('AML','AM','L'), S('ST','ST','C'), S('AMR','AM','R')
      ]
    },
    {
      // "Deep" 4-3-3: single pivot (DM) behind two central mids. DM counts as a
      // defender -> 5 defenders (back 4 + 1 DM).
      name: '4-3-3 Deep', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('DM','DM','C'), S('MC','M','CL'), S('MC','M','CR'),
        S('AML','AM','L'), S('ST','ST','C'), S('AMR','AM','R')
      ]
    },
    {
      name: '4-1-4-1', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('DM','DM','C'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','CR'), S('MR','M','R'),
        S('ST','ST','C')
      ]
    },
    {
      name: '4-2-4', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('MC','M','CL'), S('MC','M','CR'),
        S('AML','AM','L'), S('ST','ST','CL'), S('ST','ST','CR'), S('AMR','AM','R')
      ]
    },
    {
      // TRUE 3-5-2: three centre-backs and a midfield FIVE made of two wide
      // midfielders (ML/MR) + three central mids. No wing-backs/DM, so this is
      // a genuine 3-DEFENDER shape under the rules (defenders = CB/FB/WB/DM).
      name: '3-5-2', common: true,
      slots: [
        S('DC','D','L'), S('DC','D','C'), S('DC','D','R'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','C'), S('MC','M','CR'), S('MR','M','R'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      // TRUE 3-4-3: three centre-backs, a midfield four of two wide mids + two
      // central mids, and a front three. 3 defenders.
      name: '3-4-3', common: true,
      slots: [
        S('DC','D','L'), S('DC','D','C'), S('DC','D','R'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','CR'), S('MR','M','R'),
        S('AML','AM','L'), S('ST','ST','C'), S('AMR','AM','R')
      ]
    },
    {
      // Wing-back variant of the 3-5-2. Because WBs count as defenders, this is
      // really a 5-defender shape -> named honestly as 5-3-2 (WB).
      name: '5-3-2 (WB)', common: true,
      slots: [
        S('DC','D','L'), S('DC','D','C'), S('DC','D','R'),
        S('WBL','DM','L'), S('MC','M','CL'), S('MC','M','C'), S('MC','M','CR'), S('WBR','DM','R'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      // Flat-back-five 5-3-2: two full-backs in the back line + three CBs.
      name: '5-3-2', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','C'), S('DC','D','CR'), S('DR','D','R'),
        S('MC','M','CL'), S('MC','M','C'), S('MC','M','CR'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      // Narrow 4-3-3: three CENTRAL strikers (no wingers) + three central mids.
      // Attackers (rule 1) = 3 (all ST). Triggers 3-striker guidance.
      name: '4-3-3 Narrow', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('MC','M','L'), S('MC','M','C'), S('MC','M','R'),
        S('ST','ST','L'), S('ST','ST','C'), S('ST','ST','R')
      ]
    },
    {
      // 4-4-2 Diamond (a.k.a. 4-1-2-1-2): back four, a midfield DIAMOND of a DM
      // base + two central mids as the sides + an AMC at the tip, and two
      // strikers. DM counts as a defender -> 5 defenders.
      name: '4-4-2 Diamond', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('DM','DM','C'),
        S('MC','M','L'), S('MC','M','R'),
        S('AMC','AM','C'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      // 4-3-1-2: back four, flat midfield three, an AMC and two strikers. No DM,
      // so 4 defenders (contrast with the diamond, which bases on a DM).
      name: '4-3-1-2', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('MC','M','L'), S('MC','M','C'), S('MC','M','R'),
        S('AMC','AM','C'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      // 4-3-2-1 "Christmas tree": back four, midfield three, two AMCs, lone ST.
      name: '4-3-2-1', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('MC','M','L'), S('MC','M','C'), S('MC','M','R'),
        S('AMC','AM','CL'), S('AMC','AM','CR'),
        S('ST','ST','C')
      ]
    },
    {
      // 4-2-2-2: back four, double pivot (2 DM), two AMs and two strikers.
      // 2 DM -> 6 defenders.
      name: '4-2-2-2 Deep', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('DM','DM','CL'), S('DM','DM','CR'),
        S('AML','AM','L'), S('AMR','AM','R'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      // 5-2-1-2: back five (2 WB + 3 CB), two central mids, an AMC, two strikers.
      // WBs count as defenders -> 5 defenders.
      name: '5-2-1-2 (WB)', common: true,
      slots: [
        S('WBL','D','L'), S('DC','D','CL'), S('DC','D','C'), S('DC','D','CR'), S('WBR','D','R'),
        S('MC','M','CL'), S('MC','M','CR'),
        S('AMC','AM','C'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    },
    {
      // 5-2-3: back five (2 WB + 3 CB), two central mids, front three.
      name: '5-2-3 (WB)', common: true,
      slots: [
        S('WBL','D','L'), S('DC','D','CL'), S('DC','D','C'), S('DC','D','CR'), S('WBR','D','R'),
        S('MC','M','CL'), S('MC','M','CR'),
        S('AML','AM','L'), S('ST','ST','C'), S('AMR','AM','R')
      ]
    },
    {
      // 5-4-1: back five, flat midfield four, lone striker (deep, defensive).
      name: '5-4-1', common: true,
      slots: [
        S('WBL','D','L'), S('DC','D','CL'), S('DC','D','C'), S('DC','D','CR'), S('WBR','D','R'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','CR'), S('MR','M','R'),
        S('ST','ST','C')
      ]
    },
    {
      // 4-5-1 flat: back four, flat midfield five (2 wide + 3 central), lone ST.
      name: '4-5-1', common: true,
      slots: [
        S('DL','D','L'), S('DC','D','CL'), S('DC','D','CR'), S('DR','D','R'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','C'), S('MC','M','CR'), S('MR','M','R'),
        S('ST','ST','C')
      ]
    },
    {
      // 3-4-2-1: three centre-backs, two wide mids + two central mids, two AMCs
      // behind a lone striker. Wide players are wide mids -> 3 defenders.
      name: '3-4-2-1', common: true,
      slots: [
        S('DC','D','L'), S('DC','D','C'), S('DC','D','R'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','CR'), S('MR','M','R'),
        S('AMC','AM','CL'), S('AMC','AM','CR'),
        S('ST','ST','C')
      ]
    },
    {
      // 3-1-4-2: three centre-backs, a DM, flat midfield four, two strikers.
      // DM counts as a defender -> 4 defenders.
      name: '3-1-4-2', common: true,
      slots: [
        S('DC','D','L'), S('DC','D','C'), S('DC','D','R'),
        S('DM','DM','C'),
        S('ML','M','L'), S('MC','M','CL'), S('MC','M','CR'), S('MR','M','R'),
        S('ST','ST','CL'), S('ST','ST','CR')
      ]
    }
  ];

  /* The formation catalogue is a CURATED set of real-world formations only
   * (defined in RAW above). We no longer mechanically generate every numeric
   * partition — those produced non-football shapes. Every formation here is a
   * recognised one whose defender count is consistent with the rules
   * (defenders = CB/FB/WB/DM). */

  var byName = {};
  var all = [];

  // Seed with common (hand-authored) formations.
  RAW.forEach(function (f) {
    // defs = rule-2 defender count (includes DM). backline = players on the
    // actual back line (D band only), used for DROPDOWN GROUPING so a 3-at-the
    // -back shape with a DM is still grouped under "3 at the back".
    var defs = f.slots.filter(function (s) {
      return ['DL','DC','DR','WBL','WBR','DM'].indexOf(s.pos) !== -1;
    }).length;
    var backline = f.slots.filter(function (s) {
      return s.band === 'D';
    }).length;
    var entry = {
      name: f.name,
      common: !!f.common,
      defs: defs,
      backline: backline,
      slots: [GK].concat(f.slots)
    };
    byName[f.name] = entry;
    all.push(entry);
  });

  // Grouping for the UI: a single "Common" group plus back-line groups if any
  // non-common formations are ever added later. With the curated set, all
  // formations are common, so the dropdown shows one clean, grouped list
  // ordered by back-line count then name.
  function grouped() {
    // Group by RULE-2 DEFENDER COUNT (CB/FB/WB/DM), since that is what drives
    // fluidity in this system. So a "5-3-2 (WB)" sits with the 5-defender
    // shapes even though its back LINE is three centre-backs.
    var buckets = {};
    all.forEach(function (f) {
      (buckets[f.defs] = buckets[f.defs] || []).push(f);
    });
    // Grouping is by defender count for a tidy dropdown. Fluidity (rule 2) is
    // also derived from defender count, so these groups line up with fluidity.
    var labels = {
      3: '3 defenders',
      4: '4 defenders',
      5: '5 defenders',
      6: '6 defenders',
      7: '7 defenders'
    };
    var groups = [];
    Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (d) {
        var list = buckets[d].slice().sort(function (a, b) {
          return a.name.localeCompare(b.name);
        });
        groups.push({ label: labels[d] || (d + ' defenders'), formations: list });
      });
    return groups;
  }

  global.FORMATIONS = {
    all: all,
    byName: byName,
    grouped: grouped,
    // Count helpers used by the rules engine (roles.js provides classification).
    slotsOf: function (name) {
      var f = byName[name];
      return f ? f.slots : null;
    }
  };
})(window);
