# Football Tactics Test Sim (FTTS)

A 2D football tactics previewer. Pick a **formation**, **fluidity** and **mentality**
for two teams (hotseat), assign each player a **role** and **duty**, and the engine
lays out both sides on a pitch and shows every player's on-pitch responsibility —
computed strictly from a fixed tactics guide (rules 1–7 plus the full
fluidity × mentality × role responsibility tables).

It's a decision aid: test what you have in mind before a real match and see how a
shape and mentality resolve into individual instructions.

## Play

Hosted on GitHub Pages: **https://gorstak-zadar.github.io/FTTS/**

Or open `index.html` locally in any modern browser — no build step, no dependencies.

## How it works

- **Rule 1** — recommended mentality from the midfield triangle, i.e. which of
  the three central-midfield bands (DM / MC / AMC) the formation fields:
  DM+MC+AMC→attacking, MC+AMC→control, DM+AMC→standard, DM+MC→counter,
  MC→defensive. Combinations outside those five are not covered by the guide, so
  no Rule-1 recommendation is shown.
- **Rule 2** — recommended fluidity from the number of horizontal **lines
  missing** from the shape. There are six spine lines: **SW/Lib**, **CB/FB**,
  **DM/WB**, **CM/WM**, **W/AMC** and **ST**. Missing = 6 − present:
  0→very fluid, 1→fluid, 2→flexible, 3→structured, 4→highly structured.
  (A flat 4-4-2 has CB/FB + CM/WM + ST = 3 lines present, so 3 missing →
  structured.)
- **Rule 3** — what each fluidity level means.
- **Rule 4** — recommended number of support duties per fluidity (lower with
  3 CBs): very fluid 8-9, fluid 6-7, flexible 4-5, structured 2-3, highly
  structured 0-1.
- **Rule 5** — strong / weak spot (horizontal from fluidity, vertical from mentality).
- **Rule 6** — mentality efficiency across the 90 minutes.
- **Rule 7** — warnings (cards/injuries, decisions, form, weather, home/away).
- **Rule 8** — per-player responsibilities, resolved from the guide's tables.

Team A attacks right, Team B attacks left. Dots show position, role (duty) and the
resolved responsibility.

## Project layout

```
index.html            app shell
css/style.css         theme (matches gorstak.eu)
js/formations.js      formation catalogue (common first, then by defender count)
js/roles.js           positions, valid roles + duties, attacker/defender classification
js/responsibilities.js         resolver + "very fluid" table
js/responsibilities-data2.js   fluid / flexible / structured / highly structured tables
js/engine.js          rules 1–7
js/pitch.js           canvas renderer
js/app.js             UI wiring
test/test.html        in-browser engine self-test
```

## Tests

Open `test/test.html` in a browser to run the engine self-test (rule outputs and a
sampling of responsibility lookups against the guide).

## License

MIT
