# Optional SWAPP libobs runtime (not bundled yet)

This tracked directory is intentionally source-only.

The Windows developer build copies the native `swapp-libobs-host.exe`,
`libobs.dll`, required OBS plugin binaries, and corresponding data into
this directory using `libobs-host/build-and-stage-windows.ps1`.

Electron-builder stages its contents into `resources/swapp-libobs`.
If the executable is absent, SWAPP Live automatically uses the existing
FFmpeg capture engine. Do not distribute OBS binaries before GPL/source
compliance and actual Windows functional tests are completed.
