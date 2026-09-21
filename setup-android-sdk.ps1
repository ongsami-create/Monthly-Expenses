# setup-android-sdk.ps1 - Install Android SDK to D:\Android\Sdk
# Run in PowerShell (no admin needed):
#   & 'C:\Users\sami_\.minimax-agent-cn\projects\33\monthly-expenses\setup-android-sdk.ps1'

$ErrorActionPreference = 'Stop'

$SdkRoot = 'D:\Android\Sdk'
$ZipPath = "$SdkRoot\cmdline-tools.zip"
$JdkPath = 'C:\Program Files\Android\Android Studio\jbr'

Write-Host "[1/4] Extract cmdline-tools to $SdkRoot\cmdline-tools\latest ..." -ForegroundColor Cyan
$tmpDir = "$SdkRoot\tmp_extract"
if (Test-Path $tmpDir) { Remove-Item -Path $tmpDir -Recurse -Force }
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
Expand-Archive -Path $ZipPath -DestinationPath $tmpDir -Force
if (Test-Path "$SdkRoot\cmdline-tools") { Remove-Item -Path "$SdkRoot\cmdline-tools" -Recurse -Force }
Move-Item -Path "$tmpDir\cmdline-tools" -Destination "$SdkRoot\cmdline-tools\latest"
Remove-Item -Path $tmpDir -Recurse -Force
Remove-Item -Path $ZipPath -Force
Write-Host "    OK: $SdkRoot\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Host ""
Write-Host "[2/4] Set ANDROID_SDK_ROOT + ANDROID_HOME + JAVA_HOME (User scope) ..." -ForegroundColor Cyan
[System.Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $SdkRoot, "User")
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", $SdkRoot, "User")
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", $JdkPath, "User")
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:ANDROID_HOME = $SdkRoot
$env:JAVA_HOME = $JdkPath
$env:PATH = "$JdkPath\bin;$SdkRoot\cmdline-tools\latest\bin;$env:PATH"
Write-Host "    ANDROID_SDK_ROOT = $SdkRoot"
Write-Host "    ANDROID_HOME    = $SdkRoot"
Write-Host "    JAVA_HOME       = $JdkPath"

Write-Host ""
Write-Host "[3/4] Accept all SDK licenses ..." -ForegroundColor Cyan
$sdkMgr = "$SdkRoot\cmdline-tools\latest\bin\sdkmanager.bat"
'y' | & $sdkMgr --licenses 2>&1 | Out-Null
Write-Host "    licenses OK"

Write-Host ""
Write-Host "[4/4] Download SDK components (platform-tools + platforms;android-34 + build-tools;34.0.0) ..." -ForegroundColor Cyan
Write-Host "    This will download ~1-2 GB, takes 5-15 minutes." -ForegroundColor Yellow
Write-Host "    If dl.google.com is slow, this may take longer. Be patient." -ForegroundColor Yellow
& $sdkMgr "platform-tools" "platforms;android-34" "build-tools;34.0.0" 2>&1 | Select-Object -Last 10

Write-Host ""
Write-Host "=== Verify ===" -ForegroundColor Green
Write-Host "java -version:"
& "$JdkPath\bin\java.exe" -version 2>&1
Write-Host ""
Write-Host "sdkmanager --list_installed:"
& $sdkMgr --list_installed 2>&1 | Select-Object -First 10

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "SDK path: $SdkRoot"
Write-Host "Next: launch Android Studio - it will pick up ANDROID_SDK_ROOT env var automatically."