# Zeichnet das App-Symbol und erzeugt alle Grafiken für webOS, Samsung Tizen und Android TV.
#   powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
param([string]$Root = (Join-Path $PSScriptRoot ".."))
Add-Type -AssemblyName System.Drawing

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$S = 1024
$bmp = New-Object System.Drawing.Bitmap $S, $S, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.PixelOffsetMode = 'HighQuality'
$g.Clear([System.Drawing.Color]::Transparent)

# --- Hintergrund: abgerundetes Quadrat, Verlauf Blau -> Violett ---
$bgPath = RoundRect 0 0 $S $S 230
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $S, $S), ([System.Drawing.Color]::FromArgb(255, 47, 128, 255)), ([System.Drawing.Color]::FromArgb(255, 124, 58, 237))
$blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
$blend.Colors = @([System.Drawing.Color]::FromArgb(255, 40, 150, 255), [System.Drawing.Color]::FromArgb(255, 79, 92, 246), [System.Drawing.Color]::FromArgb(255, 139, 52, 230))
$blend.Positions = @([float]0, [float]0.5, [float]1)
$bg.InterpolationColors = $blend
$g.FillPath($bg, $bgPath)

# weicher Glanz oben
$g.SetClip($bgPath)
$glossPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glossPath.AddEllipse(-300, -620, 1624, 1080)
$gloss = New-Object System.Drawing.Drawing2D.PathGradientBrush $glossPath
$gloss.CenterColor = [System.Drawing.Color]::FromArgb(70, 255, 255, 255)
$gloss.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
$g.FillPath($gloss, $glossPath)
$g.ResetClip()

# --- Antennen ---
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$pen = New-Object System.Drawing.Pen $white, 44
$pen.StartCap = 'Round'; $pen.EndCap = 'Round'
$g.DrawLine($pen, 512, 300, 392, 168)
$g.DrawLine($pen, 512, 300, 632, 168)
$g.FillEllipse((New-Object System.Drawing.SolidBrush $white), 368, 144, 52, 52)
$g.FillEllipse((New-Object System.Drawing.SolidBrush $white), 604, 144, 52, 52)

# --- Bildschirm (Schatten, dann weiß) ---
$shadow = RoundRect 196 318 640 440 92
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 20, 10, 80))), $shadow)
$screen = RoundRect 192 296 640 440 92
$g.FillPath((New-Object System.Drawing.SolidBrush $white), $screen)

# --- Play-Dreieck mit Verlauf (abgerundet) ---
$tri = New-Object System.Drawing.Drawing2D.GraphicsPath
$tri.AddPolygon(@((New-Object System.Drawing.PointF 452, 404), (New-Object System.Drawing.PointF 452, 628), (New-Object System.Drawing.PointF 642, 516)))
$triBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 440, 400), (New-Object System.Drawing.Point 650, 630), ([System.Drawing.Color]::FromArgb(255, 40, 150, 255)), ([System.Drawing.Color]::FromArgb(255, 139, 52, 230))
$g.FillPath($triBrush, $tri)
$triPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 79, 92, 246)), 34
$triPen.LineJoin = 'Round'
$g.DrawPath($triPen, $tri)

# --- Standfuß ---
$stand = RoundRect 392 790 240 46 23
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 255, 255))), $stand)

$g.Dispose()

function SaveScaled([System.Drawing.Bitmap]$src, [int]$size, [string]$file) {
  $dst = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gg = [System.Drawing.Graphics]::FromImage($dst)
  $gg.InterpolationMode = 'HighQualityBicubic'
  $gg.SmoothingMode = 'AntiAlias'
  $gg.PixelOffsetMode = 'HighQuality'
  $gg.CompositingQuality = 'HighQuality'
  $gg.DrawImage($src, 0, 0, $size, $size)
  $gg.Dispose()
  $dst.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
}
function Out([string]$rel) { $f = Join-Path $Root $rel; New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null; return $f }

# webOS
SaveScaled $bmp 80 (Out 'app/icon.png')
SaveScaled $bmp 130 (Out 'app/largeIcon.png')
# Samsung Tizen
SaveScaled $bmp 512 (Out 'tizen/icon.png')
# Android: Launcher-Symbole
$dens = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
foreach ($d in $dens.Keys) { SaveScaled $bmp $dens[$d] (Out "android/res/mipmap-$d/ic_launcher.png") }

# Android TV: Banner 320x180 (Symbol links, Name rechts) in doppelter Größe gezeichnet, dann verkleinert
$W = 640; $H = 360
$ban = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$b = [System.Drawing.Graphics]::FromImage($ban)
$b.SmoothingMode = 'AntiAlias'; $b.InterpolationMode = 'HighQualityBicubic'; $b.TextRenderingHint = 'AntiAliasGridFit'
$bgb = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $W, $H), ([System.Drawing.Color]::FromArgb(255, 16, 22, 40)), ([System.Drawing.Color]::FromArgb(255, 34, 24, 72))
$b.FillRectangle($bgb, 0, 0, $W, $H)
$b.DrawImage($bmp, 40, 60, 240, 240)
$font = New-Object System.Drawing.Font 'Segoe UI', 64, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$b.DrawString('IPTV', $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)), 300, 104)
$font2 = New-Object System.Drawing.Font 'Segoe UI', 64, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$b.DrawString('Player', $font2, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 150, 175, 255))), 300, 176)
$b.Dispose()
$small = New-Object System.Drawing.Bitmap 320, 180
$s = [System.Drawing.Graphics]::FromImage($small); $s.InterpolationMode = 'HighQualityBicubic'; $s.SmoothingMode = 'AntiAlias'; $s.PixelOffsetMode = 'HighQuality'
$s.DrawImage($ban, 0, 0, 320, 180); $s.Dispose()
$small.Save((Out 'android/res/drawable-xhdpi/banner.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$small.Dispose(); $ban.Dispose(); $bmp.Dispose()
"ok"
