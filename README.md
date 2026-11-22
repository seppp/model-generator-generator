# Model generator generator

Parametric 3D-print generators (QR code keychains, coasters, signs, ...) that
run entirely in the browser, plus matching Onshape FeatureScript features, all
produced from short JSON **recipes**.

**Site:** https://seppp.github.io/model-generator-generator/ (after GitHub Pages is enabled, see below)

```
recipes/qr-keychain.json ─┐
recipes/coaster.json      ├─ npm run build ─▶ dist/generators.json        all generators in one collection file
recipes/sign.json         ┘                   dist/index.html?recipe=<id>  web generator (form, 3D preview, downloads)
                                              dist/featurescript/<id>.fs   Onshape custom feature
```

## How it works

- A **recipe** lists parameters and steps. Each step takes a 2D block (`shape`,
  `frame`, `line`, `qr`, `text`), extrudes it and adds it to a colored part or cuts it away. Values
  are small expressions like `"width - 2 * margin"`. See
  [docs/RECIPES.md](docs/RECIPES.md).
- The **engine** (`engine/`) runs a recipe with [manifold-3d](https://github.com/elalish/manifold)
  (WASM, watertight booleans) in the browser or Node, and exports binary STL,
  3MF, OBJ and top-view outlines as SVG / DXF. The same recipe is compiled to **FeatureScript** with every expression
  translated, so the Onshape feature stays parametric.
- The **website** (`web/`) is a single page, the *Generator Generator*. It
  loads every generator from one collection file, `generators.json`, which the
  build makes from `recipes/`. Pick a generator at the top (`?recipe=<id>`);
  the page builds the form from the recipe's params, rebuilds the model on
  every change (*Live update* while typing or dragging; it pauses itself when a
  rebuild takes over 300 ms) and shows it with three.js in a preview that stays
  in view while you scroll. Settings live in the URL, so links
  are shareable. Nothing is uploaded anywhere. Old per-generator links
  (`/<id>/`, `/lab.html`) redirect.
- Under the generator, the collapsible **Change this generator** section is a
  guided flow: describe a change, copy a prompt for any AI chat, paste the
  answer back and preview it. The recipe code itself stays behind a *Recipe
  code* toggle. **+ New generator** starts from scratch or from a copy.
- **My generators**: *Save to my generators* keeps your version in this
  browser (localStorage, `?mine=<id>`). *Export all to a file* writes them to
  one `my-generators.json` in the same format as the site's `generators.json`,
  and *Import a file* reads either back.
- **Fonts**: text can use 39 open-licensed fonts (sans such as Inter and
  Montserrat, rounded, condensed, serif, display, script and monospace) or a
  font file you choose (kept in your browser). The picker lists them
  alphabetically under style headings. The page loads a font only when it is
  used. Onshape has its own font list, so the FeatureScript draws all of them
  with Open Sans.
- **Text styles and colors**: bold, italic and underline work with every font
  (drawn by the engine: grown outline, 12° slant, a printable line). The
  official generators also let the text take its own color as a separate part
  (keychain nametag, sign text); the coaster text already has one.
- **Share links** (`?shared#g=...`) carry the whole recipe, compressed, after
  the `#`, so nothing is stored on a server. A shared version opens with a
  banner saying it is not the official generator.
- **Submit to the site** opens a prefilled GitHub issue (label `submission`)
  with the share link and, when it fits, the recipe. The owner reviews these
  with the `review-submissions` skill.

## Multi-color printing (Prusa Core One and friends)

Each generator has colored parts. The page offers:

- **3MF, filament swap**: when the parts are stacked (raised QR code, raised
  text), a PrusaSlicer project with the M600 color change already at the right
  layer for the chosen layer height. One nozzle, no MMU needed.
- **3MF, multi-material**: one object with one part per color and extruders
  assigned, for MMU / INDX / tool changers (needed for flush inlays).
- **STL**: all parts in one file or one file per part.

**Borders and lines** (`frame` and `line` blocks): border lines along an
outline and straight lines (solid, dashed or dotted, flat or round ends),
raised, flush or engraved. The QR keychain has a border along the tag edge,
around the code and a line between nametag and code (same color as the code
or their own); the coaster a ring and lines above and below the text (same
color as the text or their own); the sign a border style, a second border
line and lines above and below the text (in the border color). All are off by
default (the sign's border stays on, as before).

Parts can have **chamfered or filleted** top and bottom edges, including a
*printable fillet* for the bottom: a 45° chamfer at the bed, then a fillet
above it, so it prints without supports. The QR keychain, coaster and sign
offer these under *Edges*.

## Other downloads

The *Download* panel (right column on wide screens, the *Download* button on
the preview on smaller screens and phones) also offers:

- **Image**: the current view as PNG, JPG or WebP at twice the screen
  resolution, optionally with a transparent background.
- **Vector**: each part's outline seen from above as SVG or DXF, in mm, one
  layer per part, for laser cutters, vinyl cutters or CNC.
- **CAD**: OBJ (mesh with colors) and the Onshape FeatureScript. STEP is not
  generated in the browser: it needs exact curved surfaces that a mesh engine
  doesn't have. Paste the FeatureScript into Onshape and export STEP,
  Parasolid and more from there.

## Backwards compatibility

Saved generators, exported files and share links keep older recipe versions
alive, so the engine never drops a name it once accepted. `tests/compat/`
holds older versions of the official recipes and `npm run check` builds them
all. Every deploy versions its module URLs (`?v=<build hash>`), so a browser
never mixes files from two deploys.

## Changing a generator

Generators are never edited directly: change the recipe and everything is
regenerated (web page, exports, FeatureScript).

**Anyone, on the website:** open *Change this generator*, describe the change,
click *Copy prompt for an AI chat* (it contains the recipe, the format
reference and your current settings), paste it into ChatGPT, Claude,
Gemini..., paste the answer back and click *Apply to preview*. The page
checks the recipe and tells you what to send back to the AI if something is
wrong. Then *Save to my generators*, *Copy share link*, or *Submit to the
site*. The recipe code is under *Recipe code* for editing by hand.

**The owner, in the repo:**

1. Change `recipes/<id>.json`, or ask Claude ("on the QR keychain, make the
   corner hole position adjustable"; it uses the `new-generator` skill).
   Submissions from visitors: ask Claude to review them (the
   `review-submissions` skill lists the issues, checks each recipe with
   `npm run submission` and adds the ones you accept).
2. `npm run check` (CI runs it too) builds the recipe with every option and
   extreme value.
3. Merge to `main`. GitHub Actions rebuilds and redeploys the site within a
   minute or two; download a fresh `.fs` for Onshape.

Shared links keep working as long as param `key`s stay the same: missing
values fall back to the defaults, unknown ones are ignored.

## Adding a generator

1. Write `recipes/<id>.json` (copy one of the existing ones, or start with
   *+ New generator* on the site and download it from *Recipe code*).
2. `npm run check` validates it and builds it with many parameter combinations.
3. `npm run dev` and open http://localhost:8080/?recipe=<id>.
4. Commit. On `main` the GitHub Action rebuilds and publishes the site.

The repo includes a Claude Code skill, [`.claude/skills/new-generator`](.claude/skills/new-generator/SKILL.md),
so you can also just describe an idea to Claude ("a plant label with the plant's
name and a spike") and it writes the recipe, adding a block if needed.

## Using the FeatureScript in Onshape

1. Download the `.fs` from the generator (it uses the current settings as
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
npm run check                 # validate + build every recipe (and the older versions in tests/compat) in Node
npm run dev                   # build to dist/ and serve on http://localhost:8080
npm run build                 # build dist/ only
npm run test:page             # after build: open every generator in Chromium, check the form (selects list their options) and console
npm run export -- <id|file.json> [key=value]  # STL / 3MF / OBJ / SVG / DXF / FS to out/
npm run submission < body.md  # check a submitted generator (issue body)
npm run format                # canonical JSON formatting for recipes (check enforces it)
```

## Deploying

`.github/workflows/pages.yml` runs the checks on every push and pull request
and deploys `dist/` to GitHub Pages from `main`. One-time setup: repository
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
