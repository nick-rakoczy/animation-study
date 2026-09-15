import assert from "node:assert/strict";
import test from "node:test";
import { appKeyboardAction, type KeyboardShortcutInput } from "../src/keyboard-shortcuts.js";

const cases: readonly [KeyboardShortcutInput, string][] = [
  [{ key: " " }, "toggle-playback"],
  [{ key: "ArrowLeft" }, "previous-frame"],
  [{ key: "," }, "previous-frame"],
  [{ key: "ArrowRight" }, "next-frame"],
  [{ key: "." }, "next-frame"],
  [{ key: "Home" }, "first-frame"],
  [{ key: "End" }, "last-frame"],
  [{ key: "ArrowLeft", shiftKey: true }, "previous-cel"],
  [{ key: "ArrowRight", shiftKey: true }, "next-cel"],
  [{ key: "+" }, "increase-timeline-scale"],
  [{ key: "-" }, "decrease-timeline-scale"],
  [{ key: "z", ctrlKey: true }, "undo-correction"],
  [{ key: "Z", metaKey: true }, "undo-correction"],
  [{ key: "z", ctrlKey: true, shiftKey: true }, "redo-correction"],
  [{ key: "y", metaKey: true }, "redo-correction"],
];

test("maps every application keyboard shortcut to one action", () => {
  for (const [input, expected] of cases) assert.equal(appKeyboardAction(input), expected);
});

test("does not take application shortcuts from interactive controls", () => {
  for (const [input] of cases) {
    assert.equal(appKeyboardAction({ ...input, interactiveTarget: true }), null);
  }
});

test("ignores modified timeline keys and unrelated keys", () => {
  assert.equal(appKeyboardAction({ key: "Home", ctrlKey: true }), null);
  assert.equal(appKeyboardAction({ key: "ArrowRight", altKey: true }), null);
  assert.equal(appKeyboardAction({ key: "x" }), null);
});
