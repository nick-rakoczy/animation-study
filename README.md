# Animation study

The repository currently contains the Phase 1 timing probe described in [PROJECT_PLAN.md](PROJECT_PLAN.md). It reads every video frame with `ffprobe`, retains exact rational presentation timing, assigns a zero-based timeline position, and creates a sampled PNG contact sheet with FFmpeg.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the current checklist, verification record, and next work.

The viewer uses a seekable compressed playback proxy for playback and frame navigation. It does not generate full-size PNG proxies while stepping or scrubbing. The sampled filmstrip uses a bounded cache of small thumbnails, and export decodes full-resolution PNGs from the source.

## Requirements

- Node.js 24 or newer with npm 12 or newer
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

The current viewer opens a local video and uses the same seekable proxy for synchronized playback and indexed frame navigation. Use the arrow keys, comma, period, Home, or End to move between frames.

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

The build also creates `release/latest-linux.yml`. GitHub releases must include that file with the AppImage so packaged copies can find, verify, and install updates. The release workflow uploads both files.

AppImage normally uses FUSE. On a system without FUSE, run it with `APPIMAGE_EXTRACT_AND_RUN=1` or use `--appimage-extract` and start the extracted `AppRun` file.
