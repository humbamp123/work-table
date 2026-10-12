/*
 * calc.js — pure calculation logic for the 5 ft x 10 ft mobile work table.
 * No DOM access. All internal dimensions are INCHES, weights in POUNDS.
 *
 * Geometry that never changes with the visitor's choices:
 *   top 60 x 120, 6" overhang -> frame 48 x 108
 *   2x4 rails on edge, 45" cross members, six 2x4-pair legs
 * The finished height is the visitor's choice (28"–44"); it changes only
 * the king and jack lengths:  king = H - top - pad - caster,  jack = king - 7
 */

const TOP = { w: 60, l: 120 };
const OVERHANG = 6;
const FRAME = { w: TOP.w - 2 * OVERHANG, l: TOP.l - 2 * OVERHANG }; // 48 x 108
const TWO_BY_FOUR = { t: 1.5, w: 3.5 };
const TWO_BY_SIX = { t: 1.5, w: 5.5 };
const PLY = 0.75;
const SKIN = 0.25;
const PAD_T = TWO_BY_SIX.t; // caster pad under each leg
const LEG_LAP = 2 * TWO_BY_FOUR.w; // the king laps both frames: jack = king - 7

const HEIGHT_RANGE = [28, 44];
const SAW_RANGE = [29, 40];
const DROP_RANGE = [0, 0.5];
const CASTER_RANGE = [2, 9];
const SHALLOW_SHELF_JACK = 18; // shelf bay (= jack) under this is hard to use
const BRACE_ABOVE = 40; // taller legs get diagonal braces

const SKINS = {
  hardboard: { label: '1/4" hardboard (replaceable sacrificial skin)', t: SKIN },
  melamine: { label: '1/4" melamine or smooth hardboard (slick layout surface)', t: SKIN },
  waxed: { label: '1/4" hardboard, waxed (slick outfeed surface)', t: SKIN },
};

const PRESETS = {
  assembly: {
    label: 'Woodworking assembly',
    blurb: 'Flat, heavy, dead-level glue-up and clamping table.',
    heightSource: 'fixed',
    height: 34,
    range: [30, 34],
    ergo: 'Knuckle height, about 30–34": low enough to lean into clamps and planes.',
    topLayers: 2,
    skin: 'hardboard',
    shelf: true,
    mobility: { type: 'leveling', count: 6, wheelDia: 3, label: 'leveling casters (wheel + screw-down foot)' },
    casterHeight: 4,
    workingLoadLb: 500,
  },
  shop: {
    label: 'General shop bench',
    blurb: 'All-purpose bench for repairs, projects and storage underneath.',
    heightSource: 'fixed',
    height: 36,
    range: [34, 38],
    ergo: 'Elbow height minus 4–6", about 34–38": comfortable for mixed standing work.',
    topLayers: 2,
    skin: null,
    shelf: true,
    mobility: { type: 'plate', count: 6, wheelDia: 5, label: '5" total-lock swivel casters' },
    casterHeight: 6.25,
    workingLoadLb: 1000,
  },
  craft: {
    label: 'Craft, cutting and layout',
    blurb: 'Smooth, lighter surface for fabric, paper, sewing and layout work.',
    heightSource: 'fixed',
    height: 36,
    range: [36, 40],
    ergo: 'Elbow height, about 36–40": detail work without stooping.',
    topLayers: 1,
    skin: 'melamine',
    shelf: false,
    mobility: { type: 'plate', count: 6, wheelDia: 4, label: '4" total-lock swivel casters, soft tread' },
    casterHeight: 5.125,
    workingLoadLb: 150,
  },
  outfeed: {
    label: 'Table saw outfeed',
    blurb: 'Height matched to your saw; doubles as an assembly table.',
    heightSource: 'saw',
    sawHeight: 34,
    sawDrop: 0.125,
    range: [29, 40],
    ergo: 'Set by your saw: table height minus a 1/8" drop so stock never catches.',
    topLayers: 1,
    skin: 'waxed',
    shelf: true,
    mobility: { type: 'leveling', count: 6, wheelDia: 3, label: 'leveling casters (wheel + screw-down foot)' },
    casterHeight: 4,
    workingLoadLb: 300,
  },
};

