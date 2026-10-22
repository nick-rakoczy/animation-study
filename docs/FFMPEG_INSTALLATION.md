# Install FFmpeg

Animation Study requires both FFmpeg and ffprobe. On Windows, you can select FFmpeg in the app. On Linux, install both tools on `PATH` and restart the application.

## Linux

Use the package manager for your distribution.

```sh
# Ubuntu or Debian
sudo apt update
sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

Confirm both commands work:

```sh
ffmpeg -version
ffprobe -version
```

If the distribution does not provide FFmpeg, use a 64-bit Linux build linked from the [official FFmpeg download page](https://ffmpeg.org/download.html).

## Windows

1. Open the [official FFmpeg download page](https://ffmpeg.org/download.html#build-windows).
2. Choose one of the linked Windows build providers.
3. Download and extract a 64-bit build.
4. Open Animation Study and click **Choose FFmpeg** near the FFmpeg status.
5. Select `ffmpeg.exe` in the extracted `bin` folder. Keep `ffprobe.exe` in the same folder.

The app checks both tools and remembers the selected path for future launches. No `PATH` change or restart is needed. If you change the path while a video is open, reopen the video to use the new tools for that video.

Use **Choose FFmpeg** again to change the location, or **Use PATH** to return to the system commands. If a saved location is moved or deleted, select its new location using **Choose FFmpeg**.

## Missing codecs

FFmpeg builds can omit codecs. If Animation Study reports a missing decoder, install a full build from a provider linked by FFmpeg. Run this command to check a decoder before reopening the source:

```sh
ffmpeg -decoders
```
