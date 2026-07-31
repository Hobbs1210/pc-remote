param([string]$ServerUrl = 'http://127.0.0.1:3535')

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class AudioKeys {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public static void VolumeUp()   { keybd_event(0xAF, 0, 0, 0); keybd_event(0xAF, 0, 2, 0); }
    public static void VolumeDown() { keybd_event(0xAE, 0, 0, 0); keybd_event(0xAE, 0, 2, 0); }
    public static void VolumeMute() { keybd_event(0xAD, 0, 0, 0); keybd_event(0xAD, 0, 2, 0); }
}

public class ScreenGrab {
    [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll")] static extern IntPtr GetWindowDC(IntPtr h);
    [DllImport("user32.dll")] static extern int    ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")]  static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")]  static extern IntPtr CreateCompatibleBitmap(IntPtr dc, int w, int h);
    [DllImport("gdi32.dll")]  static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")]  static extern bool   BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int op);
    [DllImport("gdi32.dll")]  static extern bool   DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")]  static extern bool   DeleteObject(IntPtr obj);

    public static string Capture(int quality) {
        int sw = Screen.PrimaryScreen.Bounds.Width;
        int sh = Screen.PrimaryScreen.Bounds.Height;
        int tw = sw / 2, th = sh / 2;

        IntPtr desk  = GetDesktopWindow();
        IntPtr dc    = GetWindowDC(desk);
        IntPtr memDc = CreateCompatibleDC(dc);
        IntPtr hBmp  = CreateCompatibleBitmap(dc, sw, sh);
        IntPtr old   = SelectObject(memDc, hBmp);
        BitBlt(memDc, 0, 0, sw, sh, dc, 0, 0, 0x00CC0020); // SRCCOPY
        SelectObject(memDc, old);
        DeleteDC(memDc);
        ReleaseDC(desk, dc);

        Bitmap full = Image.FromHbitmap(hBmp);
        DeleteObject(hBmp);

        var small = new Bitmap(tw, th);
        using (var g = Graphics.FromImage(small)) {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(full, 0, 0, tw, th);
        }
        full.Dispose();

        var codec = Array.Find(ImageCodecInfo.GetImageEncoders(), c => c.MimeType == "image/jpeg");
        var ep    = new EncoderParameters(1);
        ep.Param[0] = new EncoderParameter(Encoder.Quality, (long)quality);
        using (var ms = new MemoryStream()) {
            small.Save(ms, codec, ep);
            small.Dispose();
            return Convert.ToBase64String(ms.ToArray());
        }
    }
}
'@ -ReferencedAssemblies 'System.Windows.Forms', 'System.Drawing'

# -- UI Strings --
$s = @{
    Online            = [string]([char]0x25CF) + ' Online'
    Offline           = [string]([char]0x25CB) + ' Offline'
    ServiceUnavail    = '! Service Unavailable'
    ShowQR            = 'Show QR Code'
    ResetBind         = 'Reset Device Binding'
    Settings          = 'Settings'
    ChangePass        = 'Change Password'
    HideIcon          = 'Hide Icon'
    Exit              = 'Exit Tray'
    WrongPass         = 'Incorrect password'
    EnterPass         = 'Enter Password:'
    NewPass           = 'New Password:'
    PassChanged       = 'Password changed successfully'
    PassChangeErr     = 'Error changing password'
    ResetConfirm      = 'Reset device binding? You will need to re-scan the QR code in the mobile app.'
    ResetDone         = 'Device binding reset. The agent will restart.'
    ResetErr          = 'Error resetting device binding'
}

function Make-Icon {
    param([int]$R, [int]$G, [int]$B)
    $bmp = New-Object System.Drawing.Bitmap(16, 16, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Monitor Screen Body (Dark Blue / Slate background)
    $screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 24, 40))
    $screenPen   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 90, 105, 140), 1)
    
    # Screen frame: x=1, y=1, w=13, h=9
    $rect = New-Object System.Drawing.Rectangle(1, 1, 13, 9)
    $g.FillRectangle($screenBrush, $rect)
    $g.DrawRectangle($screenPen, $rect)

    # Monitor Stand Base: neck at x=7, y=10..12, foot at x=4..10, y=13
    $standPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 160, 175, 200), 1)
    $g.DrawLine($standPen, 7, 10, 7, 12)
    $g.DrawLine($standPen, 4, 13, 10, 13)

    # Status LED Dot inside screen
    $statusColor = [System.Drawing.Color]::FromArgb(255, $R, $G, $B)
    $statusBrush = New-Object System.Drawing.SolidBrush($statusColor)
    $g.FillEllipse($statusBrush, 5, 3, 5, 5)

    $screenBrush.Dispose()
    $screenPen.Dispose()
    $standPen.Dispose()
    $statusBrush.Dispose()
    $g.Dispose()

    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $bmp.Dispose()
    return $icon
}

