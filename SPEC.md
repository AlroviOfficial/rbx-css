\# CSS to Roblox StyleSheet Compiler — Specification



\## Overview



A compiler that transforms standard CSS into Roblox StyleSheet instances (Luau code or `.rbxmx` model files). This is \*\*Layer 1\*\* of a larger TSX-to-Luau pipeline, but is fully standalone and useful on its own.



The compiler takes `.css` files as input and produces either:

\- \*\*Luau source code\*\* that programmatically creates `StyleSheet`, `StyleRule`, and token attributes

\- \*\*RBXMX model files\*\* that can be dropped into Rojo projects or Studio directly



---



\## Design Principles



1\. \*\*Standard CSS in, Roblox StyleSheet out.\*\* Write CSS any web developer would recognize. The compiler handles the translation.

2\. \*\*Subset, not superset.\*\* We compile a well-defined subset of CSS. Unsupported properties emit warnings, not errors.

3\. \*\*Pseudo-instances are an implementation detail.\*\* `border-radius` in CSS becomes a `::UICorner` rule automatically. The developer never thinks in Roblox terms.

4\. \*\*Tokens from CSS variables.\*\* `--primary-color` maps directly to Roblox style tokens (`$primary-color`).

5\. \*\*Predictable output.\*\* Same input always produces the same output. No runtime magic.



---



\## CLI Interface



```bash

\# Basic usage

rbx-css compile styles.css -o output.luau



\# RBXMX output for Rojo

rbx-css compile styles.css -o styles.rbxmx



\# Watch mode

rbx-css watch src/styles/ -o out/styles/



\# Multiple input files (merged into one StyleSheet)

rbx-css compile base.css theme.css components.css -o output.luau



\# Specify StyleSheet name

rbx-css compile styles.css -o output.luau --name "CoreSheet"

```



\### Flags



| Flag | Description | Default |

|---|---|---|

| `-o, --output` | Output file path (`.luau` or `.rbxmx`) | `stdout` |

| `--name` | Name of the root StyleSheet instance | `"StyleSheet"` |

| `--format` | Output format: `luau` or `rbxmx` | Inferred from `-o` extension |

| `--warn` | Warning level: `all`, `unsupported`, `none` | `all` |

| `--tokens-sheet` | Emit tokens as a separate StyleSheet | `false` |

| `--minify` | Minify Luau output | `false` |



---



\## Selector Mapping



\### Supported Selectors



| CSS Selector | Roblox Selector | Notes |

|---|---|---|

| `.card` | `.card` | Tag selector (CollectionService tag) |

| `#header` | `#header` | Instance Name selector |

| `Frame` | `Frame` | Class selector (see Element Mapping) |

| `div` | `Frame` | Mapped via HTML element table |

| `button` | `TextButton` | Mapped via HTML element table |

| `.card:hover` | `.card:Hover` | GuiState pseudo-class |

| `.card:active` | `.card:Press` | GuiState pseudo-class |

| `.card > .title` | `.card > .title` | Direct child combinator |

| `.card .title` | `.card .title` | Descendant combinator |

| `\*` | Not supported | Emit warning |



\### HTML Element to Roblox Class Mapping



When HTML element selectors are used, they are mapped to Roblox classes:



| HTML Element | Roblox Class |

|---|---|

| `div` | `Frame` |

| `span` | `TextLabel` |

| `p` | `TextLabel` |

| `h1` - `h6` | `TextLabel` |

| `button` | `TextButton` |

| `input` | `TextBox` |

| `img` | `ImageLabel` |

| `a` | `TextButton` |

| `canvas` | `ViewportFrame` |



You may also use Roblox class names directly as selectors (e.g., `Frame`, `ScrollingFrame`, `TextLabel`). The compiler recognizes all known GUI class names and passes them through as-is.



\### Pseudo-Class Mapping



| CSS | Roblox GuiState |

|---|---|

| `:hover` | `:Hover` |

| `:active` | `:Press` |

| `:focus` | `:NonDefault` |

| `:disabled` | `:NonDefault` |



> \*\*Note:\*\* Roblox only supports `Idle`, `Hover`, `Press`, and `NonDefault` as GuiStates. CSS pseudo-classes that don't map cleanly will emit a warning.



\### Compound Selectors



Compound selectors are supported where Roblox supports them:



```css

/\* Supported \*/

.card:hover { }          /\* -> .card:Hover \*/

.card > .title { }       /\* -> .card > .title \*/

Frame.highlighted { }    /\* -> Frame.highlighted \*/



/\* Not supported in Roblox — emit warning + flatten to closest equivalent \*/

.card + .sibling { }     /\* Adjacent sibling — no Roblox equivalent \*/

.card ~ .sibling { }     /\* General sibling — no Roblox equivalent \*/

```



