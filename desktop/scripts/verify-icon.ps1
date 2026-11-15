#requires -Version 5.1
<#
.SYNOPSIS
  Kurulu Enough V2 Panel exe'sinin bizim ikonumuzu taşıdığını doğrular.

.DESCRIPTION
  1) Kurulu exe'yi bulur (veya -ExePath ile verilir).
  2) desktop/build/icon.ico içindeki 16/32/256 girdilerinin baytlarını
     exe'nin içinde arar. Windows, simgeleri PE kaynaklarına bu baytların
     aynısıyla gömer; 256 girdisi PNG olduğu için birebir eşleşme beklenir.
  3) Başlat menüsü / masaüstü / görev çubuğu kısayollarının bu exe'yi
     hedeflediğini gösterir (kısayol kendi ikonunu taşımaz; hedefin ikonunu
     kullanır).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File desktop\scripts\verify-icon.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File desktop\scripts\verify-icon.ps1 `
    -ExePath "$env:LOCALAPPDATA\Programs\Enough V2 Panel\Enough V2 Panel.exe"
#>
[CmdletBinding()]
param(
  [string]$ExePath,
  [string]$IcoPath
)

$ErrorActionPreference = 'Stop'
$script:failed = $false

function Write-Result {
  param([string]$State, [string]$Message)
  Write-Host ("[{0}] {1}" -f $State, $Message)
  if ($State -eq 'FAIL') { $script:failed = $true }
}

function Find-InstalledExe {
  $roots = @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})
  foreach ($root in $roots) {
    if ([string]::IsNullOrWhiteSpace($root)) { continue }
    $base = $root
    if ($root -eq $env:LOCALAPPDATA) { $base = Join-Path $root 'Programs' }
    $candidate = Join-Path $base 'Enough V2 Panel\Enough V2 Panel.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

# ICO dizininden tek bir boyutun ham baytlarını çıkarır.
function Get-IcoEntryBytes {
  param([string]$Path, [int]$Size)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 6) { return $null }
  $count = [BitConverter]::ToUInt16($bytes, 4)
  for ($i = 0; $i -lt $count; $i++) {
    $offset = 6 + ($i * 16)
    if ($offset + 16 -gt $bytes.Length) { break }
    $width = [int]$bytes[$offset]
    if ($width -eq 0) { $width = 256 }
    if ($width -ne $Size) { continue }
    $length = [BitConverter]::ToUInt32($bytes, $offset + 8)
    $position = [BitConverter]::ToUInt32($bytes, $offset + 12)
    if ($position + $length -gt $bytes.Length) { return $null }
    $entry = New-Object byte[] $length
    [Array]::Copy($bytes, [int]$position, $entry, 0, [int]$length)
    return $entry
  }
  return $null
}

function Format-Bytes {
  param([long]$Value)
  if ($Value -ge 1MB) { return ('{0:N1} MB' -f ($Value / 1MB)) }
  if ($Value -ge 1KB) { return ('{0:N1} KB' -f ($Value / 1KB)) }
  return ('{0} B' -f $Value)
}

Write-Host ''
Write-Host 'Enough V2 Panel - ikon doğrulama' -ForegroundColor Cyan
Write-Host '--------------------------------'

# --- exe ve ico yolları -------------------------------------------------
$scriptRoot = $PSScriptRoot
if (-not $IcoPath) {
  $IcoPath = Join-Path (Join-Path (Split-Path -Parent $scriptRoot) 'build') 'icon.ico'
}
if (-not $ExePath) { $ExePath = Find-InstalledExe }

if (-not $ExePath) {
  Write-Result 'FAIL' 'Kurulu exe bulunamadı. -ExePath ile yolu verin.'
  Write-Host '  Örnek: -ExePath "$env:LOCALAPPDATA\Programs\Enough V2 Panel\Enough V2 Panel.exe"'
  exit 1
}
if (-not (Test-Path -LiteralPath $ExePath)) {
  Write-Result 'FAIL' ("exe yok: {0}" -f $ExePath)
  exit 1
}
if (-not (Test-Path -LiteralPath $IcoPath)) {
  Write-Result 'FAIL' ("icon.ico yok: {0}" -f $IcoPath)
  exit 1
}

$exeInfo = Get-Item -LiteralPath $ExePath
Write-Host ("exe   : {0}" -f $exeInfo.FullName)
Write-Host ("boyut : {0}" -f (Format-Bytes $exeInfo.Length))
Write-Host ("ikon  : {0}" -f $IcoPath)
Write-Host ("sürüm : {0}" -f $exeInfo.VersionInfo.ProductVersion)
Write-Host ''

# --- hızlı bayt arama yardımcısı ---------------------------------------
if (-not ('IconByteSearch' -as [type])) {
  $typeDefinition = @'
public static class IconByteSearch {
    public static int IndexOf(byte[] haystack, byte[] needle) {
        if (needle == null || needle.Length == 0) return -1;
        if (haystack == null || haystack.Length < needle.Length) return -1;
        int last = haystack.Length - needle.Length;
        byte first = needle[0];
        for (int i = 0; i <= last; i++) {
            if (haystack[i] != first) continue;
            int j = 1;
            while (j < needle.Length && haystack[i + j] == needle[j]) j++;
            if (j == needle.Length) return i;
        }
        return -1;
    }
}
'@
  Add-Type -TypeDefinition $typeDefinition
}

$exeBytes = [System.IO.File]::ReadAllBytes($ExePath)
$sizes = @(256, 128, 64, 48, 32, 16)
$found = @()
$offset256 = -1

foreach ($size in $sizes) {
  $entry = Get-IcoEntryBytes -Path $IcoPath -Size $size
  if (-not $entry) { continue }
  # 256 için PNG gövdesi, küçükler için BMP gövdesi gömülüdür. Büyük dosyalarda
  # yavaşlamamak için girdinin ortasından 96 baytlık parmak izi alınır.
  $sliceLength = [Math]::Min(96, $entry.Length)
  $sliceStart = [int]([Math]::Floor($entry.Length / 2) - [Math]::Floor($sliceLength / 2))
  if ($sliceStart -lt 0) { $sliceStart = 0 }
  $needle = New-Object byte[] $sliceLength
  [Array]::Copy($entry, $sliceStart, $needle, 0, $sliceLength)

  $at = [IconByteSearch]::IndexOf($exeBytes, $needle)
  if ($at -ge 0) {
    $found += $size
    if ($size -eq 256) { $offset256 = $at }
  }
}

if ($found -contains 256) {
  Write-Result 'PASS' ("256x256 ikon verisi exe kaynaklarında bulundu (offset 0x{0:X})" -f $offset256)
} else {
  Write-Result 'FAIL' '256x256 ikon verisi exe içinde YOK - exe başka/varsayılan ikon taşıyor'
}

$smallSizes = @(128, 64, 48, 32, 16)
$smallFound = @($smallSizes | Where-Object { $found -contains $_ })
if ($smallFound.Count -eq $smallSizes.Count) {
  Write-Result 'PASS' '16-128 arası tüm küçük simgeler de gömülü.'
} elseif ($smallFound.Count -gt 0) {
  Write-Result 'WARN' ('küçük simgeler: {0}/{1} bulundu (kritik değil)' -f $smallFound.Count, $smallSizes.Count)
} else {
  Write-Result 'WARN' 'küçük simgeler doğrulanamadı (kritik değil; Explorer 256px girdisini kullanır)'
}

# --- kısayollar ---------------------------------------------------------
Write-Host ''
Write-Host 'Kısayollar (kısayol kendi ikonunu taşımaz; hedef exe ikonunu kullanır):' -ForegroundColor Cyan

$shortcutRoots = @()
if ($env:APPDATA) {
  $shortcutRoots += (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
  $shortcutRoots += (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
}
if ($env:ProgramData) {
  $shortcutRoots += (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
}
if ($env:USERPROFILE) {
  $shortcutRoots += (Join-Path $env:USERPROFILE 'Desktop')
}

$matched = 0
try {
  $wsh = New-Object -ComObject WScript.Shell
  foreach ($root in $shortcutRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $links = Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -ErrorAction SilentlyContinue
    foreach ($link in $links) {
      try { $sc = $wsh.CreateShortcut($link.FullName) } catch { continue }
      if (-not $sc.TargetPath) { continue }
      if ($sc.TargetPath -ieq $exeInfo.FullName) {
        $matched++
        $iconLocation = $sc.IconLocation
        if ([string]::IsNullOrWhiteSpace($iconLocation)) { $iconLocation = '(boş = hedef exe ikonu)' }
        Write-Result 'PASS' ("kısayol: {0} -> ikon: {1}" -f $link.FullName, $iconLocation)
      }
    }
  }
}
catch {
  Write-Result 'WARN' ("kısayol kontrolü yapılamadı: {0}" -f $_.Exception.Message)
}

if ($matched -eq 0) {
  Write-Result 'WARN' 'Bu exe''yi hedefleyen kısayol bulunamadı. Uygulamayı bir kez açın, görev çubuğuna sabitleyin ve tekrar çalıştırın.'
} else {
  Write-Result 'PASS' ('{0} kısayol bu exe''yi gösteriyor.' -f $matched)
}

Write-Host ''
Write-Host 'Görsel kontrol (elle):' -ForegroundColor Cyan
Write-Host '  1) Başlat menüsünde "Enough V2 Panel" arayın; küçük/orta/geniş kutucuk ikonlarına bakın.'
Write-Host '  2) Uygulamayı açın, görev çubuğundaki simgeye bakın; sağ tık > "Görev çubuğuna sabitle".'
Write-Host '  3) Masaüstü kısayolu > sağ tık > Özellikler > "Simge Değiştir" ile gömülü simgeleri görün.'
Write-Host '  4) Simge eski görünüyorsa önbelleği yenileyin: ie4uinit.exe -show, ardından Explorer''ı yeniden başlatın.'
Write-Host ''

if ($script:failed) {
  Write-Host 'SONUÇ: FAIL - exe bizim ikonumuzu taşımıyor veya ikon dosyası eksik.' -ForegroundColor Red
  exit 1
}
Write-Host 'SONUÇ: PASS - exe bizim ikonumuzu taşıyor.' -ForegroundColor Green
exit 0
