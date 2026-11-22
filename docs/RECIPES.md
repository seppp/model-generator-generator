# Recipe reference

<!-- Parts between dev-only markers are left out of the website's AI-chat
prompt (they only make sense in the repo); a chat marker's text is used
there instead. See engine/docs.js. -->

A recipe is one JSON object<!-- dev-only --> (in the repo: a file in `recipes/`, named after its `id`)<!-- /dev-only -->. It describes a
parametric object as **parameters** plus a list of **steps**. Each step takes a
2D **block** (an outline, a QR code, some text), extrudes it and either adds it
to a colored **part** or cuts it away. From that single recipe the generator
generator produces:

- a generator on the website with a form, live 3D preview and downloads
  (STL, 3MF, OBJ, images, SVG / DXF outlines)<!-- dev-only --> (`?recipe=<id>`, loaded from `generators.json`)<!-- /dev-only -->
- an Onshape FeatureScript custom feature (the *Download .fs* button<!-- dev-only -->, or
  `dist/featurescript/<id>.fs`<!-- /dev-only -->)

```json
{
  "id": "my-thing",
  "name": "My thing",
  "description": "One sentence for the gallery.",
  "parts": { "base": { "label": "Body", "color": "#1e3a8a" } },
  "params": [ ... ],
  "derived": { ... },
  "steps": [ ... ],
  "notes": [ ... ]
}
```

## Expressions

Anywhere a step, derived value or note needs a value you can write a literal
(`3`, `true`) or a **string expression** that is evaluated against the
parameters and derived values:

```
"width - 2 * margin"
"style == 'raised' ? thickness : thickness - depth"
"max(corner - rimWidth, 0)"
```

Operators: `+ - * / %`, `== != < <= > >=`, `&& || !`, `a ? b : c`, parentheses.
Functions: `min max abs sqrt floor ceil round clamp(x, lo, hi)` and `sin cos tan`
(degrees). Constant: `pi`. Strings use single quotes inside the JSON string.

Because every value is a string expression, a literal piece of text has to be
quoted twice: `"text": "'Hello'"`.

## `parts`

Colored bodies of the result, in extruder order. Keys are identifiers
(`base`, `code`, `accent`...), values have a `label` and a `color` (`#rrggbb`).

Parts never overlap: adding a tool to one part automatically cuts it out of
all other parts. That is how a flush inlay works: add the QR code to `code`
inside the tag and the tag gets the matching pocket.

### Chamfers and fillets (`edges`)

A part can break the edges of its lowest and highest faces:

```json
"base": { "label": "Tag", "color": "#f8fafc",
  "edges": { "top": "fillet", "topSize": 0.8, "bottom": "printable", "bottomSize": 1, "bottomChamfer": 1 } }
```

- `top`: `none`, `chamfer` or `fillet`, with `topSize` (chamfer width or
  fillet radius, mm).
- `bottom`: `none`, `chamfer`, `fillet` or `printable`, with `bottomSize`.
  `printable` is a fillet you can print without supports: a 45° chamfer of
  height `bottomChamfer` (default 1 mm) at the bed, then a fillet of radius
  `bottomSize` where the chamfer meets the wall, so nothing overhangs more
  than 45°. A plain `fillet` on the bottom edge overhangs at the bed.
- Every value can be an expression, so a select param can offer the choice:
  `"top": "edgeTop"` with options `none` / `chamfer` / `fillet`.
- It applies to the whole part after all steps, on its outline seen from
  above: the outer edges and the edges of holes that go all the way through.
  Pockets that don't go through keep sharp edges. Pieces added in separate
  steps get one continuous edge, without a notch where they join.
- When the two together are taller than the part they are scaled down to fit
  (the page says so).
<!-- dev-only -->
- The website moves rings of the outline inwards (`engine/edges.js`), or
  stacks slabs about 0.2 mm high where that would fold over (thin text);
  FeatureScript uses opChamfer / opFillet on the edges of the part's lowest
  and highest faces (in Onshape that also rounds pocket edges on those faces).
<!-- /dev-only -->

## `params`

Shown as the form on the website and as feature inputs in Onshape.

| key | meaning |
| --- | --- |
| `key` | identifier used in expressions |
| `type` | `number`, `text`, `select` or `boolean` |
| `label` | form label |
| `default` | initial value |
| `group` | form section (fieldset) |
| `help` | small hint under the input |
| `showIf` | expression; the input is hidden when false |
| `min`, `max`, `step` | numbers only; `min`/`max` are required |
| `unit` | numbers only: `mm`, `deg` or omitted |
| `integer` | numbers only: round to whole numbers |
| `options` | selects only: `[{ "value": "raised", "label": "Raised" }]`; values must be identifiers |

## `derived`

Named helper values computed in order from params (and earlier derived values):

```json
"derived": { "qrSize": "width - 2 * margin", "holeY": "width / 2 + 4" }
```

## `steps`

Executed top to bottom. Every step has exactly one of `add` / `subtract`, whose
value is the block name, and then common keys plus the block's own arguments.