/*
 * Merge the preset with the visitor's overrides and settle the one number
 * everything else depends on: config.height. A typed height wins for the
 * fixed-height uses; the outfeed height is always derived from the saw.
 */
function resolveConfig(inputs) {
  const preset = PRESETS[inputs.use] || PRESETS.assembly;
  const pick = (k) => (inputs[k] != null ? inputs[k] : preset[k]);
  const cfg = {
    use: PRESETS[inputs.use] ? inputs.use : 'assembly',
    label: preset.label,
    heightSource: preset.heightSource,
    range: preset.range,
    ergo: preset.ergo,
    topLayers: preset.topLayers,
    skin: inputs.skin === false ? null : inputs.skin === true ? preset.skin || 'hardboard' : preset.skin,
    shelf: pick('shelf'),
    mobility: preset.mobility,
    casterHeight: pick('casterHeight'),
    workingLoadLb: preset.workingLoadLb,
    sawHeight: pick('sawHeight'),
    sawDrop: pick('sawDrop'),
  };
  cfg.height =
    preset.heightSource === 'saw'
      ? cfg.sawHeight - cfg.sawDrop
      : inputs.height != null
        ? inputs.height
        : preset.height;
  return cfg;
}

function topStack(cfg) {
  const layers = [];
  for (let i = 0; i < cfg.topLayers; i++) {
    layers.push({ name: `3/4" plywood, layer ${i + 1}`, t: PLY });
  }
  if (cfg.skin) layers.push({ name: SKINS[cfg.skin].label, t: SKINS[cfg.skin].t });
  return { layers, thickness: layers.reduce((s, l) => s + l.t, 0) };
}

function legLengths(cfg) {
  const king = cfg.height - topStack(cfg).thickness - PAD_T - cfg.casterHeight;
  return { king, jack: king - LEG_LAP };
}

// Floor to top surface, bottom up. Sums to cfg.height by construction.
function heightStack(cfg) {
  const { king } = legLengths(cfg);
  return [
    { name: 'caster', h: cfg.casterHeight },
    { name: 'caster pad', h: PAD_T },
    { name: 'leg (king)', h: king },
    { name: 'top', h: topStack(cfg).thickness },
  ];
}

function heightAdvice(cfg) {
  const { jack } = legLengths(cfg);
  const warnings = [];
  if (cfg.shelf && jack < SHALLOW_SHELF_JACK) {
    warnings.push(
      `At this height the shelf bay is only ${fmtFrac(jack)} tall, so tall bins won't fit. ` +
        'Consider building without the shelf.'
    );
  }
  const braces = cfg.height > BRACE_ABOVE;
  if (braces) {
    warnings.push(
      `Over ${BRACE_ABOVE}" the 2x4-pair legs get slender. Add diagonal 2x4 braces between the legs ` +
        'on both long sides (included in the cut list and lumber count).'
    );
  }
  return { hint: cfg.ergo, warnings, braces };
}

function inRange(x, [lo, hi]) {
  return typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
}

function validate(inputs) {
  const errors = {};
  if (!PRESETS[inputs.use]) errors.use = 'Pick one of the four uses.';
  const preset = PRESETS[inputs.use] || PRESETS.assembly;
  if (preset.heightSource === 'saw') {
    if (inputs.sawHeight != null && !inRange(inputs.sawHeight, SAW_RANGE)) {
      errors.sawHeight = `Expected ${SAW_RANGE[0]}–${SAW_RANGE[1]}" (${Math.round(SAW_RANGE[0] * 2.54)}–${Math.round(SAW_RANGE[1] * 2.54)} cm).`;
    }
    if (inputs.sawDrop != null && !inRange(inputs.sawDrop, DROP_RANGE)) {
      errors.sawDrop = 'Expected 0–1/2" (0–13 mm).';
    }
  } else if (inputs.height != null && !inRange(inputs.height, HEIGHT_RANGE)) {
    errors.height = `Expected ${HEIGHT_RANGE[0]}–${HEIGHT_RANGE[1]}" (${Math.round(HEIGHT_RANGE[0] * 2.54)}–${Math.round(HEIGHT_RANGE[1] * 2.54)} cm).`;
  }
  if (inputs.casterHeight != null && !inRange(inputs.casterHeight, CASTER_RANGE)) {
    errors.casterHeight = `Expected ${CASTER_RANGE[0]}–${CASTER_RANGE[1]}" overall (${Math.round(CASTER_RANGE[0] * 2.54)}–${Math.round(CASTER_RANGE[1] * 2.54)} cm).`;
  }
  return errors;
}

