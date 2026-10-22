import assert from "node:assert/strict";
import test from "node:test";
import { installVideoFileDrop } from "../src/video-file-drop.js";

function setup(canOpen = true) {
  const target = new EventTarget();
  const hovers: boolean[] = [];
  const opened: File[] = [];
  const errors: string[] = [];
  const cleanup = installVideoFileDrop(target, {
    canOpen,
    onHover: (hovering) => hovers.push(hovering),
    onFile: (file) => opened.push(file),
    onError: (message) => errors.push(message),
  });
  const dispatch = (type: string, files: File[] = [], types = ["Files"]) => {
    const event = new Event(type, { cancelable: true });
    const dataTransfer = { types, files, dropEffect: "uninitialized" };
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    target.dispatchEvent(event);
    return { event, dataTransfer };
  };
  return { target, hovers, opened, errors, cleanup, dispatch };
}

test("file drops prevent navigation and open the original file, including names with spaces", () => {
  const { dispatch, opened, hovers, errors } = setup();
  const file = new File(["video"], "timing study.MOV", { type: "" });
  dispatch("dragenter");
  const over = dispatch("dragover");
  assert.equal(over.event.defaultPrevented, true);
  assert.equal(over.dataTransfer.dropEffect, "copy");
  assert.equal(dispatch("drop", [file]).event.defaultPrevented, true);
  assert.deepEqual(opened, [file]);
  assert.deepEqual(hovers, [true, false]);
  assert.deepEqual(errors, []);
});

test("crossing child elements keeps the drop indicator visible until leaving the window", () => {
  const { dispatch, hovers } = setup();
  dispatch("dragenter");
  dispatch("dragenter");
  dispatch("dragleave");
  assert.equal(hovers.at(-1), true);
  dispatch("dragleave");
  assert.equal(hovers.at(-1), false);
});

test("busy or unavailable tools reject drops while still preventing file navigation", () => {
  const { dispatch, opened, hovers } = setup(false);
  dispatch("dragenter");
  const over = dispatch("dragover");
  assert.equal(over.event.defaultPrevented, true);
  assert.equal(over.dataTransfer.dropEffect, "none");
  assert.equal(dispatch("drop", [new File([], "video.mp4")]).event.defaultPrevented, true);
  assert.deepEqual(opened, []);
  assert.ok(hovers.every((hovering) => !hovering));
});

test("multiple files and empty file drops report an error without opening anything", () => {
  const { dispatch, opened, errors } = setup();
  dispatch("drop", [new File([], "one.mp4"), new File([], "two.mp4")]);
  dispatch("drop");
  assert.deepEqual(opened, []);
  assert.deepEqual(errors, ["Drop one video file at a time", "Drop one video file at a time"]);
});

test("text and URL drags do not activate file handling", () => {
  const { dispatch, hovers, opened, errors } = setup();
  for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
    assert.equal(dispatch(type, [], ["text/uri-list"]).event.defaultPrevented, false);
  }
  assert.deepEqual(hovers, []);
  assert.deepEqual(opened, []);
  assert.deepEqual(errors, []);
});

test("cancelling a drag, losing focus, and cleanup clear the indicator and remove listeners", () => {
  const { target, dispatch, hovers, cleanup, opened } = setup();
  for (const type of ["dragend", "blur"]) {
    dispatch("dragenter");
    target.dispatchEvent(new Event(type));
    assert.equal(hovers.at(-1), false);
  }
  dispatch("dragenter");
  cleanup();
  assert.equal(hovers.at(-1), false);
  const hoverCount = hovers.length;
  dispatch("dragenter");
  assert.equal(dispatch("drop", [new File([], "video.mp4")]).event.defaultPrevented, false);
  assert.equal(hovers.length, hoverCount);
  assert.deepEqual(opened, []);
});