$iconOnline  = Make-Icon 34 197 94
$iconOffline = Make-Icon 239 68 68

$tray          = New-Object System.Windows.Forms.NotifyIcon
$tray.Text     = 'PC Remote Agent'
$tray.Icon     = $iconOffline
$tray.Visible  = $true

# ---- Menu ----
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$itemStatus = New-Object System.Windows.Forms.ToolStripMenuItem($s.Offline)
$itemStatus.Enabled = $false
$menu.Items.Add($itemStatus) | Out-Null
$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new()) | Out-Null

$itemQR    = New-Object System.Windows.Forms.ToolStripMenuItem($s.ShowQR)
$itemReset = New-Object System.Windows.Forms.ToolStripMenuItem($s.ResetBind)
$menu.Items.Add($itemQR)    | Out-Null
$menu.Items.Add($itemReset) | Out-Null
$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new()) | Out-Null

$itemSettings    = New-Object System.Windows.Forms.ToolStripMenuItem($s.Settings)
$itemChangePass  = New-Object System.Windows.Forms.ToolStripMenuItem($s.ChangePass)
$itemHide        = New-Object System.Windows.Forms.ToolStripMenuItem($s.HideIcon)
$itemSettings.DropDownItems.Add($itemChangePass) | Out-Null
$itemSettings.DropDownItems.Add($itemHide)       | Out-Null
$menu.Items.Add($itemSettings) | Out-Null
$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new()) | Out-Null

$itemExit = New-Object System.Windows.Forms.ToolStripMenuItem($s.Exit)
$menu.Items.Add($itemExit) | Out-Null

$tray.ContextMenuStrip = $menu

# ---- Helpers ----
function Show-Balloon([string]$Text, [string]$Title = 'PC Remote') {
    $tray.BalloonTipTitle = $Title
    $tray.BalloonTipText  = $Text
    $tray.ShowBalloonTip(3000)
}

function Ask-Password {
    Add-Type -AssemblyName Microsoft.VisualBasic
    # Останавливаем таймер на время диалога — иначе Invoke-RestMethod в Tick
    # блокирует UI-поток и InputBox "подвисает" на 2 сек каждые 5 сек
    $timer.Stop()
    $pass = [Microsoft.VisualBasic.Interaction]::InputBox($s.EnterPass, 'PC Remote', '')
    $timer.Start()
    if (-not $pass) { return $false }
    try {
        $body   = ConvertTo-Json @{ password = $pass }
        $result = Invoke-RestMethod -Uri "$ServerUrl/verify-password" `
                    -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 15
        return [bool]$result.valid
    } catch { return $false }
}

# Читаем localToken из config.json агента (ProgramData в production, cwd в dev)
function Get-LocalToken {
    $paths = @(
        "$env:ProgramData\pc-remote-agent\config.json",
        "$PSScriptRoot\.agent-config.json"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            try {
                $cfg = Get-Content $p -Raw | ConvertFrom-Json
                if ($cfg.localToken) { return $cfg.localToken }
            } catch {}
        }
    }
    return $null
}

$script:localToken = Get-LocalToken

function Invoke-Post([string]$Path) {
    $headers = @{}
    if ($script:localToken) { $headers['X-Local-Token'] = $script:localToken }
    Invoke-RestMethod -Uri "$ServerUrl$Path" -Method POST -Headers $headers -TimeoutSec 3 | Out-Null
}

# ---- Events ----
$itemQR.Add_Click({
    if (Ask-Password) { Start-Process "$ServerUrl/qr" }
    else { Show-Balloon $s.WrongPass }
})

$itemReset.Add_Click({
    Add-Type -AssemblyName Microsoft.VisualBasic
    $pass = [Microsoft.VisualBasic.Interaction]::InputBox($s.EnterPass, 'PC Remote', '')
    if (-not $pass) { return }
    $ans = [System.Windows.Forms.MessageBox]::Show(
        $s.ResetConfirm,
        'PC Remote',
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning)
    if ($ans -eq [System.Windows.Forms.DialogResult]::Yes) {
        try {
            $body = ConvertTo-Json @{ password = $pass }
            $hdrs = @{ 'X-Local-Token' = $script:localToken; 'Content-Type' = 'application/json' }
            Invoke-RestMethod -Uri "$ServerUrl/reset" -Method POST -Body $body -Headers $hdrs -TimeoutSec 3 | Out-Null
            Show-Balloon $s.ResetDone
            Start-Sleep 3
            Start-Process "$ServerUrl/qr"
        } catch { Show-Balloon $s.ResetErr }
    }
})

$itemChangePass.Add_Click({
    if (-not (Ask-Password)) { Show-Balloon $s.WrongPass; return }
    Add-Type -AssemblyName Microsoft.VisualBasic
    $new = [Microsoft.VisualBasic.Interaction]::InputBox($s.NewPass, 'PC Remote', '')
    if (-not $new) { return }
    try {
        $body = ConvertTo-Json @{ password = $new }
        $hdrs = @{ 'X-Local-Token' = $script:localToken; 'Content-Type' = 'application/json' }
        Invoke-RestMethod -Uri "$ServerUrl/change-password" `
            -Method POST -Body $body -Headers $hdrs -TimeoutSec 3 | Out-Null
        Show-Balloon $s.PassChanged
    } catch { Show-Balloon $s.PassChangeErr }
})

