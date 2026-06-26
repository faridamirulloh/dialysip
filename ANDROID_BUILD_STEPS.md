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

## Windows Release Workaround

On this machine, the direct release build hit Windows native build path issues. The successful workaround was to build from a short temporary path.

Create a temp copy:

```powershell
New-Item -ItemType Directory -Path C:\tmp\daily-sip-release-build
robocopy C:\LocalDocuments\Projects\Ari\daily-sip C:\tmp\daily-sip-release-build /E /XD .git .expo android\build android\app\build android\.gradle android\.kotlin /XF .metro-stderr.log .metro-stdout.log
```

Remove copied native build caches from the temp copy:

```powershell
Remove-Item -LiteralPath C:\tmp\daily-sip-release-build\android\build -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath C:\tmp\daily-sip-release-build\android\.gradle -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath C:\tmp\daily-sip-release-build\android\.kotlin -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath C:\tmp\daily-sip-release-build\android\app\build -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath C:\tmp\daily-sip-release-build\android\app\.cxx -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath C:\tmp\daily-sip-release-build\node_modules\.pnpm\expo-modules-core@2.5.0\node_modules\expo-modules-core\android\.cxx -Recurse -Force -ErrorAction SilentlyContinue
```

Recreate pnpm links in the temp copy:

```powershell
cd C:\tmp\daily-sip-release-build
corepack pnpm install --offline --frozen-lockfile --force
```

If release build fails with:

```text
cannot find symbol
import expo.core.ExpoModulesPackage;
```

add this temp-only shim at:

```text
C:\tmp\daily-sip-release-build\android\app\src\main\java\expo\core\ExpoModulesPackage.java
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

Build from the temp copy:

```powershell
cd C:\tmp\daily-sip-release-build\android
.\gradlew.bat assembleRelease --console=plain
```

Copy the release APK back to the project:

```powershell
Copy-Item -LiteralPath C:\tmp\daily-sip-release-build\android\app\build\outputs\apk\release\app-release.apk -Destination C:\LocalDocuments\Projects\Ari\daily-sip\app-release.apk -Force
```

Final copied output:

```text
C:\LocalDocuments\Projects\Ari\daily-sip\app-release.apk
```