/* ---------- fixed geometry ---------- */

const SHEET = { w: 60, l: 60 }; // 5 x 5 (Baltic birch format)
// Top-frame cross members, centreline from the frame end. Seams of both
// top layers (station 54, and 24/84) land on these; no bay is over 15".
const JOIST_STATIONS = [0.75, 12.375, 24, 39, 54, 69, 84, 95.625, 107.25];
const LEG_STATIONS = [0.75, 54, 107.25]; // corners + mid-span, both sides
// Base frame: the shelf (two 54" panels) seams on the centre leg line;
// the intermediate members keep every bay under 18".
const BASE_STATIONS_SHELF = [0.75, 18.5, 36.25, 54, 71.75, 89.5, 107.25];

// Top panels are full 5 x 5 sheets. Layer 1 is two whole sheets with the
// seam on the centre leg line; layer 2 is 30/60/30 (one sheet ripped in
// half for the ends) so its seams sit 30" away from layer 1's.
const PANEL_PATTERNS = { 1: [60, 60], 2: [30, 60, 30] };

function joistStations() {
  return JOIST_STATIONS.slice();
}

function panelLayout(layer) {
  let x = 0;
  return PANEL_PATTERNS[layer].map((len, i) => {
    const p = { id: `L${layer}-${i + 1}`, x, len, w: TOP.w };
    x += len;
    return p;
  });
}

// Seams in frame stations (top coordinate minus the overhang).
function seamStations(layer) {
  const panels = panelLayout(layer);
  return panels.slice(0, -1).map((p) => p.x + p.len - OVERHANG);
}

// A single-layer top gets a second joist glued beside each seam joist.
function sisterStations(cfg) {
  return cfg.topLayers === 1 ? seamStations(1) : [];
}

function baseStations(cfg) {
  return (cfg.shelf ? BASE_STATIONS_SHELF : LEG_STATIONS).slice();
}

function shelfPlan(cfg) {
  if (!cfg.shelf) return null;
  const panels = [0, 54].map((x, i) => ({ id: `S-${i + 1}`, x, len: 54, w: FRAME.w }));
  return { panels, seams: [54], w: FRAME.w, l: FRAME.l };
}

function frameDiagonal(l, w) {
  return Math.sqrt(l * l + w * w);
}

/*
 * 5 x 5 sheets: each top layer is exactly two sheets (layer 2 rips one of
 * them in half for its 30" ends). The shelf's two 48 x 54 panels each come
 * out of their own sheet, so a shelf costs two more.
 */
function sheetCount(cfg) {
  const ply34 = cfg.topLayers * 2 + (cfg.shelf ? 2 : 0);
  const skin = cfg.skin ? 2 : 0;
  return { ply34, skin };
}

/* ---------- cut list, stock packing, materials, weight ---------- */

const KERF = 0.125;
const STOCK_8 = 96;
const BRACE_RUN = 54 - TWO_BY_FOUR.w; // clear bay between adjacent legs

function braceLength(jack) {
  return Math.ceil(Math.sqrt(BRACE_RUN * BRACE_RUN + jack * jack) * 8) / 8;
}