---



\## Property Mapping



\### Direct Property Mappings



These CSS properties map directly to a single Roblox instance property.



\#### Colors



| CSS Property | Roblox Property | Value Transform |

|---|---|---|

| `background-color` | `BackgroundColor3` | CSS color -> `Color3` |

| `color` | `TextColor3` | CSS color -> `Color3` |

| `opacity` | `BackgroundTransparency` | `opacity: 0.8` -> `Transparency = 0.2` (inverted) |

| `background: transparent` | `BackgroundTransparency` | -> `1` |



\#### Sizing



| CSS Property | Roblox Property | Value Transform |

|---|---|---|

| `width` | `Size.X` | See Unit Conversion |

| `height` | `Size.Y` | See Unit Conversion |

| `width` + `height` | `Size` | Combined into `UDim2` |

| `min-width` | Not supported | Warning |

| `max-width` | Not supported | Warning |



\*\*Shorthand: `size`\*\* (non-standard, convenience)

```css

.card {

&nbsp; /\* width height \*/

&nbsp; size: 100% 48px;

&nbsp; /\* Equivalent to: width: 100%; height: 48px; \*/

}

```



\#### Positioning



| CSS Property | Roblox Property | Value Transform |

|---|---|---|

| `position: absolute` | (default in Roblox) | No-op / informational |

| `position: relative` | (layout-managed) | Context-dependent |

| `left` | `Position.X` | See Unit Conversion |

| `top` | `Position.Y` | See Unit Conversion |

| `left` + `top` | `Position` | Combined into `UDim2` |

| `z-index` | `ZIndex` | Direct integer mapping |

| `transform-origin` | `AnchorPoint` | See Anchor Point Mapping |



\#### Text



| CSS Property | Roblox Property | Value Transform |

|---|---|---|

| `font-size` | `TextSize` | `px` values only, direct mapping |

| `font-family` | `FontFace` | See Font Mapping |

| `font-weight` | `FontFace.Weight` | CSS weight -> Enum.FontWeight |

| `text-align` | `TextXAlignment` | `left\\|center\\|right` -> Enum values |

| `vertical-align` | `TextYAlignment` | `top\\|center\\|bottom` -> Enum values |

| `word-wrap` / `overflow-wrap` | `TextWrapped` | `break-word` -> `true` |

| `text-overflow: ellipsis` | `TextTruncate` | -> `Enum.TextTruncate.AtEnd` |

| `line-height` | `LineHeight` | Multiplier value |

| `letter-spacing` | Not supported | Warning |

| `text-transform` | Not supported | Warning |

| `text-decoration` | Not supported | Warning |



\#### Visibility



| CSS Property | Roblox Property | Value Transform |

|---|---|---|

| `display: none` | `Visible` | -> `false` |

| `visibility: hidden` | `Visible` | -> `false` |

| `overflow: hidden` | `ClipsDescendants` | -> `true` |

| `overflow: scroll` | \*\*Element conversion\*\* | Instance becomes `ScrollingFrame` |

| `cursor: pointer` | Not supported | Ignored silently |



\#### Image



| CSS Property | Roblox Property | Value Transform |

|---|---|---|

| `background-image: url(...)` | `Image` | URL passthrough (expects `rbxassetid://`) |

| `object-fit: cover` | `ScaleType` | -> `Enum.ScaleType.Crop` |

| `object-fit: contain` | `ScaleType` | -> `Enum.ScaleType.Fit` |

| `object-fit: fill` | `ScaleType` | -> `Enum.ScaleType.Stretch` |



---



\### Pseudo-Instance Properties



These CSS properties compile into Roblox `::PseudoInstance` style rules — child modifier instances that are applied via the StyleSheet system without existing in the DataModel.



\#### Border Radius -> `::UICorner`



```css

.card {

&nbsp; border-radius: 8px;

}

```



Compiles to a StyleRule with selector `.card::UICorner`:

```lua

cornerRule.Selector = ".card::UICorner"

cornerRule:SetProperty("CornerRadius", UDim.new(0, 8))

```



| CSS | Roblox `::UICorner` Property |

|---|---|

| `border-radius: 8px` | `CornerRadius = UDim.new(0, 8)` |

| `border-radius: 50%` | `CornerRadius = UDim.new(0.5, 0)` |

| `border-radius: 1rem` | Warning — not supported, fall back to px |



