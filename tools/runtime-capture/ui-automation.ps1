<#
.SYNOPSIS
Input and screen primitives for driving a capture session's Ruffle window.

The game receives ordinary synthetic mouse and keyboard input through the
Windows input queue - exactly what a human produces - so nothing about the
movie's execution changes and captured evidence stays as legitimate as
hand-played sessions. Nothing here reads or writes game memory or files.

Coordinates are CLIENT-AREA relative (0,0 = top-left of the movie surface),
so a route recorded once stays valid wherever the window sits.

.EXAMPLE
powershell -File tools\runtime-capture\ui-automation.ps1 info
powershell -File tools\runtime-capture\ui-automation.ps1 shot -Path shot.png
powershell -File tools\runtime-capture\ui-automation.ps1 click -X 320 -Y 240
powershell -File tools\runtime-capture\ui-automation.ps1 key -Key END
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('info', 'focus', 'shot', 'click', 'move', 'key')]
    [string] $Command,
    [string] $Path,
    [int] $X,
    [int] $Y,
    [string] $Key,
    [int] $SettleMs = 120
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

if (-not ('Ss2Ui' -as [type])) {
    Add-Type @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class Ss2Ui {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

    // Without this the process sees DPI-virtualized logical coordinates
    // while screen capture and the cursor use physical pixels, so every
    // rectangle and click lands scaled and offset (observed at 150%).
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
    [DllImport("user32.dll")] public static extern short VkKeyScan(char ch);

    const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
    const uint KEYEVENTF_KEYUP = 0x0002;

    // Client-area origin in screen coordinates.
    public static POINT ClientOrigin(IntPtr hWnd) {
        POINT p; p.X = 0; p.Y = 0;
        ClientToScreen(hWnd, ref p);
        return p;
    }

    public static RECT ClientSize(IntPtr hWnd) {
        RECT r; GetClientRect(hWnd, out r); return r;
    }

    public static void Focus(IntPtr hWnd) {
        ShowWindow(hWnd, 9); // SW_RESTORE
        SetForegroundWindow(hWnd);
    }

    public static void ClickClient(IntPtr hWnd, int cx, int cy) {
        POINT o = ClientOrigin(hWnd);
        SetCursorPos(o.X + cx, o.Y + cy);
        System.Threading.Thread.Sleep(40);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(40);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public static void MoveClient(IntPtr hWnd, int cx, int cy) {
        POINT o = ClientOrigin(hWnd);
        SetCursorPos(o.X + cx, o.Y + cy);
    }

    public static void PressVk(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(40);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static Bitmap CaptureClient(IntPtr hWnd) {
        RECT r = ClientSize(hWnd);
        POINT o = ClientOrigin(hWnd);
        int w = r.Right - r.Left, h = r.Bottom - r.Top;
        if (w <= 0 || h <= 0) throw new Exception("The window has no client area.");
        Bitmap bmp = new Bitmap(w, h);
        using (Graphics g = Graphics.FromImage(bmp)) {
            g.CopyFromScreen(o.X, o.Y, 0, 0, new Size(w, h));
        }
        return bmp;
    }
}
'@ -ReferencedAssemblies System.Drawing, System.Windows.Forms
}

[void] [Ss2Ui]::SetProcessDPIAware()

function Get-RuffleWindow {
    $proc = Get-Process ruffle -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Select-Object -First 1
    if (-not $proc) { throw 'No Ruffle window found. Launch a capture session first.' }
    return $proc.MainWindowHandle
}

# Virtual-key codes for the keys a capture route needs.
$VirtualKeys = @{
    'END' = 0x23; 'HOME' = 0x24; 'ENTER' = 0x0D; 'RETURN' = 0x0D; 'SPACE' = 0x20;
    'ESC' = 0x1B; 'ESCAPE' = 0x1B; 'TAB' = 0x09;
    'LEFT' = 0x25; 'UP' = 0x26; 'RIGHT' = 0x27; 'DOWN' = 0x28
}

$hWnd = Get-RuffleWindow

switch ($Command) {
    'info' {
        $size = [Ss2Ui]::ClientSize($hWnd)
        $origin = [Ss2Ui]::ClientOrigin($hWnd)
        [pscustomobject]@{
            ClientWidth = $size.Right - $size.Left
            ClientHeight = $size.Bottom - $size.Top
            ScreenX = $origin.X
            ScreenY = $origin.Y
        } | Format-List
    }
    'focus' {
        [Ss2Ui]::Focus($hWnd)
        Start-Sleep -Milliseconds $SettleMs
        Write-Host 'Focused.'
    }
    'shot' {
        if (-not $Path) { throw 'shot requires -Path.' }
        $full = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
        New-Item -ItemType Directory -Path (Split-Path -Parent $full) -Force | Out-Null
        $bmp = [Ss2Ui]::CaptureClient($hWnd)
        try { $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $bmp.Dispose() }
        Write-Host "Wrote $full"
    }
    'click' {
        [Ss2Ui]::Focus($hWnd)
        Start-Sleep -Milliseconds 60
        [Ss2Ui]::ClickClient($hWnd, $X, $Y)
        Start-Sleep -Milliseconds $SettleMs
        Write-Host "Clicked client ($X,$Y)."
    }
    'move' {
        [Ss2Ui]::Focus($hWnd)
        [Ss2Ui]::MoveClient($hWnd, $X, $Y)
        Start-Sleep -Milliseconds $SettleMs
        Write-Host "Moved to client ($X,$Y)."
    }
    'key' {
        if (-not $Key) { throw 'key requires -Key.' }
        [Ss2Ui]::Focus($hWnd)
        Start-Sleep -Milliseconds 60
        $upper = $Key.ToUpperInvariant()
        if ($VirtualKeys.ContainsKey($upper)) {
            [Ss2Ui]::PressVk([byte] $VirtualKeys[$upper])
        } elseif ($Key.Length -eq 1) {
            $vk = [Ss2Ui]::VkKeyScan([char] $Key) -band 0xFF
            [Ss2Ui]::PressVk([byte] $vk)
        } else {
            throw "Unknown key '$Key'. Known: $($VirtualKeys.Keys -join ', '), or a single character."
        }
        Start-Sleep -Milliseconds $SettleMs
        Write-Host "Pressed $Key."
    }
}
