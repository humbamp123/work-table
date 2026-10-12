/*
 * test.js — smoke tests for calc.js. Run with `node test.js` (or `npm test`).
 * Success is the printed line "ALL TESTS PASS"; a silent exit 0 is a failure.
 */
const C = require('./calc.js');

let failures = 0;
let passes = 0;
const near = (a, b) => Math.abs(a - b) < 1e-9;
function eq(label, got, want) {
  const ok = typeof want === 'number' ? near(got, want) : got === want;
  if (ok) {
    passes++;
  } else {
    failures++;
    console.error(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}
function ok(label, cond) {
  eq(label, !!cond, true);
}

/* ---------- presets and resolved config ---------- */

const USES = ['assembly', 'shop', 'craft', 'outfeed'];
eq('four presets', Object.keys(C.PRESETS).length, 4);
for (const u of USES) ok(`preset ${u} exists`, C.PRESETS[u]);

const asm = C.resolveConfig({ use: 'assembly' });
eq('assembly default height', asm.height, 34);
eq('assembly caster height default', asm.casterHeight, 4);
eq('assembly keeps use', asm.use, 'assembly');

const custom = C.resolveConfig({ use: 'assembly', height: 31.5 });
eq('typed height wins over preset', custom.height, 31.5);

const out = C.resolveConfig({ use: 'outfeed', sawHeight: 34.5 });
eq('outfeed height derives from saw minus drop', out.height, 34.375);
const outTyped = C.resolveConfig({ use: 'outfeed', sawHeight: 34.5, height: 40 });
eq('outfeed ignores a typed height', outTyped.height, 34.375);

/* ---------- top stack ---------- */

eq('assembly top thickness (2 ply + skin)', C.topStack(asm).thickness, 1.75);
eq('shop top thickness (2 ply)', C.topStack(C.resolveConfig({ use: 'shop' })).thickness, 1.5);
eq('craft top thickness (ply + skin)', C.topStack(C.resolveConfig({ use: 'craft' })).thickness, 1);
eq('outfeed top thickness (ply + skin)', C.topStack(out).thickness, 1);
eq('skin toggle off drops a layer', C.topStack(C.resolveConfig({ use: 'assembly', skin: false })).thickness, 1.5);

/* ---------- leg lengths: king = H - top - pad - caster; jack = king - 7 ---------- */

const legs = (inputs) => C.legLengths(C.resolveConfig(inputs));
eq('assembly king', legs({ use: 'assembly' }).king, 26.75);
eq('assembly jack', legs({ use: 'assembly' }).jack, 19.75);
eq('shop king (6-1/4 caster)', legs({ use: 'shop' }).king, 26.75);
eq('craft king (5-1/8 caster)', legs({ use: 'craft' }).king, 28.375);
eq('outfeed king (saw 34)', legs({ use: 'outfeed', sawHeight: 34 }).king, 27.375);
eq('custom 28 in king', legs({ use: 'assembly', height: 28 }).king, 20.75);
eq('custom 31-3/8 in king', legs({ use: 'assembly', height: 31.375 }).king, 24.125);
eq('custom 44 in king', legs({ use: 'assembly', height: 44 }).king, 36.75);
eq('custom 44 in jack', legs({ use: 'assembly', height: 44 }).jack, 29.75);
eq('caster height input changes king', legs({ use: 'assembly', casterHeight: 5 }).king, 25.75);

/* ---------- height stack sums to the finished height ---------- */

for (const u of USES) {
  const cfg = C.resolveConfig({ use: u, sawHeight: 34 });
  const sum = C.heightStack(cfg).reduce((s, p) => s + p.h, 0);
  eq(`height stack sums (${u})`, sum, cfg.height);
}
for (const h of [28, 31.375, 44]) {
  const cfg = C.resolveConfig({ use: 'shop', height: h });
  eq(`height stack sums (custom ${h})`, C.heightStack(cfg).reduce((s, p) => s + p.h, 0), h);
}

/* ---------- height advice ---------- */

const adv = (inputs) => C.heightAdvice(C.resolveConfig(inputs));
ok('ergonomic hint is text', typeof adv({ use: 'assembly' }).hint === 'string' && adv({ use: 'assembly' }).hint.length > 10);
eq('no warnings at assembly default', adv({ use: 'assembly' }).warnings.length, 0);
eq('shallow shelf warning at 31-1/2 (jack 17-1/4)', adv({ use: 'assembly', height: 31.5 }).warnings.length, 1);
ok('shallow shelf warning mentions shelf', /shelf/i.test(adv({ use: 'assembly', height: 31.5 }).warnings[0]));
eq('no shelf warning when shelf is off', adv({ use: 'assembly', height: 31.5, shelf: false }).warnings.length, 0);
ok('tall table warns about bracing', adv({ use: 'shop', height: 42 }).warnings.some((w) => /brace/i.test(w)));
eq('tall table flags braces', adv({ use: 'shop', height: 42 }).braces, true);
eq('normal table has no braces', adv({ use: 'shop' }).braces, false);
eq('40 in exactly needs no braces', adv({ use: 'shop', height: 40 }).braces, false);

/* ---------- validation ---------- */

eq('valid defaults have no errors', Object.keys(C.validate({ use: 'assembly' })).length, 0);
ok('rejects 27-7/8 height', C.validate({ use: 'assembly', height: 27.875 }).height);
ok('rejects 44-1/8 height', C.validate({ use: 'assembly', height: 44.125 }).height);
ok('accepts 28 height', !C.validate({ use: 'assembly', height: 28 }).height);
ok('accepts 44 height', !C.validate({ use: 'assembly', height: 44 }).height);
ok('rejects saw height 28', C.validate({ use: 'outfeed', sawHeight: 28 }).sawHeight);
ok('rejects saw height 41', C.validate({ use: 'outfeed', sawHeight: 41 }).sawHeight);
ok('rejects drop over 1/2', C.validate({ use: 'outfeed', sawHeight: 34, sawDrop: 0.75 }).sawDrop);
ok('rejects caster height 1', C.validate({ use: 'shop', casterHeight: 1 }).casterHeight);
ok('rejects caster height 10', C.validate({ use: 'shop', casterHeight: 10 }).casterHeight);
ok('rejects unknown use', C.validate({ use: 'bench' }).use);

/* ---------- fixed geometry: frame, joists, seams, panels ---------- */

eq('frame width', C.FRAME.w, 48);
eq('frame length', C.FRAME.l, 108);
const J = C.joistStations();
eq('nine top cross members', J.length, 9);
eq('joist stations', J.join(','), '0.75,12.375,24,39,54,69,84,95.625,107.25');
ok('no joist bay over 15 in', J.every((s, i) => i === 0 || s - J[i - 1] <= 15 + 1e-9));
eq('sheet is 5 x 5', `${C.SHEET.w}x${C.SHEET.l}`, '60x60');

const L1 = C.panelLayout(1);
eq('layer 1 panels: two full 5x5 sheets', L1.map((p) => p.len).join('/'), '60/60');
eq('layer 1 panel widths are 60', L1.every((p) => p.w === 60), true);
eq('layer 1 seam on the centre leg line', C.seamStations(1).join(','), '54');
const L2 = C.panelLayout(2);
eq('layer 2 panels staggered', L2.map((p) => p.len).join('/'), '30/60/30');
eq('layer 2 seams (frame stations)', C.seamStations(2).join(','), '24,84');
ok('every layer-1 seam sits on a joist', C.seamStations(1).every((s) => J.includes(s)));
ok('every layer-2 seam sits on a joist', C.seamStations(2).every((s) => J.includes(s)));
ok('panels tile the full 120 in length', near(L1.reduce((s, p) => s + p.len, 0), 120) && near(L2.reduce((s, p) => s + p.len, 0), 120));

eq('single top sisters the centre seam joist', C.sisterStations(C.resolveConfig({ use: 'craft' })).join(','), '54');
eq('doubled top needs no sisters', C.sisterStations(C.resolveConfig({ use: 'shop' })).length, 0);

eq('base stations with shelf', C.baseStations(C.resolveConfig({ use: 'shop' })).join(','), '0.75,18.5,36.25,54,71.75,89.5,107.25');
eq('base stations without shelf', C.baseStations(C.resolveConfig({ use: 'craft' })).join(','), '0.75,54,107.25');
eq('leg stations', C.LEG_STATIONS.join(','), '0.75,54,107.25');

const shelf = C.shelfPlan(C.resolveConfig({ use: 'shop' }));
eq('shelf has two 48x54 panels', shelf.panels.length, 2);
ok('shelf panels are 48 x 54', shelf.panels.every((p) => p.w === 48 && p.len === 54));
eq('shelf seam on the centre leg line', shelf.seams.join(','), '54');
ok('shelf seam is a base-frame station', C.baseStations(C.resolveConfig({ use: 'shop' })).includes(54));
eq('no shelf for craft default', C.shelfPlan(C.resolveConfig({ use: 'craft' })), null);

ok('frame diagonal ~118.19', Math.abs(C.frameDiagonal(C.FRAME.l, C.FRAME.w) - 118.19) < 0.01);
ok('top diagonal ~134.16', Math.abs(C.frameDiagonal(C.TOP.l, C.TOP.w) - 134.16) < 0.01);

/* ---------- sheet goods ---------- */

const sheets = (inputs) => C.sheetCount(C.resolveConfig(inputs));
eq('assembly 3/4 sheets (2 layers + shelf)', sheets({ use: 'assembly' }).ply34, 6);
eq('assembly skin sheets', sheets({ use: 'assembly' }).skin, 2);
eq('shop 3/4 sheets', sheets({ use: 'shop' }).ply34, 6);
eq('shop skin sheets', sheets({ use: 'shop' }).skin, 0);
eq('craft 3/4 sheets (1 layer, no shelf)', sheets({ use: 'craft' }).ply34, 2);
eq('craft skin sheets', sheets({ use: 'craft' }).skin, 2);
eq('outfeed 3/4 sheets (1 layer + shelf)', sheets({ use: 'outfeed' }).ply34, 4);
eq('outfeed skin sheets', sheets({ use: 'outfeed' }).skin, 2);
eq('shelf costs two sheets', sheets({ use: 'craft', shelf: true }).ply34, 4);

/* ---------- cut list ---------- */

const rows = (inputs) => C.cutList(C.resolveConfig(inputs));
const find = (list, re) => list.find((r) => re.test(r.name));
const shopRows = rows({ use: 'shop' });
eq('top rails', find(shopRows, /top frame rails/i).qty, 2);
eq('top rail length', find(shopRows, /top frame rails/i).len, 108);
eq('top cross members', find(shopRows, /top frame cross/i).qty, 9);
eq('cross member length', find(shopRows, /top frame cross/i).len, 45);
eq('base cross members with shelf', find(shopRows, /base frame cross/i).qty, 7);
eq('kings', find(shopRows, /king/i).qty, 6);
eq('king length in cut list', find(shopRows, /king/i).len, 26.75);
eq('jack length in cut list', find(shopRows, /jack/i).len, 19.75);
eq('caster pads are 2x6 x 7', find(shopRows, /caster pad/i).w, 5.5);
eq('caster pad length', find(shopRows, /caster pad/i).len, 7);
eq('no sisters for doubled top', find(shopRows, /sister/i), undefined);
eq('no braces at 36 in', find(shopRows, /brace/i), undefined);
eq('shop 60x60 panels (2 + 1)', find(shopRows, /60 x 60/i).qty, 3);
eq('shop 30x60 panels', find(shopRows, /30 x 60/i).qty, 2);
eq('shop shelf panels', find(shopRows, /shelf panel/i).qty, 2);
eq('shop has no skin rows', find(shopRows, /skin/i), undefined);

const craftRows = rows({ use: 'craft' });
eq('one sister for the single centre seam', find(craftRows, /sister/i).qty, 1);
eq('base cross members without shelf', find(craftRows, /base frame cross/i).qty, 3);
eq('craft 60x60 panels', find(craftRows, /60 x 60/i).qty, 2);
eq('craft has no half panels', find(craftRows, /30 x 60/i), undefined);
eq('craft shelf absent', find(craftRows, /shelf panel/i), undefined);
ok('craft skin rows present', find(craftRows, /skin/i));

const tallRows = rows({ use: 'shop', height: 42 });
eq('braces at 42 in', find(tallRows, /brace/i).qty, 4);
ok('brace spans leg bay diagonally (> 50 in)', find(tallRows, /brace/i).len > 50);

const linearIn = (list) => list.filter((r) => r.stock === '2x4').reduce((s, r) => s + r.qty * r.len, 0);
eq('shop 2x4 linear inches', linearIn(shopRows), 1431);

/* ---------- stock packing (first-fit decreasing) ---------- */

const packed = C.packStock([45, 45, 45, 45], 96, 0.125);
eq('four 45s take two 8 ft boards', packed.length, 2);
eq('55+55+40 packs into two boards', C.packStock([55, 40, 55], 96, 0.125).length, 2);
ok('packStock never overfills', C.packStock([45, 45, 45, 26.75, 26.75, 26.75, 19.75, 19.75, 19.75, 19.75, 19.75], 96, 0.125)
  .every((b) => b.cuts.reduce((s, c) => s + c, 0) + 0.125 * b.cuts.length <= 96 + 1e-9));
ok('packStock keeps every cut', C.packStock([45, 45, 45, 26.75, 19.75], 96, 0.125).flatMap((b) => b.cuts).length === 5);
eq('cut longer than stock throws', (() => { try { C.packStock([100], 96, 0.125); return 'no'; } catch (e) { return 'threw'; } })(), 'threw');

const buy = (inputs) => C.boardsToBuy(C.resolveConfig(inputs));
eq('shop 10 ft boards', buy({ use: 'shop' }).ten, 4);
eq('shop 8 ft boards', buy({ use: 'shop' }).eight, 12);
eq('craft 8 ft boards', buy({ use: 'craft' }).eight, 10);
eq('assembly 8 ft boards', buy({ use: 'assembly' }).eight, 12);
ok('braces add 8 ft boards', buy({ use: 'shop', height: 42 }).eight > buy({ use: 'shop' }).eight);

/* ---------- materials and weight ---------- */

const mats = C.materials(C.resolveConfig({ use: 'assembly' }));
const mat = (re) => mats.find((m) => re.test(m.item));
eq('10 ft 2x4 line', mat(/2x4 x 10/i).qty, 4);
eq('8 ft 2x4 line', mat(/2x4 x 8/i).qty, 12);
eq('3/4 ply line', mat(/3\/4" plywood/i).qty, 6);
ok('ply line says 5 x 5', /5 x 5/.test(mat(/3\/4" plywood/i).item));
eq('skin line', mat(/skin/i).qty, 2);
eq('casters line', mat(/caster/i).qty, 6);
ok('caster line names the type', /leveling/i.test(mat(/caster/i).item));
ok('glue is listed', mat(/glue/i));
eq('shop has no skin line', C.materials(C.resolveConfig({ use: 'shop' })).find((m) => /skin/i.test(m.item)), undefined);

const wt = (inputs) => C.estimateWeight(C.resolveConfig(inputs));
ok('assembly weight ~535 lb', wt({ use: 'assembly' }).total > 500 && wt({ use: 'assembly' }).total < 570);
ok('craft weight ~335 lb', wt({ use: 'craft' }).total > 300 && wt({ use: 'craft' }).total < 370);
ok('shop heavier than craft', wt({ use: 'shop' }).total > wt({ use: 'craft' }).total);
ok('taller table weighs more', wt({ use: 'shop', height: 44 }).total > wt({ use: 'shop', height: 28 }).total);

/* ---------- caster rating: tiers are given, the policy is hand-written ---------- */

eq('nextTier rounds up', C.nextTier(323), 350);
eq('nextTier exact hit', C.nextTier(500), 500);
eq('nextTier off the chart', C.nextTier(5000), null);

const cr = C.requiredCasterRating(535, 500, C.PRESETS.assembly.mobility);
ok('caster policy is set (returns an object)', cr !== undefined);
if (cr === undefined) {
  console.log('SKIP requiredCasterRating — TODO: not written yet (see calc.js)');
} else {
  ok('per-caster is at least total / count', cr.perCasterLb >= (535 + 500) / 6 - 1e-9);
  ok('tier is at least per-caster', cr.tierLb === null || cr.tierLb >= cr.perCasterLb);
  ok('effective count is 1..count', cr.effectiveCount >= 1 && cr.effectiveCount <= 6);
  const heavier = C.requiredCasterRating(535, 1000, C.PRESETS.assembly.mobility);
  ok('monotonic in load', heavier.perCasterLb >= cr.perCasterLb);
}

/* ---------- computeAll ---------- */

const all = C.computeAll({ use: 'assembly', height: 31.5 });
eq('computeAll height', all.config.height, 31.5);
eq('computeAll one height warning', all.warnings.length, 1);
ok('computeAll fixed notes (door, floor, studs)', all.notes.length >= 3);
ok('computeAll carries cut list', all.cutList.length > 5);
eq('computeAll craft has no second layer', C.computeAll({ use: 'craft' }).panels[2], null);
ok('computeAll assembly has a second layer', C.computeAll({ use: 'assembly' }).panels[2].length === 3);
ok('computeAll tolerates missing caster policy', 'caster' in C.computeAll({ use: 'shop' }));

/* ---------- formatters ---------- */

eq('fmt 25.5', C.fmtFrac(25.5), '25-1/2"');
eq('fmt 26.75', C.fmtFrac(26.75), '26-3/4"');
eq('fmt 0.125', C.fmtFrac(0.125), '1/8"');
eq('fmtLen metric', C.fmtLen(25.5, 'metric'), '648 mm');
eq('fmtLen imperial', C.fmtLen(45, 'imperial'), '45"');
eq('fmtHeight imperial', C.fmtHeight(34, 'imperial'), `2' 10"`);
eq('fmtHeight metric', C.fmtHeight(34, 'metric'), '86 cm');
eq('fmtWeight imperial', C.fmtWeight(535.4, 'imperial'), '535 lb');
eq('fmtWeight metric', C.fmtWeight(535.4, 'metric'), '243 kg');

/* ---------- report ---------- */

console.log(`${passes} passed`);
console.log(failures === 0 ? 'ALL TESTS PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