> \*\*Note:\*\* Roblox UICorner only supports a uniform corner radius. If the CSS specifies per-corner radii (e.g., `border-radius: 8px 0 0 8px`), use the first value and emit a warning.



\#### Border -> `::UIStroke`



```css

.card {

&nbsp; border: 2px solid #333;

}

```



Compiles to:

```lua

strokeRule.Selector = ".card::UIStroke"

strokeRule:SetProperties({

&nbsp;   Thickness = 2,

&nbsp;   Color = Color3.fromHex("#333"),

&nbsp;   ApplyStrokeMode = Enum.ApplyStrokeMode.Border,

})

```



| CSS | Roblox `::UIStroke` Property |

|---|---|

| `border-width` | `Thickness` |

| `border-color` | `Color` |

| `border-style: solid` | Default — no action needed |

| `border-style: none` | Don't emit `::UIStroke` rule |

| `border-style: dashed/dotted` | Warning — not supported |

| `outline` | `ApplyStrokeMode = Contextual` |



\#### Padding -> `::UIPadding`



```css

.card {

&nbsp; padding: 12px 16px;

}

```



Compiles to:

```lua

paddingRule.Selector = ".card::UIPadding"

paddingRule:SetProperties({

&nbsp;   PaddingTop = UDim.new(0, 12),

&nbsp;   PaddingBottom = UDim.new(0, 12),

&nbsp;   PaddingLeft = UDim.new(0, 16),

&nbsp;   PaddingRight = UDim.new(0, 16),

})

```



Standard CSS padding shorthand is fully supported:

\- `padding: 10px` -> all sides

\- `padding: 10px 20px` -> vertical | horizontal

\- `padding: 10px 20px 30px` -> top | horizontal | bottom

\- `padding: 10px 20px 30px 40px` -> top | right | bottom | left



\#### Flexbox Layout -> `::UIListLayout`



```css

.container {

&nbsp; display: flex;

&nbsp; flex-direction: row;

&nbsp; justify-content: center;

&nbsp; align-items: center;

&nbsp; gap: 8px;

&nbsp; flex-wrap: wrap;

}

```



Compiles to:

```lua

layoutRule.Selector = ".container::UIListLayout"

layoutRule:SetProperties({

&nbsp;   FillDirection = Enum.FillDirection.Horizontal,

&nbsp;   HorizontalAlignment = Enum.HorizontalAlignment.Center,

&nbsp;   VerticalAlignment = Enum.VerticalAlignment.Center,

&nbsp;   Padding = UDim.new(0, 8),

&nbsp;   Wraps = true,

})

```



| CSS | Roblox `::UIListLayout` Property |

|---|---|

| `flex-direction: row` | `FillDirection = Horizontal` |

| `flex-direction: column` | `FillDirection = Vertical` |

| `flex-direction: row-reverse` | `FillDirection = Horizontal` + warning: partial |

