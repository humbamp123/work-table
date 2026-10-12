# Mobile Work Table — plan sheet generator

Build plans for a sturdy, rolling **5 ft × 10 ft** work table. Pick how you'll use it
(assembly, shop bench, craft/layout, or table saw outfeed) and the finished height you
want; the page produces the cut list (5 × 5 plywood, 2x4 lumber), boards to buy, to-scale
drawings and build steps.

Plain HTML/CSS/JS, no build step. Served as a sub-site of
[andrespineda.dev](https://andrespineda.dev) via a git submodule.

## Files

| File | Role |
|---|---|
| `calc.js` | All the maths: presets, geometry, cut list, stock packing, materials, weight. Pure functions, inches and pounds, no DOM. |
| `app.js` | Reads the form, calls `CALC.computeAll`, renders the sheet and the two SVG drawings. |
| `test.js` | Smoke tests for `calc.js`. |
| `index.html`, `style.css` | The page. Same "drafting table" look as the bike-rack plan sheet. |

## Tests

```sh
npm test        # or: node test.js
```

Success is the printed line `ALL TESTS PASS`. Node treats this folder as CommonJS
(`package.json` says so) so the tests run even when the folder sits inside an ESM project.

## Design in one paragraph

Top 60 × 120 with a 6" overhang all round, so the frame is 48 × 108 and the 45" cross
members come two to an 8 ft 2x4. Plywood is 5 × 5 (Baltic birch format): layer 1 is two
whole sheets with the seam on the centre leg line, layer 2 is 30/60/30 so its seams sit
30" away, and every seam lands on a joist. The shelf is two 48 × 54 panels. Six legs, each a
full-height 2x4 "king" plus a "jack" that bears wood-on-wood between the frames. The
finished height is the visitor's choice (28"–44"): `king = height − top − pad − caster`,
`jack = king − 7`. Everything else is fixed.

## Caster policy

`requiredCasterRating()` in `calc.js` decides the per-caster load rating. It is written by
the site owner; the policy and its reasoning are recorded here once it lands.