function cutList(cfg) {
  const { king, jack } = legLengths(cfg);
  const sisters = sisterStations(cfg);
  const base = baseStations(cfg);
  const { braces } = heightAdvice(cfg);
  const x4 = (name, qty, len, details) => ({ stock: '2x4', name, qty, t: TWO_BY_FOUR.t, w: TWO_BY_FOUR.w, len, details });
  const rows = [
    x4('Top frame rails', 2, FRAME.l, 'from 10 ft boards; straightest stock, crown up'),
    x4('Top frame cross members', JOIST_STATIONS.length, FRAME.w - 2 * TWO_BY_FOUR.t, 'ends + 7 joists; two per 8 ft board'),
  ];
  if (sisters.length) {
    rows.push(x4('Sister joists (single-layer top)', sisters.length, FRAME.w - 2 * TWO_BY_FOUR.t, `glued beside the joists at ${sisters.map((s) => fmtFrac(s)).join(' and ')} so each seam gets 3" of bearing`));
  }
  rows.push(x4('Base frame rails', 2, FRAME.l, 'from 10 ft boards'));
  rows.push(x4('Base frame cross members', base.length, FRAME.w - 2 * TWO_BY_FOUR.t, cfg.shelf ? 'ends + shelf bearers' : 'ends + mid-span, at the leg lines'));
  rows.push(x4('Leg kings (full height)', 6, king, 'lap both frames; through-bolted to the rails'));
  rows.push(x4('Leg jacks', 6, jack, 'bear between the top and base cross members; glue + screw to the king'));
  if (braces) {
    rows.push(x4('Diagonal braces', 4, braceLength(jack), 'corner leg to middle leg, both long sides; angled ends cut to fit'));
  }
  rows.push({ stock: '2x6', name: 'Caster pads', qty: 6, t: TWO_BY_SIX.t, w: TWO_BY_SIX.w, len: 7, details: 'one under each leg; lags go into face grain' });

  const ply = (name, qty, w, len, details) => ({ stock: 'ply', name, qty, t: PLY, w, len, details });
  rows.push(ply('Top panels, 60 x 60', 2 + (cfg.topLayers > 1 ? 1 : 0), 60, 60, 'full 5 x 5 sheets; factory edges out'));
  if (cfg.topLayers > 1) rows.push(ply('Top panels, 30 x 60', 2, 30, 60, 'one sheet ripped in half: the two ends of layer 2'));
  if (cfg.shelf) rows.push(ply('Shelf panels, 48 x 54', 2, 48, 54, 'one per sheet; notch 3" x 5" at each leg'));
  if (cfg.skin) {
    rows.push({ stock: 'skin', name: 'Skin panels, 60 x 60', qty: 2, t: SKIN, w: 60, len: 60, details: 'full sheets, seam over the centre joist; screws only, no glue' });
  }
  return rows;
}

// First-fit decreasing: longest cuts first, each into the first board with room.
function packStock(lengths, stockLen, kerf) {
  const boards = [];
  const sorted = lengths.slice().sort((a, b) => b - a);
  for (const len of sorted) {
    if (len + kerf > stockLen) throw new Error(`cut of ${len}" does not fit ${stockLen}" stock`);
    let board = boards.find((b) => b.used + len + kerf <= stockLen + 1e-9);
    if (!board) {
      board = { cuts: [], used: 0 };
      boards.push(board);
    }
    board.cuts.push(len);
    board.used += len + kerf;
  }
  return boards;
}

function boardsToBuy(cfg) {
  const cuts = cutList(cfg).filter((r) => r.stock === '2x4');
  let ten = 0;
  const short = [];
  for (const r of cuts) {
    for (let i = 0; i < r.qty; i++) {
      if (r.len > STOCK_8) ten++;
      else short.push(r.len);
    }
  }
  return { ten, eight: packStock(short, STOCK_8, KERF).length, twoBySix: 1 };
}

