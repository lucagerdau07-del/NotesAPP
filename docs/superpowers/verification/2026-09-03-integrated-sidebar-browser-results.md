# Integrated sidebar browser verification

Verified on 2026-09-03 in the isolated `codex/integrated-sidebar-browser` worktree.

## Automated checks

- `npm test`: 47 files, 354 tests passed.
- `npm run build`: Vite production build completed. The existing large-chunk advisory remains.
- `npx cap sync android`: completed and retained the local plugin sources.
- `gradlew testDebugUnitTest assembleDebug`: completed successfully with Android Studio's bundled JDK and the configured Android SDK.
- `gradlew assembleDebugAndroidTest`: the app instrumentation APK compiled, but the aggregate task later failed in the generated `capacitor-cordova-android-plugins` project because Kotlin 1.8.22 and legacy `kotlin-stdlib-jdk7/jdk8` 1.6.21 are both present. This dependency conflict is outside the new Java plugin.

## Browser acceptance

- Checked at 1024×768 and at the 2000×1200 reference viewport.
- The shared left rail switches between Agent and Browser without unmounting either panel.
- The Browser rail scales to 42% of wide editor viewports (maximum 800 px) and occupies the available width on narrow screens.
- Free text was entered in the address bar and resolved to `https://www.google.com/search?q=...`.
- The external-browser button remained enabled on a loaded URL.
- On the desktop web fallback, Google refuses iframe embedding as expected. Android uses the native WebView and is not subject to that iframe restriction.

## Device-only follow-up

No running Android device or emulator was available in this session. Login persistence, hardware-back behavior, third-party cookies, and rotation should receive a short smoke test on the target tablet before release.
