# Animation study

The repository currently contains the Phase 1 timing probe described in [PROJECT_PLAN.md](PROJECT_PLAN.md). It reads every video frame with `ffprobe`, retains exact rational presentation timing, assigns a zero-based timeline position, and creates a sampled PNG contact sheet with FFmpeg.

## Requirements

- Node.js 22 or newer
- `ffmpeg` and `ffprobe` on `PATH`

## Run the probe

```sh
npm install
npm run build
npm run probe -- /path/to/video.mp4
```

The default outputs are `<source filename>.timing.json` and `<source filename>.timing.png` in the current directory. Use `--output`, `--contact-sheet`, and `--samples` to change them.

`timelinePosition` is zero-based for indexing. `displayFrameNumber` is the corresponding one-based frame number for the interface.

## Test

```sh
npm test
```