function materials(cfg, casterPolicy) {
  const boards = boardsToBuy(cfg);
  const sheets = sheetCount(cfg);
  const { braces } = heightAdvice(cfg);
  const list = [
    { qty: boards.ten, item: '2x4 x 10 ft', notes: 'rails; pick straight boards, not pre-cut studs' },
    { qty: boards.eight, item: '2x4 x 8 ft', notes: 'cross members, legs' + (braces ? ', braces' : '') },
    { qty: boards.twoBySix, item: '2x6 x 4 ft', notes: 'caster pads (or doubled plywood offcuts)' },
    { qty: sheets.ply34, item: '3/4" plywood, 5 x 5 sheet', notes: `${cfg.topLayers * 2} for the top` + (cfg.shelf ? ', 2 for the shelf' : '') },
  ];
  if (cfg.skin) {
    list.push({ qty: sheets.skin, item: `skin: ${SKINS[cfg.skin].label}, 5 x 5 sheet`, notes: 'screwed, not glued, so it can be replaced' });
  }
  list.push({ qty: 48, item: '5/16" x 4" structural screws', notes: 'legs to both frames' });
  list.push({ qty: 100, item: '3" construction screws', notes: 'frames, pads, braces' });
  list.push({ qty: 85, item: '#8 x 2" wood screws', notes: 'first top layer to the frame' });
  if (cfg.topLayers > 1) list.push({ qty: 100, item: '#8 x 1-1/4" wood screws', notes: 'second layer, driven from below' });
  list.push({ qty: 24, item: '5/16" x 1-1/2" lag screws with washers', notes: 'casters to pads' });
  const rating = casterPolicy && casterPolicy.tierLb ? `rated ${casterPolicy.tierLb} lb each or more` : 'see the caster section for the rating';
  list.push({ qty: cfg.mobility.count, item: cfg.mobility.label, notes: rating });
  list.push({ qty: null, item: 'wood glue', notes: 'every joint except the skin' });
  return list;
}

const DENSITY = { twoByFourLbPerFt: 1.3, twoBySixLbPerFt: 2.0, plyLbPerSqFt: 2.2, skinLbPerSqFt: 1.0 };

function estimateWeight(cfg) {
  const rows = cutList(cfg);
  const inches = (stock) => rows.filter((r) => r.stock === stock).reduce((s, r) => s + r.qty * r.len, 0);
  const lumberLb = (inches('2x4') / 12) * DENSITY.twoByFourLbPerFt + (inches('2x6') / 12) * DENSITY.twoBySixLbPerFt;
  const topSqFt = (TOP.w * TOP.l) / 144;
  const shelfSqFt = cfg.shelf ? (FRAME.w * FRAME.l) / 144 : 0;
  const plyLb = (cfg.topLayers * topSqFt + shelfSqFt) * DENSITY.plyLbPerSqFt;
  const skinLb = cfg.skin ? topSqFt * DENSITY.skinLbPerSqFt : 0;
  const hardwareLb = cfg.mobility.count * 5 + 5;
  return { lumberLb, plyLb, skinLb, hardwareLb, total: lumberLb + plyLb + skinLb + hardwareLb };
}

/* ---------- casters ---------- */

// Common catalogue load ratings, pounds per caster.
const CASTER_TIERS = [100, 150, 200, 250, 300, 350, 400, 500, 600, 800, 1000, 1200];

function nextTier(lb) {
  const tier = CASTER_TIERS.find((t) => t >= lb);
  return tier === undefined ? null : tier;
}

/*
 * TODO (Andres): the caster policy.
 *
 * Decide the minimum load rating each caster needs, given the table's
 * own weight, the working load the preset assumes, and the mobility spec
 * ({ type: 'leveling' | 'plate', count: 6 }).
 *
 * Questions this function answers:
 *   - On a real (uneven) floor, how many of the six casters carry load?
 *     All six only on a dead-flat slab; three or four is the usual answer.
 *   - What safety factor? About 1.25 for a static load; 1.5–2 if the
 *     table rolls over cracks and thresholds while loaded.
 *   - Leveling casters carry the working load only while rolling; the
 *     feet take it when parked. Does the working load count at all?
 *   - What to return when nextTier() finds no tier big enough (null).
 *
 * Return shape (the renderer and tests rely on these keys):
 *   { perCasterLb, tierLb, effectiveCount, safetyFactor }
 * Returning undefined keeps the site working with a "policy not set" note.
 */
