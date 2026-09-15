# Install FFmpeg

Animation Study requires both `ffmpeg` and `ffprobe` on `PATH`. Restart the application after installation.

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
4. Add the extracted `bin` directory, which contains `ffmpeg.exe` and `ffprobe.exe`, to the user or system `Path` environment variable.
5. Open a new Command Prompt and run `ffmpeg -version` and `ffprobe -version`.
6. Restart Animation Study.

Windows exposes environment variables through Advanced System Settings. Microsoft documents that tool in [System configuration tools in Windows](https://support.microsoft.com/en-us/windows/experience/system-configuration-tools-in-windows).

## Missing codecs

FFmpeg builds can omit codecs. If Animation Study reports a missing decoder, install a full build from a provider linked by FFmpeg. Run this command to check a decoder before reopening the source:

```sh
ffmpeg -decoders
```
