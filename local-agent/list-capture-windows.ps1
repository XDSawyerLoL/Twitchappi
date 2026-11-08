# Enumerate real Windows top-level windows and return an array of
# { hwnd, title, pid, minimized }. No administrative privileges or OBS required.
# Run with powershell.exe -NoProfile -NonInteractive -File thisfile.ps1.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class SwappCaptureWindow {
    public string hwnd { get; set; }
    public string title { get; set; }
    public uint pid { get; set; }
    public bool minimized { get; set; }
}
public static class SwappWindows {
    private delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int length);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLengthW(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

    public static List<SwappCaptureWindow> ListWindows() {
        var result = new List<SwappCaptureWindow>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr unused) {
            try {
                if (!IsWindowVisible(hwnd)) return true;
                int length = GetWindowTextLengthW(hwnd);
                if (length < 1 || length > 4096) return true;
                var title = new StringBuilder(length + 1);
                if (GetWindowTextW(hwnd, title, title.Capacity) < 1) return true;
                var trimmed = title.ToString().Trim();
                if (trimmed.Length < 2) return true;
                long handle = hwnd.ToInt64();
                if (handle <= 0) return true;
                uint pid;
                GetWindowThreadProcessId(hwnd, out pid);
                result.Add(new SwappCaptureWindow {
                    hwnd = handle.ToString(), title = trimmed, pid = pid,
                    minimized = IsIconic(hwnd)
                });
            } catch (Exception) {
                // One destroyed or inaccessible window must not break enumeration.
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
'@
Add-Type -TypeDefinition $source -ErrorAction Stop
$windows = [SwappWindows]::ListWindows()
ConvertTo-Json -InputObject ($windows.ToArray()) -Compress -Depth 4
