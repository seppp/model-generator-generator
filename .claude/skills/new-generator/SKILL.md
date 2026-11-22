---
name: new-generator
description: Turn a 3D-print idea (keychain, coaster, sign, tag, holder...) into a new generator for this repo, or change an existing one (new options, fixes), by editing recipes and adding blocks when needed.
---

# New generator from an idea

In this repo a generator is a JSON **recipe** in `recipes/`. The build
(`npm run build`) turns every recipe into a page on the GitHub Pages site and an
Onshape FeatureScript feature. Your job is to write the recipe (and, rarely, a
new block); never hand-write a web page or FeatureScript for a single generator.

Read `docs/RECIPES.md` first. Use `recipes/qr-keychain.json`,
`recipes/coaster.json` and `recipes/sign.json` as examples.

## Steps

1. **Pin down the idea.** What is printed, typical size, which parts get which
   color, what the user will want to change (text, size, style). If something
   important is unclear, ask one short question; otherwise pick sensible
   defaults and say which.
2. **Choose the parts** (one per color, in the order a filament swap would
   happen, bottom first) and the **params** (only what people actually change,
   with realistic `min`/`max` and `group`s for the form).
3. **Express the geometry as steps** using the existing blocks (`shape`, `qr`,
   `text`). Typical patterns:
   - plate: `add shape` to `base` from `z: 0`
   - raised detail: `add` to an accent part at `z: "thickness"` (stacked, so a
     single-nozzle filament swap works)
   - flush inlay: `add` to the accent part at `z: "thickness - depth"` (parts
     never overlap, so this also cuts the pocket)
   - engraving: `subtract` with `from: "base"`
   - holes: `subtract` with `through: true`
   - rims and frames: `add` an outline, then `subtract` a smaller one at the
     same `z`
   - options: use `when` on steps and `showIf` on params
4. **Add notes** for print advice that depends on the settings.
5. **Check it**: `npm run check` builds every recipe with defaults and with each
   option and number extreme. Fix all problems.
6. **Look at it**: `npm run export -- <id> key=value ...` writes STL, 3MF and
   `.fs` files to `out/`; `npm run dev` serves the site at
   http://localhost:8080/?recipe=<id>. If you can, take a screenshot with Playwright
   and look at the preview before calling it done.
7. Commit the recipe (and anything else you changed) and open a PR. Mention
   that the FeatureScript was generated but not run in Onshape unless someone
   tried it.

## Changing an existing generator

Same loop: edit the recipe, `npm run check`, look at it, commit, PR, merge
(the owner allows merging once CI is green). Keep existing param `key`s so
shared links keep working; give new params a default that keeps the current
look unless the request is to change it. If a new option can produce a broken
print (e.g. a hole cutting into the QR code), add a `derived` value that
measures it and a `note` that warns about it.

## When a block is missing

If the idea needs geometry the blocks cannot express (for example an SVG logo,
an arc of text, a revolve), add a block in `engine/blocks.js` following
"Adding a block" in `docs/RECIPES.md`: a manifold-3d `profile`, the matching
FeatureScript helper, argument schema, and docs. Keep blocks generic (2D
profile, extruded by the engine) so every recipe can use them.

## Printability rules of thumb (FDM, 0.4 mm nozzle)

- Walls and raised lines at least 0.8 mm wide; text at least 4 mm cap height.
- Raised or inlaid detail at least 0.4 mm (two layers) high; 0.8 to 1 mm reads well.
- QR modules at least 1 mm (the page warns below that); keep a margin of at
  least 2 mm around the code.
- Keyring holes at least 4 mm with at least 2 mm of material around.
