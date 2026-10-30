/* ============================================================================
 * roles.js
 * ----------------------------------------------------------------------------
 * Position codes, the roles+duties valid at each position, and classification
 * helpers used by the rules engine.
 *
 * Classification per the user's guide:
 *   Attackers (rule 1) = Wingers (AML/AMR) + AMC + ST.
 *   Defenders (rule 2) = CB (DC/DL/DR) + FB (DL/DR) + WB (WBL/WBR) + DM.
 *   (DM is both midfielder & defender; AMC/Wingers are both mid & attacker.)
 * ==========================================================================*/

(function (global) {
  'use strict';

  // Fluidity levels (rule 2/3) in order most-structured -> most-fluid.
  var FLUIDITIES = [
    'highly structured',
    'structured',
    'flexible',
    'fluid',
    'very fluid'
  ];

  // Mentalities from most defensive to most attacking. The guide's tables use
  // these seven labels (contain..overload). "overload" is the most attacking.
  var MENTALITIES = [
    'contain',
    'defensive',
    'counter',
    'standard',
    'control',
    'attacking',
    'overload'
  ];

  var DUTIES = ['Defend', 'Support', 'Attack'];

  // Human-readable full names for position codes.
  var POS_NAME = {
    GK: 'Goalkeeper',
    DL: 'Left Back', DC: 'Centre Back', DR: 'Right Back',
    WBL: 'Left Wing-Back', WBR: 'Right Wing-Back',
    DM: 'Defensive Midfielder',
    ML: 'Left Midfielder', MC: 'Central Midfielder', MR: 'Right Midfielder',
    AML: 'Left Winger', AMC: 'Attacking Midfielder', AMR: 'Right Winger',
    ST: 'Striker'
  };

  // Roles available per position, each with the duties it allows.
  // Kept faithful to the roles referenced in the guide's responsibility tables.
  function roleset(list) { return list; }

  var ROLES_BY_POS = {
    GK: roleset([
      { role: 'Goalkeeper', duties: ['Defend'] },
      { role: 'Sweeper Keeper', duties: ['Defend', 'Support', 'Attack'] }
    ]),
    DC: roleset([
      { role: 'Central Defender', duties: ['Defend', 'Stopper', 'Cover'] },
      { role: 'Ball Playing Defender', duties: ['Defend', 'Stopper', 'Cover'] },
      { role: 'No-Nonsense Centre Back', duties: ['Defend', 'Stopper', 'Cover'] },
      { role: 'Libero', duties: ['Defend', 'Support', 'Attack'] },
      { role: 'Sweeper', duties: ['Defend', 'Support'] }
    ]),
    DL: roleset([
      { role: 'Full Back', duties: ['Defend', 'Support', 'Attack'] },
      { role: 'Wing Back', duties: ['Defend', 'Support', 'Attack'] },
      { role: 'No-Nonsense Full Back', duties: ['Defend'] },
      { role: 'Inverted Full Back', duties: ['Defend', 'Support'] },
      { role: 'Complete Wing Back', duties: ['Support', 'Attack'] }
    ]),
    DR: null, // filled below = same as DL
    WBL: roleset([
      { role: 'Wing Back', duties: ['Defend', 'Support', 'Attack'] },
      { role: 'Complete Wing Back', duties: ['Support', 'Attack'] },
      { role: 'Inverted Wing Back', duties: ['Defend', 'Support'] }
    ]),
    WBR: null, // = WBL
    DM: roleset([
      { role: 'Defensive Midfielder', duties: ['Defend', 'Support'] },
      { role: 'Deep Lying Playmaker', duties: ['Defend', 'Support'] },
      { role: 'Half Back', duties: ['Defend'] },
      { role: 'Anchor Man', duties: ['Defend'] },
      { role: 'Ball Winning Midfielder', duties: ['Defend', 'Support'] },
      { role: 'Regista', duties: ['Support'] },
      { role: 'Segundo Volante', duties: ['Support', 'Attack'] }
    ]),
    MC: roleset([
      { role: 'Central Midfielder', duties: ['Defend', 'Support', 'Attack'] },
      { role: 'Box to Box Midfielder', duties: ['Support'] },
      { role: 'Deep Lying Playmaker', duties: ['Defend', 'Support'] },
      { role: 'Advanced Playmaker', duties: ['Support', 'Attack'] },
      { role: 'Ball Winning Midfielder', duties: ['Defend', 'Support'] },
      { role: 'Mezzala', duties: ['Support', 'Attack'] },
      { role: 'Roaming Playmaker', duties: ['Support'] },
      { role: 'Carrilero', duties: ['Support'] }
    ]),
    ML: roleset([
      { role: 'Winger', duties: ['Support', 'Attack'] },
      { role: 'Wide Midfielder', duties: ['Defend', 'Support', 'Attack'] },
      { role: 'Defensive Winger', duties: ['Defend', 'Support'] },
      { role: 'Wide Playmaker', duties: ['Support', 'Attack'] }
    ]),
    MR: null, // = ML
    AMC: roleset([
      { role: 'Attacking Midfielder', duties: ['Support', 'Attack'] },
      { role: 'Advanced Playmaker', duties: ['Support', 'Attack'] },
      { role: 'Shadow Striker', duties: ['Attack'] },
      { role: 'Enganche', duties: ['Support'] },
      { role: 'Trequartista', duties: ['Attack'] }
    ]),
    AML: roleset([
      { role: 'Winger', duties: ['Support', 'Attack'] },
      { role: 'Inside Forward', duties: ['Support', 'Attack'] },
      { role: 'Advanced Playmaker', duties: ['Support', 'Attack'] },
      { role: 'Defensive Winger', duties: ['Defend', 'Support'] },
      { role: 'Inverted Winger', duties: ['Support', 'Attack'] },
      { role: 'Raumdeuter', duties: ['Attack'] }
    ]),
    AMR: null, // = AML
    ST: roleset([
      { role: 'Advanced Forward', duties: ['Attack'] },
      { role: 'Deep Lying Forward', duties: ['Support', 'Attack'] },
      { role: 'Complete Forward', duties: ['Support', 'Attack'] },
      { role: 'Target Forward', duties: ['Support', 'Attack'] },
      { role: 'Poacher', duties: ['Attack'] },
      { role: 'Pressing Forward', duties: ['Defend', 'Support', 'Attack'] },
      { role: 'False Nine', duties: ['Support'] },
      { role: 'Trequartista', duties: ['Attack'] },
      { role: 'Defensive Forward', duties: ['Defend', 'Support'] }
    ])
  };

  // Mirror left/right positions.
  ROLES_BY_POS.DR = ROLES_BY_POS.DL;
  ROLES_BY_POS.WBR = ROLES_BY_POS.WBL;
  ROLES_BY_POS.MR = ROLES_BY_POS.ML;
  ROLES_BY_POS.AMR = ROLES_BY_POS.AML;

  // Position sets for classification.
  //   Attackers (rule 1) = W (AML/AMR) + AMC + ST.
  //   Defenders (rule 2) = SW + DM + WB (WBL/WBR) + FB/CB (DL/DC/DR).
  // A Sweeper is picked from a centre-back slot but occupies the SW line, so
  // it is still counted as a defender below (via pos OR the Sweeper role).
  var ATTACKER_POS = ['AML', 'AMR', 'AMC', 'ST'];
  var DEFENDER_POS = ['SW', 'DL', 'DC', 'DR', 'WBL', 'WBR', 'DM'];

  function isAttackerSlot(slot) {
    return ATTACKER_POS.indexOf(slot.pos) !== -1;
  }
  function isDefenderSlot(slot) {
    return DEFENDER_POS.indexOf(slot.pos) !== -1 || slot.role === 'Sweeper';
  }

  function countAttackers(slots) {
    return slots.filter(isAttackerSlot).length;
  }
  function countDefenders(slots) {
    return slots.filter(isDefenderSlot).length;
  }

  // Default role/duty for a fresh formation selection (sensible starting point).
  function defaultRoleDuty(pos) {
    var opts = ROLES_BY_POS[pos];
    var first = opts[0];
    return { role: first.role, duty: first.duties[0] };
  }

  function rolesForPos(pos) { return ROLES_BY_POS[pos] || []; }

  global.ROLES = {
    FLUIDITIES: FLUIDITIES,
    MENTALITIES: MENTALITIES,
    DUTIES: DUTIES,
    POS_NAME: POS_NAME,
    ROLES_BY_POS: ROLES_BY_POS,
    ATTACKER_POS: ATTACKER_POS,
    DEFENDER_POS: DEFENDER_POS,
    isAttackerSlot: isAttackerSlot,
    isDefenderSlot: isDefenderSlot,
    countAttackers: countAttackers,
    countDefenders: countDefenders,
    defaultRoleDuty: defaultRoleDuty,
    rolesForPos: rolesForPos
  };
})(window);
