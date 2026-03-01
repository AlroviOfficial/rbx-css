import type { StyleSheetIR, RobloxValue, TokenValue } from "../ir/types.ts";
import { rgbToHex } from "../mappers/colors.ts";

export function generateRBXMX(ir: StyleSheetIR): string {
  let referentCounter = 0;
  const nextReferent = () => `RBX${String(++referentCounter).padStart(4, "0")}`;

  const lines: string[] = [];
  lines.push('<roblox version="4">');

  // Root StyleSheet
  const sheetRef = nextReferent();
  lines.push(`  <Item class="StyleSheet" referent="${sheetRef}">`);
  lines.push("    <Properties>");
  lines.push(`      <string name="Name">${escapeXml(ir.name)}</string>`);
  lines.push("    </Properties>");

  // Token attributes as child Attributes item (simplified)
  if (ir.tokens.size > 0) {
    lines.push(`    <!-- Tokens -->`);
    for (const [name, value] of ir.tokens) {
      lines.push(
        `    <!-- ${escapeXml(name)}: ${serializeTokenComment(value)} -->`
      );
    }
  }

  // StyleRule children
  for (const rule of ir.rules) {
    const ruleRef = nextReferent();
    lines.push(
      `    <Item class="StyleRule" referent="${ruleRef}">`,
      "      <Properties>",
      `        <string name="Selector">${escapeXml(rule.selector)}</string>`,
      "      </Properties>"
    );
    // Properties as comments (RBXMX StyleRule property encoding is complex)
    if (rule.properties.size > 0) {
      lines.push("      <!-- Properties:");
      for (const [propName, propValue] of rule.properties) {
        lines.push(
          `        ${escapeXml(propName)} = ${serializeValueComment(propValue)}`
        );
      }
      lines.push("      -->");
    }
    lines.push("    </Item>");
  }

  lines.push("  </Item>");

  // Theme sheets
  if (ir.themes) {
    for (const [themeName, themeIR] of ir.themes) {
      const themeRef = nextReferent();
      lines.push(
        `  <Item class="StyleSheet" referent="${themeRef}">`,
        "    <Properties>",
        `      <string name="Name">${escapeXml(themeIR.name)}</string>`,
        "    </Properties>",
        "  </Item>"
      );
    }
  }

  lines.push("</roblox>", "");

  return lines.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function serializeTokenComment(value: TokenValue): string {
  switch (value.type) {
    case "Color3":
      return rgbToHex(value.value);
    case "UDim":
      return `UDim(${value.value.join(", ")})`;
    case "number":
      return String(value.value);
    case "Font":
      return value.family;
    case "string":
      return value.value;
  }
}

function serializeValueComment(value: RobloxValue): string {
  switch (value.type) {
    case "Color3":
      return `Color3(${value.value.join(", ")})`;
    case "UDim2":
      return `UDim2(${value.value.join(", ")})`;
    case "UDim":
      return `UDim(${value.value.join(", ")})`;
    case "number":
      return String(value.value);
    case "boolean":
      return String(value.value);
    case "Enum":
      return `Enum.${value.enum}.${value.value}`;
    case "token":
      return `$${value.name}`;
    case "Font":
      return value.family;
    case "Vector2":
      return `Vector2(${value.value.join(", ")})`;
    case "string":
      return value.value;
    case "ColorSequence":
      return "ColorSequence(...)";
  }
}
