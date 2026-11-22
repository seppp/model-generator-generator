# Model generator generator

Parametric 3D-print generators (QR code keychains, coasters, signs, ...) that
run entirely in the browser, plus matching Onshape FeatureScript features, all
produced from short JSON **recipes**.

**Site:** https://seppp.github.io/model-generator-generator/ (after GitHub Pages is enabled, see below)

```
recipes/qr-keychain.json ─┐
recipes/coaster.json      ├─ npm run build ─▶ dist/<id>/index.html     web generator (form, 3D preview, STL / 3MF)
recipes/sign.json         ┘                   dist/featurescript/<id>.fs   Onshape custom feature
```

## How it works

- A **recipe** lists parameters and steps. Each step takes a 2D block (`shape`,
  `qr`, `text`), extrudes it and adds it to a colored part or cuts it away. Values
  are small expressions like `"width - 2 * margin"`. See
  [docs/RECIPES.md](docs/RECIPES.md).
- The **engine** (`engine/`) runs a recipe with [manifold-3d](https://github.com/elalish/manifold)
  (WASM, watertight booleans) in the browser or Node, and exports binary STL and
  3MF. The same recipe is compiled to **FeatureScript** with every expression
  translated, so the Onshape feature stays parametric.
- The **website** (`web/`) builds the form from the recipe's params, rebuilds
  the model on every change and shows it with three.js. Settings live in the URL,
  so links are shareable. Nothing is uploaded anywhere.
- The **Recipe lab** page lets you edit a recipe and see the generator update
  live, then download the JSON.

## Multi-color printing (Prusa Core One and friends)

Each generator has colored parts. The page offers:

- **3MF, filament swap**: when the parts are stacked (raised QR code, raised
  text), a PrusaSlicer project with the M600 color change already at the right
  layer for the chosen layer height. One nozzle, no MMU needed.
- **3MF, multi-material**: one object with one part per color and extruders
  assigned, for MMU / INDX / tool changers (needed for flush inlays).
- **STL**: all parts in one file or one file per part.

## Changing a generator

Generators are never edited directly: change the recipe and everything is
regenerated (web page, exports, FeatureScript).

1. Change `recipes/<id>.json`, for example add a param and use it in a step.
   - **No setup, any AI chat:** click *Change this generator* on a generator
     page. In the Recipe lab, describe the change, click *Copy prompt for an AI
     chat* (it contains the recipe, the format reference and your current
     settings), paste it into ChatGPT, Claude, Gemini..., paste the answer back
     and click *Apply to preview*. The lab extracts and checks the recipe and
     tells you what to send back to the AI if something is wrong.
   - **Try it first in the Recipe lab** (*Change this generator* on every
     generator page): edit the recipe and the generator rebuilds live in your
     browser, keeping your settings and camera. *Changes* shows the diff
     against the published version, drafts survive a reload, and
     *Edit on GitHub* copies the recipe and opens the file so you can paste it
     and start a pull request.
   - Or ask Claude ("on the QR keychain, make the corner hole position
     adjustable"); it uses the `new-generator` skill.
2. `npm run check` (CI runs it too) builds the recipe with every option and
   extreme value.
3. Merge to `main`. GitHub Actions rebuilds and redeploys the site within a
   minute or two; download a fresh `.fs` for Onshape.

Shared links keep working as long as param `key`s stay the same: missing
values fall back to the defaults, unknown ones are ignored.

## Adding a generator

1. Write `recipes/<id>.json` (copy one of the existing ones, or start in the
   Recipe lab on the site and download it).
2. `npm run check` validates it and builds it with many parameter combinations.
3. `npm run dev` and open http://localhost:8080/<id>/.
4. Commit. On `main` the GitHub Action rebuilds and publishes the site.

The repo includes a Claude Code skill, [`.claude/skills/new-generator`](.claude/skills/new-generator/SKILL.md),
so you can also just describe an idea to Claude ("a plant label with the plant's
name and a spike") and it writes the recipe, adding a block if needed.

## Using the FeatureScript in Onshape

1. Download the `.fs` from a generator page (it uses the current settings as
   defaults) or take `dist/featurescript/<id>.fs`.
2. In Onshape, create a Feature Studio, replace its contents with the file and
   commit. If Onshape complains about the version on the first two lines, keep
   the two header lines of a fresh Feature Studio instead.
3. In a Part Studio, add the feature from the custom features menu.

QR content is baked into the file (Onshape has no QR encoder); all sizes and
options remain feature inputs.

## Commands

```
npm install
npm run check                 # validate + build every recipe in Node
npm run dev                   # build to dist/ and serve on http://localhost:8080
npm run build                 # build dist/ only
npm run format                # canonical JSON formatting for recipes (check enforces it)
npm run export -- qr-keychain content=https://example.com style=flush   # files to out/
```

## Deploying

`.github/workflows/pages.yml` runs the checks on every push and pull request
and deploys `dist/` to GitHub Pages from `main`. One-time setup: repository
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