| common key | meaning |
| --- | --- |
| `add` | block to add to `part` |
| `subtract` | block to cut away from `from` (default: every part) |
| `part` | part to add to (required for `add`) |
| `from` | part name or list of part names to cut from |
| `when` | expression; the step is skipped when false |
| `x`, `y` | where the block's center goes (default 0) |
| `z` | bottom of the extrusion (default 0) |
| `thickness` | extrusion height (required unless `through`) |
| `through` | `true` cuts through everything (holes) |
| `rotate` | degrees around Z |
| `comment` | free text, copied into the FeatureScript |

### Blocks

All blocks are centered on the origin before `x`/`y` move them.

**`shape`**: basic outlines.

| arg | default | |
| --- | --- | --- |
| `shape` | `rect` | `rect`, `roundedRect`, `circle`, `polygon` (or an expression giving one of those) |
| `width`, `height` | 10 | rect and roundedRect |
| `radius` | 0 | roundedRect corner radius |
| `diameter` | 10 | circle; polygon corner-to-corner |
| `sides` | 6 | polygon, first corner points to +Y |

**`qr`**: QR code, dark modules only, no quiet zone.

| arg | default | |
| --- | --- | --- |
| `content` | | text or URL (UTF-8) |
| `size` | 20 | side length in mm |
| `ecc` | `M` | `L`, `M`, `Q`, `H` |

`content` and `ecc` are baked into FeatureScript exports (Onshape has no QR
encoder), everything else stays parametric. The page warns when modules get
smaller than 1 mm.

**`text`**: one line of text, centered on its bounding box.

What text can't do: it is always a single line centered on its `x`/`y`, and
its rendered width is not available in expressions. So left or right
alignment, fitting text to a width, or keeping it clear of other features can
only be approximated (for example with a param the user adjusts, or by
assuming roughly 0.6 × `size` per character). There is no multi-line text and
no text along a curve. Rotation works with the step's `rotate`.

| arg | default | |
| --- | --- | --- |
| `text` | | the string |
| `size` | 8 | capital letter height in mm |
| `font` | `regular` | a font name, see below |

Fonts (open-licensed<!-- dev-only -->, in `engine/fonts.js`<!-- /dev-only -->; the browser loads each only when used):
`regular` (Open Sans), `bold` (Open Sans Bold), `rounded` (Varela Round),
`slab` (Roboto Slab Bold), `serif` (Noto Serif Bold), `condensed` (Bebas Neue,
capitals only), `stencil` (Allerta Stencil), `script` (Pacifico), `mono`
(Roboto Mono Bold), `custom` (a font file the visitor chooses; browser only,
falls back to `regular` until chosen). To let people pick, use a select param
whose option values are these names and set `"font": "font"` on the step. Keep
script and stencil text large (cap height 8 mm or more) so thin strokes print.

In Onshape, text is drawn with Open Sans through `skText` (regular, or bold for
the heavier fonts), since Onshape has its own font list; sizes match closely
but not to the tenth of a millimeter.

## `notes`

Hints shown under the preview. `{expression}` placeholders are filled in.

```json
{ "when": "style == 'raised'", "text": "Swap filament at {thickness} mm." }
```

## Multi-color output

- **Filament swap**: if the parts are stacked (each part starts at or above the
  top of the parts below it), the page offers a PrusaSlicer 3MF with the M600
  color change already placed at the right layer.
- **Multi-material**: always available for 2+ parts: one object, one part per
  color, extruder 1, 2, ... in `parts` order.
- **STL**: everything, or one file per part.

The page also exports OBJ (with the part colors), images of the current view,
and each part's outline seen from above as SVG / DXF (for laser cutting).
Nothing in the recipe is needed for that.

<!-- dev-only -->
## Collections (many recipes in one file)

The site loads its generators from `generators.json`, and *My generators* are
exported and imported in the same format:

```json
{ "format": "generator-generator/1", "generators": [ { "id": "coaster", ... }, { "id": "sign", ... } ] }
```

Importing also accepts a single recipe or a plain array of recipes.

## Adding a block

Blocks live in `engine/blocks.js`. Each needs:

1. `args`: argument schema (`number`, `string`, `enum` with `options`; `baked: true`
   for values that cannot be computed in FeatureScript).
2. `profile(args, env)`: returns a manifold-3d `CrossSection` centered on the
   origin (or `null` to skip).
3. `fs.helper`: a FeatureScript function that sketches the same outline on
   `mgPlane(z)` and returns `mgExtrude(...)`, plus `fs.call(fsArgs, jsArgs)` that
   returns the call expression.
4. Optional `warnings(args)` for printability hints.

Then document it here and run `npm run check`.
<!-- /dev-only -->
<!-- chat: ## Missing features

If a change needs something the blocks above can't express (an SVG logo, curved
or multi-line text, a revolved or freeform shape...), or can only approximate
it (like text alignment), say so plainly before the recipe: what is missing,
what you did instead, and that the user can request the feature with the
website's "Submit to the site" button. Never invent new blocks, arguments or
recipe fields: the website rejects them. -->
