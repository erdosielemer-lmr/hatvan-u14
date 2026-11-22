# FC Hatvan Leány U14 – Android APK építése (Gradle nélkül, a telepített Android SDK-val)
# Futtatás:  powershell -ExecutionPolicy Bypass -File build-apk.ps1
# Előtte érdemes frissíteni az adatokat:  node scrape.mjs
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$sdk   = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$bt    = Get-ChildItem "$sdk\build-tools" -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName
$plat  = Get-ChildItem "$sdk\platforms" -Directory | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
$jar   = "$plat\android.jar"
$jdk   = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { (Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-17*' | Select-Object -First 1).FullName }
$env:JAVA_HOME = $jdk
$and   = "$root\android"
$out   = "$and\build"

Write-Host "build-tools: $bt`nplatform:    $plat`nJDK:         $jdk"

# 1) webapp összefűzése
Push-Location $root; node build.mjs; $rc = $LASTEXITCODE; Pop-Location
if ($rc) { throw 'node build.mjs hiba' }
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force "$out\assets", "$out\res\mipmap-xxxhdpi", "$out\classes", "$out\dex" | Out-Null
Copy-Item "$root\dist\standalone.html" "$out\assets\index.html"   # képek beágyazva, nincs almappa

# 2) ikon: Hatvan címer fehér alapon, 192x192 PNG
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("$root\img\logos\hatvan.jpg")
$bmp = New-Object System.Drawing.Bitmap 192, 192
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::White)
$scale = [Math]::Min(160 / $src.Width, 160 / $src.Height)
$w = [int]($src.Width * $scale); $h = [int]($src.Height * $scale)
$g.DrawImage($src, [int]((192 - $w) / 2), [int]((192 - $h) / 2), $w, $h)
$bmp.Save("$out\res\mipmap-xxxhdpi\ic_launcher.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()

# 3) erőforrások + manifest
& "$bt\aapt2.exe" compile --dir "$out\res" -o "$out\res.zip"
if ($LASTEXITCODE) { throw 'aapt2 compile hiba' }
$ver = [int](Get-Date -Format 'yyMMddHH')
& "$bt\aapt2.exe" link -o "$out\unsigned.apk" -I $jar --manifest "$and\AndroidManifest.xml" -A "$out\assets" "$out\res.zip" `
  --version-code $ver --version-name (Get-Date -Format 'yyyy.MM.dd')
if ($LASTEXITCODE) { throw 'aapt2 link hiba' }

# 4) Java → dex
$srcs = Get-ChildItem "$and\src" -Recurse -Filter *.java | ForEach-Object FullName
& "$jdk\bin\javac.exe" -source 8 -target 8 -nowarn -Xlint:-options -bootclasspath $jar -d "$out\classes" $srcs
if ($LASTEXITCODE) { throw 'javac hiba' }
$classes = Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName
& "$bt\d8.bat" --lib $jar --min-api 24 --release --output "$out\dex" $classes
if ($LASTEXITCODE) { throw 'd8 hiba' }
Push-Location "$out\dex"; & "$bt\aapt.exe" add "$out\unsigned.apk" classes.dex | Out-Null; Pop-Location
if ($LASTEXITCODE) { throw 'aapt add hiba' }

# 5) igazítás + aláírás (saját kulcs, hogy a frissítések telepíthetők legyenek a régi fölé)
& "$bt\zipalign.exe" -f -p 4 "$out\unsigned.apk" "$out\aligned.apk"
$ks = "$and\hatvan-release.keystore"
if (-not (Test-Path $ks)) {
  & "$jdk\bin\keytool.exe" -genkeypair -keystore $ks -storepass hatvan-u14 -keypass hatvan-u14 -alias hatvan `
    -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Hatvan U14 App' | Out-Null
}
$apk = "$root\Hatvan-U14.apk"
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:hatvan-u14 --key-pass pass:hatvan-u14 --ks-key-alias hatvan --out $apk "$out\aligned.apk"
if ($LASTEXITCODE) { throw 'apksigner hiba' }
& "$bt\apksigner.bat" verify $apk
if ($LASTEXITCODE) { throw 'APK ellenőrzés hiba' }
Write-Host "`nKész: $apk  ($([math]::Round((Get-Item $apk).Length/1KB)) KB, versionCode $ver)"
