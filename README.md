# Animation study

The repository currently contains the Phase 1 timing probe described in [PROJECT_PLAN.md](PROJECT_PLAN.md). It reads every video frame with `ffprobe`, retains exact rational presentation timing, assigns a zero-based timeline position, and creates a sampled PNG contact sheet with FFmpeg.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the current checklist, verification record, and next work.

The media code also includes a bounded display-proxy cache. It seeks to an indexed presentation timestamp, decodes a small frame window, and evicts older PNG proxies instead of extracting the full source file.

## Requirements

- Node.js 22 or newer
- `ffmpeg` and `ffprobe` on `PATH`

See [FFmpeg installation instructions](docs/FFMPEG_INSTALLATION.md) for Linux and Windows setup.

## Run the probe

```sh
npm install
npm run build
npm run probe -- /path/to/video.mp4
```

The default outputs are `<source filename>.timing.json` and `<source filename>.timing.png` in the current directory. Use `--output`, `--contact-sheet`, and `--samples` to change them.

`timelinePosition` is zero-based for indexing. `displayFrameNumber` is the corresponding one-based frame number for the interface.

## Run the desktop viewer

```sh
npm start
```

The current viewer opens a local video, shows the first indexed frame, and steps by exact source-frame position with the arrow keys, comma, period, Home, or End. Normal playback with synchronized audio is the next Phase 1 slice.

## Test

```sh
npm test
```

## Build the Linux release

```sh
npm run dist:linux
```

The x86-64 artifact is `release/Animation-Study-<version>-x86_64.AppImage`. Make it executable and run it directly:

```sh
chmod +x Animation-Study-0.1.0-x86_64.AppImage
./Animation-Study-0.1.0-x86_64.AppImage
```

AppImage normally uses FUSE. On a system without FUSE, run it with `APPIMAGE_EXTRACT_AND_RUN=1` or use `--appimage-extract` and start the extracted `AppRun` file.
