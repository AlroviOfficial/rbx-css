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

### `rbx-css watch <path>`

Watches a directory or file for changes and recompiles. Accepts `-o`, `--name`, `--format`, and `--warn`.

## CSS Mapping

### Selectors

| CSS | Roblox |
|-----|--------|
| `div`, `button`, `span`, ... | `Frame`, `TextButton`, `TextLabel`, ... |
| `.card` | `.card` (class selector) |
| `#sidebar` | `#sidebar` (name selector) |
| `button.primary` | `TextButton.primary` |
| `.card > span` | `.card > TextLabel` |
| `:hover` | `:Hover` |
| `:active` | `:Press` |

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

### Pseudo-Instances

CSS properties that map to Roblox child instances are emitted as separate `::Component` rules:

| CSS | Roblox Pseudo-Instance |
|-----|------------------------|
| `border-radius` | `UICorner` |
| `border` | `UIStroke` |
| `padding` | `UIPadding` |
| `display: flex` + flex props | `UIListLayout` |
| `flex-grow`, `flex-shrink` | `UIFlexItem` |
| `linear-gradient()` | `UIGradient` |
| `aspect-ratio` | `UIAspectRatioConstraint` |
| `min-width`, `max-height`, etc. | `UISizeConstraint` |

### Themes

Define themes with `[data-theme]` or `@media (prefers-color-scheme)`:

```css
:root { --bg: white; --text: black; }

[data-theme="dark"] {
  --bg: #1a1a2e;
  --text: #e1e1e1;
}
```

The output includes a `setTheme(name)` helper function and theme StyleSheets connected via `StyleDerive`.

### Units

| CSS | Roblox |
|-----|--------|
| `px` | `UDim(0, n)` |
| `%` | `UDim(n, 0)` |
| `vw`, `vh` | `UDim(n, 0)` |
| `auto` | `Enum.AutomaticSize` |

## Supported Properties

`background-color`, `color`, `opacity`, `width`, `height`, `font-size`, `font-family`, `font-weight`, `font-style`, `text-align`, `vertical-align`, `word-wrap`, `text-overflow`, `line-height`, `display`, `visibility`, `overflow`, `flex-direction`, `justify-content`, `align-items`, `flex-wrap`, `gap`, `flex-grow`, `flex-shrink`, `border`, `border-radius`, `padding`, `background-image` (gradients), `image` (custom), `object-fit`, `min-width`, `max-width`, `min-height`, `max-height`, `aspect-ratio`, `transform-origin` (maps to `AnchorPoint`), `left`, `top`.

Unsupported properties emit a warning (suppressible with `--warn none`).

## License

MIT