| `gap` | `Padding` (single value — Roblox doesn't support row-gap vs column-gap) |

| `justify-content: flex-start` | Alignment along fill direction -> `Left` / `Top` |

| `justify-content: center` | -> `Center` |

| `justify-content: flex-end` | -> `Right` / `Bottom` |

| `justify-content: space-between` | Not directly supported — warning |

| `align-items: flex-start` | Cross-axis alignment -> `Left` / `Top` |

| `align-items: center` | -> `Center` |

| `align-items: flex-end` | -> `Right` / `Bottom` |

| `flex-wrap: wrap` | `Wraps = true` |

| `order` | `SortOrder = Enum.SortOrder.LayoutOrder` + sets `LayoutOrder` on children |

| `flex-grow` / `flex-shrink` | -> `UIFlexItem` (see below) |



\#### Flex Item -> `::UIFlexItem`



```css

.sidebar {

&nbsp; flex-grow: 1;

&nbsp; flex-shrink: 0;

&nbsp; flex-basis: 200px;

}

```



Compiles to a `::UIFlexItem` pseudo-instance rule:

```lua

flexRule.Selector = ".sidebar::UIFlexItem"

flexRule:SetProperties({

&nbsp;   FlexMode = Enum.UIFlexMode.Custom,

&nbsp;   GrowRatio = 1,

&nbsp;   ShrinkRatio = 0,

})

```



> \*\*Note:\*\* `flex-basis` has no direct Roblox equivalent. Compile it as `Size` on the element itself with a warning about behavioral differences.



\#### Gradient -> `::UIGradient`



```css

.card {

&nbsp; background: linear-gradient(90deg, #ff0099, #ffcc00);

}

```



Compiles to:

```lua

gradientRule.Selector = ".card::UIGradient"

gradientRule:SetProperties({

&nbsp;   Color = ColorSequence.new(Color3.fromHex("#ff0099"), Color3.fromHex("#ffcc00")),

&nbsp;   Rotation = 90,

})

```



| CSS | Roblox `::UIGradient` Property |

|---|---|

| `linear-gradient(angle, ...)` | `Rotation` = angle, `Color` = ColorSequence from stops |

| `radial-gradient(...)` | Not supported — warning |

| Multiple color stops | Map to `ColorSequence` keypoints |



\#### Aspect Ratio -> `::UIAspectRatioConstraint`



```css

.square {

&nbsp; aspect-ratio: 1;

}



.widescreen {

&nbsp; aspect-ratio: 16 / 9;

}

```



Compiles to:

```lua

aspectRule.Selector = ".square::UIAspectRatioConstraint"

aspectRule:SetProperty("AspectRatio", 1)

```



\#### Size Constraints -> `::UISizeConstraint`



```css

.card {

&nbsp; min-width: 200px;

&nbsp; max-width: 500px;

&nbsp; min-height: 100px;

&nbsp; max-height: 300px;

}

```



Compiles to:

```lua

constraintRule.Selector = ".card::UISizeConstraint"

constraintRule:SetProperties({

&nbsp;   MinSize = Vector2.new(200, 100),

&nbsp;   MaxSize = Vector2.new(500, 300),

})

```



---



\## Unit Conversion



| CSS Unit | Roblox UDim | Notes |

|---|---|---|

| `px` | `UDim.new(0, value)` | Offset pixels |

| `%` | `UDim.new(value/100, 0)` | Scale (0-1) |

| `vw` | `UDim.new(value/100, 0)` | Treated as Scale (approximate) |

| `vh` | `UDim.new(value/100, 0)` | Treated as Scale (approximate) |

| `em` / `rem` | Not supported | Warning — suggest `px` |

| `auto` | Context-dependent | -> `AutomaticSize` property |

| unitless `0` | `UDim.new(0, 0)` | Zero is zero |



\### `auto` Sizing



```css

.card {

&nbsp; width: auto;

&nbsp; height: auto;

}

```



Maps to `AutomaticSize = Enum.AutomaticSize.XY`. If only one axis is `auto`:

\- `width: auto; height: 48px` -> `AutomaticSize = Enum.AutomaticSize.X`, `Size = UDim2.new(0, 0, 0, 48)`

\- `width: 100%; height: auto` -> `AutomaticSize = Enum.AutomaticSize.Y`, `Size = UDim2.new(1, 0, 0, 0)`



\### Combined `UDim2` Construction



When both `width` and `height` (or `left` and `top`) are present, they are merged into a single `UDim2`:



```css

.card {

&nbsp; width: 50%;

&nbsp; height: 200px;

}

/\* -> Size = UDim2.new(0.5, 0, 0, 200) \*/

```



---



\## Color Conversion



All CSS color formats are supported and converted to `Color3`:



| CSS Format | Example | Transform |

|---|---|---|

| Hex | `#ff0099` | `Color3.fromHex("#ff0099")` |

| Hex shorthand | `#f09` | Expand -> `Color3.fromHex("#ff0099")` |

| `rgb()` | `rgb(255, 0, 153)` | `Color3.fromRGB(255, 0, 153)` |

| `rgba()` | `rgba(255, 0, 153, 0.5)` | `Color3` + separate `Transparency = 0.5` |

| `hsl()` | `hsl(320, 100%, 50%)` | Convert to RGB -> `Color3` |

| `hsla()` | `hsla(320, 100%, 50%, 0.5)` | Convert to RGB -> `Color3` + Transparency |

| Named colors | `red`, `blue`, `transparent` | Lookup table -> `Color3` |



> \*\*Important:\*\* When `rgba()` or `hsla()` is used with `background-color`, the alpha channel maps to `BackgroundTransparency`. When used with `color` (text), it maps to `TextTransparency`.



---



\## CSS Variables -> Roblox Tokens



CSS custom properties map to Roblox StyleSheet token attributes.



\### Declaration (`:root` -> Token StyleSheet)



```css

:root {

&nbsp; --primary: #335fff;

&nbsp; --secondary: #ff0099;

&nbsp; --radius-sm: 4px;

&nbsp; --radius-md: 8px;

&nbsp; --spacing-sm: 8px;

&nbsp; --spacing-md: 16px;

&nbsp; --font-body: "GothamSSm";

}

```



Compiles to token attributes on the root StyleSheet (or a separate token sheet if `--tokens-sheet` flag is set):



```lua

sheet:SetAttribute("primary", Color3.fromHex("#335fff"))

sheet:SetAttribute("secondary", Color3.fromHex("#ff0099"))

sheet:SetAttribute("radius-sm", UDim.new(0, 4))

sheet:SetAttribute("radius-md", UDim.new(0, 8))

sheet:SetAttribute("spacing-sm", UDim.new(0, 8))

sheet:SetAttribute("spacing-md", UDim.new(0, 16))

sheet:SetAttribute("font-body", Font.new("rbxasset://fonts/families/GothamSSm.json"))

```



\### Usage (`var()` -> `$token`)



```css

.card {

&nbsp; background-color: var(--primary);

&nbsp; border-radius: var(--radius-md);

&nbsp; padding: var(--spacing-md);

}

```



Compiles to:

```lua

rule:SetProperties({

&nbsp;   BackgroundColor3 = "$primary",

})

-- ::UICorner rule

cornerRule:SetProperty("CornerRadius", "$radius-md")

-- ::UIPadding rule references $spacing-md

```



\### Token Type Inference



The compiler infers the Roblox type of a token from context of first usage:



| Used in property like... | Inferred type |

|---|---|

| `background-color`, `color`, `border-color` | `Color3` |

| `border-radius` | `UDim` |

| `padding`, `gap`, `width`, `height` | `UDim` |

| `font-size` | `number` |

| `font-family` | `Font` |

| `opacity` | `number` |



---



\## Theming



CSS media queries or data attributes can be used to express themes, which compile to separate theme StyleSheets connected via `StyleDerive`.



\### Using data attributes (recommended)



```css

:root {

&nbsp; --bg: #ffffff;

&nbsp; --text: #1a1a2e;

}



\[data-theme="dark"] {

&nbsp; --bg: #1a1a2e;

&nbsp; --text: #ffffff;

}

```



Compiles to:

\- \*\*Base token sheet\*\* with `bg` and `text` attributes set to light values

\- \*\*Dark theme sheet\*\* overriding `bg` and `text` with dark values

\- A `StyleDerive` linking the design sheet to whichever theme is active



Theme switching in Luau:

```lua

-- Generated helper function

function setTheme(themeName: string)

&nbsp;   themeDerive.StyleSheet = themes\[themeName]

end

```



\### Using `prefers-color-scheme`



```css

@media (prefers-color-scheme: dark) {

&nbsp; :root {

&nbsp;   --bg: #1a1a2e;

&nbsp; }

}

```



Same output as `\[data-theme="dark"]`. The compiler treats `prefers-color-scheme` as a theme name.



---



\## Font Mapping



| CSS `font-family` | Roblox `FontFace` |

|---|---|

| `"GothamSSm"`, `"Gotham"` | `Font.new("rbxasset://fonts/families/GothamSSm.json")` |

| `"Builder Sans"` | `Font.new("rbxasset://fonts/families/BuilderSans.json")` |

| `"Source Sans Pro"` | `Font.new("rbxasset://fonts/families/SourceSansPro.json")` |

| `"Roboto"` | `Font.new("rbxasset://fonts/families/Roboto.json")` |

| `"Montserrat"` | `Font.new("rbxasset://fonts/families/Montserrat.json")` |

| `monospace` (generic) | `Font.new("rbxasset://fonts/families/RobotoMono.json")` |

| `sans-serif` (generic) | `Font.new("rbxasset://fonts/families/GothamSSm.json")` |

| Custom / unknown | `Font.new("rbxasset://fonts/families/<name>.json")` + warning |



\### Font Weight Mapping



| CSS `font-weight` | Roblox `Enum.FontWeight` |

|---|---|

| `100` / `thin` | `Thin` |

| `200` / `extra-light` | `ExtraLight` |

| `300` / `light` | `Light` |

| `400` / `normal` | `Regular` |

| `500` / `medium` | `Medium` |

| `600` / `semi-bold` | `SemiBold` |

| `700` / `bold` | `Bold` |

| `800` / `extra-bold` | `ExtraBold` |

| `900` / `black` | `Heavy` |



\### Font Style Mapping



| CSS `font-style` | Roblox `Enum.FontStyle` |

|---|---|

| `normal` | `Normal` |

| `italic` | `Italic` |



---



\## Output Formats



\### Luau Output



Generates a self-contained `.luau` (or `.lua`) module that constructs the full StyleSheet tree:



```lua

-- Auto-generated by rbx-css compiler

-- Source: styles.css



local ReplicatedStorage = game:GetService("ReplicatedStorage")



local function createStyleSheet()

&nbsp;   -- Root StyleSheet

&nbsp;   local sheet = Instance.new("StyleSheet")

&nbsp;   sheet.Name = "CoreSheet"



&nbsp;   -- Tokens

&nbsp;   sheet:SetAttribute("primary", Color3.fromHex("#335fff"))

&nbsp;   sheet:SetAttribute("radius-md", UDim.new(0, 8))



&nbsp;   -- Rule: .card

&nbsp;   local rule\_1 = Instance.new("StyleRule")

&nbsp;   rule\_1.Selector = ".card"

&nbsp;   rule\_1.Parent = sheet

&nbsp;   rule\_1:SetProperties({

&nbsp;       BackgroundColor3 = "$primary",

&nbsp;   })



&nbsp;   -- Rule: .card::UICorner

&nbsp;   local rule\_2 = Instance.new("StyleRule")

&nbsp;   rule\_2.Selector = ".card::UICorner"

&nbsp;   rule\_2.Parent = sheet

&nbsp;   rule\_2:SetProperty("CornerRadius", "$radius-md")



&nbsp;   return sheet

end



return createStyleSheet

```



\### RBXMX Output



Generates Roblox XML model format for direct import or Rojo integration:



```xml

<roblox version="4">

&nbsp; <Item class="StyleSheet" referent="RBX0001">

&nbsp;   <Properties>

&nbsp;     <string name="Name">CoreSheet</string>

&nbsp;   </Properties>

&nbsp;   <Item class="StyleRule" referent="RBX0002">

&nbsp;     <Properties>

&nbsp;       <string name="Selector">.card</string>

&nbsp;     </Properties>

&nbsp;   </Item>

&nbsp; </Item>

</roblox>

```



> \*\*Note:\*\* RBXMX output for `SetProperties` calls requires encoding property maps in the Roblox XML attribute format. This is more complex but enables drag-and-drop import into Studio and seamless Rojo sync.



---



\## Error Handling \& Warnings



\### Warning Levels



\- \*\*`unsupported-property`\*\*: CSS property has no Roblox equivalent (e.g., `box-shadow`, `text-decoration`)

\- \*\*`unsupported-selector`\*\*: Selector type not available in Roblox (e.g., `+`, `~`)

\- \*\*`unsupported-unit`\*\*: Unit can't be cleanly mapped (e.g., `em`, `rem`)

\- \*\*`partial-mapping`\*\*: Property maps but with reduced fidelity (e.g., per-corner `border-radius`)

\- \*\*`type-inference-ambiguous`\*\*: Can't determine token type from usage context



\### Warning Format



```

warning: styles.css:14:3 \[unsupported-property] 'box-shadow' has no Roblox equivalent - skipped

warning: styles.css:22:3 \[partial-mapping] Per-corner border-radius not supported, using first value (8px)

warning: styles.css:31:3 \[unsupported-unit] 'em' not supported, consider using 'px' - skipped

```



\### Strict Mode



With `--strict`, all warnings become errors and compilation fails. Useful for CI pipelines.



---



\## Unsupported CSS (Known Gaps)



These CSS features have no Roblox equivalent and are intentionally excluded:



| CSS Feature | Reason |

|---|---|

| `box-shadow` | No shadow system in Roblox UI (use `ImageLabel` with 9-slice shadows as workaround) |

| `text-shadow` | Not available |

| `transform` (rotate, scale) | Partially available via `Rotation` property only |

| `transition` / `animation` | No CSS transition equivalent — use `TweenService` in scripts |

| `@keyframes` | Not available — would need runtime code |

| `::before` / `::after` | No content pseudo-elements |

| `grid` layout | No CSS Grid equivalent — only flex via UIListLayout |

| `text-decoration` | Not available |

| `filter` (blur, brightness) | Not available |

| `backdrop-filter` | Not available |

| `clip-path` | Not available |

| `text-transform` | Not available — handle in Luau at runtime |

| `@media` queries (besides theme) | No responsive design system (except `ViewportDisplaySize` API) |



---



\## Rojo Integration



\### Project Structure



```

src/

&nbsp; ui/

&nbsp;   styles/

&nbsp;     base.css

&nbsp;     theme-dark.css

&nbsp;     components.css

&nbsp;   components/

out/

&nbsp; ui/

&nbsp;   styles/

&nbsp;     CoreSheet.rbxmx

&nbsp;     DarkTheme.rbxmx

```



\### `default.project.json` Integration



```json

{

&nbsp; "tree": {

&nbsp;   "$className": "DataModel",

&nbsp;   "ReplicatedStorage": {

&nbsp;     "Styles": {

&nbsp;       "$path": "out/ui/styles"

&nbsp;     }

&nbsp;   }

&nbsp; }

}

```



The compiler's watch mode (`rbx-css watch`) monitors source CSS files and regenerates output files, which Rojo then hot-reloads into Studio.



---



\## Implementation Notes



\### Recommended Parser



Use \*\*lightningcss\*\* (Rust, available as npm package `lightningcss`) for CSS parsing. It's fast, spec-compliant, handles vendor prefixes, shorthand expansion, and provides a clean AST. Alternative: `postcss` if a plugin ecosystem is needed.



\### Architecture



```

CSS Source

&nbsp;   |

&nbsp;   v

+---------------+

|  CSS Parser   |  (lightningcss / postcss)

|  -> CSS AST   |

+-------+-------+

&nbsp;       |

&nbsp;       v

+------------------+

|  Selector Mapper |  CSS selectors -> Roblox selectors

+-------+----------+

&nbsp;       |

&nbsp;       v

+------------------+

|  Property Mapper |  CSS props -> Roblox props + pseudo-instances

+-------+----------+

&nbsp;       |

&nbsp;       v

+------------------+

|  Token Extractor |  :root variables -> StyleSheet attributes

+-------+----------+

&nbsp;       |

&nbsp;       v

+------------------+

|  IR (Intermediate|  Normalized representation of StyleSheet tree

|  Representation) |

+-------+----------+

&nbsp;       |

&nbsp;       +---------------+

&nbsp;       v               v

+--------------+  +--------------+

| Luau Codegen |  | RBXMX Gen    |

+--------------+  +--------------+

```



\### IR Schema (conceptual)



```typescript

interface StyleSheetIR {

&nbsp; name: string;

&nbsp; tokens: Map<string, TokenValue>;

&nbsp; rules: StyleRuleIR\[];

&nbsp; themes?: Map<string, StyleSheetIR>;

}



interface StyleRuleIR {

&nbsp; selector: string;           // Already mapped to Roblox format

&nbsp; properties: Map<string, RobloxValue>;

&nbsp; pseudoInstances: PseudoInstanceIR\[];

}



interface PseudoInstanceIR {

&nbsp; type: "UICorner" | "UIStroke" | "UIPadding" | "UIListLayout" | "UIGradient"

&nbsp;     | "UIFlexItem" | "UIAspectRatioConstraint" | "UISizeConstraint";

&nbsp; properties: Map<string, RobloxValue>;

}



type RobloxValue =

&nbsp; | { type: "Color3"; value: \[number, number, number] }

&nbsp; | { type: "UDim2"; value: \[number, number, number, number] }

&nbsp; | { type: "UDim"; value: \[number, number] }

&nbsp; | { type: "number"; value: number }

&nbsp; | { type: "boolean"; value: boolean }

&nbsp; | { type: "Enum"; enum: string; value: string }

&nbsp; | { type: "token"; name: string }

&nbsp; | { type: "Font"; family: string; weight?: string; style?: string };

```



---



\## Example: Full Compilation



\### Input: `styles.css`



```css

:root {

&nbsp; --bg: #1a1a2e;

&nbsp; --text: #e1e1e1;

&nbsp; --primary: #335fff;

&nbsp; --radius: 8px;

&nbsp; --gap: 12px;

}



div {

&nbsp; background-color: var(--bg);

}



.card {

&nbsp; background-color: var(--bg);

&nbsp; border-radius: var(--radius);

&nbsp; border: 1px solid rgba(255, 255, 255, 0.1);

&nbsp; padding: 16px;

&nbsp; display: flex;

&nbsp; flex-direction: column;

&nbsp; gap: var(--gap);

}



.card:hover {

&nbsp; background-color: #2a2a4e;

}



.card > span {

&nbsp; color: var(--text);

&nbsp; font-size: 18px;

&nbsp; font-weight: 700;

&nbsp; font-family: "GothamSSm";

}



button.primary {

&nbsp; background-color: var(--primary);

&nbsp; color: white;

&nbsp; font-size: 16px;

&nbsp; border-radius: 6px;

&nbsp; padding: 8px 24px;

&nbsp; width: auto;

&nbsp; height: auto;

}



button.primary:hover {

&nbsp; background-color: #4470ff;

}

```



\### Output: `styles.luau`



```lua

-- Auto-generated by rbx-css

-- Source: styles.css



local function createStyleSheet()

&nbsp;   local sheet = Instance.new("StyleSheet")

&nbsp;   sheet.Name = "StyleSheet"



&nbsp;   -- Tokens from :root

&nbsp;   sheet:SetAttribute("bg", Color3.fromHex("#1a1a2e"))

&nbsp;   sheet:SetAttribute("text", Color3.fromHex("#e1e1e1"))

&nbsp;   sheet:SetAttribute("primary", Color3.fromHex("#335fff"))

&nbsp;   sheet:SetAttribute("radius", UDim.new(0, 8))

&nbsp;   sheet:SetAttribute("gap", UDim.new(0, 12))



&nbsp;   -- Rule: Frame (from 'div')

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = "Frame"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           BackgroundColor3 = "$bg",

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: .card

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = ".card"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           BackgroundColor3 = "$bg",

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: .card::UICorner

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = ".card::UICorner"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperty("CornerRadius", "$radius")

&nbsp;   end



&nbsp;   -- Rule: .card::UIStroke

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = ".card::UIStroke"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           Thickness = 1,

&nbsp;           Color = Color3.fromRGB(255, 255, 255),

&nbsp;           Transparency = 0.9,

&nbsp;           ApplyStrokeMode = Enum.ApplyStrokeMode.Border,

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: .card::UIPadding

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = ".card::UIPadding"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           PaddingTop = UDim.new(0, 16),

&nbsp;           PaddingBottom = UDim.new(0, 16),

&nbsp;           PaddingLeft = UDim.new(0, 16),

&nbsp;           PaddingRight = UDim.new(0, 16),

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: .card::UIListLayout

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = ".card::UIListLayout"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           FillDirection = Enum.FillDirection.Vertical,

&nbsp;           Padding = "$gap",

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: .card:Hover

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = ".card:Hover"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           BackgroundColor3 = Color3.fromHex("#2a2a4e"),

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: .card > TextLabel (from '.card > span')

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = ".card > TextLabel"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           TextColor3 = "$text",

&nbsp;           TextSize = 18,

&nbsp;           FontFace = Font.new(

&nbsp;               "rbxasset://fonts/families/GothamSSm.json",

&nbsp;               Enum.FontWeight.Bold

&nbsp;           ),

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: TextButton.primary (from 'button.primary')

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = "TextButton.primary"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           BackgroundColor3 = "$primary",

&nbsp;           TextColor3 = Color3.fromRGB(255, 255, 255),

&nbsp;           TextSize = 16,

&nbsp;           AutomaticSize = Enum.AutomaticSize.XY,

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: TextButton.primary::UICorner

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = "TextButton.primary::UICorner"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperty("CornerRadius", UDim.new(0, 6))

&nbsp;   end



&nbsp;   -- Rule: TextButton.primary::UIPadding

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = "TextButton.primary::UIPadding"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           PaddingTop = UDim.new(0, 8),

&nbsp;           PaddingBottom = UDim.new(0, 8),

&nbsp;           PaddingLeft = UDim.new(0, 24),

&nbsp;           PaddingRight = UDim.new(0, 24),

&nbsp;       })

&nbsp;   end



&nbsp;   -- Rule: TextButton.primary:Hover

&nbsp;   do

&nbsp;       local rule = Instance.new("StyleRule")

&nbsp;       rule.Selector = "TextButton.primary:Hover"

&nbsp;       rule.Parent = sheet

&nbsp;       rule:SetProperties({

&nbsp;           BackgroundColor3 = Color3.fromHex("#4470ff"),

&nbsp;       })

&nbsp;   end



&nbsp;   return sheet

end



return createStyleSheet

```



---



\## Future: Layer 2 (TSX -> Luau) Integration Points



This spec focuses on Layer 1 (CSS compiler), but here are the hooks for Layer 2:



1\. \*\*`className` -> `CollectionService:AddTag()`\*\*: The TSX compiler uses `className` values to emit tag calls matching the CSS selectors.

2\. \*\*Element type from CSS\*\*: When `overflow: scroll` is detected on a class, the TSX compiler knows to emit `ScrollingFrame` instead of `Frame` for elements with that class.

3\. \*\*CSS Modules support\*\*: Scoped class names (`styles.card`) could generate unique tag names to avoid collisions between component styles.

4\. \*\*Shared config\*\*: The HTML-to-Roblox element mapping table is shared between both compilers.



---



\## Version



Spec version: \*\*0.1.0\*\* — Initial draft

