interface VideoFileDropOptions {
  readonly canOpen: boolean;
  readonly onHover: (hovering: boolean) => void;
  readonly onFile: (file: File) => void;
  readonly onError: (message: string) => void;
}

/** Handle OS file drops across the window, including over native video controls. */
export function installVideoFileDrop(target: EventTarget, options: VideoFileDropOptions): () => void {
  let depth = 0;
  const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") === true;
  const reset = () => {
    depth = 0;
    options.onHover(false);
  };
  const enter = (event: Event) => {
    if (!hasFiles(event as DragEvent)) return;
    event.preventDefault();
    depth += 1;
    options.onHover(options.canOpen);
  };
  const over = (event: Event) => {
    const drag = event as DragEvent;
    if (!hasFiles(drag)) return;
    event.preventDefault();
    drag.dataTransfer!.dropEffect = options.canOpen ? "copy" : "none";
  };
  const leave = (event: Event) => {
    if (!hasFiles(event as DragEvent)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) reset();
  };
  const drop = (event: Event) => {
    const drag = event as DragEvent;
    if (!hasFiles(drag)) return;
    event.preventDefault();
    reset();
    if (!options.canOpen) return;
    const files = drag.dataTransfer!.files;
    if (files.length !== 1) {
      options.onError("Drop one video file at a time");
      return;
    }
    options.onFile(files[0]!);
  };
  const listeners = { dragenter: enter, dragover: over, dragleave: leave, drop, dragend: reset, blur: reset };
  for (const [type, listener] of Object.entries(listeners)) target.addEventListener(type, listener, true);
  return () => {
    for (const [type, listener] of Object.entries(listeners)) target.removeEventListener(type, listener, true);
    reset();
  };
}
