# Android APK Build Steps

This project is an Expo / React Native app with an existing Android native project in `android/`.

## Prerequisites

- Java installed and available on `PATH`.
- Android SDK installed.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` set.
- Project dependencies installed with `pnpm install`.

Optional checks:

```powershell
java -version
adb version
```

## Debug APK

Use this for local install and testing.

```powershell
cd C:\LocalDocuments\Projects\Ari\daily-sip\android
.\gradlew.bat assembleDebug
```

Expected output:

```text
C:\LocalDocuments\Projects\Ari\daily-sip\android\app\build\outputs\apk\debug\app-debug.apk
```

Install on a connected device:

```powershell
adb install -r C:\LocalDocuments\Projects\Ari\daily-sip\android\app\build\outputs\apk\debug\app-debug.apk
```

## Release APK

Current release config signs the APK with the debug keystore:

```gradle
release {
    signingConfig signingConfigs.debug
}
```

That creates a release build variant, but it is not production-signed with a private release keystore.

Basic command:

```powershell
cd C:\LocalDocuments\Projects\Ari\daily-sip\android
.\gradlew.bat assembleRelease --console=plain
```

Expected output:

```text
C:\LocalDocuments\Projects\Ari\daily-sip\android\app\build\outputs\apk\release\app-release.apk
```

## Automated Windows Release Build

Use the included script to run the Windows workaround end to end. From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-release.ps1
```

The script creates a fresh short path under `C:\tmp`, copies the project, removes temporary native caches, relinks locked dependencies offline, and runs `assembleRelease`. If it encounters the known `ExpoModulesPackage` autolinking failure, it adds the shim only in the temporary copy and retries. On success, it overwrites:

```text
C:\LocalDocuments\Projects\Ari\daily-sip\app-release.apk
```

The temporary workspace is retained under `C:\tmp\ds...` for build logs and troubleshooting. The project source is not modified.

## Windows Release Workaround

On this machine, the direct release build can hit Windows native build path issues. Build from a fresh, short temporary path instead. This is the recommended release workflow.

Create a fresh temporary copy. The `ds` directory name stays short for native toolchain path limits; Robocopy exit codes below `8` are successful:

```powershell
$source = 'C:\LocalDocuments\Projects\Ari\daily-sip'
$root = (Resolve-Path -LiteralPath 'C:\tmp').Path
$buildDir = Join-Path $root ('ds' + (Get-Date -Format 'HHmmss'))
New-Item -ItemType Directory -Path $buildDir | Out-Null

robocopy $source $buildDir /E /XD .git .expo android\build android\app\build android\.gradle android\.kotlin /XF .metro-stderr.log .metro-stdout.log
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed with exit code $LASTEXITCODE" }
```

Remove copied native build caches and recreate pnpm links in the temp copy:

```powershell
Remove-Item -LiteralPath "$buildDir\android\build" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$buildDir\android\.gradle" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$buildDir\android\.kotlin" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$buildDir\android\app\build" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$buildDir\android\app\.cxx" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$buildDir\node_modules\.pnpm\expo-modules-core@2.5.0\node_modules\expo-modules-core\android\.cxx" -Recurse -Force -ErrorAction SilentlyContinue

Set-Location $buildDir
corepack pnpm install --offline --frozen-lockfile --force
```

Build from the temp copy:

```powershell
Set-Location "$buildDir\android"
.\gradlew.bat assembleRelease --console=plain
```

If release build fails with:

```text
cannot find symbol
import expo.core.ExpoModulesPackage;
```

add this temp-only shim at:

```text
$buildDir\android\app\src\main\java\expo\core\ExpoModulesPackage.java
```

```java
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
```

Create its parent directory before adding the shim:

```powershell
New-Item -ItemType Directory -Path "$buildDir\android\app\src\main\java\expo\core" -Force | Out-Null
```

Then rerun the same release command:

```powershell
Set-Location "$buildDir\android"
.\gradlew.bat assembleRelease --console=plain
```

Copy the release APK back to the project:

```powershell
Copy-Item -LiteralPath "$buildDir\android\app\build\outputs\apk\release\app-release.apk" -Destination C:\LocalDocuments\Projects\Ari\daily-sip\app-release.apk -Force
```

Final copied output:

```text
C:\LocalDocuments\Projects\Ari\daily-sip\app-release.apk
```
