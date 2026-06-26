[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$gradleWrapper = Join-Path $projectRoot 'android\gradlew.bat'

if (-not (Test-Path -LiteralPath $gradleWrapper)) {
  throw "Android Gradle wrapper was not found: $gradleWrapper"
}

$tempRoot = 'C:\tmp'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path

$buildName = 'ds' + (Get-Date -Format 'HHmmss')
$buildDir = Join-Path $tempRoot $buildName
$suffix = 0
while (Test-Path -LiteralPath $buildDir) {
  $suffix += 1
  $buildDir = Join-Path $tempRoot ($buildName + $suffix)
}

New-Item -ItemType Directory -Path $buildDir | Out-Null

function Remove-TemporaryCache {
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $target = Join-Path $buildDir $RelativePath
  if (-not $target.StartsWith($buildDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside the temporary build directory: $target"
  }

  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}

function Invoke-GradleReleaseBuild {
  param(
    [Parameter(Mandatory = $true)][string]$AndroidDirectory,
    [Parameter(Mandatory = $true)][string]$LogPath
  )

  Push-Location $AndroidDirectory
  try {
    # Merge Gradle's stderr in cmd.exe so warnings do not become PowerShell errors.
    & cmd.exe /d /c '.\gradlew.bat assembleRelease --console=plain 2>&1' |
      Tee-Object -FilePath $LogPath |
      Out-Host
    return $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}

try {
  Write-Host "Creating temporary release workspace: $buildDir"

  & robocopy $projectRoot $buildDir /E /XD .git .expo android\build android\app\build android\.gradle android\.kotlin /XF .metro-stderr.log .metro-stdout.log
  $robocopyExitCode = $LASTEXITCODE
  if ($robocopyExitCode -ge 8) {
    throw "Robocopy failed with exit code $robocopyExitCode."
  }

  @(
    'android\build',
    'android\.gradle',
    'android\.kotlin',
    'android\app\build',
    'android\app\.cxx',
    'node_modules\.pnpm\expo-modules-core@2.5.0\node_modules\expo-modules-core\android\.cxx'
  ) | ForEach-Object { Remove-TemporaryCache $_ }

  Push-Location $buildDir
  try {
    & corepack pnpm install --offline --frozen-lockfile --force
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm install failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }

  $androidDir = Join-Path $buildDir 'android'
  $firstLog = Join-Path $buildDir 'assemble-release-first.log'
  $exitCode = Invoke-GradleReleaseBuild -AndroidDirectory $androidDir -LogPath $firstLog

  if ($exitCode -ne 0) {
    $firstBuildLog = Get-Content -LiteralPath $firstLog -Raw
    $knownAutolinkingFailure =
      $firstBuildLog.Contains('import expo.core.ExpoModulesPackage;') -and
      $firstBuildLog.Contains('cannot find symbol')

    if (-not $knownAutolinkingFailure) {
      throw "assembleRelease failed with exit code $exitCode. See $firstLog"
    }

    $shimDirectory = Join-Path $androidDir 'app\src\main\java\expo\core'
    $shimPath = Join-Path $shimDirectory 'ExpoModulesPackage.java'
    New-Item -ItemType Directory -Path $shimDirectory -Force | Out-Null

    @'
package expo.core;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.List;

public class ExpoModulesPackage implements ReactPackage {
  private final expo.modules.ExpoModulesPackage delegate = new expo.modules.ExpoModulesPackage();

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    return delegate.createNativeModules(reactContext);
  }

  @Override
  @SuppressWarnings({"rawtypes", "unchecked"})
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return (List) delegate.createViewManagers(reactContext);
  }
}
'@ | Set-Content -LiteralPath $shimPath -Encoding ascii

    Write-Host 'Retrying release build with the temporary Expo compatibility shim.'
    $retryLog = Join-Path $buildDir 'assemble-release-retry.log'
    $exitCode = Invoke-GradleReleaseBuild -AndroidDirectory $androidDir -LogPath $retryLog
    if ($exitCode -ne 0) {
      throw "assembleRelease retry failed with exit code $exitCode. See $retryLog"
    }
  }

  $sourceApk = Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path -LiteralPath $sourceApk)) {
    throw "Release APK was not created: $sourceApk"
  }

  $destinationApk = Join-Path $projectRoot 'app-release.apk'
  Copy-Item -LiteralPath $sourceApk -Destination $destinationApk -Force
  $apk = Get-Item -LiteralPath $destinationApk

  Write-Host "Release APK: $($apk.FullName)"
  Write-Host "Size: $($apk.Length) bytes"
  Write-Host "Temporary build directory retained: $buildDir"
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  Write-Host "Temporary build directory retained for diagnostics: $buildDir"
  exit 1
}
