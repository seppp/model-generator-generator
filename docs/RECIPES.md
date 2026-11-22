# Recipe reference

A recipe is one JSON file in `recipes/`, named after its `id`. It describes a
parametric object as **parameters** plus a list of **steps**. Each step takes a
2D **block** (an outline, a QR code, some text), extrudes it and either adds it
to a colored **part** or cuts it away. From that single file the generator
generator produces:

- a page on the website with a form, live 3D preview and STL / 3MF downloads
- an Onshape FeatureScript custom feature (`dist/featurescript/<id>.fs`, or the
  *Download .fs* button on the page)

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

**`text`**: one line of Open Sans, centered on its bounding box.

| arg | default | |
| --- | --- | --- |
| `text` | | the string |
| `size` | 8 | capital letter height in mm |
| `font` | `regular` | `regular` or `bold` |

In Onshape the same font is used through `skText`; sizes match closely but not
to the tenth of a millimeter.

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
