# CLAUDE.md

Guidance for Claude (and other contributors) working in this repo.

## What this is

An open-source collection of animated, generative wallpapers, served as live HTML pages on GitHub Pages (`https://shanerybacki.github.io/wallpapers/`). They're used as desktop wallpapers through Plash (macOS) and Lively Wallpaper (Windows). Themes will grow beyond statistics, for example music visuals. The first wallpaper is `wallpapers/gaussian-process/`.

A main goal is **reducing OLED burn-in**, which drives many of the rules below.

## Core decisions (don't change without asking)

- **Clock-synced.** Every frame is a pure function of shared wall-clock time `t` (from `shared/clock.js`), the seed and URL params, so anyone with the same URL sees the same frame. Never use `Math.random()`, page-load time or per-session state for anything visible. Use `createRng(seed, ...keys)` from `shared/rng.js`.
- **No build step, no dependencies.** Plain ES modules + Canvas 2D. GitHub Pages serves the `main` branch root as is (`.nojekyll` is present). Don't add bundlers, frameworks or npm packages.
- **Flat layout.** One folder per wallpaper at `wallpapers/<slug>/`. Category lives in `meta.json`, never in the path, so URLs stay stable.
- **Native refresh rate.** The loop runs at the display rate (the owner uses 120 Hz). `?fps=` is only an optional cap.
- **No pixel shift, no drift.** The owner's monitor already does pixel shift, so wallpapers don't need to move their content around for wear. In the Gaussian process wallpaper, the zero line (the prior mean) stays fixed at the vertical center, at the owner's request.

## OLED rules (every wallpaper)

1. Pure black background: `oled.clear()` runs every frame.
2. No static elements: no axes, gridlines, labels, text or logos.
3. Lit pixels keep moving, and content covers the whole screen over time.
4. Build colors through `oled.color(r, g, b, a)` so `?brightness=` applies.

## Layout

- `shared/` holds code every wallpaper uses. `wallpaper.js` exports `run({ schema, setup, frame })`, the entry point for each page. Other shared modules: `rng`, `clock`, `params`, `canvas`, `loop`, `oled`, `linalg`, plus `wallpaper.css`.
- `wallpapers/<slug>/` holds one wallpaper: `index.html`, `main.js`, `meta.json` and any logic modules. Keep math and scene logic in modules separate from drawing so they can be unit-tested.
- `tests/*.test.js` holds unit tests using `node:test` and `node:assert/strict`.

Shared URL params are `seed`, `speed`, `brightness` and `fps`. A wallpaper adds its own through `schema` in `run()` and documents them in its `meta.json`.

## Adding a wallpaper

Create `wallpapers/<slug>/` with:
- `index.html` that loads `../../shared/wallpaper.css` and `main.js` as a module
- `main.js` that calls `run()`
- `meta.json` with `title`, `description`, `category`, `tags` and `params`

Then add it to the table in `README.md` and the list in `index.html`. Add tests for any non-trivial math or scene logic, including a determinism test (same seed + same `t` gives the same state).

## Running and testing

- Serve: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/wallpapers/<slug>/`. ES modules don't load over `file://`.
- Tests: `npm test` (Node 20+). CI runs them in `.github/workflows/test.yml`.
- Node may not be installed locally. If it isn't, run the tests in headless Chrome with a small import-map shim for `node:test` and `node:assert/strict`, or ask the owner before installing anything.
- For visual checks, take a headless Chrome screenshot: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1600,900 --virtual-time-budget=3000 --screenshot=<out.png> <url>`

## Style

- The owner's taste so far: pure black, moderate brightness, slow and ambient motion, cool blues and teals with warm accents.
- Keep the per-frame cost low. Wallpapers run all day, so precompute anything that doesn't depend on `t`.

## Gaussian process wallpaper

One sampling process ("episode") at a time, never overlapping. Everything is in `wallpapers/gaussian-process/scene.js`, and timings live in `TIMING`. Each process is on screen for exactly 10 minutes, then 3 s of black (603 s in all):
- **0–10.2 s:** prior draws stream in until a full set (`samples`, default 40) is on screen.
- **10.2–18.2 s:** only then is the true function drawn in, slowly (8 s; the owner halved its speed).
- **19 s onward:** 8 points appear one at a time, 1 minute apart (19, 79, … 439 s). Points are never removed.
- **Points fade in slowly** (`pointFade`, 2.5 s); the owner asked for them to appear "much slower".
- **Observation event:** just two soft rings rippling out from the new point (about 4.6 s), and the dot fades in gently. The owner asked for it to be much less dramatic: no vertical beam, no bloom, no flash. Settings are in `EVENT` in `main.js`.
- **True function line:** 1.15 px at rest with a soft glow beneath it (3× wider, 11% opacity), nearly opaque (95%). Points are drawn 1.15× larger to sit on it. The owner tried 4.5, 3.5 and 2.3 px before settling on a thin resting line that breathes wide.
- **Brightness:** the owner asked for everything slightly brighter. Draw lines are 32% opacity each, the palette lightness is 0.70 for draws and 0.84 for truth/points, and the point glow is 24%. The arrival rings were left understated.
- **Breathing** means size, not brightness: the true function's width (and its glow) swells from its resting width up to double and back, over a 6 s period, never thinner than resting. Points vary by ±30% in size. Opacity never changes (the owner was explicit about this, and wants it clearly noticeable). Points are phase-shifted by position, so it ripples along the curve. Settings are in `BREATH` in `main.js`.
- **Kernel:** RBF with lengthscale 1.0 (down from 1.2) for slightly wilder functions. The owner wants only a slight change here, so don't go much lower.
- **439–597 s:** the final posterior lingers on all 8 points. **597–600 s:** fade to black (the 10-minute mark). **600–603 s:** pure black. Then the next process starts.
- **Draws are frozen.** Each draw is sampled once, from the posterior given the points observed at its birth (Matheron's rule in `createSampler`), and never changes shape. The owner prefers this to morphing existing draws.
- **Draws fade; they don't erase or chase.** The owner tried a left-to-right erase and a "chase" (each new draw pushing an old one out) and much preferred fading. Each draw is drawn in left to right (`sweep`, 6.2 s), stays fully visible for its own random time (`hold`, 1–3 s), then fades (`fade`, 2 s). One is born every `life / samples` s, which keeps about `samples` on screen. The owner found 2 s lives too fast and an 11.5 s sweep too slow.
- **No "open water."** When a new point arrives, outdated draws are not cut short; they fade on their own schedules while fresh posterior draws keep arriving at the same rate. Cutting them short made new draws cross empty space, which the owner disliked ("treading on open waters"). The random holds stagger the fades so the picture never visibly "updates" all at once. A test checks that coverage across the screen never dips after a point.
- **Colors** use OKLCH (`shared/color.js`). Within a process, the draws and the truth/points are complementary (180° apart). Each new process turns the wheel 90°. Settings are in `PALETTE`.
- Functions are always drawn left to right. Only sampled functions and points are shown: the owner explicitly removed the mean line and the ±2σ band.

To preview a specific moment, use a scratch HTML page that overrides `Date.now` before importing `main.js`.

## Commits

Don't add a `Co-Authored-By: Claude` trailer (or any other AI attribution) to commit messages or PR descriptions. The owner doesn't want Claude associated with commits.

## Status

The proof of concept is done: the shared core, the Gaussian process wallpaper and the tests. Still to do: a gallery index generated from `meta.json`, a `_template/` folder with a CONTRIBUTING guide, Plash and Lively setup docs, theme palettes, and visual snapshot tests.
