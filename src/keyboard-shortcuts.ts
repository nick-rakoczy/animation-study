export type AppKeyboardAction =
  | "toggle-playback"
  | "previous-frame"
  | "next-frame"
  | "first-frame"
  | "last-frame"
  | "previous-cel"
  | "next-cel"
  | "increase-timeline-scale"
  | "decrease-timeline-scale"
  | "undo-correction"
  | "redo-correction";

export interface KeyboardShortcutInput {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly interactiveTarget?: boolean;
}

export function appKeyboardAction(input: KeyboardShortcutInput): AppKeyboardAction | null {
  if (input.interactiveTarget) return null;

  const key = input.key.toLowerCase();
  const commandKey = Boolean(input.ctrlKey || input.metaKey);
  if (commandKey && !input.altKey) {
    if (key === "z" && !input.shiftKey) return "undo-correction";
    if (key === "y" || key === "z" && input.shiftKey) return "redo-correction";
    return null;
  }
  if (input.ctrlKey || input.metaKey || input.altKey) return null;

  if (input.key === " ") return "toggle-playback";
  if (input.key === "ArrowLeft" && input.shiftKey) return "previous-cel";
  if (input.key === "ArrowRight" && input.shiftKey) return "next-cel";
  if (input.key === "ArrowLeft" && !input.shiftKey || input.key === ",") return "previous-frame";
  if (input.key === "ArrowRight" && !input.shiftKey || input.key === ".") return "next-frame";
  if (input.key === "Home") return "first-frame";
  if (input.key === "End") return "last-frame";
  if (input.key === "+") return "increase-timeline-scale";
  if (input.key === "-") return "decrease-timeline-scale";
  return null;
}
