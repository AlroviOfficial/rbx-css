export type TokenValue =
  | { type: "Color3"; value: [number, number, number] }
  | { type: "UDim"; value: [number, number] }
  | { type: "number"; value: number }
  | { type: "Font"; family: string; weight?: string; style?: string }
  | { type: "string"; value: string };

export type RobloxValue =
  | { type: "Color3"; value: [number, number, number] }
  | { type: "UDim2"; value: [number, number, number, number] }
  | { type: "UDim"; value: [number, number] }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "Enum"; enum: string; value: string }
  | { type: "token"; name: string }
  | { type: "Font"; family: string; weight?: string; style?: string }
  | { type: "Vector2"; value: [number, number] }
  | { type: "string"; value: string }
  | {
      type: "ColorSequence";
      stops: Array<{ position: number; color: [number, number, number] }>;
    };

export type PseudoInstanceType =
  | "UICorner"
  | "UIStroke"
  | "UIPadding"
  | "UIListLayout"
  | "UIGridLayout"
  | "UIGradient"
  | "UIFlexItem"
  | "UIScale"
  | "UIAspectRatioConstraint"
  | "UISizeConstraint";

export interface PseudoInstanceIR {
  type: PseudoInstanceType;
  properties: Map<string, RobloxValue>;
}

export interface StyleRuleIR {
  selector: string;
  properties: Map<string, RobloxValue>;
  pseudoInstances: PseudoInstanceIR[];
}

export interface StyleSheetIR {
  name: string;
  tokens: Map<string, TokenValue>;
  rules: StyleRuleIR[];
  themes?: Map<string, StyleSheetIR>;
}