function requiredCasterRating(tableLb, workingLb, mobility) {
  return undefined;
}

/* ---------- everything the page renders ---------- */

const NOTES = [
  'A 60" wide top will not pass through a standard door. Build it where it will live, and screw (do not glue) the top to the frame so it can come apart.',
  'Six casters on an uneven floor: the middle pair can float or rock. Shim them 1/16" shy of the corners, or use leveling casters.',
  'Buy full 96" 2x4s, not 92-5/8" pre-cut studs: two 45" cross members only come out of a true 8 ft board.',
  'Not an engineered design. Weights, loads and caster ratings are estimates; check your casters\' published ratings.',
];

function computeAll(inputs) {
  const config = resolveConfig(inputs);
  const weight = estimateWeight(config);
  const caster = requiredCasterRating(weight.total, config.workingLoadLb, config.mobility);
  const advice = heightAdvice(config);
  return {
    config,
    top: topStack(config),
    legs: legLengths(config),
    stack: heightStack(config),
    advice,
    joists: joistStations(),
    sisters: sisterStations(config),
    base: baseStations(config),
    panels: { 1: panelLayout(1), 2: config.topLayers > 1 ? panelLayout(2) : null },
    shelf: shelfPlan(config),
    sheets: sheetCount(config),
    cutList: cutList(config),
    boards: boardsToBuy(config),
    materials: materials(config, caster),
    weight,
    caster,
    warnings: advice.warnings,
    notes: NOTES,
  };
}

/* ---------- formatting helpers (shared with bike-rack) ---------- */

function roundToFrac(x, frac) {
  return Math.round(x / frac) * frac;
}

// 25.5 -> '25-1/2"', 2.75 -> '2-3/4"', 15 -> '15"'
function fmtFrac(inches, denom = 16) {
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  let whole = Math.floor(abs + 1e-9);
  let num = Math.round((abs - whole) * denom);
  let den = denom;
  if (num === den) {
    whole += 1;
    num = 0;
  }
  while (num > 0 && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (num === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${num}/${den}"`;
  return `${sign}${whole}-${num}/${den}"`;
}

// Cut-list lengths: fractional inches or whole millimetres.
function fmtLen(inches, units) {
  if (units === 'metric') return `${Math.round(inches * 25.4)} mm`;
  return fmtFrac(inches);
}

// Room-scale heights: feet-inches or centimetres.
function fmtHeight(inches, units) {
  if (units === 'metric') return `${Math.round(inches * 2.54)} cm`;
  const ft = Math.floor(inches / 12);
  const rest = roundToFrac(inches - ft * 12, 1 / 8);
  if (ft === 0) return fmtFrac(rest, 8);
  return `${ft}' ${fmtFrac(rest, 8)}`;
}

function fmtWeight(lb, units) {
  if (units === 'metric') return `${Math.round(lb * 0.45359237)} kg`;
  return `${Math.round(lb)} lb`;
}

const CALC = {
  TOP,
  OVERHANG,
  FRAME,
  TWO_BY_FOUR,
  TWO_BY_SIX,
  PLY,
  SKIN,
  PAD_T,
  HEIGHT_RANGE,
  SAW_RANGE,
  DROP_RANGE,
  CASTER_RANGE,
  SHALLOW_SHELF_JACK,
  BRACE_ABOVE,
  SKINS,
  PRESETS,
  SHEET,
  LEG_STATIONS,
  joistStations,
  panelLayout,
  seamStations,
  sisterStations,
  baseStations,
  shelfPlan,
  frameDiagonal,
  sheetCount,
  resolveConfig,
  topStack,
  legLengths,
  heightStack,
  heightAdvice,
  validate,
  KERF,
  CASTER_TIERS,
  NOTES,
  cutList,
  packStock,
  boardsToBuy,
  materials,
  estimateWeight,
  nextTier,
  requiredCasterRating,
  computeAll,
  roundToFrac,
  fmtFrac,
  fmtLen,
  fmtHeight,
  fmtWeight,
};

if (typeof module !== 'undefined') module.exports = CALC;
