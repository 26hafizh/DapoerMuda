param(
    [string]$ApiBaseUrl = ""
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidUserHome = Join-Path $projectRoot '.android-user'
$gradleUserHome = Join-Path $projectRoot '.gradle-user'
$debugKeystoreLock = Join-Path $androidUserHome 'debug.keystore.lock'
$projectDebugKeystore = Join-Path $projectRoot 'android\\app\\debug.keystore'

Set-Location $projectRoot

New-Item -ItemType Directory -Force -Path $androidUserHome | Out-Null
New-Item -ItemType Directory -Force -Path $gradleUserHome | Out-Null

if (Test-Path $debugKeystoreLock) {
    Remove-Item -LiteralPath $debugKeystoreLock -Force
}

if ($ApiBaseUrl) {
    $env:DAPOERMUDA_API_BASE_URL = $ApiBaseUrl.TrimEnd('/')
}

npm.cmd run cap:sync

Push-Location (Join-Path $projectRoot 'android')
try {
    $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
    $env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
    $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT
    $env:ANDROID_USER_HOME = $androidUserHome
    $env:HOME = $androidUserHome
    $env:GRADLE_USER_HOME = $gradleUserHome

    if (-not (Test-Path $projectDebugKeystore)) {
        $keytool = Join-Path $env:JAVA_HOME 'bin\\keytool.exe'
        & $keytool -genkeypair -v -keystore $projectDebugKeystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000 -noprompt | Out-Null
    }

    .\gradlew.bat assembleDebug
} finally {
    Pop-Location
}