$itemHide.Add_Click({
    if (Ask-Password) { $tray.Visible = $false }
    else { Show-Balloon $s.WrongPass }
})

$itemExit.Add_Click({
    if (-not (Ask-Password)) { Show-Balloon $s.WrongPass; return }
    $timer.Stop()
    $tray.Visible = $false
    $tray.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

# ---- Status timer ----
$script:lastOnline = $null

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
    try {
        $st = Invoke-RestMethod -Uri "$ServerUrl/status" -TimeoutSec 2

        # Блокировка экрана — сервис не может вызвать LockWorkStation из session 0,
        # поэтому делегирует трею через pendingLock
        $th = @{ 'X-Local-Token' = $script:localToken }

        if ($st.pendingLock) {
            try { Invoke-RestMethod -Uri "$ServerUrl/ack-lock" -Method POST -Headers $th -TimeoutSec 2 | Out-Null } catch {}
            $msg = if ($st.pendingLockMessage) { $st.pendingLockMessage } else { 'Access restricted' }
            $tray.ShowBalloonTip(4000, 'PC Remote', $msg, [System.Windows.Forms.ToolTipIcon]::Warning)
            Start-Sleep -Seconds 4
            if ($st.pendingLogoff) {
                shutdown /l /f
            } else {
                rundll32.exe user32.dll,LockWorkStation
            }
        }

        # Уведомление об ограничении времени
        if ($st.pendingNotification) {
            try { Invoke-RestMethod -Uri "$ServerUrl/ack-notification" -Method POST -Headers $th -TimeoutSec 2 | Out-Null } catch {}
            $tray.ShowBalloonTip(5000, 'PC Remote', $st.pendingNotification, [System.Windows.Forms.ToolTipIcon]::Warning)
        }

        # Управление громкостью — сервис в session 0 не имеет доступа к аудио сессии пользователя
        if ($st.pendingVolume) {
            try { Invoke-RestMethod -Uri "$ServerUrl/ack-volume" -Method POST -Headers $th -TimeoutSec 2 | Out-Null } catch {}
            switch ($st.pendingVolume) {
                'UP'   { [AudioKeys]::VolumeUp() }
                'DOWN' { [AudioKeys]::VolumeDown() }
                'MUTE' { [AudioKeys]::VolumeMute() }
            }
        }

        # Скриншот — сервис в session 0 не имеет доступа к рабочему столу пользователя
        # ACK отправляем только ПОСЛЕ успешного захвата, чтобы не потерять скриншот при сбое
        if ($st.pendingScreenshot) {
            try {
                $b64 = [ScreenGrab]::Capture(60)
                Invoke-RestMethod -Uri "$ServerUrl/ack-screenshot" -Method POST -Headers $th -TimeoutSec 2 | Out-Null
                $body = ConvertTo-Json @{ image = $b64 } -Compress
                $thJson = @{ 'X-Local-Token' = $script:localToken; 'Content-Type' = 'application/json' }
                Invoke-RestMethod -Uri "$ServerUrl/screenshot-result" -Method POST -Body $body -Headers $thJson -TimeoutSec 15 | Out-Null
            } catch {}
        }

        if ($st.online) {
            if ($script:lastOnline -ne $true) {
                $tray.Icon        = $iconOnline
                $tray.Text        = 'PC Remote Agent - Online'
                $itemStatus.Text  = $s.Online
                $script:lastOnline = $true
            }
        } else {
            if ($script:lastOnline -ne $false) {
                $tray.Icon        = $iconOffline
                $tray.Text        = 'PC Remote Agent - Offline'
                $itemStatus.Text  = $s.Offline
                $script:lastOnline = $false
            }
        }
    } catch {
        if ($null -ne $script:lastOnline) {
            $tray.Icon        = $iconOffline
            $tray.Text        = 'PC Remote Agent'
            $itemStatus.Text  = $s.ServiceUnavail
            $script:lastOnline = $null
        }
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
