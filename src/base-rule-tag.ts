/**
 * Tag every base element rule is scoped to.
 *
 * Base rules exist to undo Roblox defaults that have no counterpart in a
 * browser (an opaque background, a 1px border, placeholder text). A bare type
 * selector would apply them to every instance under the StyleLink, including
 * ones the compiler never produced — a GUI built by hand and adopted into the
 * tree would silently lose its backgrounds and borders. Scoping to a tag the
 * renderer applies to what it creates keeps the sheet to its own elements.
 *
 * Reported to the renderer through the manifest (`elementTag`) rather than
 * agreed by convention, so the two sides cannot drift apart.
 */
export const BASE_RULE_TAG = "rbx-el";
