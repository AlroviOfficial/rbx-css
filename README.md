# rbx-css

CSS to Roblox StyleSheet compiler. Write standard CSS, get Luau modules or `.rbxmx` model files that create Roblox `StyleSheet` instances.

## Install

```bash
npm install rbx-css
# or
bun add rbx-css
```

## Usage

```bash
# Compile to Luau (stdout)
rbx-css compile styles.css

# Compile to file (format inferred from extension)
rbx-css compile styles.css -o StyleSheet.luau
rbx-css compile styles.css -o StyleSheet.rbxmx

# Multiple input files (merged into one StyleSheet)
rbx-css compile base.css theme.css components.css -o StyleSheet.luau

# Watch mode
rbx-css watch src/styles -o StyleSheet.luau
```

## CLI Reference

### `rbx-css compile <files...>`

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <path>` | Output file (`.luau` or `.rbxmx`) | stdout |
| `--name <name>` | StyleSheet instance name | `StyleSheet` |
| `--format <format>` | `luau` or `rbxmx` (inferred from `-o` if omitted) | `luau` |
| `--warn <level>` | `all`, `unsupported`, or `none` | `all` |
| `--strict` | Treat warnings as errors | `false` |
| `--minify` | Minify Luau output | `false` |
| `--manifest` | Emit a `.manifest.json` alongside the output | `false` |

### `rbx-css watch <path>`

Watches a directory or file for changes and recompiles. Accepts `-o`, `--name`, `--format`, and `--warn`.

## CSS Mapping

### Selectors

| CSS | Roblox |
|-----|--------|
| `div`, `button`, `span`, ... | `Frame`, `TextButton`, `TextLabel`, ... |
| `Frame`, `TextLabel`, ... | Direct Roblox class names pass through unchanged |
| `.card` | `.card` (class selector) |
| `#sidebar` | `#sidebar` (name selector) |
| `button.primary` | `TextButton.primary` |
| `.card > span` | `.card > TextLabel` (child combinator) |
| `.card span` | `.card TextLabel` (descendant combinator) |
| `:hover` | `:Hover` |
| `:active` | `:Press` |
| `:focus`, `:disabled` | `:NonDefault` |

Special characters in class/ID names are automatically escaped, so Tailwind-style selectors like `.text-\[22px\]` or `.gap-0\.5` work correctly.

### Element Mapping

| HTML | Roblox |
|------|--------|
| `div`, `nav`, `header`, `footer`, `main`, `section`, `article`, `aside`, `form`, `ul`, `ol`, `li`, `table`, `dialog`, `details`, `select` | `Frame` |
| `span`, `p`, `h1`–`h6`, `label`, `td`, `th` | `TextLabel` |
| `button`, `a`, `summary`, `option` | `TextButton` |
| `input`, `textarea` | `TextBox` |
| `img` | `ImageLabel` |
| `canvas` | `ViewportFrame` |
| `video` | `VideoFrame` |
| `scroll` | `ScrollingFrame` |

### Design Tokens

CSS custom properties on `:root` become StyleSheet attributes:

```css
:root {
  --primary: #335fff;  /* Color3 */
  --radius: 8px;       /* UDim */
  --gap: 12px;         /* UDim */
}
```

Reference them with `var()`:

```css
.card {
  background-color: var(--primary);
  border-radius: var(--radius);
}
```

Token types are automatically inferred: colors → `Color3`, lengths → `UDim`, numbers → `number`, strings → `string`.

### Pseudo-Instances

CSS properties that map to Roblox child instances are emitted as separate `::Component` rules:

| CSS | Roblox Pseudo-Instance |
|-----|------------------------|
| `border-radius` | `UICorner` |
| `border`, `outline` | `UIStroke` |
| `padding` | `UIPadding` |
| `display: flex` + flex props | `UIListLayout` |
| `display: grid` + grid props | `UIGridLayout` |
| `flex-grow`, `flex-shrink`, `align-self` | `UIFlexItem` |
| `linear-gradient()` | `UIGradient` |
| `transform: scale()` | `UIScale` |
| `aspect-ratio` | `UIAspectRatioConstraint` |
| `min-width`, `max-height`, etc. | `UISizeConstraint` |

### CSS Nesting

Standard CSS nesting is supported:

```css
.card {
  background-color: white;

  &:hover {
    background-color: #f0f0f0;
  }

  > span {
    color: gray;
  }
}
```

### Themes

Define themes with `[data-theme]` or `@media (prefers-color-scheme)`:

```css
:root { --bg: white; --text: black; }

[data-theme="dark"] {
  --bg: #1a1a2e;
  --text: #e1e1e1;
}

/* or */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a2e;
    --text: #e1e1e1;
  }
}
```

The output includes a `setTheme(name)` helper function and theme StyleSheets connected via `StyleDerive`.

### Units

| CSS | Roblox |
|-----|--------|
| `px` | `UDim(0, n)` |
| `rem` | `UDim(0, n * 16)` |
| `em` | `UDim(0, n * 16)` (approximated as rem) |
| `%` | `UDim(n, 0)` |
| `vw`, `vh` | `UDim(n/100, 0)` |
| `auto` | `Enum.AutomaticSize` |

### Colors

All standard CSS color formats are supported — `lightningcss` normalizes most formats (hex, `hsl()`, `hwb()`, named colors, etc.) to `rgb()` internally. Additionally supported natively:

- `rgb()` / `rgba()`
- `oklch()`, `oklab()`
- `lab()`, `lch()`

Alpha channels map to Roblox transparency values.

### Fonts

| CSS `font-family` | Roblox Font |
|--------------------|-------------|
| `gotham`, `gothamssm` | GothamSSm |
| `builder sans` | BuilderSans |
| `source sans pro` | SourceSansPro |
| `roboto` | Roboto |
| `montserrat` | Montserrat |
| `monospace` | RobotoMono |
| `sans-serif` | GothamSSm |
| `serif` | Merriweather |

Unknown font families are assumed to exist at `rbxasset://fonts/families/{name}.json`. Font weight (100–900) and font style (`italic`/`normal`) are combined into a single Roblox `Font` value on the `FontFace` property.

## Supported Properties

### Layout & Sizing

`display` (flex, grid, none), `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`, `left`, `top`, `aspect-ratio`, `overflow` (hidden, scroll), `visibility`, `z-index`

### Flexbox

`flex-direction`, `justify-content`, `align-items`, `flex-wrap`, `gap`, `flex-grow`, `flex-shrink`, `flex-basis`, `align-self`, `order`

### Grid

`grid-template-columns`, `grid-template-rows` (px/rem track sizes)

### Box Model

`padding` (shorthand and per-side), `padding-inline`, `padding-block`, `padding-inline-start/end`, `padding-block-start/end`, `border` (shorthand and per-side), `border-color`, `border-width`, `border-style`, `border-radius`, `outline`

### Typography

`font-size`, `font-family`, `font-weight`, `font-style`, `text-align`, `vertical-align`, `line-height`, `word-wrap` / `overflow-wrap`, `text-overflow`, `color`

### Visual

`background-color`, `background` (solid color or gradient), `background-image` (url or linear-gradient), `opacity`, `object-fit`, `transform` (scale, rotate), `transform-origin` (maps to `AnchorPoint`)

Unsupported properties emit a warning (suppressible with `--warn none`). Common web-only properties (transitions, animations, shadows, etc.) are silently ignored.

## Base Element Rules

The compiler auto-prepends low-specificity base rules to match common Roblox defaults:

- `TextLabel`, `TextButton` — `AutomaticSize = XY`, `BackgroundTransparency = 1`
- `TextBox` — `AutomaticSize = XY`
- `Frame`, `ScrollingFrame` — `BackgroundTransparency = 1`

These can be overridden by your CSS rules.

## Manifest

When using `--manifest` with `-o`, a `.manifest.json` file is generated alongside the output containing metadata about the compiled stylesheet — for example, which classes use `overflow: scroll` (useful for tools like rbx-tsx that need to upgrade `Frame` to `ScrollingFrame`).

## Output Formats

### Luau (default)

Generates a `.luau` module returning a `createStyleSheet()` factory function. This is the recommended format.

### RBXMX

Generates a `.rbxmx` model file. Note: RBXMX output is currently **experimental** — StyleRule properties are emitted as XML comments rather than fully encoded RBXMX properties. The Luau format is recommended for production use.

## Programmatic API

In addition to the CLI, you can use rbx-css as a library:

```ts
import { compile, generateLuau, generateRBXMX } from "rbx-css";

const result = compile(
  [{ filename: "styles.css", content: "div { background-color: red; }" }],
  { name: "MyStyleSheet", warnLevel: "all", strict: false }
);

// result.ir       — intermediate representation (StyleSheetIR)
// result.warnings — WarningCollector with any diagnostics

const luau = generateLuau(result.ir, { minify: false });
const rbxmx = generateRBXMX(result.ir);
```

## License

MIT
