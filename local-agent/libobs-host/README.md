# SWAPP libobs host — Windows build & licensing

This directory contains a standalone native host written against OBS Studio's **libobs** API.
It is **not** OBS Studio and does not launch an OBS GUI. Its only RTMP destination
is SWAPP Live's own loopback ingest. The Electron app displays the resulting HLS
preview and decides when to publish via the existing SWAPP service.

## Provenance

- Upstream: https://github.com/obsproject/obs-studio
- Recommended SDK + portable runtime: tag `33.0.1` (October 29, 2026)
- libobs/plugin licensing: GPL-2.0-or-later, subject to the licenses of bundled dependencies.
- Changes to this host are also offered under GPL-2.0-or-later.
- Do not ship the libobs binary, OBS plugins or the combined installer unless the
  license notices, complete corresponding sources/build instructions, and all
  applicable GPL obligations for the distributed work have been reviewed.

## Build prerequisites (developer only)

1. Windows 10/11 x64, Visual Studio C++ build tools, CMake 3.28+, and a
   compatible OBS Studio **33.0.1 libobs development build/export**, with headers,
   import libraries and CMake package files. The OBS portable ZIP alone generally
   does **not** supply the developer headers/import libraries.
2. An **official OBS Studio 33.0.1 Windows portable runtime** for the matching
   architecture, extracted locally. It is used to stage compatible libobs DLLs,
   plugins and their runtime assets. No OBS interface is installed for the user.
3. Run `local-agent/libobs-host/build-and-stage-windows.ps1` with
   `-SdkPrefix C:\path\to\exported-libobs`,
   `-ObsPortableRoot C:\path\to\OBS-portable`, and
   `-ObsSourceRoot C:\path\to\obs-studio-33.0.1` (checked-out upstream source with `COPYING`).

OBS 33.0.1 uses `core/<module>/<module>.dll` and `core/<module>/data`
for its first-party modules, rather than the older
`obs-plugins/64bit/<module>.dll` layout. The staging script now copies each
required *whole module directory*, including game capture helpers, and rejects
missing required modules. It also stages `data/libobs` effects if present.
The application will not offer libobs unless the host, both libobs DLLs and the
six mandatory capture/audio/RTMP modules are present.

The script builds `swapp-libobs-host.exe` and stages the selected OBS runtime
components under `local-agent/libobs-runtime/`. It will abort when required
modules are missing. It does **not** download or silently bundle binaries.

## Required plugin sources

- `win-capture`: `game_capture` / `monitor_capture`.
- `win-wasapi`: `wasapi_output_capture` / `wasapi_input_capture`.
- `obs-outputs`: `rtmp_output`.
- `rtmp-services`: `rtmp_custom` service.
- `obs-x264`: software fallback H.264.
- `obs-ffmpeg`: AAC encoder.
- `obs-nvenc`: optional NVIDIA H.264 hardware encoding.

The OBS game hook is **not** guaranteed to work in games with anti-cheat
restrictions, sandboxing, DRM, elevated privileges or incompatible GPUs.
Never bypass game security or anti-cheat protections.

## Integration

The Electron package includes a `swapp-libobs` runtime directory when staged.
On start, SWAPP Live checks for `swapp-libobs-host.exe` in its packaged
resources; in development it also checks `local-agent/libobs-runtime/` and `local-agent/bin/`.
The Studio auto mode prefers libobs when present and falls back to FFmpeg if
the host cannot provide healthy HLS. Users can explicitly select libobs
Game Capture, and the interface clearly reports when the host is missing.

SWAPP's existing OBS/FFmpeg mode remains a separate option.

## Acceptance tests still needed

Compile with the actual OBS 33.0.1 headers and libraries; then test Game
Capture with a fullscreen game, WASAPI desktop/microphone, NVENC/x264,
external viewer HLS for at least five minutes, and start/stop/restart.
Verify ffmpeg HLS remuxing and the existing OBS mode are unaffected.
No native binary is included in this source-only change.

## Verification status (8 November 2026)

- JS source syntax and mocked libobs process handoff have been checked.
- Module paths were corrected against OBS 33.0.1 portable runtime layout.
- A real C++ compile against libobs 33.0.1 is **not yet done**.
- No Windows portable/NSIS installer has been produced and no public release created.
- Explicit Windows-only capture tests (fullscreen game, GPU, WASAPI, network spectator)
  and GPL corresponding-source compliance remain release blockers.
