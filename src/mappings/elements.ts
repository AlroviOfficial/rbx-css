export const HTML_TO_ROBLOX: Record<string, string> = {
  div: "Frame",
  span: "TextLabel",
  p: "TextLabel",
  h1: "TextLabel",
  h2: "TextLabel",
  h3: "TextLabel",
  h4: "TextLabel",
  h5: "TextLabel",
  h6: "TextLabel",
  button: "TextButton",
  input: "TextBox",
  img: "ImageLabel",
  a: "TextButton",
  canvas: "ViewportFrame",
  label: "TextLabel",
  textarea: "TextBox",
  video: "VideoFrame",
  scroll: "ScrollingFrame",

  // Semantic containers
  nav: "Frame",
  header: "Frame",
  footer: "Frame",
  main: "Frame",
  section: "Frame",
  article: "Frame",
  aside: "Frame",
  form: "Frame",

  // List elements
  ul: "Frame",
  ol: "Frame",
  li: "Frame",

  // Table elements
  table: "Frame",
  thead: "Frame",
  tbody: "Frame",
  tfoot: "Frame",
  tr: "Frame",
  td: "TextLabel",
  th: "TextLabel",

  // Interactive/overlay
  dialog: "Frame",
  details: "Frame",
  summary: "TextButton",

  // Form controls
  select: "Frame",
  option: "TextButton",
  optgroup: "Frame",
};
