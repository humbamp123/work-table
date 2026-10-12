/*
 * app.js — DOM wiring. calc.js (global CALC) does all the maths in inches;
 * this file converts at the input/output boundaries, renders the plan
 * sheet, and draws the two SVGs. All rendering uses DOM builders (no innerHTML).
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = 'workTable.inputs.v1';

  // How each numeric field is displayed in each unit system (internal = inches).
  const FIELD_UNITS = {
    height: { imperial: 'in', metric: 'cm', factor: { in: 1, cm: 2.54 } },
    sawHeight: { imperial: 'in', metric: 'cm', factor: { in: 1, cm: 2.54 } },
    sawDrop: { imperial: 'in', metric: 'mm', factor: { in: 1, mm: 25.4 } },
    casterHeight: { imperial: 'in', metric: 'cm', factor: { in: 1, cm: 2.54 } },
  };

  // null means "use the preset's value".
  const state = {
    units: 'imperial',
    use: 'assembly',
    height: null,
    sawHeight: null,
    sawDrop: null,
    casterHeight: null,
    shelf: null,
    skin: null,
  };

  /* ---------- DOM builders (XSS-safe: children become text nodes) ---------- */

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const c of children.flat(Infinity)) {
      if (c == null) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }
  const b = (...c) => el('b', null, ...c);
  const substep = (...c) => el('span', { class: 'substep' }, ...c);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const c of children.flat(Infinity)) {
      if (c == null) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /* ---------- unit helpers ---------- */

  const unitOf = (field) => FIELD_UNITS[field][state.units];

  function toDisplay(field, inches) {
    if (inches == null || !isFinite(inches)) return '';
    const u = unitOf(field);
    const v = inches * FIELD_UNITS[field].factor[u];
    const decimals = u === 'mm' ? 0 : u === 'cm' ? 1 : 3;
    return String(parseFloat(v.toFixed(decimals)));
  }

  // Metric entries are snapped to 1/16" so the sheet never shows 31.496".
  function fromDisplay(field, raw) {
    const v = parseFloat(raw);
    if (!isFinite(v)) return null;
    const inches = v / FIELD_UNITS[field].factor[unitOf(field)];
    return state.units === 'metric' ? CALC.roundToFrac(inches, 1 / 16) : inches;
  }

  function syncSuffixes() {
    document.querySelectorAll('.unit-suffix').forEach((s) => {
      s.textContent = '(' + unitOf(s.dataset.for) + ')';
    });
  }

  const fmtLen = (x) => CALC.fmtLen(x, state.units);
  const fmtHeight = (x) => CALC.fmtHeight(x, state.units);
  const fmtWeight = (x) => CALC.fmtWeight(x, state.units);

  /* ---------- inputs <-> state ---------- */

  function currentInputs() {
    return {
      use: state.use,
      height: state.height,
      sawHeight: state.sawHeight,
      sawDrop: state.sawDrop,
      casterHeight: state.casterHeight,
      shelf: state.shelf,
      skin: state.skin,
    };
  }

  // Write every field from the resolved config so presets show as real values.
  function writeFields() {
    const cfg = CALC.resolveConfig(currentInputs());
    const preset = CALC.PRESETS[state.use];
    const outfeed = preset.heightSource === 'saw';

    document.querySelector(`input[name="use"][value="${state.use}"]`).checked = true;
    $('use-blurb').textContent = preset.blurb;

    $('height').value = toDisplay('height', cfg.height);
    $('height').readOnly = outfeed;
    $('height').setAttribute('aria-readonly', String(outfeed));
    $('reset-height').hidden = outfeed || state.height == null;
    $('ergo-hint').textContent = outfeed
      ? `${preset.ergo} Change it with the saw height below.`
      : `${preset.ergo} Any height from ${CALC.HEIGHT_RANGE[0]}" to ${CALC.HEIGHT_RANGE[1]}" works.`;

    $('field-sawHeight').hidden = !outfeed;
    $('field-sawDrop').hidden = !outfeed;
    $('sawHeight').value = outfeed ? toDisplay('sawHeight', cfg.sawHeight) : '';
    $('sawDrop').value = outfeed ? toDisplay('sawDrop', cfg.sawDrop) : '';

    $('shelf').checked = !!cfg.shelf;
    $('skin').checked = !!cfg.skin;
    $('casterHeight').value = toDisplay('casterHeight', cfg.casterHeight);
  }

  function setUnits(units) {
    state.units = units;
    $('unit-imperial').classList.toggle('active', units === 'imperial');
    $('unit-metric').classList.toggle('active', units === 'metric');
    $('unit-imperial').setAttribute('aria-pressed', String(units === 'imperial'));
    $('unit-metric').setAttribute('aria-pressed', String(units === 'metric'));
    syncSuffixes();
    writeFields();
    recalc();
  }

  function onUseChange(e) {
    state.use = e.target.value;
    // A new use means new defaults for everything.
    state.height = state.sawHeight = state.sawDrop = state.casterHeight = null;
    state.shelf = state.skin = null;
    writeFields();
    recalc();
  }

  function onInput(e) {
    const id = e.target.id;
    if (id === 'shelf') state.shelf = $('shelf').checked;
    else if (id === 'skin') state.skin = $('skin').checked;
    else if (id in FIELD_UNITS) {
      if (id === 'height' && $('height').readOnly) return;
      state[id] = fromDisplay(id, e.target.value);
    } else {
      return;
    }
    if (id === 'height') $('reset-height').hidden = state.height == null;
    recalc();
  }

  function resetHeight() {
    state.height = null;
    writeFields();
    $('height').focus();
    recalc();
  }

  /* ---------- validation ---------- */

  function renderErrors(errors) {
    for (const key of ['height', 'sawHeight', 'sawDrop', 'casterHeight']) {
      const msg = errors[key] || '';
      $('err-' + key).textContent = msg;
      $(key).classList.toggle('invalid', !!msg);
      $(key).setAttribute('aria-invalid', String(!!msg));
    }
  }

  /* ---------- renderers ---------- */

  function renderPrintConfig(r) {
    const c = r.config;
    const top = r.top.layers.map((l) => l.name).join(' + ');
    $('print-config').textContent =
      `Configuration — use: ${c.label} · finished height: ${fmtHeight(c.height)} · top: ${top} · ` +
      `shelf: ${c.shelf ? 'yes' : 'no'} · casters: ${c.mobility.count} × ${c.mobility.label}, ${fmtLen(c.casterHeight)} overall`;
  }

  function renderWarnings(warnings) {
    $('warnings').replaceChildren(...warnings.map((w) => el('div', { class: 'warning' }, w)));
  }

  function renderSummary(r) {
    const cards = [
      ['height', 'Finished height', fmtHeight(r.config.height)],
      ['top', 'Top thickness', fmtLen(r.top.thickness)],
      ['king', 'Leg kings ×6', fmtLen(r.legs.king)],
      ['jack', 'Leg jacks ×6', fmtLen(r.legs.jack)],
      ['shelf', 'Shelf bay', r.shelf ? fmtLen(r.legs.jack) + ' tall' : 'none'],
      ['sheets', '3/4" plywood', `${r.sheets.ply34} sheets`],
      ['boards', '2x4 lumber', `${r.boards.ten} × 10 ft + ${r.boards.eight} × 8 ft`],
      ['weight', 'Est. weight', fmtWeight(r.weight.total)],
    ];
    $('summary').replaceChildren(
      ...cards.map(([key, k, v]) =>
        el('div', { class: 'summary-card', 'data-key': key },
          el('span', { class: 'k' }, k),
          el('span', { class: 'v' }, v))
      )
    );
  }

  function cutRow(p) {
    const stock = p.stock === 'ply' ? '3/4" ply' : p.stock === 'skin' ? '1/4" skin' : p.stock;
    return el('tr', { 'data-part': p.name },
      el('td', null, p.name),
      el('td', { class: 'num' }, p.qty),
      el('td', { class: 'num' }, stock),
      el('td', { class: 'dim' }, `${fmtLen(p.t)} × ${fmtLen(p.w)} × ${fmtLen(p.len)}`),
      el('td', null, p.details));
  }

  function renderCutlist(r) {
    const lumber = r.cutList.filter((p) => p.stock === '2x4' || p.stock === '2x6');
    const sheets = r.cutList.filter((p) => p.stock === 'ply' || p.stock === 'skin');
    $('cutlist-lumber').querySelector('tbody').replaceChildren(...lumber.map(cutRow));
    $('cutlist-sheets').querySelector('tbody').replaceChildren(...sheets.map(cutRow));
    $('boards-note').textContent =
      `Buy ${r.boards.ten} × 10 ft and ${r.boards.eight} × 8 ft 2x4s (packed with a ${fmtLen(CALC.KERF)} kerf), ` +
      `${r.sheets.ply34} sheets of 3/4" plywood` + (r.sheets.skin ? ` and ${r.sheets.skin} sheets of 1/4" skin.` : '.') +
      ' Nominal 2x4 = 1-1/2" × 3-1/2" actual.';
  }

  function renderMaterials(r) {
    $('materials').replaceChildren(
      ...r.materials.map((m) =>
        el('li', null,
          m.qty != null ? el('span', { class: 'qty' }, `${m.qty}× `) : null,
          m.item,
          m.notes ? el('span', { class: 'note' }, ` — ${m.notes}`) : null)
      )
    );
  }

  function renderBuildSteps(r) {
    const c = r.config;
    const stations = (list) => list.map((s) => fmtLen(s)).join(', ');
    const leveling = c.mobility.type === 'leveling';
    const steps = [
      [b('Choose the spot.'), ' The finished top is 60" × 120" and will not fit through a door, so build it where it will live.',
        c.use === 'outfeed' ? substep(`Measure the saw's table height on this floor, where the table will park. The sheet is set for ${fmtLen(c.sawHeight)} with a ${fmtLen(c.sawDrop)} drop.`) : null],

      [b('Cut the lumber'), ' per the cut list. Mark the crown on every board; the straightest four become rails. Kings at ',
        b(fmtLen(r.legs.king)), ', jacks at ', b(fmtLen(r.legs.jack)), '.'],

      [b('Assemble the top frame.'), ' Rails on edge, cross members between them at ', stations(r.joists),
        ' from one end (centreline). Glue plus two 3" screws per joint, pre-drilled. Check both diagonals: ',
        b(fmtLen(CALC.frameDiagonal(CALC.FRAME.l, CALC.FRAME.w))), ' and equal within 1/8".',
        r.sisters.length ? substep(`Single-layer top: glue a sister beside the joists at ${stations(r.sisters)} so each seam gets 3" of bearing.`) : null],

      [b('Assemble the base frame'), ' the same way, cross members at ', stations(r.base), '.'],

      [b('Laminate the legs.'), ' Glue each jack to a king with its bottom end ', b(fmtLen(CALC.TWO_BY_FOUR.w)),
        ' above the king\'s bottom, 3" screws every 8". The jack is what the frames bear on.'],

      [b('Attach the legs.'), ' Top frame upside down on the floor. Set a leg at each corner and mid-span (', stations(CALC.LEG_STATIONS),
        '), king outside the rail, jack tucked under the cross member. Four 5/16" × 4" structural screws per leg through the rail. Check square.'],

      [b('Add the base frame.'), ' Drop it over the kings so each cross member lands on the end of a jack. Four more structural screws per leg.'],

      r.advice.braces
        ? [b('Fit the diagonal braces.'), ' One per bay on both long sides, corner leg to middle leg, 3" screws. Mark and cut the angled ends in place.']
        : null,

      [b('Pads and casters.'), ' Screw a 2x6 pad to the bottom of each king. Lag the casters to the pads with 5/16" × 1-1/2" lags and washers.',
        leveling ? substep('Leveling casters: wind every foot fully up before the flip.') : null],

      [b('Flip it.'), ' Two or three people. Lock the casters before anyone lets go.'],

      c.shelf ? [b('Fit the shelf.'), ' Two 48 × 54 panels, seam on the centre leg line, notched 3" × 5" at each leg and screwed to the base frame. Do this before the top goes on.'] : null,

      [b('Check the frame plane.'), ' Straightedge across the joists in both directions. Plane or shim high spots; this is what makes the top flat.'],

      [b('Top layer 1.'), ' Two full 5 × 5 sheets (', r.panels[1].map((p) => fmtLen(p.len)).join(' / '), '), factory edges out, seam over the centre joist at ', stations(CALC.seamStations(1)),
        '. #8 × 2" screws every 8" along every joist.'],

      c.topLayers > 1
        ? [b('Top layer 2.'), ' Rip one sheet in half and lay ', r.panels[2].map((p) => fmtLen(p.len)).join(' / '), ' so the seams land at ', stations(CALC.seamStations(2)),
           ', 30" clear of the layer-1 seam. Glue the whole face and screw from below with #8 × 1-1/4" screws from inside the bays.']
        : null,

      c.skin
        ? [b('Skin.'), ' Two full 5 × 5 sheets, seam over the centre joist. Countersunk screws only, no glue, so it can be swapped when it gets chewed up.']
        : null,

      [b('Trim and finish.'), ' Flush-trim the edges, ease them with a roundover, sand, and finish with wipe-on poly or paste wax.',
        c.use === 'outfeed' ? substep('Rout mitre-slot extensions, 7/16" deep × 1" wide, aligned with the saw\'s slots. Then set the height with the leveling feet.') : null,
        leveling && c.use !== 'outfeed' ? substep('Park it, wind the feet down until the wheels are just off the floor, and check with a level.') : null],

      [b('After a week,'), ' re-tighten the caster lags and leg screws once the lumber has settled.'],
    ].filter(Boolean);
    $('build-steps').replaceChildren(...steps.map((s) => el('li', null, ...s)));
  }

  function renderCaster(r) {
    const c = r.config;
    const row = (k, v) => el('tr', null, el('td', null, k), el('td', null, v));
    const rows = [
      row('Casters', `${c.mobility.count} × ${c.mobility.label}`),
      row('Table weight (est.)', fmtWeight(r.weight.total)),
      row('Working load assumed', fmtWeight(c.workingLoadLb)),
    ];
    if (r.caster) {
      rows.push(row('Casters assumed carrying', `${r.caster.effectiveCount} of ${c.mobility.count}`));
      rows.push(row('Safety factor', `× ${r.caster.safetyFactor}`));
      rows.push(row('Needed per caster', fmtWeight(r.caster.perCasterLb)));
      rows.push(row('Buy casters rated', r.caster.tierLb ? `${r.caster.tierLb} lb each or more` : 'above the usual catalogue — use industrial casters'));
    }
    $('caster-card').replaceChildren(
      el('div', { class: 'caster-card' },
        el('h4', null, 'Caster rating'),
        el('table', null, ...rows),
        r.caster ? null : el('p', { class: 'todo' }, 'Rating policy not set yet — see requiredCasterRating() in calc.js.'))
    );
    $('notes').replaceChildren(...r.notes.map((n) => el('li', null, n)));
  }

  /* ---------- SVG drawings ---------- */

  // Drafting-style dimension line with 45° tick marks.
  function dimNodes(x1, y1, x2, y2, label, opts = {}) {
    const tick = 4;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
    const t1 = horizontal
      ? `M${x1 - tick},${y1 + tick} L${x1 + tick},${y1 - tick}`
      : `M${x1 - tick},${y1 - tick} L${x1 + tick},${y1 + tick}`;
    const t2 = horizontal
      ? `M${x2 - tick},${y2 + tick} L${x2 + tick},${y2 - tick}`
      : `M${x2 - tick},${y2 - tick} L${x2 + tick},${y2 + tick}`;
    const dy = 'dy' in opts ? opts.dy : horizontal ? -5 : 0;
    const textAttrs = {
      class: 'svg-dim-text',
      x: mx + (opts.dx || 0),
      y: my + dy,
      'text-anchor': opts.anchor || 'middle',
    };
    if (opts.rotate) textAttrs.transform = `rotate(${opts.rotate} ${mx} ${my})`;
    return [
      svgEl('path', { class: 'svg-dim', d: `M${x1},${y1} L${x2},${y2} ${t1} ${t2}` }),
      svgEl('text', textAttrs, label),
    ];
  }

  function drawPlan(r) {
    const k = 6; // px per inch
    const pad = 44;
    const T = CALC.TOP, O = CALC.OVERHANG, F = CALC.FRAME, W = CALC.TWO_BY_FOUR;
    const px = (x) => pad + x * k; // top coords -> px
    const py = (y) => pad + y * k;
    const nodes = [];

    // top outline
    nodes.push(svgEl('rect', { class: 'svg-ply', x: px(0), y: py(0), width: T.l * k, height: T.w * k }));
    // frame rails and cross members (dashed, under the top)
    nodes.push(svgEl('rect', { class: 'svg-joist', x: px(O), y: py(O), width: F.l * k, height: F.w * k }));
    nodes.push(svgEl('line', { class: 'svg-joist', x1: px(O), y1: py(O + W.t), x2: px(O + F.l), y2: py(O + W.t) }));
    nodes.push(svgEl('line', { class: 'svg-joist', x1: px(O), y1: py(O + F.w - W.t), x2: px(O + F.l), y2: py(O + F.w - W.t) }));
    for (const s of r.joists) {
      nodes.push(svgEl('rect', { class: 'svg-joist', x: px(O + s - W.t / 2), y: py(O + W.t), width: W.t * k, height: (F.w - 2 * W.t) * k }));
    }
    for (const s of r.sisters) {
      nodes.push(svgEl('rect', { class: 'svg-joist', x: px(O + s + W.t / 2), y: py(O + W.t), width: W.t * k, height: (F.w - 2 * W.t) * k }));
    }
    // legs (king 3.5 along the rail × 3 across), outside the rails
    for (const s of CALC.LEG_STATIONS) {
      for (const y of [O - 3, O + F.w]) {
        nodes.push(svgEl('rect', { class: 'svg-leg', x: px(O + s - W.w / 2), y: py(y), width: W.w * k, height: 3 * k }));
      }
    }
    // layer 1 seams (solid) and panel labels
    for (const p of r.panels[1]) {
      nodes.push(svgEl('text', { class: 'svg-panel-label', x: px(p.x + p.len / 2), y: py(T.w / 2) - 8 }, `${p.id} · ${fmtLen(p.len)} × ${fmtLen(p.w)}`));
    }
    for (const s of CALC.seamStations(1)) {
      nodes.push(svgEl('line', { class: 'svg-seam-1', x1: px(s + O), y1: py(0), x2: px(s + O), y2: py(T.w) }));
    }
    if (r.panels[2]) {
      for (const s of CALC.seamStations(2)) {
        nodes.push(svgEl('line', { class: 'svg-seam-2', x1: px(s + O), y1: py(0), x2: px(s + O), y2: py(T.w) }));
      }
      for (const p of r.panels[2]) {
        nodes.push(svgEl('text', { class: 'svg-label', x: px(p.x + p.len / 2), y: py(T.w / 2) + 12, 'text-anchor': 'middle' }, `${p.id} ${fmtLen(p.len)}`));
      }
    }
    if (r.config.skin) {
      nodes.push(svgEl('line', { class: 'svg-seam-skin', x1: px(T.l / 2), y1: py(0), x2: px(T.l / 2), y2: py(T.w) }));
    }
    // dimensions
    nodes.push(dimNodes(px(0), py(T.w) + 22, px(T.l), py(T.w) + 22, fmtLen(T.l)));
    nodes.push(dimNodes(px(0) - 22, py(0), px(0) - 22, py(T.w), fmtLen(T.w), { rotate: -90, dy: -6 }));
    nodes.push(dimNodes(px(O), py(0) - 16, px(O + F.l), py(0) - 16, `frame ${fmtLen(F.l)}`));
    nodes.push(dimNodes(px(T.l) + 22, py(0), px(T.l) + 22, py(O), fmtLen(O), { rotate: 90, dy: -6 }));
    nodes.push(svgEl('text', { class: 'svg-label', x: px(0), y: py(T.w) + 42 }, 'joists at ' + r.joists.map((s) => fmtLen(s)).join(' · ') + ' from the frame end'));

    return svgEl('svg', {
      viewBox: `0 0 ${px(T.l) + pad + 10} ${py(T.w) + 56}`,
      xmlns: SVG_NS,
      role: 'img',
      'aria-label': `Plan view of the 60 by 120 inch top (5 by 5 sheets) over the 48 by 108 inch frame, with joists, six legs and the plywood seams of ${r.panels[2] ? 'both layers' : 'the single layer'}.`,
    }, nodes);
  }

  // One caster under a leg centred at cx: plate, wheel, and a foot for leveling casters.
  function casterNodes(nodes, cx, floorY, c, k) {
    const wheelR = Math.max((c.casterHeight - 0.5) / 2, 1) * k;
    nodes.push(svgEl('rect', { class: 'svg-caster', x: cx - 2 * k, y: floorY - c.casterHeight * k, width: 4 * k, height: 0.4 * k }));
    nodes.push(svgEl('circle', { class: 'svg-caster', cx, cy: floorY - wheelR, r: wheelR }));
    if (c.mobility.type === 'leveling') {
      nodes.push(svgEl('rect', { class: 'svg-foot', x: cx + 2.2 * k, y: floorY - 1.2 * k, width: 2 * k, height: 1.2 * k }));
    }
  }

  // Chain dimension (caster, pad, king, top) up the left, total height on the right.
  function heightDimNodes(nodes, r, py, leftX, rightX, k) {
    let acc = 0;
    for (const part of r.stack) {
      if (part.h * k > 14) {
        nodes.push(dimNodes(leftX, py(acc), leftX, py(acc + part.h), `${part.name} ${fmtLen(part.h)}`, { rotate: -90, dy: -6 }));
      }
      acc += part.h;
    }
    nodes.push(dimNodes(rightX, py(0), rightX, py(r.config.height), `height ${fmtHeight(r.config.height)}`, { rotate: 90, dy: -6 }));
  }

  function drawElevation(r) {
    const k = 6;
    const pad = 44;
    const c = r.config;
    const T = CALC.TOP, O = CALC.OVERHANG, F = CALC.FRAME, W = CALC.TWO_BY_FOUR;
    const H = c.height;
    const floorY = pad + H * k + 10;
    const px = (x) => pad + 40 + x * k;
    const py = (y) => floorY - y * k; // height above floor -> px
    const nodes = [];

    const padTop = c.casterHeight + CALC.PAD_T;
    const topUnderside = H - r.top.thickness;

    // floor
    nodes.push(svgEl('line', { class: 'svg-floor', x1: px(-10), y1: floorY, x2: px(T.l + 10), y2: floorY }));
    for (let x = -10; x < T.l + 10; x += 4) {
      nodes.push(svgEl('line', { class: 'svg-hatch', x1: px(x), y1: floorY, x2: px(x - 2), y2: floorY + 7 }));
    }
    // legs: kings from pad top to the underside of the top
    for (const s of CALC.LEG_STATIONS) {
      const x = px(O + s - W.w / 2);
      nodes.push(svgEl('rect', { class: 'svg-leg', x, y: py(topUnderside), width: W.w * k, height: (topUnderside - padTop) * k }));
      nodes.push(svgEl('rect', { class: 'svg-wood-dark', x: px(O + s - 3.5), y: py(padTop), width: 7 * k, height: CALC.PAD_T * k }));
      casterNodes(nodes, px(O + s), floorY, c, k);
    }
    // base frame rail (in front of the legs) and shelf
    nodes.push(svgEl('rect', { class: 'svg-wood', x: px(O), y: py(padTop + W.w), width: F.l * k, height: W.w * k }));
    if (r.shelf) {
      nodes.push(svgEl('rect', { class: 'svg-ply', x: px(O), y: py(padTop + W.w + CALC.PLY), width: F.l * k, height: CALC.PLY * k }));
    }
    // top frame rail
    nodes.push(svgEl('rect', { class: 'svg-wood', x: px(O), y: py(topUnderside), width: F.l * k, height: W.w * k }));
    // top layers, bottom up
    let y = topUnderside;
    r.top.layers.forEach((l, i) => {
      const cls = l.t < 0.5 ? 'svg-skin' : i === 0 ? 'svg-ply' : 'svg-ply svg-ply-2';
      nodes.push(svgEl('rect', { class: cls, x: px(0), y: py(y + l.t), width: T.l * k, height: l.t * k }));
      y += l.t;
    });
    heightDimNodes(nodes, r, py, px(0) - 24, px(T.l) + 26, k);
    if (r.shelf) {
      const sx = px(O + 27);
      nodes.push(dimNodes(sx, py(padTop + W.w + CALC.PLY), sx, py(topUnderside), `shelf bay ${fmtLen(r.legs.jack - CALC.PLY)}`, { rotate: -90, dy: -6 }));
    }
    // outfeed: ghost saw to the left, with the drop
    if (c.use === 'outfeed') {
      const sawW = 27, sawH = c.sawHeight;
      nodes.push(svgEl('rect', { class: 'svg-ghost', x: px(-sawW - 2), y: py(sawH), width: sawW * k, height: (sawH - 2) * k }));
      nodes.push(svgEl('text', { class: 'svg-label', x: px(-sawW / 2 - 2), y: py(sawH) - 8, 'text-anchor': 'middle' }, `saw ${fmtLen(sawH)}`));
      nodes.push(svgEl('text', { class: 'svg-dim-text', x: px(1), y: py(H) - 8, 'text-anchor': 'start' }, `drop ${fmtLen(c.sawDrop)}`));
    }

    const left = c.use === 'outfeed' ? px(-31) - 8 : px(-10) - 70;
    return svgEl('svg', {
      viewBox: `${left} 0 ${px(T.l + 10) + 60 - left} ${floorY + 24}`,
      xmlns: SVG_NS,
      role: 'img',
      'aria-label': `Side elevation of the table at ${fmtHeight(H)} finished height: casters, pads, six legs, base frame${r.shelf ? ' with shelf' : ''}, top frame and the top layers.`,
    }, nodes);
  }

  // Looking at the 60" end: overhang both sides, rail ends, legs outside the rails.
  function drawEnd(r) {
    const k = 6;
    const pad = 44;
    const c = r.config;
    const T = CALC.TOP, O = CALC.OVERHANG, F = CALC.FRAME, W = CALC.TWO_BY_FOUR;
    const H = c.height;
    const LEG_T = 2 * W.t; // king + jack laminated
    const floorY = pad + H * k + 10;
    const px = (x) => pad + 40 + x * k; // across the width, 0 = top edge
    const py = (y) => floorY - y * k;
    const nodes = [];

    const padTop = c.casterHeight + CALC.PAD_T;
    const topUnderside = H - r.top.thickness;
    const legXs = [O - LEG_T, O + F.w]; // left edge of each leg

    nodes.push(svgEl('line', { class: 'svg-floor', x1: px(-8), y1: floorY, x2: px(T.w + 8), y2: floorY }));
    for (let x = -8; x < T.w + 8; x += 4) {
      nodes.push(svgEl('line', { class: 'svg-hatch', x1: px(x), y1: floorY, x2: px(x - 2), y2: floorY + 7 }));
    }
    for (const lx of legXs) {
      nodes.push(svgEl('rect', { class: 'svg-leg', x: px(lx), y: py(topUnderside), width: LEG_T * k, height: (topUnderside - padTop) * k }));
      nodes.push(svgEl('rect', { class: 'svg-wood-dark', x: px(lx + LEG_T / 2 - 2.75), y: py(padTop), width: 5.5 * k, height: CALC.PAD_T * k }));
      casterNodes(nodes, px(lx + LEG_T / 2), floorY, c, k);
    }
    // base and top frames seen end-on: cross member face between the rail ends
    for (const bottom of [padTop, topUnderside]) {
      nodes.push(svgEl('rect', { class: 'svg-wood-dark', x: px(O), y: py(bottom + W.w), width: W.t * k, height: W.w * k }));
      nodes.push(svgEl('rect', { class: 'svg-wood-dark', x: px(O + F.w - W.t), y: py(bottom + W.w), width: W.t * k, height: W.w * k }));
      nodes.push(svgEl('rect', { class: 'svg-wood', x: px(O + W.t), y: py(bottom + W.w), width: (F.w - 2 * W.t) * k, height: W.w * k }));
    }
    if (r.shelf) {
      nodes.push(svgEl('rect', { class: 'svg-ply', x: px(O), y: py(padTop + W.w + CALC.PLY), width: F.w * k, height: CALC.PLY * k }));
    }
    let y = topUnderside;
    r.top.layers.forEach((l, i) => {
      const cls = l.t < 0.5 ? 'svg-skin' : i === 0 ? 'svg-ply' : 'svg-ply svg-ply-2';
      nodes.push(svgEl('rect', { class: cls, x: px(0), y: py(y + l.t), width: T.w * k, height: l.t * k }));
      y += l.t;
    });
    heightDimNodes(nodes, r, py, px(0) - 24, px(T.w) + 26, k);
    nodes.push(dimNodes(px(0), floorY + 22, px(T.w), floorY + 22, fmtLen(T.w)));
    nodes.push(dimNodes(px(O), py(H) - 16, px(O + F.w), py(H) - 16, `frame ${fmtLen(F.w)}`));
    nodes.push(dimNodes(px(0), py(H) - 32, px(O), py(H) - 32, fmtLen(O)));
    nodes.push(svgEl('text', { class: 'svg-label', x: px(T.w / 2), y: py(H) - 44, 'text-anchor': 'middle' }, 'legs outside the rails'));

    const left = px(-8) - 70;
    return svgEl('svg', {
      viewBox: `${left} 0 ${px(T.w + 8) + 60 - left} ${floorY + 40}`,
      xmlns: SVG_NS,
      role: 'img',
      'aria-label': `End elevation of the 60 inch short side: the top overhangs the 48 inch frame by ${fmtLen(O)} each side, with a leg outside each rail${r.shelf ? ' and the shelf between the base rails' : ''}.`,
    }, nodes);
  }

  function renderDiagrams(r) {
    $('diagram-plan').replaceChildren(drawPlan(r));
    $('diagram-elev').replaceChildren(drawElevation(r));
    $('diagram-end').replaceChildren(drawEnd(r));
    $('legend-seam-2').hidden = !r.panels[2];
    $('legend-seam-skin').hidden = !r.config.skin;
  }

  /* ---------- main loop ---------- */

  function recalc() {
    const inputs = currentInputs();
    const errors = CALC.validate(inputs);
    renderErrors(errors);
    if (Object.keys(errors).length) return; // keep the last good sheet

    const r = CALC.computeAll(inputs);
    renderPrintConfig(r);
    renderWarnings(r.warnings);
    renderSummary(r);
    renderDiagrams(r);
    renderCutlist(r);
    renderMaterials(r);
    renderBuildSteps(r);
    renderCaster(r);
    save();
  }

  /* ---------- persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* private mode etc. — persistence is optional */
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s !== 'object' || s === null || !CALC.PRESETS[s.use]) return;
      state.units = s.units === 'metric' ? 'metric' : 'imperial';
      state.use = s.use;
      for (const k of ['height', 'sawHeight', 'sawDrop', 'casterHeight']) {
        state[k] = typeof s[k] === 'number' && isFinite(s[k]) ? s[k] : null;
      }
      for (const k of ['shelf', 'skin']) state[k] = typeof s[k] === 'boolean' ? s[k] : null;
    } catch (e) {
      /* corrupted storage — fall back to defaults */
    }
  }

  /* ---------- boot ---------- */

  restore();
  $('unit-imperial').addEventListener('click', () => setUnits('imperial'));
  $('unit-metric').addEventListener('click', () => setUnits('metric'));
  document.querySelectorAll('input[name="use"]').forEach((r) => r.addEventListener('change', onUseChange));
  $('table-form').addEventListener('input', onInput);
  $('reset-height').addEventListener('click', resetHeight);
  $('print-btn').addEventListener('click', () => window.print());

  setUnits(state.units); // syncs suffixes, writes fields, first recalc
})();
