param(
    [string]$ApiBaseUrl = "",
    [string]$VersionName = "1.0.0",
    [int]$VersionCode = 1
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sharedAndroidUserHome = Join-Path $projectRoot '.android-user'
$sharedGradleUserHome = Join-Path $projectRoot '.gradle-user'
$androidUserHome = Join-Path $projectRoot '.android-user-release'
$gradleUserHome = Join-Path $projectRoot '.gradle-user-release'
$releaseConfigPath = Join-Path $projectRoot '.release-signing.local.json'
$releaseKeystorePath = Join-Path $projectRoot 'android\app\release.keystore'

function New-RandomSecret {
    param([int]$Length = 32)

    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    $builder = New-Object System.Text.StringBuilder
    for ($i = 0; $i -lt $Length; $i++) {
        [void]$builder.Append($chars[(Get-Random -Minimum 0 -Maximum $chars.Length)])
    }
    return $builder.ToString()
}

function Copy-TreeIfMissing {
    param(
        [string]$SourceDir,
        [string]$TargetDir
    )

    if (-not (Test-Path $SourceDir) -or (Test-Path $TargetDir)) {
        return
    }

    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    robocopy $SourceDir $TargetDir /E /NFL /NDL /NJH /NJS /NP | Out-Null

    if ($LASTEXITCODE -ge 8) {
        throw "Gagal menyalin cache build dari $SourceDir ke $TargetDir."
    }
}

Set-Location $projectRoot

New-Item -ItemType Directory -Force -Path $androidUserHome | Out-Null
New-Item -ItemType Directory -Force -Path $gradleUserHome | Out-Null

foreach ($dirName in @('wrapper', 'native', 'caches')) {
    Copy-TreeIfMissing -SourceDir (Join-Path $sharedGradleUserHome $dirName) -TargetDir (Join-Path $gradleUserHome $dirName)
}

if ((Test-Path $sharedAndroidUserHome) -and ((Get-ChildItem $androidUserHome -Force | Measure-Object).Count -eq 0)) {
    robocopy $sharedAndroidUserHome $androidUserHome /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "Gagal menyalin cache Android lokal ke $androidUserHome."
    }
}

if ($ApiBaseUrl) {
    $env:DAPOERMUDA_API_BASE_URL = $ApiBaseUrl.TrimEnd('/')
}

if (-not (Test-Path $releaseConfigPath)) {
    $sharedPassword = New-RandomSecret
    $releaseConfig = [pscustomobject]@{
        keyAlias = 'dapoermudarelease'
        storePassword = $sharedPassword
        keyPassword = $sharedPassword
        dname = 'CN=DapoerMuda POS, O=DapoerMuda, C=ID'
    }
    $releaseConfig | ConvertTo-Json | Set-Content -Path $releaseConfigPath -Encoding UTF8
} else {
    $releaseConfig = Get-Content $releaseConfigPath -Raw | ConvertFrom-Json
}

if (-not $releaseConfig.keyPassword -or $releaseConfig.keyPassword -ne $releaseConfig.storePassword) {
    $releaseConfig.keyPassword = $releaseConfig.storePassword
    $releaseConfig | ConvertTo-Json | Set-Content -Path $releaseConfigPath -Encoding UTF8
}

$env:DAPOERMUDA_RELEASE_STORE_FILE = $releaseKeystorePath
$env:DAPOERMUDA_RELEASE_STORE_PASSWORD = $releaseConfig.storePassword
$env:DAPOERMUDA_RELEASE_KEY_ALIAS = $releaseConfig.keyAlias
$env:DAPOERMUDA_RELEASE_KEY_PASSWORD = $releaseConfig.keyPassword
$env:DAPOERMUDA_FINAL_BUILD = 'true'
$env:DAPOERMUDA_VERSION_NAME = $VersionName
$env:DAPOERMUDA_VERSION_CODE = [string]$VersionCode

npm.cmd run cap:sync

if (-not (Test-Path $releaseKeystorePath)) {
    $keytool = Join-Path 'C:\Program Files\Android\Android Studio\jbr' 'bin\keytool.exe'
    & $keytool -genkeypair -v -keystore $releaseKeystorePath -storepass $releaseConfig.storePassword -alias $releaseConfig.keyAlias -keypass $releaseConfig.keyPassword -dname $releaseConfig.dname -keyalg RSA -keysize 2048 -validity 10000 -noprompt | Out-Null
}

Push-Location (Join-Path $projectRoot 'android')
try {
    $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
    $env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
    $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
    $env:ANDROID_USER_HOME = $androidUserHome
    $env:HOME = $androidUserHome
    $env:GRADLE_USER_HOME = $gradleUserHome
    & .\gradlew.bat --no-daemon assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle final build gagal dengan kode $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$finalOutputDir = Join-Path $projectRoot 'android\app\build\outputs\apk\final'
$debugApkPath = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
$finalApkPath = Join-Path $finalOutputDir 'app-final.apk'

New-Item -ItemType Directory -Force -Path $finalOutputDir | Out-Null
Copy-Item -LiteralPath $debugApkPath -Destination $finalApkPath -Force

Write-Host "Final APK:" $finalApkPath
Write-Host "Signing config:" $releaseConfigPath
Write-Host "Version:" $VersionName "($VersionCode)"
