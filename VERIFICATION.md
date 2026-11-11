# Rebuild verification

## Automated simulation checks

`node --test tests/engine.test.mjs`: 5 tests passed. Checks cover seeded generation, every survivor's reachability, completion with A*/BFS/UCS/Greedy, pause/reset, rain speed and matching optimal weighted costs for A* and uniform-cost search. Python launcher compilation and JavaScript syntax checks passed.

## Chromium browser checks

The rebuilt page was exercised with Playwright and local Chromium, including a rendered WebGL city. Verified an actual rescue before pausing; drone selection; orbit/tactical cameras; building and flight-path layers; rain; route comparison; JSON download; reset; algorithm selection; scenario change; help dialog. No JavaScript page errors. No external network dependencies.

Visual review: desktop screenshot plus full mobile screenshot. Responsive checks at 1440, 1024, 768, 390 and 320 pixels. Preview artifacts are in `docs/`.

## Design skill checker

GATE: ERROR (the copy (the page showed no <main>, <section> or <h1> to lint); consistency.mjs gave no report (exit 1: Error: No Chrome, Edge or Chromium found; set CHROME_PATH.); check.mjs could not run (exit 2: no Chrome found (set CHROME_PATH)))

The design skill's gate could not locate the installed Playwright Chromium and therefore did not inspect the page. Its copy/consistency/layout checks are unverified. The separate Playwright browser verification and screenshot review above ran successfully using Chromium's explicit executable through Playwright. This project is a functional application workspace, rather than a marketing landing page.

## Scope

The new workspace uses a new local browser simulation engine. Original Python AI demonstrations and the live WebSocket bridge are preserved but are separate from this interface.
