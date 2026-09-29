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

On first launch, the AppImage copies itself to `~/Applications` and restarts from there. You can delete the original download after the app opens. It creates `com.animationstudy.app.desktop` in `$XDG_DATA_HOME/applications` (or `~/.local/share/applications`), pointing to the copy in `~/Applications`. The built-in updater keeps the desktop entry pointed at the current version.

The build also creates `release/latest-linux.yml`. GitHub releases must include that file with the AppImage so packaged copies can find, verify, and install updates.

## Build the Windows release on Linux

Install Wine, then run:

```sh
npm run dist:win
```

This creates `release/Animation-Study-<version>-win-x64-Setup.exe`, its `.blockmap`, and `release/latest.yml`. The Windows installer requires `ffmpeg` and `ffprobe` on the user's `PATH` as described in the [FFmpeg installation instructions](docs/FFMPEG_INSTALLATION.md). The release workflow builds the installer on Ubuntu and uploads it with the AppImage and both update metadata files. Linux tests and cross-building do not verify the app on Windows.

Pushes to `main` start the release workflow. Each successful run reads the major and minor numbers from `package.json`, finds the highest existing patch tag for that release line, and increments it. If the release line has no tags, it starts at patch `0`. To begin a new major or minor release line, update the version in `package.json`; the checked-in patch number is ignored by the workflow.

AppImage normally uses FUSE. On a system without FUSE, run it with `APPIMAGE_EXTRACT_AND_RUN=1` or use `--appimage-extract` and start the extracted `AppRun` file.
