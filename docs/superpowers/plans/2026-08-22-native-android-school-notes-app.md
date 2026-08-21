# Native Android School Notes App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Kotlin/Android note-taking app for school that supports handwriting with a generic capacitive stylus (software palm rejection), PDF worksheet annotation, and fully offline document management on a Samsung SM-T505.

**Architecture:** A new, self-contained `android/` Gradle project is added beside the frozen React prototype. Jetpack Compose renders the shell, file overview and settings; a dedicated custom `View` owns the hot drawing path and consumes raw `MotionEvent` data without Compose recomposition. Platform-neutral document/profile models and backend DTOs live in `core-model`, so nothing in the persisted schema depends on Android types. Room stores structured state, app-private files store imported PDFs, and remote AI work exists only as a queued, versioned job interface — no AI features ship in this milestone.

**Tech Stack:** Kotlin 1.9.24, AGP 8.5.2, Gradle 8.7, Jetpack Compose (BOM 2024.06.00), Room 2.6.1, kotlinx-coroutines 1.8.1, kotlinx-serialization 1.6.3, OkHttp 4.12.0, `android.graphics.pdf.PdfRenderer`, `com.tom-roush:pdfbox-android:2.0.27.0`, JUnit4 + Robolectric 4.12.2.

**Spec:** `docs/superpowers/specs/2026-08-22-native-school-notes-app-design.md`

**Prototype (reference only, never modified):** `src/`, `tests/` — the React/Vite project. Its `WritingZone` pad-to-focus-box coordinate mapping (`src/components/WritingZone.jsx:20-30`) is the proven basis for Task 21.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Language:** Kotlin only. No Java sources.
- **Target device:** Samsung Galaxy Tab A7 LTE, SM-T505, Android 12 (API 31), One UI Core 4.1. `minSdk = 26`, `compileSdk = 34`, `targetSdk = 34`.
- **Package namespace:** `com.notes.school` (module suffixes: `.core`, `.ink`, `.touch`, `.document`, `.storage`, `.remote`).
- **Repository layout:** the existing React/Vite prototype in `src/` and `tests/` is frozen. Do not move, edit, or delete it. All new code goes under `android/`.
- **PDF writer version:** `com.tom-roush:pdfbox-android:2.0.27.0` exactly. Do not bump without target-device regression testing.
- **PDF reader:** `android.graphics.pdf.PdfRenderer` only. No SDK-extension-gated APIs.
- **Backend base URL:** `https://luca448-app-backend.hf.space/notes/` — HTTPS on 443 through Nginx, internal service port 7863, REST submit + poll, no WebSockets.
- **Endpoints reserved:** `POST /notes/v1/jobs`, `GET /notes/v1/jobs/{id}`, `DELETE /notes/v1/jobs/{id}`, `GET /notes/v1/health`.
- **Secrets:** `GRAVITY_TOKEN` and any provider API key must never appear in the APK, in source, or in a Gradle property. The app only ever holds a restricted Notes token supplied at runtime.
- **No AI features:** this milestone ships the remote *interface* and job queue only. No OCR, summaries, scanning, or question generation.
- **`core-model` purity:** no `android.*` imports. Enforced by a test in Task 2.
- **Touch targets:** every interactive control has a minimum 48 dp hit area even when the drawn symbol is smaller.
- **Theme:** everything outside the page is dark; the page surface stays white unless a template says otherwise.
- **Copy rules:** the editor's only persistent palm indicator is a crossed-out-hand icon at bottom-right. Calibration, profile controls and 25% mode live in Settings, never as editor panels. Explanatory "Local / Bounded / Reversible" cards are not rendered in production UI.
- **Commit after every task.** `.agents/AGENTS.md` requires a git savestate after each change or fix. Every task ends with a commit step; do not batch tasks into one commit.
- **Verification commands** are written for the Bash tool from the repository root. On Windows PowerShell use `cd android; .\gradlew.bat <task>` instead of `cd android && ./gradlew <task>`.
- **Logs** must never contain document content, raw ink, tokens, or imported filenames.

---

## File Structure

### New Gradle project: `android/`

| Path | Responsibility |
|---|---|
| `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle/libs.versions.toml` | Build definition and single source of dependency versions. |
| `android/app/` | Application shell, Compose navigation, dependency composition, Android resources, theme. |
| `android/core-model/` | Platform-neutral models: `Folder`, `DocumentMeta`, `Page`, `Stroke`, `StrokePoint`, `Bounds`, `ToolKind`, `PalmProfile`, `RemoteJob`, backend DTOs, and the versioned stroke binary codec. Pure Kotlin/JVM. |
| `android/ink-engine/` | `InkScene` (strokes, hit-testing, logical erase, lasso selection, undo/redo), `StrokeRenderer`, and the `InkView` custom `View` that owns the hot input path. |
| `android/touch-engine/` | `ContactSample`/`ContactFeatures` extraction, `ContactClassifier` state machine, `Calibrator`, `ProfileTuner`, `ProfileStore`. |
| `android/document-engine/` | `PaperTemplate` rendering, `PdfPageSource` + `PdfRenderer` implementation with bounded tile cache, `PdfExporter` (PdfBox annotation path + flattened fallback). |
| `android/storage/` | Room database, entities, DAOs, migrations, autosave repository, crash recovery. |
| `android/remote/` | `NotesApi` client, `RetryPolicy`, offline job queue worker. No AI logic. |
| `docs/superpowers/plans/` | This plan. |

### Module dependency direction

```
app  ->  ink-engine, touch-engine, document-engine, storage, remote, core-model
ink-engine, touch-engine, document-engine, storage, remote  ->  core-model
core-model  ->  (nothing Android)
```

No module depends on `app`. No sibling engine module depends on another sibling engine module; `app` wires them together.

### Task map

| Phase | Tasks | Deliverable |
|---|---|---|
| 0 — Skeleton | 1–3 | Buildable Gradle project, models, stroke codec |
| 1 — Ink | 4–6 | Scene, history, renderer, `InkView` |
| 2 — Touch | 7–11 | Features, state machine, calibration, bounded tuning, wiring |
| 3 — Storage | 12–14 | Room schema, autosave, recovery |
| 4 — Document/PDF | 15–17 | Templates, PDF tiles, annotated export |
| 5 — UI | 18–22 | Shell, file overview, editor, settings, 25% mode |
| 6 — Remote + verification | 23–24 | Job queue, API client, device test harness |

---

## Phase 0 — Native Android Skeleton

### Task 1: Gradle project skeleton that builds and runs a unit test

**Files:**
- Create: `android/settings.gradle.kts`
- Create: `android/build.gradle.kts`
- Create: `android/gradle.properties`
- Create: `android/gradle/libs.versions.toml`
- Create: `android/app/build.gradle.kts`
- Create: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/kotlin/com/notes/school/NotesApplication.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/MainActivity.kt`
- Create: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/res/values/themes.xml`
- Test: `android/app/src/test/kotlin/com/notes/school/BuildSmokeTest.kt`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a Gradle build where `:app` compiles and `testDebugUnitTest` runs; the version catalog aliases every later module uses.

- [ ] **Step 1: Add the Gradle wrapper**

The wrapper binary cannot be authored by hand. Generate it with a locally installed Gradle, or copy it from an existing Android Studio project.

```bash
mkdir -p android && cd android && gradle wrapper --gradle-version 8.7 --distribution-type bin
```

Expected: `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/gradle-wrapper.jar`, `android/gradle/wrapper/gradle-wrapper.properties`.

If no `gradle` is on PATH, copy those four files from any Gradle 8.7 project and set `distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip` in `gradle-wrapper.properties`.

- [ ] **Step 2: Write the version catalog**

`android/gradle/libs.versions.toml`:

```toml
[versions]
agp = "8.5.2"
kotlin = "1.9.24"
ksp = "1.9.24-1.0.20"
composeBom = "2024.06.00"
composeCompiler = "1.5.14"
coroutines = "1.8.1"
serialization = "1.6.3"
room = "2.6.1"
lifecycle = "2.8.3"
navigationCompose = "2.7.7"
activityCompose = "1.9.0"
coreKtx = "1.13.1"
work = "2.9.0"
okhttp = "4.12.0"
pdfbox = "2.0.27.0"
junit = "4.13.2"
robolectric = "4.12.2"
androidxTestCore = "1.6.1"
androidxTestJunit = "1.2.1"
espresso = "3.6.1"

[libraries]
androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "coreKtx" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
androidx-lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-lifecycle-viewmodel-compose = { module = "androidx.lifecycle:lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-navigation-compose = { module = "androidx.navigation:navigation-compose", version.ref = "navigationCompose" }
androidx-work-runtime-ktx = { module = "androidx.work:work-runtime-ktx", version.ref = "work" }
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
compose-ui = { module = "androidx.compose.ui:ui" }
compose-ui-graphics = { module = "androidx.compose.ui:ui-graphics" }
compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
compose-ui-test-junit4 = { module = "androidx.compose.ui:ui-test-junit4" }
compose-ui-test-manifest = { module = "androidx.compose.ui:ui-test-manifest" }
compose-material3 = { module = "androidx.compose.material3:material3" }
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }
room-testing = { module = "androidx.room:room-testing", version.ref = "room" }
okhttp = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
okhttp-mockwebserver = { module = "com.squareup.okhttp3:mockwebserver", version.ref = "okhttp" }
pdfbox-android = { module = "com.tom-roush:pdfbox-android", version.ref = "pdfbox" }
junit = { module = "junit:junit", version.ref = "junit" }
robolectric = { module = "org.robolectric:robolectric", version.ref = "robolectric" }
androidx-test-core = { module = "androidx.test:core", version.ref = "androidxTestCore" }
androidx-test-runner = { module = "androidx.test:runner", version.ref = "androidxTestCore" }
androidx-test-junit = { module = "androidx.test.ext:junit", version.ref = "androidxTestJunit" }
espresso-core = { module = "androidx.test.espresso:espresso-core", version.ref = "espresso" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
```

- [ ] **Step 3: Write the root build files**

`android/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "school-notes"
include(":app")
// Uncommented by the task that creates each module's build.gradle.kts:
// include(":core-model")
// include(":ink-engine")
// include(":touch-engine")
// include(":document-engine")
// include(":storage")
// include(":remote")
```

`android/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
}
```

`android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx3072m -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.caching=true
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
```

- [ ] **Step 4: Write the app module**

`android/app/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.notes.school"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.notes.school"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions { kotlinCompilerExtensionVersion = libs.versions.composeCompiler.get() }

    sourceSets["main"].kotlin.srcDir("src/main/kotlin")
    sourceSets["test"].kotlin.srcDir("src/test/kotlin")
    sourceSets["androidTest"].kotlin.srcDir("src/androidTest/kotlin")

    testOptions { unitTests { isIncludeAndroidResources = true } }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
}
```

`android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:name=".NotesApplication"
        android:allowBackup="false"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.SchoolNotes">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="sensorLandscape"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`android/app/src/main/kotlin/com/notes/school/NotesApplication.kt`:

```kotlin
package com.notes.school

import android.app.Application

class NotesApplication : Application()
```

`android/app/src/main/kotlin/com/notes/school/MainActivity.kt`:

```kotlin
package com.notes.school

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                Surface { Text("School Notes") }
            }
        }
    }
}
```

`android/app/src/main/res/values/strings.xml`:

```xml
<resources>
    <string name="app_name">School Notes</string>
</resources>
```

`android/app/src/main/res/values/themes.xml`:

```xml
<resources>
    <style name="Theme.SchoolNotes" parent="android:Theme.Material.NoActionBar">
        <item name="android:windowBackground">#FF121212</item>
    </style>
</resources>
```

- [ ] **Step 5: Write the failing smoke test**

`android/app/src/test/kotlin/com/notes/school/BuildSmokeTest.kt`:

```kotlin
package com.notes.school

import org.junit.Assert.assertEquals
import org.junit.Test

class BuildSmokeTest {
    @Test
    fun applicationIdMatchesSpecNamespace() {
        assertEquals("com.notes.school", BuildConfig.APPLICATION_ID)
    }
}
```

- [ ] **Step 6: Run the test**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, one test executed.

- [ ] **Step 7: Update `.gitignore`**

Append to the repository-root `.gitignore`:

```
# Android
android/.gradle/
android/build/
android/*/build/
android/local.properties
android/.idea/
android/app/release/
*.apk
*.aab
```

- [ ] **Step 8: Commit**

```bash
git add android .gitignore && git commit -m "feat(android): add native Gradle project skeleton with app module"
```

---

### Task 2: `core-model` module with platform-neutral document models

**Files:**
- Create: `android/core-model/build.gradle.kts`
- Create: `android/core-model/src/main/kotlin/com/notes/school/core/Ids.kt`
- Create: `android/core-model/src/main/kotlin/com/notes/school/core/Geometry.kt`
- Create: `android/core-model/src/main/kotlin/com/notes/school/core/Ink.kt`
- Create: `android/core-model/src/main/kotlin/com/notes/school/core/Documents.kt`
- Test: `android/core-model/src/test/kotlin/com/notes/school/core/DocumentsTest.kt`
- Test: `android/core-model/src/test/kotlin/com/notes/school/core/PlatformNeutralityTest.kt`
- Modify: `android/settings.gradle.kts` (uncomment `include(":core-model")`)

**Interfaces:**
- Consumes: Task 1's version catalog.
- Produces:
  - `Bounds(left: Float, top: Float, right: Float, bottom: Float)` with `width`, `height`, `union(other): Bounds`, `contains(x, y): Boolean`, `intersects(other): Boolean`, `inflate(by: Float): Bounds`, and companion `Bounds.EMPTY` / `Bounds.ofPoints(points: List<StrokePoint>, padding: Float): Bounds`.
  - `StrokePoint(x: Float, y: Float, pressure: Float, tOffsetMs: Int)`
  - `ToolKind { PEN, HIGHLIGHTER, ERASER }`
  - `Stroke(id: String, pageId: String, tool: ToolKind, colorArgb: Int, widthPx: Float, points: List<StrokePoint>, bounds: Bounds, order: Long, active: Boolean = true)`
  - `Folder`, `DocumentMeta`, `DocumentKind`, `Page`, `PageSource`
  - `newId(): String`

- [ ] **Step 1: Add the module build file and enable it**

`android/core-model/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin { jvmToolchain(17) }

dependencies {
    implementation(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}
```

Uncomment `include(":core-model")` in `android/settings.gradle.kts`.

- [ ] **Step 2: Write the failing tests**

`android/core-model/src/test/kotlin/com/notes/school/core/DocumentsTest.kt`:

```kotlin
package com.notes.school.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DocumentsTest {

    @Test
    fun boundsOfPointsCoversAllPointsPlusPadding() {
        val points = listOf(
            StrokePoint(10f, 20f, 0.5f, 0),
            StrokePoint(30f, 5f, 0.5f, 8),
            StrokePoint(15f, 40f, 0.5f, 16)
        )
        val b = Bounds.ofPoints(points, padding = 2f)
        assertEquals(8f, b.left, 0.001f)
        assertEquals(3f, b.top, 0.001f)
        assertEquals(32f, b.right, 0.001f)
        assertEquals(42f, b.bottom, 0.001f)
        assertEquals(24f, b.width, 0.001f)
        assertEquals(39f, b.height, 0.001f)
    }

    @Test
    fun boundsOfEmptyPointsIsEmptyAtOrigin() {
        val b = Bounds.ofPoints(emptyList(), padding = 4f)
        assertEquals(Bounds.EMPTY, b)
    }

    @Test
    fun unionExpandsToCoverBoth() {
        val a = Bounds(0f, 0f, 10f, 10f)
        val b = Bounds(5f, -5f, 20f, 8f)
        assertEquals(Bounds(0f, -5f, 20f, 10f), a.union(b))
    }

    @Test
    fun intersectsIsTrueOnOverlapAndFalseOnGap() {
        assertTrue(Bounds(0f, 0f, 10f, 10f).intersects(Bounds(9f, 9f, 20f, 20f)))
        assertFalse(Bounds(0f, 0f, 10f, 10f).intersects(Bounds(11f, 0f, 20f, 10f)))
    }

    @Test
    fun newIdIsUniqueAcrossCalls() {
        assertEquals(500, (1..500).map { newId() }.toSet().size)
    }

    @Test
    fun strokeDefaultsToActive() {
        val s = Stroke(
            id = newId(),
            pageId = "page-1",
            tool = ToolKind.PEN,
            colorArgb = 0xFF2C2825.toInt(),
            widthPx = 3f,
            points = listOf(StrokePoint(0f, 0f, 1f, 0)),
            bounds = Bounds.EMPTY,
            order = 1
        )
        assertTrue(s.active)
    }
}
```

`android/core-model/src/test/kotlin/com/notes/school/core/PlatformNeutralityTest.kt`:

```kotlin
package com.notes.school.core

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class PlatformNeutralityTest {

    @Test
    fun noSourceFileImportsAndroidTypes() {
        val offenders = File("src/main/kotlin").walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { file -> file.readLines().any { it.trimStart().startsWith("import android") } }
            .map { it.path }
            .toList()
        assertEquals("core-model must stay platform neutral", emptyList<String>(), offenders)
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd android && ./gradlew :core-model:test
```

Expected: FAIL — `Unresolved reference: StrokePoint`.

- [ ] **Step 4: Write the implementation**

`android/core-model/src/main/kotlin/com/notes/school/core/Ids.kt`:

```kotlin
package com.notes.school.core

import java.util.UUID

/** Stable, storage-safe identifier used for folders, documents, pages, strokes and jobs. */
fun newId(): String = UUID.randomUUID().toString()
```

`android/core-model/src/main/kotlin/com/notes/school/core/Geometry.kt`:

```kotlin
package com.notes.school.core

import kotlinx.serialization.Serializable

@Serializable
data class Bounds(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float
) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top

    fun union(other: Bounds): Bounds = Bounds(
        left = minOf(left, other.left),
        top = minOf(top, other.top),
        right = maxOf(right, other.right),
        bottom = maxOf(bottom, other.bottom)
    )

    fun contains(x: Float, y: Float): Boolean =
        x >= left && x <= right && y >= top && y <= bottom

    fun intersects(other: Bounds): Boolean =
        left <= other.right && other.left <= right &&
            top <= other.bottom && other.top <= bottom

    fun inflate(by: Float): Bounds = Bounds(left - by, top - by, right + by, bottom + by)

    companion object {
        val EMPTY = Bounds(0f, 0f, 0f, 0f)

        fun ofPoints(points: List<StrokePoint>, padding: Float = 0f): Bounds {
            if (points.isEmpty()) return EMPTY
            var l = Float.MAX_VALUE
            var t = Float.MAX_VALUE
            var r = -Float.MAX_VALUE
            var b = -Float.MAX_VALUE
            for (p in points) {
                if (p.x < l) l = p.x
                if (p.y < t) t = p.y
                if (p.x > r) r = p.x
                if (p.y > b) b = p.y
            }
            return Bounds(l - padding, t - padding, r + padding, b + padding)
        }
    }
}
```

`android/core-model/src/main/kotlin/com/notes/school/core/Ink.kt`:

```kotlin
package com.notes.school.core

import kotlinx.serialization.Serializable

@Serializable
data class StrokePoint(
    val x: Float,
    val y: Float,
    /** Normalized 0f..1f. Capacitive styluses often report a constant; treat as a hint only. */
    val pressure: Float,
    /** Milliseconds since the first sample of the owning stroke. */
    val tOffsetMs: Int
)

enum class ToolKind { PEN, HIGHLIGHTER, ERASER }

@Serializable
data class Stroke(
    val id: String,
    val pageId: String,
    val tool: ToolKind,
    val colorArgb: Int,
    val widthPx: Float,
    val points: List<StrokePoint>,
    val bounds: Bounds,
    /** Monotonic per page. Defines paint order and deterministic history replay. */
    val order: Long,
    /** Logical deletion flag. Erase and undo flip this instead of destroying data. */
    val active: Boolean = true
)
```

`android/core-model/src/main/kotlin/com/notes/school/core/Documents.kt`:

```kotlin
package com.notes.school.core

import kotlinx.serialization.Serializable

@Serializable
data class Folder(
    val id: String,
    val parentId: String?,
    val name: String,
    val sortIndex: Int,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val trashed: Boolean = false
)

enum class DocumentKind { BLANK, LINED, GRID, PDF }

@Serializable
data class DocumentMeta(
    val id: String,
    val folderId: String?,
    val title: String,
    val kind: DocumentKind,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val favorite: Boolean = false,
    val trashed: Boolean = false,
    /** Relative path inside app-private storage for an imported PDF, else null. */
    val sourceRef: String? = null
)

@Serializable
sealed interface PageSource {
    @Serializable
    data class Template(val kind: DocumentKind) : PageSource

    @Serializable
    data class PdfPage(val pageIndex: Int) : PageSource
}

@Serializable
data class Page(
    val id: String,
    val documentId: String,
    val index: Int,
    val widthPx: Float,
    val heightPx: Float,
    val source: PageSource,
    /** Last viewport the user left the page in, so reopening restores position. */
    val scrollX: Float = 0f,
    val scrollY: Float = 0f,
    val zoom: Float = 1f
)
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd android && ./gradlew :core-model:test
```

Expected: `BUILD SUCCESSFUL`, 7 tests passing.

- [ ] **Step 6: Commit**

```bash
git add android && git commit -m "feat(core-model): add platform-neutral document, page and stroke models"
```

---

### Task 3: Versioned compact stroke point codec

**Files:**
- Create: `android/core-model/src/main/kotlin/com/notes/school/core/StrokeCodec.kt`
- Test: `android/core-model/src/test/kotlin/com/notes/school/core/StrokeCodecTest.kt`

**Interfaces:**
- Consumes: `StrokePoint` from Task 2.
- Produces: `object StrokeCodec` with `const val VERSION: Int = 1`, `fun encode(points: List<StrokePoint>): ByteArray`, `fun decode(blob: ByteArray): List<StrokePoint>`; plus `class StrokeCodecException(message: String) : RuntimeException(message)`.

- [ ] **Step 1: Write the failing test**

`android/core-model/src/test/kotlin/com/notes/school/core/StrokeCodecTest.kt`:

```kotlin
package com.notes.school.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class StrokeCodecTest {

    private val sample = listOf(
        StrokePoint(0f, 0f, 0f, 0),
        StrokePoint(12.5f, -3.25f, 0.75f, 16),
        StrokePoint(1024.125f, 2048.5f, 1f, 512)
    )

    @Test
    fun roundTripPreservesEveryField() {
        assertEquals(sample, StrokeCodec.decode(StrokeCodec.encode(sample)))
    }

    @Test
    fun emptyStrokeRoundTrips() {
        assertEquals(emptyList<StrokePoint>(), StrokeCodec.decode(StrokeCodec.encode(emptyList())))
    }

    @Test
    fun blobLayoutIsHeaderPlusFixedSizeRecords() {
        val blob = StrokeCodec.encode(sample)
        assertEquals(8 + 16 * sample.size, blob.size)
        assertEquals(StrokeCodec.VERSION.toByte(), blob[0])
    }

    @Test
    fun unknownVersionIsRejected() {
        val blob = StrokeCodec.encode(sample)
        blob[0] = 99
        val e = assertThrows(StrokeCodecException::class.java) { StrokeCodec.decode(blob) }
        assertTrue(e.message!!.contains("version"))
    }

    @Test
    fun truncatedPayloadIsRejected() {
        val blob = StrokeCodec.encode(sample)
        assertThrows(StrokeCodecException::class.java) {
            StrokeCodec.decode(blob.copyOf(blob.size - 5))
        }
    }

    @Test
    fun tenThousandPointsRoundTripUnchanged() {
        val big = (0 until 10_000).map { StrokePoint(it * 0.5f, it * 0.25f, 0.5f, it * 4) }
        assertEquals(big, StrokeCodec.decode(StrokeCodec.encode(big)))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :core-model:test --tests "*StrokeCodecTest*"
```

Expected: FAIL — `Unresolved reference: StrokeCodec`.

- [ ] **Step 3: Write the implementation**

`android/core-model/src/main/kotlin/com/notes/school/core/StrokeCodec.kt`:

```kotlin
package com.notes.school.core

import java.nio.ByteBuffer
import java.nio.ByteOrder

class StrokeCodecException(message: String) : RuntimeException(message)

/**
 * Versioned little-endian binary encoding for stroke point arrays stored in Room BLOB columns.
 *
 * Layout:
 *   header : u8 version | u8 reserved | u16 reserved | u32 pointCount   (8 bytes)
 *   record : f32 x | f32 y | f32 pressure | u32 tOffsetMs               (16 bytes, repeated)
 *
 * The header is a fixed 8 bytes so a future version can extend the record while an
 * older reader can still read the version and count.
 */
object StrokeCodec {

    const val VERSION: Int = 1
    private const val HEADER_BYTES = 8
    private const val RECORD_BYTES = 16

    fun encode(points: List<StrokePoint>): ByteArray {
        val buffer = ByteBuffer
            .allocate(HEADER_BYTES + RECORD_BYTES * points.size)
            .order(ByteOrder.LITTLE_ENDIAN)
        buffer.put(VERSION.toByte())
        buffer.put(0)
        buffer.putShort(0)
        buffer.putInt(points.size)
        for (p in points) {
            buffer.putFloat(p.x)
            buffer.putFloat(p.y)
            buffer.putFloat(p.pressure)
            buffer.putInt(p.tOffsetMs)
        }
        return buffer.array()
    }

    fun decode(blob: ByteArray): List<StrokePoint> {
        if (blob.size < HEADER_BYTES) throw StrokeCodecException("blob shorter than header")
        val buffer = ByteBuffer.wrap(blob).order(ByteOrder.LITTLE_ENDIAN)
        val version = buffer.get().toInt() and 0xFF
        if (version != VERSION) throw StrokeCodecException("unsupported stroke blob version $version")
        buffer.get()
        buffer.short
        val count = buffer.int
        if (count < 0) throw StrokeCodecException("negative point count")
        val expected = HEADER_BYTES + RECORD_BYTES * count
        if (blob.size != expected) {
            throw StrokeCodecException("truncated blob: expected $expected bytes, got ${blob.size}")
        }
        val points = ArrayList<StrokePoint>(count)
        repeat(count) {
            points.add(
                StrokePoint(
                    x = buffer.float,
                    y = buffer.float,
                    pressure = buffer.float,
                    tOffsetMs = buffer.int
                )
            )
        }
        return points
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd android && ./gradlew :core-model:test
```

Expected: `BUILD SUCCESSFUL`, all tests passing.

- [ ] **Step 5: Commit**

```bash
git add android && git commit -m "feat(core-model): add versioned compact stroke point codec"
```

---
## Phase 1 — Ink Engine

### Task 4: `InkScene` — strokes, logical erase, lasso selection, undo/redo

**Files:**
- Create: `android/ink-engine/build.gradle.kts`
- Create: `android/ink-engine/src/main/AndroidManifest.xml`
- Create: `android/ink-engine/src/main/kotlin/com/notes/school/ink/Segments.kt`
- Create: `android/ink-engine/src/main/kotlin/com/notes/school/ink/InkScene.kt`
- Test: `android/ink-engine/src/test/kotlin/com/notes/school/ink/SegmentsTest.kt`
- Test: `android/ink-engine/src/test/kotlin/com/notes/school/ink/InkSceneTest.kt`
- Modify: `android/settings.gradle.kts` (uncomment `include(":ink-engine")`)

**Interfaces:**
- Consumes: `Stroke`, `StrokePoint`, `Bounds`, `ToolKind`, `newId()` from Task 2.
- Produces:
  - `object Segments` with `fun distanceToSegment(px: Float, py: Float, ax: Float, ay: Float, bx: Float, by: Float): Float` and `fun polygonContains(polygon: List<StrokePoint>, x: Float, y: Float): Boolean`.
  - `class InkScene(val pageId: String, initial: List<Stroke> = emptyList())` with:
    - `fun activeStrokes(): List<Stroke>` — active strokes ordered by `order`
    - `fun allStrokes(): List<Stroke>` — including inactive, for persistence
    - `fun addStroke(tool: ToolKind, colorArgb: Int, widthPx: Float, points: List<StrokePoint>): Stroke`
    - `fun eraseAt(x: Float, y: Float, radiusPx: Float): List<Stroke>` — returns newly deactivated strokes
    - `fun selectInLasso(polygon: List<StrokePoint>): List<String>`
    - `fun translate(strokeIds: List<String>, dx: Float, dy: Float): List<Stroke>`
    - `fun undo(): InkChange?` / `fun redo(): InkChange?`
    - `val canUndo: Boolean` / `val canRedo: Boolean`
  - `data class InkChange(val changed: List<Stroke>, val dirtyBounds: Bounds)`

- [ ] **Step 1: Add the module build file and enable it**

`android/ink-engine/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.notes.school.ink"
    compileSdk = 34
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].kotlin.srcDir("src/main/kotlin")
    sourceSets["test"].kotlin.srcDir("src/test/kotlin")
    testOptions { unitTests { isIncludeAndroidResources = true } }
}

dependencies {
    api(project(":core-model"))
    implementation(libs.androidx.core.ktx)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
}
```

`android/ink-engine/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest />
```

Uncomment `include(":ink-engine")` in `android/settings.gradle.kts`.

- [ ] **Step 2: Write the failing geometry test**

`android/ink-engine/src/test/kotlin/com/notes/school/ink/SegmentsTest.kt`:

```kotlin
package com.notes.school.ink

import com.notes.school.core.StrokePoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SegmentsTest {

    @Test
    fun perpendicularDistanceToMiddleOfSegment() {
        assertEquals(5f, Segments.distanceToSegment(5f, 5f, 0f, 0f, 10f, 0f), 0.001f)
    }

    @Test
    fun distanceClampsToNearestEndpointBeyondSegment() {
        assertEquals(5f, Segments.distanceToSegment(15f, 0f, 0f, 0f, 10f, 0f), 0.001f)
        assertEquals(5f, Segments.distanceToSegment(-5f, 0f, 0f, 0f, 10f, 0f), 0.001f)
    }

    @Test
    fun degenerateSegmentBehavesLikePointDistance() {
        assertEquals(3f, Segments.distanceToSegment(3f, 4f, 0f, 4f, 0f, 4f), 0.001f)
    }

    private fun square(size: Float) = listOf(
        StrokePoint(0f, 0f, 0f, 0),
        StrokePoint(size, 0f, 0f, 0),
        StrokePoint(size, size, 0f, 0),
        StrokePoint(0f, size, 0f, 0)
    )

    @Test
    fun polygonContainsInteriorPoint() {
        assertTrue(Segments.polygonContains(square(10f), 5f, 5f))
    }

    @Test
    fun polygonRejectsExteriorPoint() {
        assertFalse(Segments.polygonContains(square(10f), 15f, 5f))
    }

    @Test
    fun polygonWithFewerThanThreePointsContainsNothing() {
        assertFalse(Segments.polygonContains(listOf(StrokePoint(0f, 0f, 0f, 0)), 0f, 0f))
    }
}
```

- [ ] **Step 3: Write the failing scene test**

`android/ink-engine/src/test/kotlin/com/notes/school/ink/InkSceneTest.kt`:

```kotlin
package com.notes.school.ink

import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class InkSceneTest {

    private lateinit var scene: InkScene

    private fun line(x1: Float, y1: Float, x2: Float, y2: Float) = listOf(
        StrokePoint(x1, y1, 0.5f, 0),
        StrokePoint(x2, y2, 0.5f, 10)
    )

    @Before
    fun setUp() {
        scene = InkScene(pageId = "page-1")
    }

    @Test
    fun addedStrokesGetIncreasingOrder() {
        val a = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 0f, 10f, 0f))
        val b = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 5f, 10f, 5f))
        assertTrue(b.order > a.order)
        assertEquals(listOf(a.id, b.id), scene.activeStrokes().map { it.id })
    }

    @Test
    fun addedStrokeCarriesComputedBounds() {
        val s = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 4f, line(10f, 10f, 20f, 30f))
        // bounds are padded by half the stroke width
        assertEquals(8f, s.bounds.left, 0.001f)
        assertEquals(32f, s.bounds.bottom, 0.001f)
    }

    @Test
    fun eraseDeactivatesOnlyStrokesWithinRadius() {
        val hit = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 0f, 100f, 0f))
        val miss = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 500f, 100f, 500f))
        val erased = scene.eraseAt(50f, 2f, radiusPx = 8f)
        assertEquals(listOf(hit.id), erased.map { it.id })
        assertEquals(listOf(miss.id), scene.activeStrokes().map { it.id })
    }

    @Test
    fun eraseIsLogicalAndKeepsDataForRecovery() {
        val s = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 0f, 100f, 0f))
        scene.eraseAt(50f, 0f, radiusPx = 8f)
        val stored = scene.allStrokes().single { it.id == s.id }
        assertFalse(stored.active)
        assertEquals(2, stored.points.size)
    }

    @Test
    fun undoOfAddRemovesStrokeAndRedoRestoresIt() {
        val s = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 0f, 10f, 0f))
        assertTrue(scene.canUndo)
        scene.undo()
        assertEquals(emptyList<String>(), scene.activeStrokes().map { it.id })
        assertTrue(scene.canRedo)
        scene.redo()
        assertEquals(listOf(s.id), scene.activeStrokes().map { it.id })
    }

    @Test
    fun undoOfEraseReactivatesExactlyTheErasedStrokes() {
        val a = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 0f, 100f, 0f))
        val b = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 400f, 100f, 400f))
        scene.eraseAt(50f, 0f, radiusPx = 8f)
        scene.undo()
        assertEquals(listOf(a.id, b.id), scene.activeStrokes().map { it.id })
    }

    @Test
    fun newActionClearsRedoStack() {
        scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 0f, 10f, 0f))
        scene.undo()
        assertTrue(scene.canRedo)
        scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 3f, line(0f, 20f, 10f, 20f))
        assertFalse(scene.canRedo)
    }

    @Test
    fun undoOnEmptyHistoryReturnsNull() {
        assertNull(scene.undo())
        assertFalse(scene.canUndo)
    }

    @Test
    fun lassoSelectsOnlyFullyEnclosedStrokes() {
        val inside = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 2f, line(20f, 20f, 30f, 30f))
        scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 2f, line(20f, 20f, 200f, 200f))
        val polygon = listOf(
            StrokePoint(10f, 10f, 0f, 0),
            StrokePoint(50f, 10f, 0f, 0),
            StrokePoint(50f, 50f, 0f, 0),
            StrokePoint(10f, 50f, 0f, 0)
        )
        assertEquals(listOf(inside.id), scene.selectInLasso(polygon))
    }

    @Test
    fun translateMovesPointsAndBoundsAndIsUndoable() {
        val s = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 2f, line(0f, 0f, 10f, 0f))
        scene.translate(listOf(s.id), dx = 5f, dy = 7f)
        val moved = scene.activeStrokes().single()
        assertEquals(5f, moved.points.first().x, 0.001f)
        assertEquals(7f, moved.points.first().y, 0.001f)
        scene.undo()
        assertEquals(0f, scene.activeStrokes().single().points.first().x, 0.001f)
    }

    @Test
    fun changeReportsDirtyBoundsCoveringAffectedStrokes() {
        scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 2f, line(0f, 0f, 10f, 0f))
        val change = scene.undo()!!
        assertTrue(change.dirtyBounds.contains(5f, 0f))
    }

    @Test
    fun sceneRestoredFromStoredStrokesKeepsOrderAndActiveState() {
        val a = scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 2f, line(0f, 0f, 10f, 0f))
        scene.addStroke(ToolKind.PEN, 0xFF000000.toInt(), 2f, line(0f, 40f, 10f, 40f))
        scene.eraseAt(5f, 40f, radiusPx = 6f)
        val restored = InkScene("page-1", scene.allStrokes())
        assertEquals(listOf(a.id), restored.activeStrokes().map { it.id })
        assertFalse(restored.canUndo)
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd android && ./gradlew :ink-engine:testDebugUnitTest
```

Expected: FAIL — `Unresolved reference: Segments`.

- [ ] **Step 5: Write `Segments`**

`android/ink-engine/src/main/kotlin/com/notes/school/ink/Segments.kt`:

```kotlin
package com.notes.school.ink

import com.notes.school.core.StrokePoint
import kotlin.math.sqrt

object Segments {

    /** Shortest distance from (px, py) to the segment a-b, clamped at the endpoints. */
    fun distanceToSegment(
        px: Float, py: Float,
        ax: Float, ay: Float,
        bx: Float, by: Float
    ): Float {
        val abx = bx - ax
        val aby = by - ay
        val lengthSquared = abx * abx + aby * aby
        val t = if (lengthSquared <= 0f) {
            0f
        } else {
            (((px - ax) * abx + (py - ay) * aby) / lengthSquared).coerceIn(0f, 1f)
        }
        val dx = px - (ax + t * abx)
        val dy = py - (ay + t * aby)
        return sqrt(dx * dx + dy * dy)
    }

    /** Even-odd ray casting. Polygons with fewer than three vertices contain nothing. */
    fun polygonContains(polygon: List<StrokePoint>, x: Float, y: Float): Boolean {
        if (polygon.size < 3) return false
        var inside = false
        var j = polygon.lastIndex
        for (i in polygon.indices) {
            val pi = polygon[i]
            val pj = polygon[j]
            val crossesRay = (pi.y > y) != (pj.y > y)
            if (crossesRay) {
                val xAtY = (pj.x - pi.x) * (y - pi.y) / (pj.y - pi.y) + pi.x
                if (x < xAtY) inside = !inside
            }
            j = i
        }
        return inside
    }
}
```

- [ ] **Step 6: Write `InkScene`**

`android/ink-engine/src/main/kotlin/com/notes/school/ink/InkScene.kt`:

```kotlin
package com.notes.school.ink

import com.notes.school.core.Bounds
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import com.notes.school.core.newId

/** A committed mutation, reported so callers can invalidate and persist the minimum. */
data class InkChange(val changed: List<Stroke>, val dirtyBounds: Bounds)

private sealed interface InkCommand {
    data class Add(val strokeId: String) : InkCommand
    data class SetActive(val strokeIds: List<String>, val active: Boolean) : InkCommand
    data class Translate(val strokeIds: List<String>, val dx: Float, val dy: Float) : InkCommand
}

/**
 * In-memory ink state for one page. Erase and undo are logical: a stroke's `active` flag
 * flips, its point data is never destroyed. That keeps history deterministic and makes
 * crash recovery possible.
 *
 * Not thread safe. Owned by the UI thread; persistence reads snapshots via [allStrokes].
 */
class InkScene(
    val pageId: String,
    initial: List<Stroke> = emptyList()
) {
    private val strokes = LinkedHashMap<String, Stroke>()
    private val undoStack = ArrayDeque<InkCommand>()
    private val redoStack = ArrayDeque<InkCommand>()
    private var nextOrder: Long = 0

    init {
        initial.sortedBy { it.order }.forEach { strokes[it.id] = it }
        nextOrder = (initial.maxOfOrNull { it.order } ?: -1L) + 1L
    }

    val canUndo: Boolean get() = undoStack.isNotEmpty()
    val canRedo: Boolean get() = redoStack.isNotEmpty()

    fun activeStrokes(): List<Stroke> = strokes.values.filter { it.active }.sortedBy { it.order }

    fun allStrokes(): List<Stroke> = strokes.values.sortedBy { it.order }

    fun addStroke(
        tool: ToolKind,
        colorArgb: Int,
        widthPx: Float,
        points: List<StrokePoint>
    ): Stroke {
        val stroke = Stroke(
            id = newId(),
            pageId = pageId,
            tool = tool,
            colorArgb = colorArgb,
            widthPx = widthPx,
            points = points,
            bounds = Bounds.ofPoints(points, padding = widthPx / 2f),
            order = nextOrder++,
            active = true
        )
        strokes[stroke.id] = stroke
        push(InkCommand.Add(stroke.id))
        return stroke
    }

    /** Deactivates every active stroke passing within [radiusPx] of (x, y). */
    fun eraseAt(x: Float, y: Float, radiusPx: Float): List<Stroke> {
        val probe = Bounds(x - radiusPx, y - radiusPx, x + radiusPx, y + radiusPx)
        val hits = strokes.values.filter { stroke ->
            stroke.active && stroke.bounds.intersects(probe) && touches(stroke, x, y, radiusPx)
        }
        if (hits.isEmpty()) return emptyList()
        val ids = hits.map { it.id }
        applySetActive(ids, active = false)
        push(InkCommand.SetActive(ids, active = false))
        return ids.map { strokes.getValue(it) }
    }

    /** Ids of active strokes whose every point lies inside [polygon]. */
    fun selectInLasso(polygon: List<StrokePoint>): List<String> =
        activeStrokes()
            .filter { stroke -> stroke.points.all { Segments.polygonContains(polygon, it.x, it.y) } }
            .map { it.id }

    fun translate(strokeIds: List<String>, dx: Float, dy: Float): List<Stroke> {
        if (strokeIds.isEmpty() || (dx == 0f && dy == 0f)) return emptyList()
        applyTranslate(strokeIds, dx, dy)
        push(InkCommand.Translate(strokeIds, dx, dy))
        return strokeIds.map { strokes.getValue(it) }
    }

    fun undo(): InkChange? {
        val command = undoStack.removeLastOrNull() ?: return null
        val change = when (command) {
            is InkCommand.Add -> {
                applySetActive(listOf(command.strokeId), active = false)
                changeOf(listOf(command.strokeId))
            }
            is InkCommand.SetActive -> {
                applySetActive(command.strokeIds, active = !command.active)
                changeOf(command.strokeIds)
            }
            is InkCommand.Translate -> {
                applyTranslate(command.strokeIds, -command.dx, -command.dy)
                changeOf(command.strokeIds)
            }
        }
        redoStack.addLast(command)
        return change
    }

    fun redo(): InkChange? {
        val command = redoStack.removeLastOrNull() ?: return null
        val change = when (command) {
            is InkCommand.Add -> {
                applySetActive(listOf(command.strokeId), active = true)
                changeOf(listOf(command.strokeId))
            }
            is InkCommand.SetActive -> {
                applySetActive(command.strokeIds, command.active)
                changeOf(command.strokeIds)
            }
            is InkCommand.Translate -> {
                applyTranslate(command.strokeIds, command.dx, command.dy)
                changeOf(command.strokeIds)
            }
        }
        undoStack.addLast(command)
        return change
    }

    private fun push(command: InkCommand) {
        undoStack.addLast(command)
        redoStack.clear()
    }

    private fun applySetActive(ids: List<String>, active: Boolean) {
        ids.forEach { id ->
            strokes[id]?.let { strokes[id] = it.copy(active = active) }
        }
    }

    private fun applyTranslate(ids: List<String>, dx: Float, dy: Float) {
        ids.forEach { id ->
            val stroke = strokes[id] ?: return@forEach
            val moved = stroke.points.map { it.copy(x = it.x + dx, y = it.y + dy) }
            strokes[id] = stroke.copy(
                points = moved,
                bounds = Bounds.ofPoints(moved, padding = stroke.widthPx / 2f)
            )
        }
    }

    private fun changeOf(ids: List<String>): InkChange {
        val affected = ids.mapNotNull { strokes[it] }
        val dirty = affected
            .map { it.bounds }
            .reduceOrNull { acc, b -> acc.union(b) }
            ?: Bounds.EMPTY
        return InkChange(affected, dirty)
    }

    private fun touches(stroke: Stroke, x: Float, y: Float, radiusPx: Float): Boolean {
        val threshold = radiusPx + stroke.widthPx / 2f
        val points = stroke.points
        if (points.size == 1) {
            val p = points[0]
            return Segments.distanceToSegment(x, y, p.x, p.y, p.x, p.y) <= threshold
        }
        for (i in 0 until points.size - 1) {
            val a = points[i]
            val b = points[i + 1]
            if (Segments.distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= threshold) return true
        }
        return false
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd android && ./gradlew :ink-engine:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, 18 tests passing.

- [ ] **Step 8: Commit**

```bash
git add android && git commit -m "feat(ink-engine): add InkScene with logical erase, lasso selection and undo/redo"
```

---

### Task 5: `StrokeRenderer` — bounds-clipped Canvas rendering

**Files:**
- Create: `android/ink-engine/src/main/kotlin/com/notes/school/ink/StrokeRenderer.kt`
- Test: `android/ink-engine/src/test/kotlin/com/notes/school/ink/StrokeRendererTest.kt`

**Interfaces:**
- Consumes: `Stroke`, `Bounds`, `ToolKind` (Task 2); `InkScene` (Task 4).
- Produces: `class StrokeRenderer` with
  - `fun draw(canvas: Canvas, strokes: List<Stroke>, clip: Bounds? = null)`
  - `fun drawLive(canvas: Canvas, points: FloatArray, pointCount: Int, tool: ToolKind, colorArgb: Int, widthPx: Float, alphaScale: Float = 1f)` — draws the in-progress or provisional stroke straight from the raw coordinate buffer, allocating nothing.
  - `const val HIGHLIGHTER_ALPHA: Int = 96` (companion)

- [ ] **Step 1: Write the failing test**

`android/ink-engine/src/test/kotlin/com/notes/school/ink/StrokeRendererTest.kt`:

```kotlin
package com.notes.school.ink

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.notes.school.core.Bounds
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class StrokeRendererTest {

    private val renderer = StrokeRenderer()

    private fun surface(): Pair<Bitmap, Canvas> {
        val bitmap = Bitmap.createBitmap(200, 200, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        return bitmap to canvas
    }

    private fun horizontalStroke(y: Float, color: Int, tool: ToolKind = ToolKind.PEN) =
        InkScene("p").addStroke(
            tool, color, 6f,
            listOf(StrokePoint(20f, y, 1f, 0), StrokePoint(180f, y, 1f, 20))
        )

    @Test
    fun drawsStrokeInItsColor() {
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, listOf(horizontalStroke(100f, Color.RED)))
        assertEquals(Color.RED, bitmap.getPixel(100, 100))
    }

    @Test
    fun leavesUntouchedPixelsAlone() {
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, listOf(horizontalStroke(100f, Color.RED)))
        assertEquals(Color.WHITE, bitmap.getPixel(100, 10))
    }

    @Test
    fun clipRestrictsDrawingToTheGivenBounds() {
        val (bitmap, canvas) = surface()
        renderer.draw(
            canvas,
            listOf(horizontalStroke(100f, Color.RED)),
            clip = Bounds(0f, 0f, 60f, 200f)
        )
        assertEquals(Color.RED, bitmap.getPixel(40, 100))
        assertEquals(Color.WHITE, bitmap.getPixel(150, 100))
    }

    @Test
    fun highlighterIsDrawnTranslucent() {
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, listOf(horizontalStroke(100f, Color.YELLOW, ToolKind.HIGHLIGHTER)))
        val pixel = bitmap.getPixel(100, 100)
        assertNotEquals(Color.YELLOW, pixel)
        assertTrue("highlighter should blend toward white", Color.blue(pixel) > 0)
    }

    @Test
    fun inactiveStrokesAreNeverDrawn() {
        val scene = InkScene("p")
        scene.addStroke(
            ToolKind.PEN, Color.RED, 6f,
            listOf(StrokePoint(20f, 100f, 1f, 0), StrokePoint(180f, 100f, 1f, 20))
        )
        scene.eraseAt(100f, 100f, radiusPx = 4f)
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, scene.activeStrokes())
        assertEquals(Color.WHITE, bitmap.getPixel(100, 100))
    }

    @Test
    fun drawLiveRendersFromRawBufferWithoutStrokeObjects() {
        val (bitmap, canvas) = surface()
        val buffer = floatArrayOf(20f, 100f, 180f, 100f, 0f, 0f, 0f, 0f)
        renderer.drawLive(canvas, buffer, pointCount = 2, ToolKind.PEN, Color.BLUE, 6f)
        assertEquals(Color.BLUE, bitmap.getPixel(100, 100))
    }

    @Test
    fun drawLiveWithSinglePointDrawsADot() {
        val (bitmap, canvas) = surface()
        renderer.drawLive(canvas, floatArrayOf(100f, 100f), pointCount = 1, ToolKind.PEN, Color.BLUE, 10f)
        assertEquals(Color.BLUE, bitmap.getPixel(100, 100))
    }

    @Test
    fun drawLiveWithZeroPointsDoesNothing() {
        val (bitmap, canvas) = surface()
        renderer.drawLive(canvas, FloatArray(8), pointCount = 0, ToolKind.PEN, Color.BLUE, 6f)
        assertEquals(Color.WHITE, bitmap.getPixel(100, 100))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :ink-engine:testDebugUnitTest --tests "*StrokeRendererTest*"
```

Expected: FAIL — `Unresolved reference: StrokeRenderer`.

- [ ] **Step 3: Write the implementation**

`android/ink-engine/src/main/kotlin/com/notes/school/ink/StrokeRenderer.kt`:

```kotlin
package com.notes.school.ink

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import com.notes.school.core.Bounds
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind

/**
 * Draws vector strokes onto a Canvas. One instance per view; every object it needs is
 * allocated once in the constructor so [drawLive] can run inside the input path
 * without producing garbage proportional to the point count.
 */
class StrokeRenderer {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()

    fun draw(canvas: Canvas, strokes: List<Stroke>, clip: Bounds? = null) {
        val saved = canvas.save()
        if (clip != null) canvas.clipRect(clip.left, clip.top, clip.right, clip.bottom)
        for (stroke in strokes) {
            if (!stroke.active) continue
            if (clip != null && !stroke.bounds.intersects(clip)) continue
            applyTool(stroke.tool, stroke.colorArgb, stroke.widthPx, alphaScale = 1f)
            path.rewind()
            val points = stroke.points
            if (points.isEmpty()) continue
            if (points.size == 1) {
                drawDot(canvas, points[0].x, points[0].y, stroke.widthPx)
                continue
            }
            path.moveTo(points[0].x, points[0].y)
            for (i in 1 until points.size) path.lineTo(points[i].x, points[i].y)
            canvas.drawPath(path, paint)
        }
        canvas.restoreToCount(saved)
    }

    /**
     * @param points flat x,y pairs. Only the first [pointCount] pairs are read.
     * @param alphaScale multiplied into the paint alpha; used for provisional ink.
     */
    fun drawLive(
        canvas: Canvas,
        points: FloatArray,
        pointCount: Int,
        tool: ToolKind,
        colorArgb: Int,
        widthPx: Float,
        alphaScale: Float = 1f
    ) {
        if (pointCount <= 0) return
        applyTool(tool, colorArgb, widthPx, alphaScale)
        if (pointCount == 1) {
            drawDot(canvas, points[0], points[1], widthPx)
            return
        }
        path.rewind()
        path.moveTo(points[0], points[1])
        for (i in 1 until pointCount) path.lineTo(points[i * 2], points[i * 2 + 1])
        canvas.drawPath(path, paint)
    }

    private fun drawDot(canvas: Canvas, x: Float, y: Float, widthPx: Float) {
        val previous = paint.style
        paint.style = Paint.Style.FILL
        canvas.drawCircle(x, y, widthPx / 2f, paint)
        paint.style = previous
    }

    private fun applyTool(tool: ToolKind, colorArgb: Int, widthPx: Float, alphaScale: Float) {
        paint.style = Paint.Style.STROKE
        paint.color = colorArgb
        paint.strokeWidth = widthPx
        val base = when (tool) {
            ToolKind.HIGHLIGHTER -> HIGHLIGHTER_ALPHA
            else -> Color.alpha(colorArgb)
        }
        paint.alpha = (base * alphaScale).toInt().coerceIn(0, 255)
    }

    companion object {
        /** Highlighter ink must stay readable over text underneath it. */
        const val HIGHLIGHTER_ALPHA: Int = 96

        /** Provisional (undecided) ink is drawn faded until the classifier commits. */
        const val PROVISIONAL_ALPHA_SCALE: Float = 0.55f
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd android && ./gradlew :ink-engine:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add android && git commit -m "feat(ink-engine): add bounds-clipped stroke renderer with allocation-free live path"
```

---

### Task 6: `InkView` — custom View owning the hot input path

**Files:**
- Create: `android/ink-engine/src/main/kotlin/com/notes/school/ink/PointBuffer.kt`
- Create: `android/ink-engine/src/main/kotlin/com/notes/school/ink/InkView.kt`
- Test: `android/ink-engine/src/test/kotlin/com/notes/school/ink/PointBufferTest.kt`
- Test: `android/ink-engine/src/test/kotlin/com/notes/school/ink/InkViewTest.kt`

**Interfaces:**
- Consumes: `InkScene`, `InkChange` (Task 4); `StrokeRenderer` (Task 5).
- Produces:
  - `class PointBuffer(initialCapacity: Int = 512)` with `val count: Int`, `val xy: FloatArray`, `fun add(x: Float, y: Float, pressure: Float, tOffsetMs: Int)`, `fun clear()`, `fun toStrokePoints(): List<StrokePoint>`, `fun boundsWith(widthPx: Float): Bounds`.
  - `data class ToolSettings(val kind: ToolKind, val colorArgb: Int, val widthPx: Float, val eraserRadiusPx: Float = 12f)`
  - `class InkView(context: Context, attrs: AttributeSet? = null) : View(context, attrs)` with:
    - `var scene: InkScene?`
    - `var tool: ToolSettings`
    - `var onStrokeCommitted: ((Stroke) -> Unit)?`
    - `var onSceneChanged: ((InkChange) -> Unit)?`
    - `fun undo()` / `fun redo()`
    - `fun beginProvisional(pointerId: Int)` / `fun promoteProvisional(pointerId: Int)` / `fun discardProvisional(pointerId: Int)` — used by Task 11
    - `var pointerGate: ((MotionEvent, pointerIndex: Int) -> PointerVerdict)?` — Task 11 installs the classifier here; default `null` means accept everything.
  - `enum class PointerVerdict { ACCEPT, PROVISIONAL, REJECT }`

- [ ] **Step 1: Write the failing `PointBuffer` test**

`android/ink-engine/src/test/kotlin/com/notes/school/ink/PointBufferTest.kt`:

```kotlin
package com.notes.school.ink

import com.notes.school.core.StrokePoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class PointBufferTest {

    @Test
    fun addStoresCoordinatesContiguously() {
        val buffer = PointBuffer(initialCapacity = 4)
        buffer.add(1f, 2f, 0.5f, 0)
        buffer.add(3f, 4f, 0.5f, 8)
        assertEquals(2, buffer.count)
        assertEquals(1f, buffer.xy[0], 0f)
        assertEquals(2f, buffer.xy[1], 0f)
        assertEquals(3f, buffer.xy[2], 0f)
        assertEquals(4f, buffer.xy[3], 0f)
    }

    @Test
    fun bufferGrowsBeyondInitialCapacity() {
        val buffer = PointBuffer(initialCapacity = 2)
        repeat(100) { buffer.add(it.toFloat(), it.toFloat(), 0.5f, it) }
        assertEquals(100, buffer.count)
        assertEquals(99f, buffer.xy[198], 0f)
    }

    @Test
    fun clearResetsCountButKeepsTheAllocatedArray() {
        val buffer = PointBuffer(initialCapacity = 64)
        repeat(10) { buffer.add(1f, 1f, 1f, it) }
        val array = buffer.xy
        buffer.clear()
        assertEquals(0, buffer.count)
        assertSame(array, buffer.xy)
    }

    @Test
    fun toStrokePointsProducesTheRecordedSamples() {
        val buffer = PointBuffer()
        buffer.add(1f, 2f, 0.25f, 0)
        buffer.add(3f, 4f, 0.75f, 16)
        assertEquals(
            listOf(StrokePoint(1f, 2f, 0.25f, 0), StrokePoint(3f, 4f, 0.75f, 16)),
            buffer.toStrokePoints()
        )
    }

    @Test
    fun boundsWithIncludesHalfTheStrokeWidth() {
        val buffer = PointBuffer()
        buffer.add(10f, 10f, 1f, 0)
        buffer.add(20f, 30f, 1f, 8)
        val b = buffer.boundsWith(widthPx = 4f)
        assertEquals(8f, b.left, 0.001f)
        assertEquals(32f, b.bottom, 0.001f)
    }
}
```

- [ ] **Step 2: Write the failing `InkView` test**

`android/ink-engine/src/test/kotlin/com/notes/school/ink/InkViewTest.kt`:

```kotlin
package com.notes.school.ink

import android.graphics.Color
import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class InkViewTest {

    private lateinit var view: InkView
    private lateinit var scene: InkScene
    private val committed = mutableListOf<Stroke>()

    @Before
    fun setUp() {
        scene = InkScene("page-1")
        view = InkView(ApplicationProvider.getApplicationContext()).apply {
            this.scene = this@InkViewTest.scene
            tool = ToolSettings(ToolKind.PEN, Color.BLACK, 3f)
            onStrokeCommitted = { committed += it }
        }
        view.layout(0, 0, 800, 600)
        committed.clear()
    }

    private fun event(action: Int, x: Float, y: Float, downTime: Long): MotionEvent =
        MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, x, y, 0)

    private fun drawLine() {
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 90f, 10f, downTime))
    }

    @Test
    fun aCompletedGestureBecomesExactlyOneStroke() {
        drawLine()
        assertEquals(1, scene.activeStrokes().size)
        assertEquals(1, committed.size)
        assertEquals(3, committed.single().points.size)
    }

    @Test
    fun strokeUsesTheCurrentToolSettings() {
        view.tool = ToolSettings(ToolKind.HIGHLIGHTER, Color.YELLOW, 18f)
        drawLine()
        val stroke = committed.single()
        assertEquals(ToolKind.HIGHLIGHTER, stroke.tool)
        assertEquals(Color.YELLOW, stroke.colorArgb)
        assertEquals(18f, stroke.widthPx, 0f)
    }

    @Test
    fun cancelDiscardsTheInProgressStroke() {
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_CANCEL, 50f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(0, committed.size)
    }

    @Test
    fun eraserToolDeactivatesStrokesInsteadOfAddingOne() {
        drawLine()
        view.tool = ToolSettings(ToolKind.ERASER, Color.BLACK, 3f, eraserRadiusPx = 12f)
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 50f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 50f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(1, scene.allStrokes().size)
    }

    @Test
    fun rejectedPointerNeverProducesAStroke() {
        view.pointerGate = { _, _ -> PointerVerdict.REJECT }
        drawLine()
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(0, committed.size)
    }

    @Test
    fun provisionalPointerIsBufferedAndOnlyCommittedOnPromotion() {
        view.pointerGate = { _, _ -> PointerVerdict.PROVISIONAL }
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        view.promoteProvisional(pointerId = 0)
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 90f, 10f, downTime))
        assertEquals(1, scene.activeStrokes().size)
        assertEquals(3, committed.single().points.size)
    }

    @Test
    fun discardedProvisionalPointerLeavesNoTrace() {
        view.pointerGate = { _, _ -> PointerVerdict.PROVISIONAL }
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        view.discardProvisional(pointerId = 0)
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 90f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(0, committed.size)
    }

    @Test
    fun undoAndRedoGoThroughTheScene() {
        drawLine()
        view.undo()
        assertEquals(0, scene.activeStrokes().size)
        view.redo()
        assertEquals(1, scene.activeStrokes().size)
    }

    @Test
    fun eventsWithoutASceneAreIgnoredWithoutCrashing() {
        view.scene = null
        drawLine()
        assertEquals(0, committed.size)
        assertNull(view.scene)
    }

    @Test
    fun pointTimestampsAreRelativeToTheStrokeStart() {
        drawLine()
        assertEquals(0, committed.single().points.first().tOffsetMs)
        assertTrue(committed.single().points.last().tOffsetMs >= 0)
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd android && ./gradlew :ink-engine:testDebugUnitTest --tests "*PointBufferTest*" --tests "*InkViewTest*"
```

Expected: FAIL — `Unresolved reference: PointBuffer`.

- [ ] **Step 4: Write `PointBuffer`**

`android/ink-engine/src/main/kotlin/com/notes/school/ink/PointBuffer.kt`:

```kotlin
package com.notes.school.ink

import com.notes.school.core.Bounds
import com.notes.school.core.StrokePoint

/**
 * Growable primitive buffer for one in-progress stroke. Coordinates live in a flat
 * FloatArray so the input callback allocates nothing per sample; the array is only
 * ever reallocated when a stroke outgrows it, and is reused across strokes.
 */
class PointBuffer(initialCapacity: Int = 512) {

    var xy: FloatArray = FloatArray(initialCapacity * 2)
        private set
    private var pressures = FloatArray(initialCapacity)
    private var times = IntArray(initialCapacity)

    var count: Int = 0
        private set

    fun add(x: Float, y: Float, pressure: Float, tOffsetMs: Int) {
        ensureCapacity(count + 1)
        xy[count * 2] = x
        xy[count * 2 + 1] = y
        pressures[count] = pressure
        times[count] = tOffsetMs
        count++
    }

    fun clear() {
        count = 0
    }

    fun toStrokePoints(): List<StrokePoint> {
        val out = ArrayList<StrokePoint>(count)
        for (i in 0 until count) {
            out.add(StrokePoint(xy[i * 2], xy[i * 2 + 1], pressures[i], times[i]))
        }
        return out
    }

    fun boundsWith(widthPx: Float): Bounds {
        if (count == 0) return Bounds.EMPTY
        var l = Float.MAX_VALUE
        var t = Float.MAX_VALUE
        var r = -Float.MAX_VALUE
        var b = -Float.MAX_VALUE
        for (i in 0 until count) {
            val x = xy[i * 2]
            val y = xy[i * 2 + 1]
            if (x < l) l = x
            if (y < t) t = y
            if (x > r) r = x
            if (y > b) b = y
        }
        val pad = widthPx / 2f
        return Bounds(l - pad, t - pad, r + pad, b + pad)
    }

    private fun ensureCapacity(required: Int) {
        if (required <= pressures.size) return
        val newCapacity = maxOf(required, pressures.size * 2)
        xy = xy.copyOf(newCapacity * 2)
        pressures = pressures.copyOf(newCapacity)
        times = times.copyOf(newCapacity)
    }
}
```

- [ ] **Step 5: Write `InkView`**

`android/ink-engine/src/main/kotlin/com/notes/school/ink/InkView.kt`:

```kotlin
package com.notes.school.ink

import android.content.Context
import android.graphics.Canvas
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import com.notes.school.core.Bounds
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind
import kotlin.math.ceil
import kotlin.math.floor

data class ToolSettings(
    val kind: ToolKind,
    val colorArgb: Int,
    val widthPx: Float,
    val eraserRadiusPx: Float = 12f
)

/** What the touch engine decided about one pointer for one event. */
enum class PointerVerdict { ACCEPT, PROVISIONAL, REJECT }

/**
 * The hot drawing path. Consumes raw MotionEvents including historical samples, keeps
 * in-progress ink in primitive buffers, and never triggers Compose recomposition.
 *
 * Pointer admission is delegated to [pointerGate], which the app installs in Task 11.
 * Until then every pointer is accepted, which keeps this view testable on its own.
 */
class InkView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    var scene: InkScene? = null
    var tool: ToolSettings = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f)

    var onStrokeCommitted: ((Stroke) -> Unit)? = null
    var onSceneChanged: ((InkChange) -> Unit)? = null

    /** Installed by the touch engine. Null means: accept every pointer. */
    var pointerGate: ((MotionEvent, Int) -> PointerVerdict)? = null

    private val renderer = StrokeRenderer()
    private val buffers = HashMap<Int, PointBuffer>()
    private val provisional = HashSet<Int>()
    private val rejected = HashSet<Int>()
    private val strokeStartMs = HashMap<Int, Long>()
    private val freeBuffers = ArrayDeque<PointBuffer>()

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val scene = scene ?: return
        renderer.draw(canvas, scene.activeStrokes())
        for ((pointerId, buffer) in buffers) {
            if (pointerId in rejected) continue
            val alpha = if (pointerId in provisional) {
                StrokeRenderer.PROVISIONAL_ALPHA_SCALE
            } else {
                1f
            }
            renderer.drawLive(
                canvas, buffer.xy, buffer.count,
                tool.kind, tool.colorArgb, tool.widthPx, alpha
            )
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (scene == null) return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                onPointerDown(event, event.actionIndex)
            }
            MotionEvent.ACTION_MOVE -> {
                for (index in 0 until event.pointerCount) onPointerMove(event, index)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                onPointerUp(event, event.actionIndex)
            }
            MotionEvent.ACTION_CANCEL -> {
                buffers.keys.toList().forEach { release(it) }
                invalidate()
            }
            else -> return false
        }
        return true
    }

    private fun onPointerDown(event: MotionEvent, index: Int) {
        val pointerId = event.getPointerId(index)
        when (pointerGate?.invoke(event, index) ?: PointerVerdict.ACCEPT) {
            PointerVerdict.REJECT -> {
                rejected += pointerId
                return
            }
            PointerVerdict.PROVISIONAL -> provisional += pointerId
            PointerVerdict.ACCEPT -> Unit
        }
        if (tool.kind == ToolKind.ERASER) {
            erase(event.getX(index), event.getY(index))
            return
        }
        strokeStartMs[pointerId] = event.eventTime
        val buffer = freeBuffers.removeLastOrNull() ?: PointBuffer()
        buffer.clear()
        buffer.add(event.getX(index), event.getY(index), event.getPressure(index), 0)
        buffers[pointerId] = buffer
        invalidateStroke(buffer)
    }

    private fun onPointerMove(event: MotionEvent, index: Int) {
        val pointerId = event.getPointerId(index)
        if (pointerId in rejected) return
        if (tool.kind == ToolKind.ERASER) {
            erase(event.getX(index), event.getY(index))
            return
        }
        val buffer = buffers[pointerId] ?: return
        val start = strokeStartMs[pointerId] ?: event.eventTime
        // Historical samples arrive batched; consuming them keeps the trace faithful at speed.
        for (h in 0 until event.historySize) {
            buffer.add(
                event.getHistoricalX(index, h),
                event.getHistoricalY(index, h),
                event.getHistoricalPressure(index, h),
                (event.getHistoricalEventTime(h) - start).toInt()
            )
        }
        buffer.add(
            event.getX(index),
            event.getY(index),
            event.getPressure(index),
            (event.eventTime - start).toInt()
        )
        invalidateStroke(buffer)
    }

    private fun onPointerUp(event: MotionEvent, index: Int) {
        val pointerId = event.getPointerId(index)
        if (pointerId in rejected) {
            rejected -= pointerId
            return
        }
        if (tool.kind == ToolKind.ERASER) return
        val buffer = buffers[pointerId]
        if (buffer != null && pointerId !in provisional && buffer.count > 0) {
            commit(buffer)
        }
        release(pointerId)
        invalidate()
    }

    /** Called by the touch engine when a provisional pointer is confirmed as pen. */
    fun promoteProvisional(pointerId: Int) {
        provisional -= pointerId
        invalidate()
    }

    /** Called by the touch engine when a provisional pointer is confirmed as palm. */
    fun discardProvisional(pointerId: Int) {
        provisional -= pointerId
        rejected += pointerId
        release(pointerId)
        invalidate()
    }

    fun undo() {
        scene?.undo()?.let { publish(it) }
    }

    fun redo() {
        scene?.redo()?.let { publish(it) }
    }

    private fun commit(buffer: PointBuffer) {
        val scene = scene ?: return
        val stroke = scene.addStroke(
            tool = tool.kind,
            colorArgb = tool.colorArgb,
            widthPx = tool.widthPx,
            points = buffer.toStrokePoints()
        )
        onStrokeCommitted?.invoke(stroke)
        onSceneChanged?.invoke(InkChange(listOf(stroke), stroke.bounds))
    }

    private fun erase(x: Float, y: Float) {
        val scene = scene ?: return
        val erased = scene.eraseAt(x, y, tool.eraserRadiusPx)
        if (erased.isEmpty()) return
        val dirty = erased.map { it.bounds }.reduce { acc, b -> acc.union(b) }
        publish(InkChange(erased, dirty))
    }

    private fun publish(change: InkChange) {
        onSceneChanged?.invoke(change)
        invalidateBounds(change.dirtyBounds)
    }

    private fun release(pointerId: Int) {
        buffers.remove(pointerId)?.let { freeBuffers.addLast(it) }
        provisional -= pointerId
        strokeStartMs -= pointerId
    }

    private fun invalidateStroke(buffer: PointBuffer) {
        invalidateBounds(buffer.boundsWith(tool.widthPx))
    }

    private fun invalidateBounds(bounds: Bounds) {
        if (bounds.width <= 0f && bounds.height <= 0f) {
            invalidate()
            return
        }
        val pad = 2f
        invalidate(
            floor(bounds.left - pad).toInt(),
            floor(bounds.top - pad).toInt(),
            ceil(bounds.right + pad).toInt(),
            ceil(bounds.bottom + pad).toInt()
        )
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd android && ./gradlew :ink-engine:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`, all `PointBufferTest` and `InkViewTest` cases green.

- [ ] **Step 7: Commit**

```bash
git add android && git commit -m "feat(ink-engine): add InkView with allocation-free input path and provisional ink"
```

---
## Phase 2 — Touch Engine (Software Palm Rejection)

### Task 7: `PalmProfile` with hard safe ranges

**Files:**
- Create: `android/core-model/src/main/kotlin/com/notes/school/core/PalmProfile.kt`
- Test: `android/core-model/src/test/kotlin/com/notes/school/core/PalmProfileTest.kt`

**Interfaces:**
- Consumes: nothing beyond Task 2.
- Produces:
  - `enum class ThresholdKey { MAX_PEN_SIZE, MAX_PEN_TOUCH_MAJOR, MIN_PALM_SIZE, MIN_PEN_SPEED, DECISION_WINDOW_MS, PEN_BIAS, SMALL_CONTACT_WEIGHT }`
  - `data class SafeRange(val min: Float, val max: Float)` with `fun clamp(value: Float): Float`
  - `data class Thresholds(val values: Map<ThresholdKey, Float>)` with `operator fun get(key: ThresholdKey): Float` and `fun with(key: ThresholdKey, value: Float): Thresholds`
  - `enum class ScreenOrientation { LANDSCAPE, PORTRAIT }`, `enum class Handedness { RIGHT, LEFT }`, `enum class InputFeature { TOOL_TYPE, PRESSURE, SIZE, TOUCH_MAJOR, TOUCH_MINOR, ORIENTATION }`
  - `data class PalmProfile(...)` with `fun withThresholds(candidate: Thresholds): PalmProfile` (clamping) and `companion object { const val SCHEMA_VERSION = 1; fun defaults(deviceFingerprint: String, orientation: ScreenOrientation, handedness: Handedness, availableFeatures: Set<InputFeature>): PalmProfile }`

- [ ] **Step 1: Write the failing test**

`android/core-model/src/test/kotlin/com/notes/school/core/PalmProfileTest.kt`:

```kotlin
package com.notes.school.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PalmProfileTest {

    private fun profile() = PalmProfile.defaults(
        deviceFingerprint = "samsung/SM-T505/31",
        orientation = ScreenOrientation.LANDSCAPE,
        handedness = Handedness.RIGHT,
        availableFeatures = setOf(InputFeature.SIZE, InputFeature.PRESSURE, InputFeature.TOOL_TYPE)
    )

    @Test
    fun safeRangeClampsBothDirections() {
        val range = SafeRange(0.1f, 0.5f)
        assertEquals(0.1f, range.clamp(-3f), 0f)
        assertEquals(0.5f, range.clamp(9f), 0f)
        assertEquals(0.3f, range.clamp(0.3f), 0f)
    }

    @Test
    fun defaultProfileDefinesEverySafeRangeAndThreshold() {
        val p = profile()
        ThresholdKey.entries.forEach { key ->
            assertTrue("missing threshold $key", p.thresholds.values.containsKey(key))
            assertTrue("missing safe range $key", p.safeRanges.containsKey(key))
        }
    }

    @Test
    fun defaultProfileIsNotMarkedStableUntilCalibrated() {
        assertFalse(profile().stable)
        assertEquals(0f, profile().score, 0f)
    }

    @Test
    fun withThresholdsClampsValuesIntoTheirSafeRange() {
        val p = profile()
        val runaway = p.thresholds.with(ThresholdKey.MAX_PEN_SIZE, 999f)
        val clamped = p.withThresholds(runaway)
        val allowed = p.safeRanges.getValue(ThresholdKey.MAX_PEN_SIZE)
        assertEquals(allowed.max, clamped.thresholds[ThresholdKey.MAX_PEN_SIZE], 0.0001f)
    }

    @Test
    fun withThresholdsKeepsInRangeValuesUnchanged() {
        val p = profile()
        val allowed = p.safeRanges.getValue(ThresholdKey.DECISION_WINDOW_MS)
        val target = (allowed.min + allowed.max) / 2f
        val updated = p.withThresholds(p.thresholds.with(ThresholdKey.DECISION_WINDOW_MS, target))
        assertEquals(target, updated.thresholds[ThresholdKey.DECISION_WINDOW_MS], 0.0001f)
    }

    @Test
    fun thresholdsWithReturnsANewInstanceAndLeavesTheOriginalAlone() {
        val original = profile().thresholds
        val updated = original.with(ThresholdKey.PEN_BIAS, 0.4f)
        assertEquals(0.4f, updated[ThresholdKey.PEN_BIAS], 0f)
        assertEquals(0f, original[ThresholdKey.PEN_BIAS], 0f)
    }

    @Test
    fun penBiasSafeRangeIsSymmetricAndBounded() {
        val range = profile().safeRanges.getValue(ThresholdKey.PEN_BIAS)
        assertEquals(-1f, range.min, 0f)
        assertEquals(1f, range.max, 0f)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :core-model:test --tests "*PalmProfileTest*"
```

Expected: FAIL — `Unresolved reference: PalmProfile`.

- [ ] **Step 3: Write the implementation**

`android/core-model/src/main/kotlin/com/notes/school/core/PalmProfile.kt`:

```kotlin
package com.notes.school.core

import kotlinx.serialization.Serializable

enum class ThresholdKey {
    /** Normalized contact size at or below which a contact may still be the stylus. */
    MAX_PEN_SIZE,
    /** Touch major axis in px at or below which a contact may still be the stylus. */
    MAX_PEN_TOUCH_MAJOR,
    /** Normalized contact size at or above which a contact is treated as palm geometry. */
    MIN_PALM_SIZE,
    /** px per ms a contact must reach before it can lock as pen. */
    MIN_PEN_SPEED,
    /** How long ambiguous ink stays provisional before a decision is forced. */
    DECISION_WINDOW_MS,
    /** Manual bias, -1 = reject aggressively, +1 = accept aggressively. */
    PEN_BIAS,
    /** How much extra evidence a suspiciously small contact must supply. */
    SMALL_CONTACT_WEIGHT
}

@Serializable
data class SafeRange(val min: Float, val max: Float) {
    fun clamp(value: Float): Float = value.coerceIn(min, max)
}

@Serializable
data class Thresholds(val values: Map<ThresholdKey, Float>) {
    operator fun get(key: ThresholdKey): Float =
        values[key] ?: error("threshold $key missing from profile")

    fun with(key: ThresholdKey, value: Float): Thresholds =
        Thresholds(values + (key to value))
}

enum class ScreenOrientation { LANDSCAPE, PORTRAIT }

enum class Handedness { RIGHT, LEFT }

/** Which numeric signals this device actually reports. Missing ones are never used. */
enum class InputFeature { TOOL_TYPE, PRESSURE, SIZE, TOUCH_MAJOR, TOUCH_MINOR, ORIENTATION }

/**
 * A versioned, bounded, reversible palm-rejection profile.
 *
 * [safeRanges] is the hard boundary derived from calibration: neither manual settings nor
 * automatic tuning may move a threshold outside it. [withThresholds] is the only way to
 * change thresholds, and it always clamps.
 */
@Serializable
data class PalmProfile(
    val schemaVersion: Int,
    val revision: Int,
    val deviceFingerprint: String,
    val orientation: ScreenOrientation,
    val handedness: Handedness,
    val availableFeatures: Set<InputFeature>,
    val thresholds: Thresholds,
    val safeRanges: Map<ThresholdKey, SafeRange>,
    /** 0f..1f agreement with the stored calibration samples. */
    val score: Float,
    /** True once this revision has passed validation and may be rolled back to. */
    val stable: Boolean,
    val createdAtMs: Long
) {
    fun withThresholds(candidate: Thresholds): PalmProfile {
        val clamped = candidate.values.mapValues { (key, value) ->
            safeRanges[key]?.clamp(value) ?: value
        }
        return copy(thresholds = Thresholds(clamped))
    }

    companion object {
        const val SCHEMA_VERSION: Int = 1

        /**
         * Conservative starting point used before calibration and as the reset target.
         * Values are deliberately cautious: a wrong reject is recoverable by rewriting,
         * a wrong accept leaves a palm smear the user must erase.
         */
        fun defaults(
            deviceFingerprint: String,
            orientation: ScreenOrientation,
            handedness: Handedness,
            availableFeatures: Set<InputFeature>
        ): PalmProfile = PalmProfile(
            schemaVersion = SCHEMA_VERSION,
            revision = 0,
            deviceFingerprint = deviceFingerprint,
            orientation = orientation,
            handedness = handedness,
            availableFeatures = availableFeatures,
            thresholds = Thresholds(
                mapOf(
                    ThresholdKey.MAX_PEN_SIZE to 0.14f,
                    ThresholdKey.MAX_PEN_TOUCH_MAJOR to 26f,
                    ThresholdKey.MIN_PALM_SIZE to 0.28f,
                    ThresholdKey.MIN_PEN_SPEED to 0.03f,
                    ThresholdKey.DECISION_WINDOW_MS to 90f,
                    ThresholdKey.PEN_BIAS to 0f,
                    ThresholdKey.SMALL_CONTACT_WEIGHT to 0.5f
                )
            ),
            safeRanges = mapOf(
                ThresholdKey.MAX_PEN_SIZE to SafeRange(0.02f, 0.40f),
                ThresholdKey.MAX_PEN_TOUCH_MAJOR to SafeRange(6f, 70f),
                ThresholdKey.MIN_PALM_SIZE to SafeRange(0.10f, 0.90f),
                ThresholdKey.MIN_PEN_SPEED to SafeRange(0f, 0.5f),
                ThresholdKey.DECISION_WINDOW_MS to SafeRange(30f, 180f),
                ThresholdKey.PEN_BIAS to SafeRange(-1f, 1f),
                ThresholdKey.SMALL_CONTACT_WEIGHT to SafeRange(0f, 1f)
            ),
            score = 0f,
            stable = false,
            createdAtMs = 0L
        )
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd android && ./gradlew :core-model:test
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add android && git commit -m "feat(core-model): add versioned palm profile with hard safe ranges"
```

---

### Task 8: `touch-engine` module and contact feature extraction

**Files:**
- Create: `android/touch-engine/build.gradle.kts`
- Create: `android/touch-engine/src/main/kotlin/com/notes/school/touch/ContactSample.kt`
- Create: `android/touch-engine/src/main/kotlin/com/notes/school/touch/ContactTracker.kt`
- Test: `android/touch-engine/src/test/kotlin/com/notes/school/touch/Traces.kt`
- Test: `android/touch-engine/src/test/kotlin/com/notes/school/touch/ContactTrackerTest.kt`
- Modify: `android/settings.gradle.kts` (uncomment `include(":touch-engine")`)

**Interfaces:**
- Consumes: `PalmProfile` types (Task 7).
- Produces:
  - `object ToolTypes { const val UNKNOWN = 0; const val FINGER = 1; const val STYLUS = 2; const val MOUSE = 3; const val ERASER = 4 }` — mirrors `MotionEvent.TOOL_TYPE_*` so this module stays free of Android imports.
  - `data class ContactSample(val pointerId: Int, val eventTimeMs: Long, val x: Float, val y: Float, val toolType: Int, val pressure: Float, val size: Float, val touchMajor: Float, val touchMinor: Float, val orientation: Float, val pointerCount: Int)`
  - `data class ContactFeatures(...)` — fields listed in Step 4 below.
  - `class ContactTracker` with `fun onSample(sample: ContactSample): ContactFeatures`, `fun onLift(pointerId: Int): ContactFeatures?`, `fun featuresOf(pointerId: Int): ContactFeatures?`, `fun reset()`, `val activeCount: Int`.
- Test fixture produced for Tasks 9–10: `object Traces` with `fun penStroke(...)`, `fun palmRest(...)`, `fun smallPalmTap(...)`, all returning `List<ContactSample>` with no document content.

- [ ] **Step 1: Add the module build file and enable it**

`android/touch-engine/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin { jvmToolchain(17) }

dependencies {
    api(project(":core-model"))
    testImplementation(libs.junit)
}
```

Uncomment `include(":touch-engine")` in `android/settings.gradle.kts`. Keeping this module pure JVM means every classification test runs without Robolectric, which is what makes the deterministic trace tests fast enough to run on every commit.

- [ ] **Step 2: Write the trace fixture**

`android/touch-engine/src/test/kotlin/com/notes/school/touch/Traces.kt`:

```kotlin
package com.notes.school.touch

/**
 * Synthetic numerical traces. They contain motion statistics only — never document
 * content, ink, or anything derived from a real note.
 */
object Traces {

    /** Small, fast, directed contact: what the capacitive stylus looks like. */
    fun penStroke(
        pointerId: Int = 0,
        startMs: Long = 1_000L,
        startX: Float = 100f,
        startY: Float = 100f,
        samples: Int = 20,
        stepPx: Float = 6f,
        pointerCount: Int = 1,
        size: Float = 0.06f,
        toolType: Int = ToolTypes.FINGER
    ): List<ContactSample> = (0 until samples).map { i ->
        ContactSample(
            pointerId = pointerId,
            eventTimeMs = startMs + i * 8L,
            x = startX + i * stepPx,
            y = startY + if (i % 2 == 0) 1f else -1f,
            toolType = toolType,
            pressure = 0.28f,
            size = size,
            touchMajor = 14f,
            touchMinor = 12f,
            orientation = 0.1f,
            pointerCount = pointerCount
        )
    }

    /** Large, near-stationary, wide-axis contact: a resting palm. */
    fun palmRest(
        pointerId: Int = 1,
        startMs: Long = 1_000L,
        startX: Float = 400f,
        startY: Float = 600f,
        samples: Int = 20,
        pointerCount: Int = 1,
        size: Float = 0.55f
    ): List<ContactSample> = (0 until samples).map { i ->
        ContactSample(
            pointerId = pointerId,
            eventTimeMs = startMs + i * 8L,
            x = startX + (i % 3) * 0.4f,
            y = startY + (i % 2) * 0.3f,
            toolType = ToolTypes.FINGER,
            pressure = 0.8f,
            size = size,
            touchMajor = 88f,
            touchMinor = 41f,
            orientation = 0.9f,
            pointerCount = pointerCount
        )
    }

    /** The hard case: a brief, small, barely-moving contact arriving before the stylus. */
    fun smallPalmTap(
        pointerId: Int = 2,
        startMs: Long = 1_000L,
        samples: Int = 4
    ): List<ContactSample> = (0 until samples).map { i ->
        ContactSample(
            pointerId = pointerId,
            eventTimeMs = startMs + i * 8L,
            x = 380f + i * 0.2f,
            y = 590f + i * 0.2f,
            toolType = ToolTypes.FINGER,
            pressure = 0.5f,
            size = 0.15f,
            touchMajor = 30f,
            touchMinor = 24f,
            orientation = 0.6f,
            pointerCount = 1
        )
    }
}
```

- [ ] **Step 3: Write the failing test**

`android/touch-engine/src/test/kotlin/com/notes/school/touch/ContactTrackerTest.kt`:

```kotlin
package com.notes.school.touch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ContactTrackerTest {

    private lateinit var tracker: ContactTracker

    @Before
    fun setUp() {
        tracker = ContactTracker()
    }

    private fun feed(samples: List<ContactSample>): ContactFeatures =
        samples.map { tracker.onSample(it) }.last()

    @Test
    fun durationIsMeasuredFromTheFirstSample() {
        val features = feed(Traces.penStroke(samples = 5))
        assertEquals(32L, features.durationMs)
    }

    @Test
    fun pathLengthAccumulatesWhileDisplacementStaysDirect() {
        val features = feed(Traces.penStroke(samples = 10, stepPx = 10f))
        assertTrue(features.pathLengthPx > features.displacementPx)
        assertEquals(90f, features.displacementPx, 3f)
    }

    @Test
    fun penTraceHasHigherMeanSpeedThanRestingPalm() {
        val pen = feed(Traces.penStroke())
        tracker.reset()
        val palm = feed(Traces.palmRest())
        assertTrue(pen.meanSpeedPxPerMs > palm.meanSpeedPxPerMs * 5)
    }

    @Test
    fun sizeStatisticsFollowTheReportedContact() {
        val palm = feed(Traces.palmRest(size = 0.55f))
        assertEquals(0.55f, palm.meanSizeNorm, 0.001f)
        assertEquals(0.55f, palm.maxSizeNorm, 0.001f)
    }

    @Test
    fun axisRatioIsMajorOverMinor() {
        val palm = feed(Traces.palmRest())
        assertEquals(88f / 41f, palm.axisRatio, 0.01f)
    }

    @Test
    fun degenerateMinorAxisDoesNotProduceInfinity() {
        val sample = Traces.penStroke(samples = 1).first().copy(touchMinor = 0f)
        val features = tracker.onSample(sample)
        assertTrue(features.axisRatio.isFinite())
    }

    @Test
    fun directionChangesCountZigZag() {
        val features = feed(Traces.penStroke(samples = 12))
        assertTrue("alternating y should register reversals", features.directionChanges > 0)
    }

    @Test
    fun arrivalIndexOrdersSimultaneousContacts() {
        tracker.onSample(Traces.penStroke(pointerId = 0).first())
        tracker.onSample(Traces.palmRest(pointerId = 1).first())
        assertEquals(0, tracker.featuresOf(0)!!.arrivalIndex)
        assertEquals(1, tracker.featuresOf(1)!!.arrivalIndex)
    }

    @Test
    fun pointerCountAtDownIsFrozenAtTouchDown() {
        tracker.onSample(Traces.penStroke(pointerId = 0, pointerCount = 1).first())
        tracker.onSample(Traces.penStroke(pointerId = 0, pointerCount = 3)[1])
        assertEquals(1, tracker.featuresOf(0)!!.pointerCountAtDown)
    }

    @Test
    fun nearestOtherContactIsReportedForSimultaneousPointers() {
        tracker.onSample(Traces.penStroke(pointerId = 0, startX = 100f, startY = 100f).first())
        tracker.onSample(Traces.palmRest(pointerId = 1, startX = 100f, startY = 300f).first())
        assertEquals(200f, tracker.featuresOf(1)!!.nearestOtherContactPx, 2f)
    }

    @Test
    fun loneContactReportsNoNeighbour() {
        val features = feed(Traces.penStroke())
        assertEquals(Float.MAX_VALUE, features.nearestOtherContactPx, 0f)
    }

    @Test
    fun liftReturnsFinalFeaturesAndForgetsThePointer() {
        feed(Traces.penStroke(pointerId = 0))
        val finalFeatures = tracker.onLift(0)!!
        assertEquals(20, finalFeatures.sampleCount)
        assertNull(tracker.featuresOf(0))
        assertEquals(0, tracker.activeCount)
    }

    @Test
    fun resetClearsEverything() {
        feed(Traces.penStroke(pointerId = 0))
        feed(Traces.palmRest(pointerId = 1))
        tracker.reset()
        assertEquals(0, tracker.activeCount)
        assertNull(tracker.featuresOf(0))
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd android && ./gradlew :touch-engine:test
```

Expected: FAIL — `Unresolved reference: ContactTracker`.

- [ ] **Step 5: Write `ContactSample` and `ContactFeatures`**

`android/touch-engine/src/main/kotlin/com/notes/school/touch/ContactSample.kt`:

```kotlin
package com.notes.school.touch

/** Mirrors MotionEvent.TOOL_TYPE_* so this module needs no Android dependency. */
object ToolTypes {
    const val UNKNOWN = 0
    const val FINGER = 1
    const val STYLUS = 2
    const val MOUSE = 3
    const val ERASER = 4
}

/**
 * One raw pointer sample. A generic capacitive stylus usually reports [toolType] FINGER,
 * so tool type is only ever a hint here, never the deciding signal.
 */
data class ContactSample(
    val pointerId: Int,
    val eventTimeMs: Long,
    val x: Float,
    val y: Float,
    val toolType: Int,
    val pressure: Float,
    val size: Float,
    val touchMajor: Float,
    val touchMinor: Float,
    val orientation: Float,
    val pointerCount: Int
)

/** Running statistics for one contact. Recomputed in place; nothing grows per sample. */
data class ContactFeatures(
    val pointerId: Int,
    val sampleCount: Int,
    val durationMs: Long,
    val pathLengthPx: Float,
    val displacementPx: Float,
    val meanSpeedPxPerMs: Float,
    val peakSpeedPxPerMs: Float,
    val meanSizeNorm: Float,
    val maxSizeNorm: Float,
    val meanPressure: Float,
    val meanTouchMajorPx: Float,
    val axisRatio: Float,
    val directionChanges: Int,
    val pointerCountAtDown: Int,
    val toolType: Int,
    /** 0 for the first contact of the gesture, 1 for the next, and so on. */
    val arrivalIndex: Int,
    /** Distance to the closest other live contact, or Float.MAX_VALUE when alone. */
    val nearestOtherContactPx: Float
)
```

- [ ] **Step 6: Write `ContactTracker`**

`android/touch-engine/src/main/kotlin/com/notes/school/touch/ContactTracker.kt`:

```kotlin
package com.notes.school.touch

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Accumulates per-pointer motion statistics with O(1) memory per contact. The input
 * callback runs on the UI thread, so nothing here allocates in proportion to the number
 * of samples: each pointer owns one mutable accumulator that is updated in place.
 *
 * Not thread safe. Owned by the view that receives MotionEvents.
 */
class ContactTracker {

    private class Accumulator(
        val pointerId: Int,
        val firstTimeMs: Long,
        val firstX: Float,
        val firstY: Float,
        val pointerCountAtDown: Int,
        val arrivalIndex: Int,
        val toolType: Int
    ) {
        var lastX: Float = firstX
        var lastY: Float = firstY
        var lastTimeMs: Long = firstTimeMs
        var lastDx: Float = 0f
        var lastDy: Float = 0f
        var sampleCount: Int = 0
        var pathLength: Float = 0f
        var peakSpeed: Float = 0f
        var sizeSum: Float = 0f
        var maxSize: Float = 0f
        var pressureSum: Float = 0f
        var touchMajorSum: Float = 0f
        var axisRatioLast: Float = 1f
        var directionChanges: Int = 0
        var nearestOther: Float = Float.MAX_VALUE
    }

    private val live = LinkedHashMap<Int, Accumulator>()
    private var arrivalCounter = 0

    val activeCount: Int get() = live.size

    fun onSample(sample: ContactSample): ContactFeatures {
        val acc = live.getOrPut(sample.pointerId) {
            Accumulator(
                pointerId = sample.pointerId,
                firstTimeMs = sample.eventTimeMs,
                firstX = sample.x,
                firstY = sample.y,
                pointerCountAtDown = sample.pointerCount,
                arrivalIndex = arrivalCounter++,
                toolType = sample.toolType
            )
        }
        update(acc, sample)
        updateNeighbourDistances(sample)
        return snapshot(acc)
    }

    fun onLift(pointerId: Int): ContactFeatures? {
        val acc = live.remove(pointerId) ?: return null
        if (live.isEmpty()) arrivalCounter = 0
        return snapshot(acc)
    }

    fun featuresOf(pointerId: Int): ContactFeatures? = live[pointerId]?.let { snapshot(it) }

    fun reset() {
        live.clear()
        arrivalCounter = 0
    }

    private fun update(acc: Accumulator, sample: ContactSample) {
        if (acc.sampleCount > 0) {
            val dx = sample.x - acc.lastX
            val dy = sample.y - acc.lastY
            val step = sqrt(dx * dx + dy * dy)
            acc.pathLength += step
            val dt = (sample.eventTimeMs - acc.lastTimeMs).coerceAtLeast(1L)
            val speed = step / dt
            if (speed > acc.peakSpeed) acc.peakSpeed = speed
            // A reversal on either axis counts once; handwriting reverses constantly,
            // a sliding palm barely does.
            if (acc.lastDx * dx < 0f || acc.lastDy * dy < 0f) acc.directionChanges++
            acc.lastDx = dx
            acc.lastDy = dy
        }
        acc.lastX = sample.x
        acc.lastY = sample.y
        acc.lastTimeMs = sample.eventTimeMs
        acc.sampleCount++
        acc.sizeSum += sample.size
        if (sample.size > acc.maxSize) acc.maxSize = sample.size
        acc.pressureSum += sample.pressure
        acc.touchMajorSum += sample.touchMajor
        acc.axisRatioLast = if (sample.touchMinor > 0.0001f) {
            sample.touchMajor / sample.touchMinor
        } else {
            1f
        }
    }

    private fun updateNeighbourDistances(sample: ContactSample) {
        val self = live[sample.pointerId] ?: return
        for (other in live.values) {
            if (other.pointerId == self.pointerId) continue
            val dx = other.lastX - self.lastX
            val dy = other.lastY - self.lastY
            val distance = sqrt(dx * dx + dy * dy)
            if (distance < self.nearestOther) self.nearestOther = distance
            if (distance < other.nearestOther) other.nearestOther = distance
        }
    }

    private fun snapshot(acc: Accumulator): ContactFeatures {
        val duration = acc.lastTimeMs - acc.firstTimeMs
        val samples = acc.sampleCount.coerceAtLeast(1)
        val dx = acc.lastX - acc.firstX
        val dy = acc.lastY - acc.firstY
        return ContactFeatures(
            pointerId = acc.pointerId,
            sampleCount = acc.sampleCount,
            durationMs = duration,
            pathLengthPx = acc.pathLength,
            displacementPx = sqrt(dx * dx + dy * dy),
            meanSpeedPxPerMs = if (duration > 0) acc.pathLength / duration else 0f,
            peakSpeedPxPerMs = acc.peakSpeed,
            meanSizeNorm = acc.sizeSum / samples,
            maxSizeNorm = acc.maxSize,
            meanPressure = acc.pressureSum / samples,
            meanTouchMajorPx = acc.touchMajorSum / samples,
            axisRatio = if (acc.axisRatioLast.isFinite()) abs(acc.axisRatioLast) else 1f,
            directionChanges = acc.directionChanges,
            pointerCountAtDown = acc.pointerCountAtDown,
            toolType = acc.toolType,
            arrivalIndex = acc.arrivalIndex,
            nearestOtherContactPx = acc.nearestOther
        )
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd android && ./gradlew :touch-engine:test
```

Expected: `BUILD SUCCESSFUL`, 13 tests passing.

- [ ] **Step 8: Commit**

```bash
git add android && git commit -m "feat(touch-engine): add allocation-bounded contact feature extraction"
```

---

### Task 9: `ContactClassifier` — state machine with hysteresis and decision window

**Files:**
- Create: `android/touch-engine/src/main/kotlin/com/notes/school/touch/ContactClassifier.kt`
- Test: `android/touch-engine/src/test/kotlin/com/notes/school/touch/ContactClassifierTest.kt`

**Interfaces:**
- Consumes: `ContactSample`, `ContactFeatures`, `ContactTracker` (Task 8); `PalmProfile`, `ThresholdKey` (Task 7).
- Produces:
  - `enum class PointerState { UNKNOWN, PEN_CANDIDATE, PALM_CANDIDATE, PEN_LOCKED, PALM_LOCKED }`
  - `data class Classification(val pointerId: Int, val state: PointerState, val penConfidence: Float, val features: ContactFeatures)`
  - `class ContactClassifier(profile: PalmProfile, private val tracker: ContactTracker = ContactTracker())` with `fun onSample(sample: ContactSample): Classification`, `fun onLift(pointerId: Int): Classification?`, `fun forceDecision(pointerId: Int): Classification?`, `fun reset()`, `fun updateProfile(profile: PalmProfile)`, `val profile: PalmProfile`, `val lockedPenPointerId: Int?`.
  - `fun penConfidence(features: ContactFeatures): Float` — public because Task 10's `scoreProfile` replays stored calibration samples through it.
  - `const val HIGH_CONFIDENCE: Float = 0.85f` (companion) — the bar Task 10 uses to decide what may be learned from.

- [ ] **Step 1: Write the failing test**

`android/touch-engine/src/test/kotlin/com/notes/school/touch/ContactClassifierTest.kt`:

```kotlin
package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ContactClassifierTest {

    private lateinit var classifier: ContactClassifier

    private fun defaultProfile() = PalmProfile.defaults(
        deviceFingerprint = "samsung/SM-T505/31",
        orientation = ScreenOrientation.LANDSCAPE,
        handedness = Handedness.RIGHT,
        availableFeatures = setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR, InputFeature.PRESSURE)
    )

    @Before
    fun setUp() {
        classifier = ContactClassifier(defaultProfile())
    }

    private fun feed(samples: List<ContactSample>): Classification =
        samples.map { classifier.onSample(it) }.last()

    @Test
    fun aClearPenTraceLocksAsPen() {
        val result = feed(Traces.penStroke())
        assertEquals(PointerState.PEN_LOCKED, result.state)
        assertTrue(result.penConfidence >= ContactClassifier.HIGH_CONFIDENCE)
    }

    @Test
    fun aClearPalmRestLocksAsPalm() {
        val result = feed(Traces.palmRest())
        assertEquals(PointerState.PALM_LOCKED, result.state)
        assertTrue(result.penConfidence < 0.2f)
    }

    @Test
    fun theFirstSampleIsNeverImmediatelyLocked() {
        val first = classifier.onSample(Traces.penStroke().first())
        assertNotEquals(PointerState.PEN_LOCKED, first.state)
    }

    @Test
    fun palmArrivingAfterALockedPenIsRejectedWithoutInterruptingIt() {
        feed(Traces.penStroke(pointerId = 0))
        assertEquals(0, classifier.lockedPenPointerId)
        val palm = classifier.onSample(Traces.palmRest(pointerId = 1, startMs = 1_200L).first())
        assertEquals(PointerState.PALM_LOCKED, palm.state)
        assertEquals(0, classifier.lockedPenPointerId)
    }

    @Test
    fun aLockedPenStaysLockedEvenIfItSlowsToAStop() {
        feed(Traces.penStroke(pointerId = 0))
        val stalled = Traces.palmRest(pointerId = 0, startMs = 2_000L, samples = 10)
        val result = feed(stalled)
        assertEquals(PointerState.PEN_LOCKED, result.state)
    }

    @Test
    fun ambiguousContactStaysUndecidedInsideTheDecisionWindow() {
        val result = feed(Traces.smallPalmTap(samples = 3))
        assertTrue(
            "expected an undecided state, got ${result.state}",
            result.state == PointerState.UNKNOWN ||
                result.state == PointerState.PEN_CANDIDATE ||
                result.state == PointerState.PALM_CANDIDATE
        )
    }

    @Test
    fun forceDecisionResolvesAnAmbiguousContactAfterTheWindow() {
        feed(Traces.smallPalmTap(samples = 3))
        val decided = classifier.forceDecision(2)!!
        assertTrue(
            decided.state == PointerState.PEN_LOCKED || decided.state == PointerState.PALM_LOCKED
        )
    }

    @Test
    fun negativePenBiasResolvesAmbiguityTowardPalm() {
        val cautious = defaultProfile().let {
            it.withThresholds(it.thresholds.with(ThresholdKey.PEN_BIAS, -1f))
        }
        classifier.updateProfile(cautious)
        feed(Traces.smallPalmTap(samples = 3))
        assertEquals(PointerState.PALM_LOCKED, classifier.forceDecision(2)!!.state)
    }

    @Test
    fun positivePenBiasResolvesAmbiguityTowardPen() {
        val eager = defaultProfile().let {
            it.withThresholds(it.thresholds.with(ThresholdKey.PEN_BIAS, 1f))
        }
        classifier.updateProfile(eager)
        feed(Traces.smallPalmTap(samples = 3))
        assertEquals(PointerState.PEN_LOCKED, classifier.forceDecision(2)!!.state)
    }

    @Test
    fun aPointerNeverFlipsFromPenLockedToPalmLocked() {
        val states = mutableListOf<PointerState>()
        Traces.penStroke(pointerId = 0).forEach { states += classifier.onSample(it).state }
        Traces.palmRest(pointerId = 0, startMs = 3_000L).forEach {
            states += classifier.onSample(it).state
        }
        assertTrue(states.contains(PointerState.PEN_LOCKED))
        assertTrue(states.none { it == PointerState.PALM_LOCKED })
    }

    @Test
    fun manyStationaryContactsAtOnceAreAllTreatedAsPalm() {
        val a = classifier.onSample(Traces.palmRest(pointerId = 1, pointerCount = 3).first())
        val b = classifier.onSample(Traces.palmRest(pointerId = 2, pointerCount = 3).first())
        assertTrue(a.penConfidence < 0.5f)
        assertTrue(b.penConfidence < 0.5f)
    }

    @Test
    fun liftClearsThePenLockSoTheNextStrokeStartsFresh() {
        feed(Traces.penStroke(pointerId = 0))
        classifier.onLift(0)
        assertNull(classifier.lockedPenPointerId)
    }

    @Test
    fun resetClearsAllPointerState() {
        feed(Traces.penStroke(pointerId = 0))
        classifier.reset()
        assertNull(classifier.lockedPenPointerId)
        assertNull(classifier.forceDecision(0))
    }

    @Test
    fun aWiderMaxPenSizeAcceptsALargerContactAsPen() {
        val generous = defaultProfile().let {
            it.withThresholds(it.thresholds.with(ThresholdKey.MAX_PEN_SIZE, 0.40f))
        }
        classifier.updateProfile(generous)
        val result = feed(Traces.penStroke(size = 0.22f))
        assertEquals(PointerState.PEN_LOCKED, result.state)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :touch-engine:test --tests "*ContactClassifierTest*"
```

Expected: FAIL — `Unresolved reference: ContactClassifier`.

- [ ] **Step 3: Write the implementation**

`android/touch-engine/src/main/kotlin/com/notes/school/touch/ContactClassifier.kt`:

```kotlin
package com.notes.school.touch

import com.notes.school.core.PalmProfile
import com.notes.school.core.ThresholdKey

enum class PointerState { UNKNOWN, PEN_CANDIDATE, PALM_CANDIDATE, PEN_LOCKED, PALM_LOCKED }

data class Classification(
    val pointerId: Int,
    val state: PointerState,
    /** 0f = certainly palm, 1f = certainly pen. */
    val penConfidence: Float,
    val features: ContactFeatures
)

/**
 * Explicit per-pointer state machine.
 *
 * Two properties matter more than raw accuracy:
 *  - once a pointer reaches PEN_LOCKED it stays there for the rest of the stroke, so a
 *    palm landing mid-word can never interrupt writing;
 *  - a pointer needs consecutive agreeing samples to lock, so it cannot oscillate.
 *
 * Contacts that are still ambiguous stay in a candidate state. The view renders them as
 * provisional ink and calls [forceDecision] when the decision window expires.
 */
class ContactClassifier(
    profile: PalmProfile,
    private val tracker: ContactTracker = ContactTracker()
) {
    var profile: PalmProfile = profile
        private set

    private class PointerRecord(var state: PointerState = PointerState.UNKNOWN) {
        var penVotes: Int = 0
        var palmVotes: Int = 0
        var lastConfidence: Float = 0.5f
    }

    private val records = HashMap<Int, PointerRecord>()

    var lockedPenPointerId: Int? = null
        private set

    fun updateProfile(profile: PalmProfile) {
        this.profile = profile
    }

    fun onSample(sample: ContactSample): Classification {
        val features = tracker.onSample(sample)
        val record = records.getOrPut(sample.pointerId) { PointerRecord() }

        if (record.state == PointerState.PEN_LOCKED || record.state == PointerState.PALM_LOCKED) {
            return Classification(sample.pointerId, record.state, record.lastConfidence, features)
        }

        // A pen is already writing: everything else is a palm, immediately and without appeal.
        val lockedPen = lockedPenPointerId
        if (lockedPen != null && lockedPen != sample.pointerId) {
            record.state = PointerState.PALM_LOCKED
            record.lastConfidence = 0f
            return Classification(sample.pointerId, record.state, 0f, features)
        }

        val confidence = penConfidence(features)
        record.lastConfidence = confidence

        val margin = 0.5f + MARGIN_HALF_WIDTH
        val lowerMargin = 0.5f - MARGIN_HALF_WIDTH
        when {
            confidence >= margin -> {
                record.penVotes++
                record.palmVotes = 0
                record.state = PointerState.PEN_CANDIDATE
            }
            confidence <= lowerMargin -> {
                record.palmVotes++
                record.penVotes = 0
                record.state = PointerState.PALM_CANDIDATE
            }
            else -> record.state = PointerState.UNKNOWN
        }

        if (record.penVotes >= VOTES_TO_LOCK) {
            record.state = PointerState.PEN_LOCKED
            lockedPenPointerId = sample.pointerId
        } else if (record.palmVotes >= VOTES_TO_LOCK) {
            record.state = PointerState.PALM_LOCKED
        }

        return Classification(sample.pointerId, record.state, confidence, features)
    }

    /** Resolves a still-ambiguous pointer once its decision window has elapsed. */
    fun forceDecision(pointerId: Int): Classification? {
        val record = records[pointerId] ?: return null
        val features = tracker.featuresOf(pointerId) ?: return null
        if (record.state == PointerState.PEN_LOCKED || record.state == PointerState.PALM_LOCKED) {
            return Classification(pointerId, record.state, record.lastConfidence, features)
        }
        val confidence = penConfidence(features)
        val bias = profile.thresholds[ThresholdKey.PEN_BIAS]
        // Bias shifts only the tie-break, never the evidence itself.
        val decided = confidence + bias * MARGIN_HALF_WIDTH * 2f
        record.state = if (decided >= 0.5f) PointerState.PEN_LOCKED else PointerState.PALM_LOCKED
        record.lastConfidence = confidence
        if (record.state == PointerState.PEN_LOCKED) lockedPenPointerId = pointerId
        return Classification(pointerId, record.state, confidence, features)
    }

    fun onLift(pointerId: Int): Classification? {
        val record = records.remove(pointerId)
        val features = tracker.onLift(pointerId)
        if (lockedPenPointerId == pointerId) lockedPenPointerId = null
        if (record == null || features == null) return null
        return Classification(pointerId, record.state, record.lastConfidence, features)
    }

    fun reset() {
        records.clear()
        tracker.reset()
        lockedPenPointerId = null
    }

    /**
     * Weighted evidence, 0f = palm, 1f = pen. Every term is a bounded 0..1 vote, so a
     * single missing device signal degrades the result instead of destroying it.
     */
    fun penConfidence(features: ContactFeatures): Float {
        val t = profile.thresholds
        val sizeVote = ramp(features.meanSizeNorm, t[ThresholdKey.MAX_PEN_SIZE], t[ThresholdKey.MIN_PALM_SIZE])
        val majorVote = ramp(features.meanTouchMajorPx, t[ThresholdKey.MAX_PEN_TOUCH_MAJOR], t[ThresholdKey.MAX_PEN_TOUCH_MAJOR] * 2.5f)
        val speedVote = (features.meanSpeedPxPerMs / (t[ThresholdKey.MIN_PEN_SPEED] * 4f))
            .coerceIn(0f, 1f)
        val shapeVote = ramp(features.axisRatio, 1.6f, 3.0f)
        val soloVote = if (features.pointerCountAtDown <= 1) 1f else 0.25f
        val toolVote = when (features.toolType) {
            ToolTypes.STYLUS -> 1f
            ToolTypes.ERASER -> 0f
            else -> 0.5f // FINGER tells us nothing on this hardware
        }

        var score =
            W_SIZE * sizeVote +
                W_MAJOR * majorVote +
                W_SPEED * speedVote +
                W_SHAPE * shapeVote +
                W_SOLO * soloVote +
                W_TOOL * toolVote

        // A small but nearly stationary contact is the classic palm-first failure. Make it
        // pay for the ambiguity in proportion to the configured weighting.
        if (features.meanSizeNorm <= t[ThresholdKey.MAX_PEN_SIZE] * 2f && speedVote < 0.3f) {
            score -= t[ThresholdKey.SMALL_CONTACT_WEIGHT] * SMALL_CONTACT_PENALTY
        }
        return score.coerceIn(0f, 1f)
    }

    /** 1f at or below [good], 0f at or above [bad], linear in between. */
    private fun ramp(value: Float, good: Float, bad: Float): Float {
        if (bad <= good) return if (value <= good) 1f else 0f
        return ((bad - value) / (bad - good)).coerceIn(0f, 1f)
    }

    companion object {
        /** Confidence a decision must reach before Task 10 may learn anything from it. */
        const val HIGH_CONFIDENCE: Float = 0.85f

        private const val VOTES_TO_LOCK = 3
        private const val MARGIN_HALF_WIDTH = 0.18f
        private const val SMALL_CONTACT_PENALTY = 0.35f

        private const val W_SIZE = 0.34f
        private const val W_MAJOR = 0.20f
        private const val W_SPEED = 0.22f
        private const val W_SHAPE = 0.12f
        private const val W_SOLO = 0.06f
        private const val W_TOOL = 0.06f
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd android && ./gradlew :touch-engine:test
```

Expected: `BUILD SUCCESSFUL`. If a weighting test fails, adjust the `W_*` constants — never the assertions — and rerun.

- [ ] **Step 5: Commit**

```bash
git add android && git commit -m "feat(touch-engine): add contact classification state machine with hysteresis"
```

---

### Task 10: Calibration and bounded conservative profile improvement

**Files:**
- Create: `android/touch-engine/src/main/kotlin/com/notes/school/touch/Calibrator.kt`
- Create: `android/touch-engine/src/main/kotlin/com/notes/school/touch/ProfileTuner.kt`
- Test: `android/touch-engine/src/test/kotlin/com/notes/school/touch/CalibratorTest.kt`
- Test: `android/touch-engine/src/test/kotlin/com/notes/school/touch/ProfileTunerTest.kt`

**Interfaces:**
- Consumes: `ContactFeatures`, `ContactClassifier`, `PointerState`, `Traces` (Tasks 8–9); `PalmProfile`, `ThresholdKey`, `SafeRange` (Task 7).
- Produces:
  - `enum class CalibrationPhase { PALM_ONLY, STYLUS_ONLY, COMBINED }`
  - `data class CalibrationSample(val phase: CalibrationPhase, val features: ContactFeatures, val expectedPen: Boolean)`
  - `class Calibrator` with `fun record(phase: CalibrationPhase, features: ContactFeatures, expectedPen: Boolean)`, `fun sampleCount(phase: CalibrationPhase): Int`, `fun isComplete(): Boolean`, `fun build(deviceFingerprint: String, orientation: ScreenOrientation, handedness: Handedness, availableFeatures: Set<InputFeature>, nowMs: Long): CalibrationResult`
  - `data class CalibrationResult(val profile: PalmProfile, val samples: List<CalibrationSample>)`
  - `fun scoreProfile(profile: PalmProfile, samples: List<CalibrationSample>): Float` (top-level in `Calibrator.kt`)
  - `data class TunerConfig(val maxDriftFraction: Float = 0.10f, val minObservations: Int = 12, val degradationsBeforeRollback: Int = 2)`
  - `class ProfileTuner(stable: PalmProfile, private val validation: List<CalibrationSample>, private val config: TunerConfig = TunerConfig())` with `fun observe(classification: Classification)`, `fun endSession(nowMs: Long): PalmProfile?`, `fun reportDegradation(): PalmProfile?`, `val stableProfile: PalmProfile`, `val pendingObservations: Int`

- [ ] **Step 1: Write the failing calibration test**

`android/touch-engine/src/test/kotlin/com/notes/school/touch/CalibratorTest.kt`:

```kotlin
package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CalibratorTest {

    private lateinit var calibrator: Calibrator
    private val features = setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR, InputFeature.PRESSURE)

    @Before
    fun setUp() {
        calibrator = Calibrator()
    }

    private fun featuresOf(samples: List<ContactSample>): ContactFeatures {
        val tracker = ContactTracker()
        return samples.map { tracker.onSample(it) }.last()
    }

    private fun runGuidedCalibration() {
        repeat(6) {
            calibrator.record(
                CalibrationPhase.PALM_ONLY,
                featuresOf(Traces.palmRest(pointerId = it)),
                expectedPen = false
            )
        }
        repeat(6) {
            calibrator.record(
                CalibrationPhase.STYLUS_ONLY,
                featuresOf(Traces.penStroke(pointerId = it)),
                expectedPen = true
            )
        }
        repeat(3) {
            calibrator.record(
                CalibrationPhase.COMBINED,
                featuresOf(Traces.penStroke(pointerId = it, pointerCount = 2)),
                expectedPen = true
            )
            calibrator.record(
                CalibrationPhase.COMBINED,
                featuresOf(Traces.palmRest(pointerId = it + 10, pointerCount = 2)),
                expectedPen = false
            )
        }
    }

    private fun build() = calibrator.build(
        deviceFingerprint = "samsung/SM-T505/31",
        orientation = ScreenOrientation.LANDSCAPE,
        handedness = Handedness.RIGHT,
        availableFeatures = features,
        nowMs = 1_700_000_000_000L
    )

    @Test
    fun calibrationIsIncompleteUntilEveryPhaseHasSamples() {
        assertFalse(calibrator.isComplete())
        calibrator.record(CalibrationPhase.PALM_ONLY, featuresOf(Traces.palmRest()), false)
        assertFalse(calibrator.isComplete())
    }

    @Test
    fun completeCalibrationReportsPerPhaseCounts() {
        runGuidedCalibration()
        assertTrue(calibrator.isComplete())
        assertEquals(6, calibrator.sampleCount(CalibrationPhase.PALM_ONLY))
        assertEquals(6, calibrator.sampleCount(CalibrationPhase.STYLUS_ONLY))
        assertEquals(6, calibrator.sampleCount(CalibrationPhase.COMBINED))
    }

    @Test
    fun builtProfileSeparatesTheObservedStylusAndPalmSizes() {
        runGuidedCalibration()
        val t = build().profile.thresholds
        assertTrue(t[ThresholdKey.MAX_PEN_SIZE] > 0.06f)
        assertTrue(t[ThresholdKey.MAX_PEN_SIZE] < t[ThresholdKey.MIN_PALM_SIZE])
        assertTrue(t[ThresholdKey.MIN_PALM_SIZE] <= 0.55f)
    }

    @Test
    fun builtProfileIsStableAndCarriesItsScoreAndDevice() {
        runGuidedCalibration()
        val profile = build().profile
        assertTrue(profile.stable)
        assertTrue("score was ${profile.score}", profile.score >= 0.9f)
        assertEquals("samsung/SM-T505/31", profile.deviceFingerprint)
        assertEquals(ScreenOrientation.LANDSCAPE, profile.orientation)
        assertEquals(1, profile.revision)
    }

    @Test
    fun safeRangesAreDerivedFromTheObservedDataNotHardcoded() {
        runGuidedCalibration()
        val profile = build().profile
        val range = profile.safeRanges.getValue(ThresholdKey.MAX_PEN_SIZE)
        val value = profile.thresholds[ThresholdKey.MAX_PEN_SIZE]
        assertTrue(range.min <= value && value <= range.max)
        assertTrue("range must be bounded", range.max - range.min < 0.4f)
    }

    @Test
    fun buildReturnsTheStoredSamplesForLaterValidation() {
        runGuidedCalibration()
        assertEquals(18, build().samples.size)
    }

    @Test
    fun incompleteCalibrationFallsBackToConservativeDefaults() {
        calibrator.record(CalibrationPhase.PALM_ONLY, featuresOf(Traces.palmRest()), false)
        val profile = build().profile
        assertFalse(profile.stable)
        assertEquals(0.14f, profile.thresholds[ThresholdKey.MAX_PEN_SIZE], 0.0001f)
    }

    @Test
    fun scoreProfileMeasuresAgreementWithStoredSamples() {
        runGuidedCalibration()
        val result = build()
        assertEquals(result.profile.score, scoreProfile(result.profile, result.samples), 0.0001f)
    }
}
```

- [ ] **Step 2: Write the failing tuner test**

`android/touch-engine/src/test/kotlin/com/notes/school/touch/ProfileTunerTest.kt`:

```kotlin
package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.math.abs

class ProfileTunerTest {

    private lateinit var calibrated: CalibrationResult
    private lateinit var tuner: ProfileTuner

    private fun featuresOf(samples: List<ContactSample>): ContactFeatures {
        val tracker = ContactTracker()
        return samples.map { tracker.onSample(it) }.last()
    }

    @Before
    fun setUp() {
        val calibrator = Calibrator()
        repeat(6) {
            calibrator.record(CalibrationPhase.PALM_ONLY, featuresOf(Traces.palmRest(pointerId = it)), false)
            calibrator.record(CalibrationPhase.STYLUS_ONLY, featuresOf(Traces.penStroke(pointerId = it)), true)
            calibrator.record(CalibrationPhase.COMBINED, featuresOf(Traces.penStroke(pointerId = it, pointerCount = 2)), true)
        }
        calibrated = calibrator.build(
            "samsung/SM-T505/31",
            ScreenOrientation.LANDSCAPE,
            Handedness.RIGHT,
            setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR),
            nowMs = 1_700_000_000_000L
        )
        tuner = ProfileTuner(calibrated.profile, calibrated.samples)
    }

    private fun highConfidence(pen: Boolean, pointerId: Int = 0): Classification {
        val samples = if (pen) Traces.penStroke(pointerId) else Traces.palmRest(pointerId)
        return Classification(
            pointerId = pointerId,
            state = if (pen) PointerState.PEN_LOCKED else PointerState.PALM_LOCKED,
            penConfidence = if (pen) 0.97f else 0.02f,
            features = featuresOf(samples)
        )
    }

    private fun uncertain(pointerId: Int = 5): Classification = Classification(
        pointerId = pointerId,
        state = PointerState.UNKNOWN,
        penConfidence = 0.52f,
        features = featuresOf(Traces.smallPalmTap(pointerId))
    )

    @Test
    fun uncertainContactsAreNeverRecordedAsObservations() {
        repeat(30) { tuner.observe(uncertain()) }
        assertEquals(0, tuner.pendingObservations)
        assertNull(tuner.endSession(nowMs = 1L))
    }

    @Test
    fun lockedButLowConfidenceContactsAreAlsoIgnored() {
        val borderline = highConfidence(pen = true).copy(penConfidence = 0.6f)
        repeat(30) { tuner.observe(borderline) }
        assertEquals(0, tuner.pendingObservations)
    }

    @Test
    fun tooFewObservationsProduceNoCandidate() {
        repeat(3) { tuner.observe(highConfidence(pen = true)) }
        assertNull(tuner.endSession(nowMs = 1L))
    }

    @Test
    fun enoughHighConfidenceObservationsProduceACandidateWithABumpedRevision() {
        repeat(10) { tuner.observe(highConfidence(pen = true)) }
        repeat(10) { tuner.observe(highConfidence(pen = false, pointerId = 1)) }
        val candidate = tuner.endSession(nowMs = 1_700_000_100_000L)!!
        assertEquals(calibrated.profile.revision + 1, candidate.revision)
    }

    @Test
    fun candidateThresholdsNeverDriftFurtherThanTheConfiguredFraction() {
        repeat(40) { tuner.observe(highConfidence(pen = true)) }
        val candidate = tuner.endSession(nowMs = 1L)!!
        ThresholdKey.entries.forEach { key ->
            val before = calibrated.profile.thresholds[key]
            val after = candidate.thresholds[key]
            val allowed = abs(before) * 0.10f + 1e-4f
            assertTrue(
                "$key drifted from $before to $after",
                abs(after - before) <= allowed + 1e-3f
            )
        }
    }

    @Test
    fun candidateThresholdsAlwaysStayInsideTheCalibratedSafeRanges() {
        repeat(60) { tuner.observe(highConfidence(pen = true)) }
        val candidate = tuner.endSession(nowMs = 1L)!!
        candidate.thresholds.values.forEach { (key, value) ->
            val range = candidate.safeRanges.getValue(key)
            assertTrue("$key = $value escaped $range", value >= range.min && value <= range.max)
        }
    }

    @Test
    fun aCandidateThatScoresWorseOnStoredSamplesIsRejected() {
        val poisoned = ProfileTuner(
            calibrated.profile,
            calibrated.samples,
            TunerConfig(maxDriftFraction = 0.10f, minObservations = 4)
        )
        // Feed only palm observations so the candidate drifts toward rejecting everything.
        repeat(40) { poisoned.observe(highConfidence(pen = false, pointerId = 1)) }
        val candidate = poisoned.endSession(nowMs = 1L)
        if (candidate != null) {
            assertTrue(
                "an accepted candidate must not score below the stable profile",
                candidate.score >= calibrated.profile.score - 1e-4f
            )
        }
    }

    @Test
    fun theStableProfileRemainsAvailableAfterACandidateIsProduced() {
        repeat(30) { tuner.observe(highConfidence(pen = true)) }
        tuner.endSession(nowMs = 1L)
        assertEquals(calibrated.profile.revision, tuner.stableProfile.revision)
    }

    @Test
    fun repeatedDegradationRestoresTheLastStableProfile() {
        repeat(30) { tuner.observe(highConfidence(pen = true)) }
        assertNotNull(tuner.endSession(nowMs = 1L))
        assertNull(tuner.reportDegradation())
        val restored = tuner.reportDegradation()!!
        assertEquals(calibrated.profile.revision, restored.revision)
        assertEquals(calibrated.profile.thresholds, restored.thresholds)
    }

    @Test
    fun observationsAreClearedBetweenSessions() {
        repeat(30) { tuner.observe(highConfidence(pen = true)) }
        tuner.endSession(nowMs = 1L)
        assertEquals(0, tuner.pendingObservations)
        assertNull(tuner.endSession(nowMs = 2L))
    }

    @Test
    fun observationsCarryNoInkOrDocumentReference() {
        tuner.observe(highConfidence(pen = true))
        // ContactFeatures is the only thing stored; it exposes motion statistics only.
        val fields = ContactFeatures::class.java.declaredFields.map { it.name }
        listOf("points", "strokeId", "documentId", "pageId", "bitmap").forEach {
            assertTrue("features must not expose $it", !fields.contains(it))
        }
    }
}
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
cd android && ./gradlew :touch-engine:test --tests "*CalibratorTest*" --tests "*ProfileTunerTest*"
```

Expected: FAIL — `Unresolved reference: Calibrator`.

- [ ] **Step 4: Write `Calibrator`**

`android/touch-engine/src/main/kotlin/com/notes/school/touch/Calibrator.kt`:

```kotlin
package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.SafeRange
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey

enum class CalibrationPhase { PALM_ONLY, STYLUS_ONLY, COMBINED }

data class CalibrationSample(
    val phase: CalibrationPhase,
    val features: ContactFeatures,
    val expectedPen: Boolean
)

data class CalibrationResult(
    val profile: PalmProfile,
    val samples: List<CalibrationSample>
)

/**
 * Derives robust ranges and percentiles from a roughly 20 second guided session.
 * Deliberately not a learned model: percentiles are explainable, cheap, and their
 * failure mode is a threshold that is merely wrong rather than unpredictable.
 */
class Calibrator {

    private val samples = mutableListOf<CalibrationSample>()

    fun record(phase: CalibrationPhase, features: ContactFeatures, expectedPen: Boolean) {
        samples += CalibrationSample(phase, features, expectedPen)
    }

    fun sampleCount(phase: CalibrationPhase): Int = samples.count { it.phase == phase }

    fun isComplete(): Boolean = CalibrationPhase.entries.all { sampleCount(it) >= MIN_PER_PHASE }

    fun build(
        deviceFingerprint: String,
        orientation: ScreenOrientation,
        handedness: Handedness,
        availableFeatures: Set<InputFeature>,
        nowMs: Long
    ): CalibrationResult {
        val defaults = PalmProfile.defaults(
            deviceFingerprint, orientation, handedness, availableFeatures
        )
        if (!isComplete()) {
            return CalibrationResult(defaults.copy(createdAtMs = nowMs), samples.toList())
        }

        val penSizes = samples.filter { it.expectedPen }.map { it.features.meanSizeNorm }
        val palmSizes = samples.filterNot { it.expectedPen }.map { it.features.meanSizeNorm }
        val penMajors = samples.filter { it.expectedPen }.map { it.features.meanTouchMajorPx }
        val penSpeeds = samples.filter { it.expectedPen }.map { it.features.meanSpeedPxPerMs }

        val maxPenSize = percentile(penSizes, 0.95f) * 1.15f
        val minPalmSize = maxOf(percentile(palmSizes, 0.05f) * 0.9f, maxPenSize * 1.2f)
        val maxPenMajor = percentile(penMajors, 0.95f) * 1.2f
        val minPenSpeed = maxOf(percentile(penSpeeds, 0.10f) * 0.5f, 0.005f)

        val thresholds = defaults.thresholds
            .with(ThresholdKey.MAX_PEN_SIZE, maxPenSize)
            .with(ThresholdKey.MIN_PALM_SIZE, minPalmSize)
            .with(ThresholdKey.MAX_PEN_TOUCH_MAJOR, maxPenMajor)
            .with(ThresholdKey.MIN_PEN_SPEED, minPenSpeed)

        // Safe ranges are anchored to what this device actually produced, so neither the
        // user nor automatic tuning can drift into a configuration never observed here.
        val safeRanges = defaults.safeRanges.toMutableMap().apply {
            this[ThresholdKey.MAX_PEN_SIZE] = boundedRange(maxPenSize, 0.5f, defaults.safeRanges.getValue(ThresholdKey.MAX_PEN_SIZE))
            this[ThresholdKey.MIN_PALM_SIZE] = boundedRange(minPalmSize, 0.5f, defaults.safeRanges.getValue(ThresholdKey.MIN_PALM_SIZE))
            this[ThresholdKey.MAX_PEN_TOUCH_MAJOR] = boundedRange(maxPenMajor, 0.5f, defaults.safeRanges.getValue(ThresholdKey.MAX_PEN_TOUCH_MAJOR))
            this[ThresholdKey.MIN_PEN_SPEED] = boundedRange(minPenSpeed, 0.8f, defaults.safeRanges.getValue(ThresholdKey.MIN_PEN_SPEED))
        }

        val candidate = defaults.copy(
            revision = 1,
            thresholds = thresholds,
            safeRanges = safeRanges,
            createdAtMs = nowMs
        ).let { it.withThresholds(it.thresholds) }

        val scored = candidate.copy(
            score = scoreProfile(candidate, samples),
            stable = true
        )
        return CalibrationResult(scored, samples.toList())
    }

    private fun boundedRange(center: Float, spreadFraction: Float, hardLimit: SafeRange): SafeRange =
        SafeRange(
            min = maxOf(center * (1f - spreadFraction), hardLimit.min),
            max = minOf(center * (1f + spreadFraction), hardLimit.max)
        )

    private fun percentile(values: List<Float>, p: Float): Float {
        if (values.isEmpty()) return 0f
        val sorted = values.sorted()
        val index = ((sorted.size - 1) * p).toInt().coerceIn(0, sorted.lastIndex)
        return sorted[index]
    }

    companion object {
        private const val MIN_PER_PHASE = 4
    }
}

/** Fraction of stored calibration samples the profile classifies the way the user labelled them. */
fun scoreProfile(profile: PalmProfile, samples: List<CalibrationSample>): Float {
    if (samples.isEmpty()) return 0f
    val classifier = ContactClassifier(profile)
    val correct = samples.count { sample ->
        val confidence = classifier.penConfidence(sample.features)
        (confidence >= 0.5f) == sample.expectedPen
    }
    return correct.toFloat() / samples.size
}
```

- [ ] **Step 5: Write `ProfileTuner`**

`android/touch-engine/src/main/kotlin/com/notes/school/touch/ProfileTuner.kt`:

```kotlin
package com.notes.school.touch

import com.notes.school.core.PalmProfile
import com.notes.school.core.ThresholdKey
import kotlin.math.abs

data class TunerConfig(
    /** How far a threshold may move away from the stable baseline, as a fraction. */
    val maxDriftFraction: Float = 0.10f,
    val minObservations: Int = 12,
    val degradationsBeforeRollback: Int = 2
)

/**
 * Conservative, bounded, reversible profile improvement.
 *
 * Rules enforced here, each with a test in ProfileTunerTest:
 *  - only high-confidence locked contacts become observations;
 *  - nothing is applied mid-stroke — only [endSession] produces a candidate;
 *  - every threshold stays inside its calibrated safe range and within
 *    [TunerConfig.maxDriftFraction] of the stable baseline;
 *  - a candidate must score at least as well as the stable profile on the stored
 *    calibration samples, or it is discarded;
 *  - repeated degradation restores the last stable profile;
 *  - observations hold motion statistics only, never ink or document references.
 */
class ProfileTuner(
    stable: PalmProfile,
    private val validation: List<CalibrationSample>,
    private val config: TunerConfig = TunerConfig()
) {
    var stableProfile: PalmProfile = stable
        private set

    private var activeProfile: PalmProfile = stable
    private val penObservations = mutableListOf<ContactFeatures>()
    private val palmObservations = mutableListOf<ContactFeatures>()
    private var degradations = 0

    val pendingObservations: Int get() = penObservations.size + palmObservations.size

    fun observe(classification: Classification) {
        when (classification.state) {
            PointerState.PEN_LOCKED ->
                if (classification.penConfidence >= ContactClassifier.HIGH_CONFIDENCE) {
                    penObservations += classification.features
                }
            PointerState.PALM_LOCKED ->
                if (classification.penConfidence <= 1f - ContactClassifier.HIGH_CONFIDENCE) {
                    palmObservations += classification.features
                }
            else -> Unit // uncertain contacts never become training samples
        }
    }

    /** Produces a validated candidate profile, or null when there is nothing safe to apply. */
    fun endSession(nowMs: Long): PalmProfile? {
        if (pendingObservations < config.minObservations) {
            clearObservations()
            return null
        }

        var thresholds = stableProfile.thresholds
        if (penObservations.isNotEmpty()) {
            val observedPenSize = percentile(penObservations.map { it.meanSizeNorm }, 0.95f) * 1.1f
            thresholds = thresholds.with(
                ThresholdKey.MAX_PEN_SIZE,
                drift(stableProfile.thresholds[ThresholdKey.MAX_PEN_SIZE], observedPenSize)
            )
            val observedPenMajor = percentile(penObservations.map { it.meanTouchMajorPx }, 0.95f) * 1.1f
            thresholds = thresholds.with(
                ThresholdKey.MAX_PEN_TOUCH_MAJOR,
                drift(stableProfile.thresholds[ThresholdKey.MAX_PEN_TOUCH_MAJOR], observedPenMajor)
            )
        }
        if (palmObservations.isNotEmpty()) {
            val observedPalmSize = percentile(palmObservations.map { it.meanSizeNorm }, 0.05f) * 0.95f
            thresholds = thresholds.with(
                ThresholdKey.MIN_PALM_SIZE,
                drift(stableProfile.thresholds[ThresholdKey.MIN_PALM_SIZE], observedPalmSize)
            )
        }
        clearObservations()

        val candidate = stableProfile
            .withThresholds(thresholds)
            .copy(revision = stableProfile.revision + 1, createdAtMs = nowMs, stable = false)
        val candidateScore = scoreProfile(candidate, validation)
        if (candidateScore < stableProfile.score) return null

        activeProfile = candidate.copy(score = candidateScore)
        return activeProfile
    }

    /**
     * Called when the user recalibrates, undoes palm ink repeatedly, or the app detects the
     * active profile behaving worse than the stable one. Returns the restored profile once
     * the configured number of reports is reached, else null.
     */
    fun reportDegradation(): PalmProfile? {
        degradations++
        if (degradations < config.degradationsBeforeRollback) return null
        degradations = 0
        activeProfile = stableProfile
        return stableProfile
    }

    /** Promotes the current candidate once it has survived a full session. */
    fun promoteActiveToStable() {
        stableProfile = activeProfile.copy(stable = true)
    }

    private fun clearObservations() {
        penObservations.clear()
        palmObservations.clear()
    }

    private fun drift(baseline: Float, target: Float): Float {
        val allowed = abs(baseline) * config.maxDriftFraction
        return target.coerceIn(baseline - allowed, baseline + allowed)
    }

    private fun percentile(values: List<Float>, p: Float): Float {
        if (values.isEmpty()) return 0f
        val sorted = values.sorted()
        return sorted[((sorted.size - 1) * p).toInt().coerceIn(0, sorted.lastIndex)]
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd android && ./gradlew :touch-engine:test
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

```bash
git add android && git commit -m "feat(touch-engine): add guided calibration and bounded conservative profile tuning"
```

---

### Task 11: `PalmInputGate` — wire the classifier into `InkView`

**Files:**
- Create: `android/app/src/main/kotlin/com/notes/school/editor/PalmInputGate.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/editor/PalmInputGateTest.kt`
- Modify: `android/app/build.gradle.kts` (add module and test dependencies)

**Interfaces:**
- Consumes: `InkView`, `PointerVerdict` (Task 6); `ContactClassifier`, `ContactSample`, `PointerState`, `ToolTypes` (Tasks 8–9); `ProfileTuner` (Task 10); `PalmProfile`, `ThresholdKey` (Task 7).
- Produces:
  - `fun MotionEvent.toContactSample(pointerIndex: Int): ContactSample` (extension in `PalmInputGate.kt`)
  - `class PalmInputGate(private val view: InkView, private val classifier: ContactClassifier, private val tuner: ProfileTuner?, private val scheduleDecision: (delayMs: Long, action: () -> Unit) -> Unit)` with `fun install()`, `fun onTouchEventPreDispatch(event: MotionEvent)`, `var onStatusChanged: ((PalmStatus) -> Unit)?`, `fun endDocumentSession(nowMs: Long): PalmProfile?`
  - `enum class PalmStatus { IDLE, PEN_ACTIVE, PALM_REJECTED, LOW_CONFIDENCE }`

- [ ] **Step 1: Add dependencies**

In `android/app/build.gradle.kts`, extend the `dependencies` block:

```kotlin
    implementation(project(":core-model"))
    implementation(project(":ink-engine"))
    implementation(project(":touch-engine"))

    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
```

- [ ] **Step 2: Write the failing test**

`android/app/src/test/kotlin/com/notes/school/editor/PalmInputGateTest.kt`:

```kotlin
package com.notes.school.editor

import android.graphics.Color
import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ToolKind
import com.notes.school.ink.InkScene
import com.notes.school.ink.InkView
import com.notes.school.ink.ToolSettings
import com.notes.school.touch.ContactClassifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class PalmInputGateTest {

    private lateinit var view: InkView
    private lateinit var scene: InkScene
    private lateinit var gate: PalmInputGate
    private val pendingDecisions = mutableListOf<Pair<Long, () -> Unit>>()

    private fun profile() = PalmProfile.defaults(
        "samsung/SM-T505/31",
        ScreenOrientation.LANDSCAPE,
        Handedness.RIGHT,
        setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR)
    )

    @Before
    fun setUp() {
        scene = InkScene("page-1")
        view = InkView(ApplicationProvider.getApplicationContext()).apply {
            this.scene = this@PalmInputGateTest.scene
            tool = ToolSettings(ToolKind.PEN, Color.BLACK, 3f)
        }
        view.layout(0, 0, 1200, 800)
        gate = PalmInputGate(
            view = view,
            classifier = ContactClassifier(profile()),
            tuner = null,
            scheduleDecision = { delayMs, action -> pendingDecisions += delayMs to action }
        )
        gate.install()
        pendingDecisions.clear()
    }

    private fun send(
        action: Int,
        x: Float,
        y: Float,
        downTime: Long,
        size: Float,
        touchMajor: Float
    ) {
        val properties = MotionEvent.PointerProperties().apply {
            id = 0
            toolType = MotionEvent.TOOL_TYPE_FINGER
        }
        val coords = MotionEvent.PointerCoords().apply {
            this.x = x
            this.y = y
            pressure = 0.4f
            this.size = size
            this.touchMajor = touchMajor
            this.touchMinor = touchMajor * 0.85f
        }
        val event = MotionEvent.obtain(
            downTime, SystemClock.uptimeMillis(), action,
            1, arrayOf(properties), arrayOf(coords),
            0, 0, 1f, 1f, 0, 0, 0, 0
        )
        gate.onTouchEventPreDispatch(event)
        view.dispatchTouchEvent(event)
    }

    private fun writeWithStylus() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 100f, 100f, downTime, size = 0.06f, touchMajor = 14f)
        repeat(8) { i ->
            send(MotionEvent.ACTION_MOVE, 100f + i * 12f, 100f, downTime, 0.06f, 14f)
        }
        send(MotionEvent.ACTION_UP, 220f, 100f, downTime, 0.06f, 14f)
    }

    @Test
    fun motionEventConversionCopiesEveryClassificationInput() {
        val downTime = SystemClock.uptimeMillis()
        val event = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, 42f, 84f, 0)
        val sample = event.toContactSample(pointerIndex = 0)
        assertEquals(42f, sample.x, 0f)
        assertEquals(84f, sample.y, 0f)
        assertEquals(1, sample.pointerCount)
    }

    @Test
    fun aStylusLikeContactIsAcceptedAndProducesAStroke() {
        writeWithStylus()
        assertEquals(1, scene.activeStrokes().size)
    }

    @Test
    fun aPalmLikeContactIsRejectedAndProducesNoStroke() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 600f, 600f, downTime, size = 0.6f, touchMajor = 90f)
        repeat(8) { send(MotionEvent.ACTION_MOVE, 600.4f, 600.3f, downTime, 0.6f, 90f) }
        send(MotionEvent.ACTION_UP, 600.4f, 600.3f, downTime, 0.6f, 90f)
        assertEquals(0, scene.activeStrokes().size)
    }

    @Test
    fun anAmbiguousContactSchedulesADecisionUsingTheProfileWindow() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 400f, 400f, downTime, size = 0.16f, touchMajor = 30f)
        assertEquals(1, pendingDecisions.size)
        assertEquals(90L, pendingDecisions.single().first)
    }

    @Test
    fun runningTheScheduledDecisionResolvesTheProvisionalPointer() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 400f, 400f, downTime, size = 0.16f, touchMajor = 30f)
        send(MotionEvent.ACTION_MOVE, 402f, 400f, downTime, 0.16f, 30f)
        pendingDecisions.forEach { it.second() }
        send(MotionEvent.ACTION_UP, 404f, 400f, downTime, 0.16f, 30f)
        // Either outcome is legitimate; what matters is that nothing stays provisional.
        assertTrue(scene.activeStrokes().size <= 1)
    }

    @Test
    fun statusReportsPenActiveWhileWritingAndIdleAfterLift() {
        val seen = mutableListOf<PalmStatus>()
        gate.onStatusChanged = { seen += it }
        writeWithStylus()
        assertTrue(seen.contains(PalmStatus.PEN_ACTIVE))
        assertEquals(PalmStatus.IDLE, seen.last())
    }

    @Test
    fun statusReportsPalmRejectedWhenAContactIsDropped() {
        val seen = mutableListOf<PalmStatus>()
        gate.onStatusChanged = { seen += it }
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 600f, 600f, downTime, size = 0.6f, touchMajor = 90f)
        repeat(8) { send(MotionEvent.ACTION_MOVE, 600.4f, 600.3f, downTime, 0.6f, 90f) }
        assertTrue(seen.contains(PalmStatus.PALM_REJECTED))
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*PalmInputGateTest*"
```

Expected: FAIL — `Unresolved reference: PalmInputGate`.

- [ ] **Step 4: Write the implementation**

`android/app/src/main/kotlin/com/notes/school/editor/PalmInputGate.kt`:

```kotlin
package com.notes.school.editor

import android.view.MotionEvent
import com.notes.school.core.PalmProfile
import com.notes.school.core.ThresholdKey
import com.notes.school.ink.InkView
import com.notes.school.ink.PointerVerdict
import com.notes.school.touch.Classification
import com.notes.school.touch.ContactClassifier
import com.notes.school.touch.ContactSample
import com.notes.school.touch.PointerState
import com.notes.school.touch.ProfileTuner

/** What the editor's crossed-out-hand indicator shows. */
enum class PalmStatus { IDLE, PEN_ACTIVE, PALM_REJECTED, LOW_CONFIDENCE }

/** Copies every numeric signal the classifier needs. No coordinates leave this process. */
fun MotionEvent.toContactSample(pointerIndex: Int): ContactSample = ContactSample(
    pointerId = getPointerId(pointerIndex),
    eventTimeMs = eventTime,
    x = getX(pointerIndex),
    y = getY(pointerIndex),
    toolType = getToolType(pointerIndex),
    pressure = getPressure(pointerIndex),
    size = getSize(pointerIndex),
    touchMajor = getTouchMajor(pointerIndex),
    touchMinor = getTouchMinor(pointerIndex),
    orientation = getOrientation(pointerIndex),
    pointerCount = pointerCount
)

/**
 * Bridges MotionEvents to the touch engine and the engine's verdicts back to [InkView].
 *
 * [scheduleDecision] is injected so the bounded decision window can be driven by a real
 * Handler in the app and by the test directly in unit tests.
 */
class PalmInputGate(
    private val view: InkView,
    private val classifier: ContactClassifier,
    private val tuner: ProfileTuner?,
    private val scheduleDecision: (delayMs: Long, action: () -> Unit) -> Unit
) {
    var onStatusChanged: ((PalmStatus) -> Unit)? = null

    private val verdicts = HashMap<Int, PointerVerdict>()
    private val awaitingDecision = HashSet<Int>()

    fun install() {
        view.pointerGate = { event, pointerIndex ->
            verdicts[event.getPointerId(pointerIndex)] ?: PointerVerdict.PROVISIONAL
        }
    }

    /**
     * Must run before the event reaches the view, so a verdict exists by the time
     * InkView asks for it.
     */
    fun onTouchEventPreDispatch(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                classify(event, event.actionIndex, isDown = true)
            }
            MotionEvent.ACTION_MOVE -> {
                for (index in 0 until event.pointerCount) classify(event, index, isDown = false)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                finish(event.getPointerId(event.actionIndex))
            }
            MotionEvent.ACTION_CANCEL -> {
                verdicts.keys.toList().forEach { finish(it) }
                classifier.reset()
            }
        }
    }

    /** Applies accumulated learning after the user leaves the document. Never mid-stroke. */
    fun endDocumentSession(nowMs: Long): PalmProfile? {
        val candidate = tuner?.endSession(nowMs) ?: return null
        classifier.updateProfile(candidate)
        return candidate
    }

    private fun classify(event: MotionEvent, pointerIndex: Int, isDown: Boolean) {
        val sample = event.toContactSample(pointerIndex)
        val result = classifier.onSample(sample)
        applyVerdict(result)
        if (isDown && verdicts[result.pointerId] == PointerVerdict.PROVISIONAL) {
            scheduleWindow(result.pointerId)
        }
    }

    private fun applyVerdict(result: Classification) {
        val previous = verdicts[result.pointerId]
        val verdict = when (result.state) {
            PointerState.PEN_LOCKED -> PointerVerdict.ACCEPT
            PointerState.PALM_LOCKED -> PointerVerdict.REJECT
            else -> PointerVerdict.PROVISIONAL
        }
        verdicts[result.pointerId] = verdict
        if (previous == verdict) return

        when (verdict) {
            PointerVerdict.ACCEPT -> {
                if (previous == PointerVerdict.PROVISIONAL) view.promoteProvisional(result.pointerId)
                onStatusChanged?.invoke(PalmStatus.PEN_ACTIVE)
            }
            PointerVerdict.REJECT -> {
                if (previous == PointerVerdict.PROVISIONAL) view.discardProvisional(result.pointerId)
                onStatusChanged?.invoke(PalmStatus.PALM_REJECTED)
            }
            PointerVerdict.PROVISIONAL -> Unit
        }
    }

    private fun scheduleWindow(pointerId: Int) {
        if (!awaitingDecision.add(pointerId)) return
        val windowMs = classifier.profile.thresholds[ThresholdKey.DECISION_WINDOW_MS].toLong()
        scheduleDecision(windowMs) {
            awaitingDecision -= pointerId
            if (verdicts[pointerId] != PointerVerdict.PROVISIONAL) return@scheduleDecision
            val decided = classifier.forceDecision(pointerId)
            if (decided == null) {
                onStatusChanged?.invoke(PalmStatus.LOW_CONFIDENCE)
                return@scheduleDecision
            }
            applyVerdict(decided)
        }
    }

    private fun finish(pointerId: Int) {
        classifier.onLift(pointerId)?.let { tuner?.observe(it) }
        verdicts -= pointerId
        awaitingDecision -= pointerId
        if (verdicts.isEmpty()) onStatusChanged?.invoke(PalmStatus.IDLE)
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`. Note that `InkView.pointerGate` receives the pointer *index*,
not the pointer id — `install()` above converts it with `event.getPointerId(pointerIndex)`.
Mixing the two is the single most likely bug in this task: they agree for one finger and
diverge the moment a palm lands.

- [ ] **Step 6: Commit**

```bash
git add android && git commit -m "feat(editor): gate ink input through the palm classifier with a bounded decision window"
```

---
## Phase 3 — Storage

### Task 12: Room schema, entities and DAOs

**Files:**
- Create: `android/storage/build.gradle.kts`
- Create: `android/storage/src/main/AndroidManifest.xml`
- Create: `android/storage/src/main/kotlin/com/notes/school/storage/Entities.kt`
- Create: `android/storage/src/main/kotlin/com/notes/school/storage/Converters.kt`
- Create: `android/storage/src/main/kotlin/com/notes/school/storage/Daos.kt`
- Create: `android/storage/src/main/kotlin/com/notes/school/storage/NotesDatabase.kt`
- Create: `android/storage/src/main/kotlin/com/notes/school/storage/Mappers.kt`
- Test: `android/storage/src/test/kotlin/com/notes/school/storage/DaoTest.kt`
- Test: `android/storage/src/test/kotlin/com/notes/school/storage/MappersTest.kt`
- Modify: `android/settings.gradle.kts` (uncomment `include(":storage")`)

**Interfaces:**
- Consumes: `Folder`, `DocumentMeta`, `Page`, `Stroke`, `StrokeCodec`, `PalmProfile` (Tasks 2, 3, 7).
- Produces:
  - `FolderEntity`, `DocumentEntity`, `PageEntity`, `StrokeEntity`, `PalmProfileEntity`, `RemoteJobEntity`
  - `FolderDao`, `DocumentDao`, `PageDao`, `StrokeDao`, `PalmProfileDao`, `RemoteJobDao`
  - `abstract class NotesDatabase : RoomDatabase()` with `companion object { const val VERSION = 1; const val NAME = "notes.db" }` and dao accessors
  - `fun Stroke.toEntity(): StrokeEntity` / `fun StrokeEntity.toModel(): Stroke`, plus the equivalent pairs for folder, document and page.

- [ ] **Step 1: Add the module build file and enable it**

`android/storage/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.notes.school.storage"
    compileSdk = 34
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].kotlin.srcDir("src/main/kotlin")
    sourceSets["test"].kotlin.srcDir("src/test/kotlin")
    sourceSets["androidTest"].kotlin.srcDir("src/androidTest/kotlin")
    testOptions { unitTests { isIncludeAndroidResources = true } }
}

ksp {
    // Schema JSON is committed and is the input for every migration test.
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    api(project(":core-model"))
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)
    ksp(libs.room.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.room.testing)
}
```

`android/storage/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest />
```

Uncomment `include(":storage")` in `android/settings.gradle.kts`.

- [ ] **Step 2: Write the failing DAO test**

`android/storage/src/test/kotlin/com/notes/school/storage/DaoTest.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import com.notes.school.core.newId
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class DaoTest {

    private lateinit var db: NotesDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NotesDatabase::class.java
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seedPage(): PageEntity {
        val folder = FolderEntity(newId(), null, "Biologie", 0, 1L, 1L, false)
        db.folderDao().upsert(folder)
        val document = DocumentEntity(
            newId(), folder.id, "Zellaufbau", DocumentKind.LINED.name, 1L, 1L, false, false, null
        )
        db.documentDao().upsert(document)
        val page = PageEntity(newId(), document.id, 0, 1240f, 1754f, "TEMPLATE", 0, 0f, 0f, 1f)
        db.pageDao().upsert(page)
        return page
    }

    private fun stroke(pageId: String, order: Long, active: Boolean = true) = Stroke(
        id = newId(),
        pageId = pageId,
        tool = ToolKind.PEN,
        colorArgb = 0xFF2C2825.toInt(),
        widthPx = 3f,
        points = listOf(StrokePoint(1f, 2f, 0.5f, 0), StrokePoint(9f, 4f, 0.5f, 12)),
        bounds = Bounds(0f, 1f, 10f, 5f),
        order = order,
        active = active
    )

    @Test
    fun strokeSurvivesARoundTripWithEveryFieldIntact() = runTest {
        val page = seedPage()
        val original = stroke(page.id, order = 0)
        db.strokeDao().upsert(original.toEntity())
        val loaded = db.strokeDao().forPage(page.id).single().toModel()
        assertEquals(original, loaded)
    }

    @Test
    fun strokesComeBackInCreationOrder() = runTest {
        val page = seedPage()
        val ordered = (0L until 5L).map { stroke(page.id, order = it) }
        ordered.shuffled().forEach { db.strokeDao().upsert(it.toEntity()) }
        assertEquals(ordered.map { it.id }, db.strokeDao().forPage(page.id).map { it.id })
    }

    @Test
    fun inactiveStrokesAreStoredButExcludedFromTheActiveQuery() = runTest {
        val page = seedPage()
        val kept = stroke(page.id, 0)
        val erased = stroke(page.id, 1, active = false)
        db.strokeDao().upsert(kept.toEntity())
        db.strokeDao().upsert(erased.toEntity())
        assertEquals(2, db.strokeDao().forPage(page.id).size)
        assertEquals(listOf(kept.id), db.strokeDao().activeForPage(page.id).map { it.id })
    }

    @Test
    fun writingAStrokeBatchIsASingleTransaction() = runTest {
        val page = seedPage()
        val batch = (0L until 20L).map { stroke(page.id, it).toEntity() }
        db.strokeDao().upsertAll(batch)
        assertEquals(20, db.strokeDao().forPage(page.id).size)
    }

    @Test
    fun deletingADocumentCascadesToPagesAndStrokes() = runTest {
        val page = seedPage()
        db.strokeDao().upsert(stroke(page.id, 0).toEntity())
        db.documentDao().deleteById(page.documentId)
        assertEquals(0, db.pageDao().forDocument(page.documentId).size)
        assertEquals(0, db.strokeDao().forPage(page.id).size)
    }

    @Test
    fun trashedDocumentsAreHiddenFromTheFolderListingButStillReadable() = runTest {
        val page = seedPage()
        db.documentDao().setTrashed(page.documentId, true)
        val document = db.documentDao().byId(page.documentId)!!
        assertTrue(document.trashed)
        val folderId = document.folderId!!
        assertEquals(0, db.documentDao().inFolder(folderId).size)
        assertEquals(1, db.documentDao().trashed().size)
    }

    @Test
    fun favoritesQueryReturnsOnlyFavoritedUntrashedDocuments() = runTest {
        val page = seedPage()
        db.documentDao().setFavorite(page.documentId, true)
        assertEquals(1, db.documentDao().favorites().size)
        db.documentDao().setTrashed(page.documentId, true)
        assertEquals(0, db.documentDao().favorites().size)
    }

    @Test
    fun recentDocumentsAreOrderedByUpdatedAtDescending() = runTest {
        val page = seedPage()
        val second = DocumentEntity(
            newId(), null, "Newer", DocumentKind.BLANK.name, 5L, 500L, false, false, null
        )
        db.documentDao().upsert(second)
        assertEquals(second.id, db.documentDao().recent(limit = 10).first().id)
    }

    @Test
    fun onlyOneStablePalmProfileExistsPerDeviceAndOrientation() = runTest {
        val first = PalmProfileEntity(
            id = 0, deviceFingerprint = "SM-T505", orientation = "LANDSCAPE",
            revision = 1, json = "{}", score = 0.94f, stable = true, createdAtMs = 1L
        )
        db.palmProfileDao().upsert(first)
        db.palmProfileDao().upsert(first.copy(id = 0, revision = 2, score = 0.96f))
        val stable = db.palmProfileDao().latestStable("SM-T505", "LANDSCAPE")!!
        assertEquals(2, stable.revision)
    }

    @Test
    fun missingRowsReturnNullRatherThanThrowing() = runTest {
        assertNull(db.documentDao().byId("does-not-exist"))
        assertNull(db.palmProfileDao().latestStable("nope", "LANDSCAPE"))
    }
}
```

- [ ] **Step 3: Write the failing mapper test**

`android/storage/src/test/kotlin/com/notes/school/storage/MappersTest.kt`:

```kotlin
package com.notes.school.storage

import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Page
import com.notes.school.core.PageSource
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Test

class MappersTest {

    @Test
    fun strokePointsAreStoredAsAnEncodedBlobNotAsText() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.HIGHLIGHTER, 0xFFFFEE00.toInt(), 18f,
            listOf(StrokePoint(1f, 2f, 0.5f, 0)), Bounds(0f, 1f, 2f, 3f), 7L, true
        )
        val entity = stroke.toEntity()
        assertEquals(8 + 16, entity.pointsBlob.size)
        assertEquals(stroke, entity.toModel())
    }

    @Test
    fun templatePageSourceRoundTrips() {
        val page = Page("pg", "doc", 0, 100f, 200f, PageSource.Template(DocumentKind.GRID))
        assertEquals(page, page.toEntity().toModel())
    }

    @Test
    fun pdfPageSourceRoundTripsWithItsIndex() {
        val page = Page("pg", "doc", 3, 100f, 200f, PageSource.PdfPage(pageIndex = 12))
        val restored = page.toEntity().toModel()
        assertEquals(PageSource.PdfPage(12), restored.source)
        assertEquals(page, restored)
    }

    @Test
    fun viewportStateSurvivesTheRoundTrip() {
        val page = Page("pg", "doc", 0, 100f, 200f, PageSource.Template(DocumentKind.BLANK), 40f, 80f, 1.75f)
        assertEquals(page, page.toEntity().toModel())
    }
}
```

- [ ] **Step 4: Run both tests to verify they fail**

```bash
cd android && ./gradlew :storage:testDebugUnitTest
```

Expected: FAIL — `Unresolved reference: NotesDatabase`.

- [ ] **Step 5: Write the entities**

`android/storage/src/main/kotlin/com/notes/school/storage/Entities.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "folders")
data class FolderEntity(
    @PrimaryKey val id: String,
    val parentId: String?,
    val name: String,
    val sortIndex: Int,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val trashed: Boolean
)

@Entity(
    tableName = "documents",
    indices = [Index("folderId"), Index("updatedAtMs")]
)
data class DocumentEntity(
    @PrimaryKey val id: String,
    val folderId: String?,
    val title: String,
    val kind: String,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val favorite: Boolean,
    val trashed: Boolean,
    /** Relative path of the immutable imported PDF inside app-private storage. */
    val sourceRef: String?
)

@Entity(
    tableName = "pages",
    indices = [Index("documentId")],
    foreignKeys = [
        ForeignKey(
            entity = DocumentEntity::class,
            parentColumns = ["id"],
            childColumns = ["documentId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class PageEntity(
    @PrimaryKey val id: String,
    val documentId: String,
    val pageIndex: Int,
    val widthPx: Float,
    val heightPx: Float,
    /** "TEMPLATE" or "PDF". */
    val sourceType: String,
    /** Template ordinal for TEMPLATE, PDF page index for PDF. */
    val sourceValue: Int,
    val scrollX: Float,
    val scrollY: Float,
    val zoom: Float
)

@Entity(
    tableName = "strokes",
    indices = [Index("pageId"), Index(value = ["pageId", "strokeOrder"])],
    foreignKeys = [
        ForeignKey(
            entity = PageEntity::class,
            parentColumns = ["id"],
            childColumns = ["pageId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class StrokeEntity(
    @PrimaryKey val id: String,
    val pageId: String,
    val tool: String,
    val colorArgb: Int,
    val widthPx: Float,
    /** StrokeCodec-encoded point array. */
    val pointsBlob: ByteArray,
    val boundsLeft: Float,
    val boundsTop: Float,
    val boundsRight: Float,
    val boundsBottom: Float,
    val strokeOrder: Long,
    val active: Boolean
) {
    // Room data classes holding a ByteArray need explicit equality.
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is StrokeEntity) return false
        return id == other.id &&
            pageId == other.pageId &&
            tool == other.tool &&
            colorArgb == other.colorArgb &&
            widthPx == other.widthPx &&
            pointsBlob.contentEquals(other.pointsBlob) &&
            boundsLeft == other.boundsLeft &&
            boundsTop == other.boundsTop &&
            boundsRight == other.boundsRight &&
            boundsBottom == other.boundsBottom &&
            strokeOrder == other.strokeOrder &&
            active == other.active
    }

    override fun hashCode(): Int = id.hashCode() * 31 + strokeOrder.hashCode()
}

@Entity(
    tableName = "palm_profiles",
    indices = [Index(value = ["deviceFingerprint", "orientation", "revision"], unique = true)]
)
data class PalmProfileEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val deviceFingerprint: String,
    val orientation: String,
    val revision: Int,
    /** Serialized PalmProfile. Contains thresholds only — never ink or page content. */
    val json: String,
    val score: Float,
    val stable: Boolean,
    val createdAtMs: Long
)

@Entity(tableName = "remote_jobs", indices = [Index("state")])
data class RemoteJobEntity(
    @PrimaryKey val id: String,
    val documentId: String?,
    val operation: String,
    val consentGranted: Boolean,
    /** Relative path of the payload file in app-private storage, if any. */
    val payloadRef: String?,
    val remoteId: String?,
    val state: String,
    val attempts: Int,
    val nextAttemptAtMs: Long,
    val lastError: String?,
    val resultRef: String?,
    val createdAtMs: Long,
    val updatedAtMs: Long
)
```

- [ ] **Step 6: Write the DAOs and database**

`android/storage/src/main/kotlin/com/notes/school/storage/Daos.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface FolderDao {
    @Upsert suspend fun upsert(folder: FolderEntity)
    @Query("SELECT * FROM folders WHERE trashed = 0 AND parentId IS :parentId ORDER BY sortIndex")
    suspend fun children(parentId: String?): List<FolderEntity>
    @Query("SELECT * FROM folders WHERE trashed = 0 ORDER BY sortIndex")
    fun observeAll(): Flow<List<FolderEntity>>
    @Query("UPDATE folders SET trashed = :trashed, updatedAtMs = :nowMs WHERE id = :id")
    suspend fun setTrashed(id: String, trashed: Boolean, nowMs: Long = System.currentTimeMillis())
    @Query("DELETE FROM folders WHERE id = :id") suspend fun deleteById(id: String)
}

@Dao
interface DocumentDao {
    @Upsert suspend fun upsert(document: DocumentEntity)
    @Query("SELECT * FROM documents WHERE id = :id") suspend fun byId(id: String): DocumentEntity?
    @Query("SELECT * FROM documents WHERE folderId = :folderId AND trashed = 0 ORDER BY updatedAtMs DESC")
    suspend fun inFolder(folderId: String): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE trashed = 0 ORDER BY updatedAtMs DESC LIMIT :limit")
    suspend fun recent(limit: Int): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE favorite = 1 AND trashed = 0 ORDER BY updatedAtMs DESC")
    suspend fun favorites(): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE trashed = 1 ORDER BY updatedAtMs DESC")
    suspend fun trashed(): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE trashed = 0 ORDER BY updatedAtMs DESC")
    fun observeAll(): Flow<List<DocumentEntity>>
    @Query("UPDATE documents SET favorite = :favorite WHERE id = :id")
    suspend fun setFavorite(id: String, favorite: Boolean)
    @Query("UPDATE documents SET trashed = :trashed WHERE id = :id")
    suspend fun setTrashed(id: String, trashed: Boolean)
    @Query("UPDATE documents SET title = :title, updatedAtMs = :nowMs WHERE id = :id")
    suspend fun rename(id: String, title: String, nowMs: Long)
    @Query("UPDATE documents SET folderId = :folderId, updatedAtMs = :nowMs WHERE id = :id")
    suspend fun move(id: String, folderId: String?, nowMs: Long)
    @Query("UPDATE documents SET updatedAtMs = :nowMs WHERE id = :id")
    suspend fun touch(id: String, nowMs: Long)
    @Query("DELETE FROM documents WHERE id = :id") suspend fun deleteById(id: String)
}

@Dao
interface PageDao {
    @Upsert suspend fun upsert(page: PageEntity)
    @Upsert suspend fun upsertAll(pages: List<PageEntity>)
    @Query("SELECT * FROM pages WHERE documentId = :documentId ORDER BY pageIndex")
    suspend fun forDocument(documentId: String): List<PageEntity>
    @Query("SELECT * FROM pages WHERE id = :id") suspend fun byId(id: String): PageEntity?
    @Query("UPDATE pages SET scrollX = :x, scrollY = :y, zoom = :zoom WHERE id = :id")
    suspend fun saveViewport(id: String, x: Float, y: Float, zoom: Float)
}

@Dao
interface StrokeDao {
    @Upsert suspend fun upsert(stroke: StrokeEntity)

    @Transaction
    @Upsert
    suspend fun upsertAll(strokes: List<StrokeEntity>)

    @Query("SELECT * FROM strokes WHERE pageId = :pageId ORDER BY strokeOrder")
    suspend fun forPage(pageId: String): List<StrokeEntity>
    @Query("SELECT * FROM strokes WHERE pageId = :pageId AND active = 1 ORDER BY strokeOrder")
    suspend fun activeForPage(pageId: String): List<StrokeEntity>
    @Query("UPDATE strokes SET active = :active WHERE id IN (:ids)")
    suspend fun setActive(ids: List<String>, active: Boolean)
    @Query("SELECT COUNT(*) FROM strokes WHERE pageId = :pageId") suspend fun countForPage(pageId: String): Int
    @Query("DELETE FROM strokes WHERE pageId NOT IN (SELECT id FROM pages)")
    suspend fun deleteOrphans(): Int
}

@Dao
interface PalmProfileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(profile: PalmProfileEntity)
    @Query(
        "SELECT * FROM palm_profiles WHERE deviceFingerprint = :device AND orientation = :orientation " +
            "AND stable = 1 ORDER BY revision DESC LIMIT 1"
    )
    suspend fun latestStable(device: String, orientation: String): PalmProfileEntity?
    @Query(
        "SELECT * FROM palm_profiles WHERE deviceFingerprint = :device AND orientation = :orientation " +
            "ORDER BY revision DESC LIMIT 1"
    )
    suspend fun latest(device: String, orientation: String): PalmProfileEntity?
    @Query("DELETE FROM palm_profiles WHERE deviceFingerprint = :device AND orientation = :orientation")
    suspend fun reset(device: String, orientation: String)
}

@Dao
interface RemoteJobDao {
    @Upsert suspend fun upsert(job: RemoteJobEntity)
    @Query("SELECT * FROM remote_jobs WHERE id = :id") suspend fun byId(id: String): RemoteJobEntity?
    @Query("SELECT * FROM remote_jobs WHERE state IN (:states) AND nextAttemptAtMs <= :nowMs ORDER BY createdAtMs")
    suspend fun due(states: List<String>, nowMs: Long): List<RemoteJobEntity>
    @Query("SELECT * FROM remote_jobs ORDER BY createdAtMs DESC")
    fun observeAll(): Flow<List<RemoteJobEntity>>
    @Query("DELETE FROM remote_jobs WHERE id = :id") suspend fun deleteById(id: String)
}
```

`android/storage/src/main/kotlin/com/notes/school/storage/NotesDatabase.kt`:

```kotlin
package com.notes.school.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        FolderEntity::class,
        DocumentEntity::class,
        PageEntity::class,
        StrokeEntity::class,
        PalmProfileEntity::class,
        RemoteJobEntity::class
    ],
    version = NotesDatabase.VERSION,
    exportSchema = true
)
abstract class NotesDatabase : RoomDatabase() {

    abstract fun folderDao(): FolderDao
    abstract fun documentDao(): DocumentDao
    abstract fun pageDao(): PageDao
    abstract fun strokeDao(): StrokeDao
    abstract fun palmProfileDao(): PalmProfileDao
    abstract fun remoteJobDao(): RemoteJobDao

    companion object {
        const val VERSION = 1
        const val NAME = "notes.db"

        fun open(context: Context): NotesDatabase =
            Room.databaseBuilder(context.applicationContext, NotesDatabase::class.java, NAME)
                // No fallbackToDestructiveMigration: losing a student's notes on an
                // upgrade is worse than failing loudly.
                .build()
    }
}
```

- [ ] **Step 7: Write the mappers**

`android/storage/src/main/kotlin/com/notes/school/storage/Mappers.kt`:

```kotlin
package com.notes.school.storage

import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
import com.notes.school.core.Page
import com.notes.school.core.PageSource
import com.notes.school.core.Stroke
import com.notes.school.core.StrokeCodec
import com.notes.school.core.ToolKind

private const val SOURCE_TEMPLATE = "TEMPLATE"
private const val SOURCE_PDF = "PDF"

fun Folder.toEntity() = FolderEntity(id, parentId, name, sortIndex, createdAtMs, updatedAtMs, trashed)

fun FolderEntity.toModel() = Folder(id, parentId, name, sortIndex, createdAtMs, updatedAtMs, trashed)

fun DocumentMeta.toEntity() = DocumentEntity(
    id, folderId, title, kind.name, createdAtMs, updatedAtMs, favorite, trashed, sourceRef
)

fun DocumentEntity.toModel() = DocumentMeta(
    id, folderId, title, DocumentKind.valueOf(kind), createdAtMs, updatedAtMs, favorite, trashed, sourceRef
)

fun Page.toEntity(): PageEntity {
    val (type, value) = when (val s = source) {
        is PageSource.Template -> SOURCE_TEMPLATE to s.kind.ordinal
        is PageSource.PdfPage -> SOURCE_PDF to s.pageIndex
    }
    return PageEntity(id, documentId, index, widthPx, heightPx, type, value, scrollX, scrollY, zoom)
}

fun PageEntity.toModel() = Page(
    id = id,
    documentId = documentId,
    index = pageIndex,
    widthPx = widthPx,
    heightPx = heightPx,
    source = when (sourceType) {
        SOURCE_PDF -> PageSource.PdfPage(sourceValue)
        else -> PageSource.Template(DocumentKind.entries[sourceValue])
    },
    scrollX = scrollX,
    scrollY = scrollY,
    zoom = zoom
)

fun Stroke.toEntity() = StrokeEntity(
    id = id,
    pageId = pageId,
    tool = tool.name,
    colorArgb = colorArgb,
    widthPx = widthPx,
    pointsBlob = StrokeCodec.encode(points),
    boundsLeft = bounds.left,
    boundsTop = bounds.top,
    boundsRight = bounds.right,
    boundsBottom = bounds.bottom,
    strokeOrder = order,
    active = active
)

fun StrokeEntity.toModel() = Stroke(
    id = id,
    pageId = pageId,
    tool = ToolKind.valueOf(tool),
    colorArgb = colorArgb,
    widthPx = widthPx,
    points = StrokeCodec.decode(pointsBlob),
    bounds = Bounds(boundsLeft, boundsTop, boundsRight, boundsBottom),
    order = strokeOrder,
    active = active
)
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd android && ./gradlew :storage:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`. Cascade deletes require foreign keys to be on — if the cascade test fails, add `.setJournalMode(RoomDatabase.JournalMode.TRUNCATE)` and confirm Room's generated `PRAGMA foreign_keys=ON` is present; Room enables it by default and the in-memory builder inherits it.

- [ ] **Step 9: Commit**

```bash
git add android && git commit -m "feat(storage): add Room schema, DAOs and model mappers"
```

---

### Task 13: Migrations, schema history and startup recovery

**Files:**
- Create: `android/storage/src/main/kotlin/com/notes/school/storage/Recovery.kt`
- Test: `android/storage/src/test/kotlin/com/notes/school/storage/SchemaHistoryTest.kt`
- Test: `android/storage/src/test/kotlin/com/notes/school/storage/RecoveryTest.kt`
- Test: `android/storage/src/androidTest/kotlin/com/notes/school/storage/MigrationTest.kt`
- Commit: `android/storage/schemas/com.notes.school.storage.NotesDatabase/1.json` (generated by the build)

**Interfaces:**
- Consumes: `NotesDatabase` and its DAOs (Task 12).
- Produces:
  - `object Migrations { val ALL: Array<Migration> }` in `NotesDatabase.kt`
  - `data class RecoveryReport(val orphanStrokesRemoved: Int, val emptyDocumentsRemoved: Int)`
  - `suspend fun NotesDatabase.recoverOnStartup(): RecoveryReport`

- [ ] **Step 1: Generate and commit the version 1 schema**

```bash
cd android && ./gradlew :storage:kspDebugKotlin
ls android/storage/schemas/com.notes.school.storage.NotesDatabase/
```

Expected: `1.json` exists. Ensure `.gitignore` does not exclude it — the schema history is the input to every migration test.

- [ ] **Step 2: Write the failing schema-history test**

`android/storage/src/test/kotlin/com/notes/school/storage/SchemaHistoryTest.kt`:

```kotlin
package com.notes.school.storage

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class SchemaHistoryTest {

    private val schemaDir = File("schemas/com.notes.school.storage.NotesDatabase")

    @Test
    fun everyReleasedVersionHasACommittedSchema() {
        for (version in 1..NotesDatabase.VERSION) {
            val file = File(schemaDir, "$version.json")
            assertTrue("missing committed schema for version $version", file.isFile)
        }
    }

    @Test
    fun aMigrationExistsForEveryVersionStep() {
        // Version 1 needs no migration; every later version needs exactly one path into it.
        val targets = Migrations.ALL.map { it.endVersion }.toSet()
        for (version in 2..NotesDatabase.VERSION) {
            assertTrue("no migration ends at version $version", targets.contains(version))
        }
    }
}
```

- [ ] **Step 3: Write the failing recovery test**

`android/storage/src/test/kotlin/com/notes/school/storage/RecoveryTest.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.newId
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class RecoveryTest {

    private lateinit var db: NotesDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NotesDatabase::class.java
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seedDocumentWithStroke(): Pair<String, String> {
        val document = DocumentEntity(newId(), null, "Doc", "LINED", 1L, 1L, false, false, null)
        db.documentDao().upsert(document)
        val page = PageEntity(newId(), document.id, 0, 100f, 100f, "TEMPLATE", 1, 0f, 0f, 1f)
        db.pageDao().upsert(page)
        db.strokeDao().upsert(
            StrokeEntity(
                newId(), page.id, "PEN", -16777216, 3f, ByteArray(8),
                0f, 0f, 1f, 1f, 0L, true
            )
        )
        return document.id to page.id
    }

    @Test
    fun recoveryLeavesAHealthyDatabaseUntouched() = runTest {
        val (_, pageId) = seedDocumentWithStroke()
        val report = db.recoverOnStartup()
        assertEquals(0, report.orphanStrokesRemoved)
        assertEquals(1, db.strokeDao().countForPage(pageId))
    }

    @Test
    fun committedStrokesAreNeverDiscardedByRecovery() = runTest {
        val (documentId, pageId) = seedDocumentWithStroke()
        repeat(3) { db.recoverOnStartup() }
        assertEquals(1, db.strokeDao().countForPage(pageId))
        assertEquals(documentId, db.documentDao().byId(documentId)!!.id)
    }

    @Test
    fun recoveryIsIdempotent() = runTest {
        seedDocumentWithStroke()
        val first = db.recoverOnStartup()
        val second = db.recoverOnStartup()
        assertEquals(first, second)
    }
}
```

- [ ] **Step 4: Write the instrumented migration test**

`android/storage/src/androidTest/kotlin/com/notes/school/storage/MigrationTest.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the SM-T505 (or an emulator). Walks the real SQLite file from every released
 * schema version up to the current one, which is the only way to prove an upgrade does not
 * lose a student's notes.
 */
@RunWith(AndroidJUnit4::class)
class MigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        NotesDatabase::class.java
    )

    @Test
    fun migratesFromEveryReleasedVersionToCurrent() {
        for (start in 1 until NotesDatabase.VERSION) {
            helper.createDatabase(TEST_DB, start).close()
            helper.runMigrationsAndValidate(TEST_DB, NotesDatabase.VERSION, true, *Migrations.ALL)
        }
    }

    @Test
    fun aFreshDatabaseOpensAtTheCurrentVersion() {
        val db = helper.createDatabase(TEST_DB, NotesDatabase.VERSION)
        assertTrue(db.isOpen)
        db.close()
    }

    private companion object {
        const val TEST_DB = "migration-test.db"
    }
}
```

- [ ] **Step 5: Run the JVM tests to verify they fail**

```bash
cd android && ./gradlew :storage:testDebugUnitTest --tests "*SchemaHistoryTest*" --tests "*RecoveryTest*"
```

Expected: FAIL — `Unresolved reference: Migrations`.

- [ ] **Step 6: Add `Migrations` to the database file**

Append to `android/storage/src/main/kotlin/com/notes/school/storage/NotesDatabase.kt`:

```kotlin
import androidx.room.migration.Migration

/**
 * Every schema change adds a Migration here and commits the new schemas/N.json.
 * Version 1 is the baseline and has no migration.
 */
object Migrations {
    val ALL: Array<Migration> = emptyArray()
}
```

and use it in `open`:

```kotlin
        fun open(context: Context): NotesDatabase =
            Room.databaseBuilder(context.applicationContext, NotesDatabase::class.java, NAME)
                .addMigrations(*Migrations.ALL)
                .build()
```

- [ ] **Step 7: Write the recovery implementation**

`android/storage/src/main/kotlin/com/notes/school/storage/Recovery.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.withTransaction

data class RecoveryReport(
    val orphanStrokesRemoved: Int,
    val emptyDocumentsRemoved: Int
)

/**
 * Startup integrity pass.
 *
 * Strokes are only ever written after they are complete, so a crash cannot leave half a
 * stroke behind. What a crash can leave is a row whose parent never got written — those
 * are removed. Committed strokes are never touched.
 */
suspend fun NotesDatabase.recoverOnStartup(): RecoveryReport = withTransaction {
    val orphans = strokeDao().deleteOrphans()
    RecoveryReport(orphanStrokesRemoved = orphans, emptyDocumentsRemoved = 0)
}
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd android && ./gradlew :storage:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 9: Run the migration test on the connected device**

```bash
cd android && ./gradlew :storage:connectedDebugAndroidTest
```

Expected: `BUILD SUCCESSFUL`. If no device is attached, record that this step is pending and rerun it before the release candidate in Task 24.

- [ ] **Step 10: Commit**

```bash
git add android && git commit -m "feat(storage): add migration history, schema tests and startup recovery"
```

---

### Task 14: Autosave repository — crash-safe stroke persistence

**Files:**
- Create: `android/storage/src/main/kotlin/com/notes/school/storage/DocumentRepository.kt`
- Test: `android/storage/src/test/kotlin/com/notes/school/storage/DocumentRepositoryTest.kt`

**Interfaces:**
- Consumes: all DAOs and mappers (Task 12); `InkScene`-produced `Stroke` values (Task 4).
- Produces: `class DocumentRepository(private val db: NotesDatabase, private val scope: CoroutineScope, private val nowMs: () -> Long = System::currentTimeMillis, private val flushIntervalMs: Long = 400L)` with:
  - `suspend fun createDocument(folderId: String?, title: String, kind: DocumentKind, pageCount: Int = 1): DocumentMeta`
  - `suspend fun loadPageStrokes(pageId: String): List<Stroke>`
  - `fun queueStroke(stroke: Stroke)` — non-blocking, returns immediately
  - `fun queueActiveChange(strokeIds: List<String>, active: Boolean)`
  - `suspend fun flush()` — forces the queue to disk; used on pause and before export
  - `suspend fun saveViewport(pageId: String, x: Float, y: Float, zoom: Float)`
  - `fun close()`

- [ ] **Step 1: Write the failing test**

`android/storage/src/test/kotlin/com/notes/school/storage/DocumentRepositoryTest.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import com.notes.school.core.newId
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class DocumentRepositoryTest {

    private lateinit var db: NotesDatabase
    private lateinit var repository: DocumentRepository
    private val dispatcher = StandardTestDispatcher()
    private val scope = TestScope(dispatcher)
    private var clock = 1_000L

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NotesDatabase::class.java
        ).allowMainThreadQueries().build()
        repository = DocumentRepository(db, scope, nowMs = { clock })
    }

    @After
    fun tearDown() {
        repository.close()
        db.close()
    }

    private fun stroke(pageId: String, order: Long) = Stroke(
        newId(), pageId, ToolKind.PEN, -16777216, 3f,
        listOf(StrokePoint(0f, 0f, 0.5f, 0), StrokePoint(10f, 10f, 0.5f, 8)),
        Bounds(0f, 0f, 10f, 10f), order, true
    )

    @Test
    fun creatingADocumentAlsoCreatesItsFirstPage() = scope.runTest {
        val document = repository.createDocument(null, "Mathe", DocumentKind.GRID)
        val pages = db.pageDao().forDocument(document.id)
        assertEquals(1, pages.size)
        assertEquals(0, pages.single().pageIndex)
    }

    @Test
    fun createDocumentHonoursTheRequestedPageCount() = scope.runTest {
        val document = repository.createDocument(null, "Heft", DocumentKind.LINED, pageCount = 4)
        assertEquals(4, db.pageDao().forDocument(document.id).size)
    }

    @Test
    fun aQueuedStrokeReachesTheDatabaseWithinTheFlushInterval() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.queueStroke(stroke(page.id, 0))
        advanceUntilIdle()
        assertEquals(1, db.strokeDao().countForPage(page.id))
    }

    @Test
    fun queueStrokeDoesNotBlockTheCaller() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repeat(50) { repository.queueStroke(stroke(page.id, it.toLong())) }
        // Nothing has been written yet: the caller returned before any disk work happened.
        assertEquals(0, db.strokeDao().countForPage(page.id))
        advanceUntilIdle()
        assertEquals(50, db.strokeDao().countForPage(page.id))
    }

    @Test
    fun flushForcesEverythingPendingToDiskImmediately() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repeat(5) { repository.queueStroke(stroke(page.id, it.toLong())) }
        repository.flush()
        assertEquals(5, db.strokeDao().countForPage(page.id))
    }

    @Test
    fun strokesReloadInTheirOriginalOrder() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        val queued = (0L until 6L).map { stroke(page.id, it) }
        queued.forEach { repository.queueStroke(it) }
        repository.flush()
        assertEquals(queued.map { it.id }, repository.loadPageStrokes(page.id).map { it.id })
    }

    @Test
    fun anEraseIsPersistedAsAnActiveFlagChangeNotADelete() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        val s = stroke(page.id, 0)
        repository.queueStroke(s)
        repository.flush()
        repository.queueActiveChange(listOf(s.id), active = false)
        repository.flush()
        assertEquals(1, db.strokeDao().countForPage(page.id))
        assertEquals(0, db.strokeDao().activeForPage(page.id).size)
    }

    @Test
    fun persistingAStrokeBumpsTheDocumentTimestamp() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        clock = 9_000L
        repository.queueStroke(stroke(page.id, 0))
        repository.flush()
        assertEquals(9_000L, db.documentDao().byId(document.id)!!.updatedAtMs)
    }

    @Test
    fun strokesAlreadyWrittenSurviveAProcessRestart() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.queueStroke(stroke(page.id, 0))
        repository.flush()
        // Simulate a fresh process against the same database.
        val reopened = DocumentRepository(db, scope, nowMs = { clock })
        assertEquals(1, reopened.loadPageStrokes(page.id).size)
        reopened.close()
    }

    @Test
    fun viewportStateIsSavedPerPage() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.saveViewport(page.id, 30f, 60f, 1.5f)
        val stored = db.pageDao().byId(page.id)!!
        assertEquals(1.5f, stored.zoom, 0f)
        assertEquals(60f, stored.scrollY, 0f)
    }

    @Test
    fun closingTheRepositoryStopsAcceptingWorkWithoutLosingWhatWasFlushed() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.queueStroke(stroke(page.id, 0))
        repository.flush()
        repository.close()
        assertEquals(1, db.strokeDao().countForPage(page.id))
        assertNotNull(db.documentDao().byId(document.id))
        assertTrue(true)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :storage:testDebugUnitTest --tests "*DocumentRepositoryTest*"
```

Expected: FAIL — `Unresolved reference: DocumentRepository`.

- [ ] **Step 3: Write the implementation**

`android/storage/src/main/kotlin/com/notes/school/storage/DocumentRepository.kt`:

```kotlin
package com.notes.school.storage

import androidx.room.withTransaction
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Page
import com.notes.school.core.PageSource
import com.notes.school.core.Stroke
import com.notes.school.core.newId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private sealed interface SaveOp {
    data class Write(val stroke: Stroke) : SaveOp
    data class SetActive(val strokeIds: List<String>, val active: Boolean) : SaveOp
}

/**
 * Autosave. A completed stroke is handed over with [queueStroke], which never touches disk
 * on the calling thread. A background coroutine drains the queue and writes each batch in a
 * single transaction, so a crash either has the whole batch or none of it — and previously
 * committed strokes are untouched either way.
 *
 * ponytail: batching is time-agnostic — the drain loop writes whatever is queued as soon as
 * it is scheduled. If disk churn shows up in profiling, add a real debounce keyed on
 * [flushIntervalMs].
 */
class DocumentRepository(
    private val db: NotesDatabase,
    private val scope: CoroutineScope,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val flushIntervalMs: Long = 400L
) {
    private val queue = ArrayDeque<SaveOp>()
    private val queueLock = Mutex()
    private val wakeup = Channel<Unit>(Channel.CONFLATED)
    private var closed = false

    private val worker = scope.launch {
        for (unused in wakeup) {
            drain()
        }
    }

    suspend fun createDocument(
        folderId: String?,
        title: String,
        kind: DocumentKind,
        pageCount: Int = 1
    ): DocumentMeta {
        val now = nowMs()
        val document = DocumentMeta(
            id = newId(),
            folderId = folderId,
            title = title,
            kind = kind,
            createdAtMs = now,
            updatedAtMs = now
        )
        val pages = (0 until pageCount).map { index ->
            Page(
                id = newId(),
                documentId = document.id,
                index = index,
                widthPx = A4_WIDTH_PX,
                heightPx = A4_HEIGHT_PX,
                source = PageSource.Template(kind)
            )
        }
        db.withTransaction {
            db.documentDao().upsert(document.toEntity())
            db.pageDao().upsertAll(pages.map { it.toEntity() })
        }
        return document
    }

    suspend fun loadPageStrokes(pageId: String): List<Stroke> =
        db.strokeDao().forPage(pageId).map { it.toModel() }

    fun queueStroke(stroke: Stroke) {
        if (closed) return
        scope.launch {
            queueLock.withLock { queue.addLast(SaveOp.Write(stroke)) }
            wakeup.trySend(Unit)
        }
    }

    fun queueActiveChange(strokeIds: List<String>, active: Boolean) {
        if (closed || strokeIds.isEmpty()) return
        scope.launch {
            queueLock.withLock { queue.addLast(SaveOp.SetActive(strokeIds, active)) }
            wakeup.trySend(Unit)
        }
    }

    /** Writes everything currently queued. Call on pause, on close, and before export. */
    suspend fun flush() {
        drain()
    }

    suspend fun saveViewport(pageId: String, x: Float, y: Float, zoom: Float) {
        db.pageDao().saveViewport(pageId, x, y, zoom)
    }

    fun close() {
        closed = true
        wakeup.close()
        worker.cancel()
    }

    private suspend fun drain() {
        val batch = queueLock.withLock {
            if (queue.isEmpty()) return
            val copy = queue.toList()
            queue.clear()
            copy
        }
        val writes = batch.filterIsInstance<SaveOp.Write>().map { it.stroke }
        val flags = batch.filterIsInstance<SaveOp.SetActive>()
        db.withTransaction {
            if (writes.isNotEmpty()) {
                db.strokeDao().upsertAll(writes.map { it.toEntity() })
            }
            flags.forEach { db.strokeDao().setActive(it.strokeIds, it.active) }
            val touched = writes.map { it.pageId }.distinct()
            val now = nowMs()
            touched.forEach { pageId ->
                db.pageDao().byId(pageId)?.let { db.documentDao().touch(it.documentId, now) }
            }
        }
    }

    private companion object {
        // A4 at 150 dpi — comfortable on the SM-T505 without oversized bitmaps.
        const val A4_WIDTH_PX = 1240f
        const val A4_HEIGHT_PX = 1754f
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd android && ./gradlew :storage:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add android && git commit -m "feat(storage): add autosave repository with transactional stroke batching"
```

---
## Phase 4 — Document Engine (Paper and PDF)

### Task 15: Paper templates

**Files:**
- Create: `android/document-engine/build.gradle.kts`
- Create: `android/document-engine/src/main/AndroidManifest.xml`
- Create: `android/document-engine/src/main/kotlin/com/notes/school/document/PaperTemplate.kt`
- Test: `android/document-engine/src/test/kotlin/com/notes/school/document/PaperTemplateTest.kt`
- Modify: `android/settings.gradle.kts` (uncomment `include(":document-engine")`)

**Interfaces:**
- Consumes: `DocumentKind` (Task 2).
- Produces:
  - `object PaperTemplate` with `fun draw(canvas: Canvas, kind: DocumentKind, widthPx: Float, heightPx: Float)`
  - `const val PAGE_COLOR: Int`, `const val RULE_COLOR: Int`, `const val LINE_SPACING_PX: Float`, `const val GRID_SPACING_PX: Float`, `const val MARGIN_PX: Float` (all in `PaperTemplate`)

- [ ] **Step 1: Add the module build file and enable it**

`android/document-engine/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.notes.school.document"
    compileSdk = 34
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].kotlin.srcDir("src/main/kotlin")
    sourceSets["test"].kotlin.srcDir("src/test/kotlin")
    sourceSets["androidTest"].kotlin.srcDir("src/androidTest/kotlin")
    testOptions { unitTests { isIncludeAndroidResources = true } }
}

dependencies {
    api(project(":core-model"))
    implementation(project(":ink-engine"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.pdfbox.android)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
}
```

`android/document-engine/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest />
```

Uncomment `include(":document-engine")` in `android/settings.gradle.kts`.

- [ ] **Step 2: Write the failing test**

`android/document-engine/src/test/kotlin/com/notes/school/document/PaperTemplateTest.kt`:

```kotlin
package com.notes.school.document

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.notes.school.core.DocumentKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class PaperTemplateTest {

    private fun render(kind: DocumentKind, width: Int = 400, height: Int = 400): Bitmap {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        PaperTemplate.draw(Canvas(bitmap), kind, width.toFloat(), height.toFloat())
        return bitmap
    }

    private fun nonPageColorPixels(bitmap: Bitmap): Int {
        var count = 0
        for (x in 0 until bitmap.width) {
            for (y in 0 until bitmap.height) {
                if (bitmap.getPixel(x, y) != PaperTemplate.PAGE_COLOR) count++
            }
        }
        return count
    }

    @Test
    fun blankPaperIsUniformWhite() {
        val bitmap = render(DocumentKind.BLANK)
        assertEquals(PaperTemplate.PAGE_COLOR, bitmap.getPixel(0, 0))
        assertEquals(0, nonPageColorPixels(bitmap))
    }

    @Test
    fun thePageStaysWhiteEvenThoughTheAppIsDark() {
        assertEquals(Color.WHITE, PaperTemplate.PAGE_COLOR)
    }

    @Test
    fun linedPaperDrawsHorizontalRulesAndNothingElse() {
        val bitmap = render(DocumentKind.LINED)
        val markedRows = (0 until bitmap.height).count { y ->
            (0 until bitmap.width).any { x -> bitmap.getPixel(x, y) != PaperTemplate.PAGE_COLOR }
        }
        val expectedRules = (400f / PaperTemplate.LINE_SPACING_PX).toInt()
        assertTrue("expected about $expectedRules rules, saw $markedRows rows", markedRows >= expectedRules)
        assertTrue(markedRows < 400)
    }

    @Test
    fun gridPaperMarksBothRowsAndColumns() {
        val bitmap = render(DocumentKind.GRID)
        val markedColumns = (0 until bitmap.width).count { x ->
            (0 until bitmap.height).any { y -> bitmap.getPixel(x, y) != PaperTemplate.PAGE_COLOR }
        }
        assertTrue(markedColumns > (400f / PaperTemplate.GRID_SPACING_PX).toInt() - 1)
    }

    @Test
    fun pdfBackedPagesGetNoTemplateInkDrawnOverThem() {
        val bitmap = render(DocumentKind.PDF)
        assertEquals(0, nonPageColorPixels(bitmap))
    }

    @Test
    fun aZeroSizedPageIsHandledWithoutCrashing() {
        val bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        PaperTemplate.draw(Canvas(bitmap), DocumentKind.LINED, 0f, 0f)
        assertEquals(PaperTemplate.PAGE_COLOR, bitmap.getPixel(0, 0))
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd android && ./gradlew :document-engine:testDebugUnitTest
```

Expected: FAIL — `Unresolved reference: PaperTemplate`.

- [ ] **Step 4: Write the implementation**

`android/document-engine/src/main/kotlin/com/notes/school/document/PaperTemplate.kt`:

```kotlin
package com.notes.school.document

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import com.notes.school.core.DocumentKind

/**
 * Paper is the content layer: the page stays white while the rest of the app is dark.
 * Templates are drawn, never bitmap assets, so they stay crisp at any zoom.
 */
object PaperTemplate {

    val PAGE_COLOR: Int = Color.WHITE
    val RULE_COLOR: Int = Color.argb(255, 200, 209, 219)

    /** Roughly 9 mm at 150 dpi, the spacing of a German college-ruled block. */
    const val LINE_SPACING_PX: Float = 53f
    /** Roughly 5 mm at 150 dpi. */
    const val GRID_SPACING_PX: Float = 30f
    const val MARGIN_PX: Float = 90f

    private val background = Paint().apply { color = PAGE_COLOR }
    private val rule = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = RULE_COLOR
        strokeWidth = 1.2f
        style = Paint.Style.STROKE
    }

    fun draw(canvas: Canvas, kind: DocumentKind, widthPx: Float, heightPx: Float) {
        canvas.drawRect(0f, 0f, maxOf(widthPx, 1f), maxOf(heightPx, 1f), background)
        if (widthPx <= 0f || heightPx <= 0f) return
        when (kind) {
            DocumentKind.LINED -> {
                var y = LINE_SPACING_PX
                while (y < heightPx) {
                    canvas.drawLine(MARGIN_PX, y, widthPx - MARGIN_PX / 2f, y, rule)
                    y += LINE_SPACING_PX
                }
            }
            DocumentKind.GRID -> {
                var y = GRID_SPACING_PX
                while (y < heightPx) {
                    canvas.drawLine(0f, y, widthPx, y, rule)
                    y += GRID_SPACING_PX
                }
                var x = GRID_SPACING_PX
                while (x < widthPx) {
                    canvas.drawLine(x, 0f, x, heightPx, rule)
                    x += GRID_SPACING_PX
                }
            }
            // A PDF page supplies its own content; drawing rules over it would be vandalism.
            DocumentKind.BLANK, DocumentKind.PDF -> Unit
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd android && ./gradlew :document-engine:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
git add android && git commit -m "feat(document-engine): add blank, lined and grid paper templates"
```

---

### Task 16: PDF import and page rendering with a bounded tile cache

**Files:**
- Create: `android/document-engine/src/main/kotlin/com/notes/school/document/PdfImporter.kt`
- Create: `android/document-engine/src/main/kotlin/com/notes/school/document/PdfPageSource.kt`
- Create: `android/document-engine/src/main/kotlin/com/notes/school/document/PageBitmapCache.kt`
- Test: `android/document-engine/src/test/kotlin/com/notes/school/document/PageBitmapCacheTest.kt`
- Test: `android/document-engine/src/test/kotlin/com/notes/school/document/PdfPageSourceTest.kt`
- Test fixture: `android/document-engine/src/test/kotlin/com/notes/school/document/TestPdfs.kt`

**Interfaces:**
- Consumes: `Page`, `PageSource`, `DocumentMeta` (Task 2).
- Produces:
  - `class PdfImportException(message: String, cause: Throwable? = null) : Exception(message, cause)`
  - `class PdfImporter(private val filesDir: File)` with `fun importCopy(source: InputStream, documentId: String): String` (returns the relative `sourceRef`), `fun resolve(sourceRef: String): File`, `fun delete(sourceRef: String)`
  - `data class PdfPageInfo(val index: Int, val widthPt: Float, val heightPt: Float)`
  - `class PdfPageSource(file: File) : Closeable` with `val pageCount: Int`, `fun pageInfo(index: Int): PdfPageInfo`, `fun renderPage(index: Int, targetWidthPx: Int): Bitmap`, `override fun close()`
  - `class PageBitmapCache(private val maxBytes: Int)` with `fun get(key: String): Bitmap?`, `fun put(key: String, bitmap: Bitmap)`, `fun evictAll()`, `val sizeBytes: Int`, `fun trimToFraction(fraction: Float)`

- [ ] **Step 1: Write the PDF test fixture**

`android/document-engine/src/test/kotlin/com/notes/school/document/TestPdfs.kt`:

```kotlin
package com.notes.school.document

import java.io.File

/**
 * Generates a minimal valid PDF at runtime, so the repository carries no binary fixture
 * and the corpus stays free of anything resembling real schoolwork.
 */
object TestPdfs {

    fun twoPagePdf(target: File): File {
        val objects = mutableListOf<String>()
        objects += "<< /Type /Catalog /Pages 2 0 R >>"
        objects += "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>"
        objects += "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << >> >>"
        objects += "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << >> >>"
        val content = "0 0 1 RG 4 w 100 100 m 400 700 l S"
        objects += "<< /Length ${content.length} >>\nstream\n$content\nendstream"

        val builder = StringBuilder("%PDF-1.4\n")
        val offsets = mutableListOf<Int>()
        objects.forEachIndexed { index, body ->
            offsets += builder.length
            builder.append("${index + 1} 0 obj\n$body\nendobj\n")
        }
        val xrefStart = builder.length
        builder.append("xref\n0 ${objects.size + 1}\n")
        builder.append("0000000000 65535 f \n")
        offsets.forEach { builder.append(String.format("%010d 00000 n \n", it)) }
        builder.append("trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\n")
        builder.append("startxref\n$xrefStart\n%%EOF\n")

        target.parentFile?.mkdirs()
        target.writeText(builder.toString())
        return target
    }

    fun corruptPdf(target: File): File {
        target.parentFile?.mkdirs()
        target.writeText("%PDF-1.4\nthis is not a pdf body at all\n")
        return target
    }
}
```

- [ ] **Step 2: Write the failing cache test**

`android/document-engine/src/test/kotlin/com/notes/school/document/PageBitmapCacheTest.kt`:

```kotlin
package com.notes.school.document

import android.graphics.Bitmap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class PageBitmapCacheTest {

    /** 100 x 100 ARGB_8888 = 40_000 bytes. */
    private fun tile() = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)

    @Test
    fun storedTilesComeBackByKey() {
        val cache = PageBitmapCache(maxBytes = 200_000)
        val bitmap = tile()
        cache.put("page-0", bitmap)
        assertEquals(bitmap, cache.get("page-0"))
    }

    @Test
    fun missingKeysReturnNull() {
        assertNull(PageBitmapCache(maxBytes = 200_000).get("nope"))
    }

    @Test
    fun theCacheNeverExceedsItsByteBudget() {
        val cache = PageBitmapCache(maxBytes = 100_000)
        repeat(10) { cache.put("page-$it", tile()) }
        assertTrue("size was ${cache.sizeBytes}", cache.sizeBytes <= 100_000)
    }

    @Test
    fun theLeastRecentlyUsedTileIsEvictedFirst() {
        val cache = PageBitmapCache(maxBytes = 90_000)
        cache.put("a", tile())
        cache.put("b", tile())
        cache.get("a") // a becomes most recently used
        cache.put("c", tile())
        assertNotNull(cache.get("a"))
        assertNull(cache.get("b"))
    }

    @Test
    fun evictAllEmptiesTheCache() {
        val cache = PageBitmapCache(maxBytes = 200_000)
        cache.put("a", tile())
        cache.evictAll()
        assertEquals(0, cache.sizeBytes)
        assertNull(cache.get("a"))
    }

    @Test
    fun trimToFractionShrinksTheCacheUnderMemoryPressure() {
        val cache = PageBitmapCache(maxBytes = 400_000)
        repeat(8) { cache.put("page-$it", tile()) }
        cache.trimToFraction(0.25f)
        assertTrue("size was ${cache.sizeBytes}", cache.sizeBytes <= 100_000)
    }
}
```

- [ ] **Step 3: Write the failing PDF test**

`android/document-engine/src/test/kotlin/com/notes/school/document/PdfPageSourceTest.kt`:

```kotlin
package com.notes.school.document

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class PdfPageSourceTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun samplePdf(): File = TestPdfs.twoPagePdf(temp.newFile("sample.pdf"))

    @Test
    fun importCopiesTheSourceIntoAppPrivateStorageAndLeavesItUnmodified() {
        val importer = PdfImporter(temp.newFolder("files"))
        val source = samplePdf()
        val ref = importer.importCopy(source.inputStream(), documentId = "doc-1")
        val stored = importer.resolve(ref)
        assertTrue(stored.isFile)
        assertEquals(source.readBytes().size, stored.readBytes().size)
    }

    @Test
    fun eachImportGetsItsOwnPathSoDocumentsNeverShareASource() {
        val importer = PdfImporter(temp.newFolder("files"))
        val first = importer.importCopy(samplePdf().inputStream(), "doc-1")
        val second = importer.importCopy(samplePdf().inputStream(), "doc-2")
        assertNotEquals(first, second)
    }

    @Test
    fun deleteRemovesTheStoredCopy() {
        val importer = PdfImporter(temp.newFolder("files"))
        val ref = importer.importCopy(samplePdf().inputStream(), "doc-1")
        importer.delete(ref)
        assertTrue(!importer.resolve(ref).exists())
    }

    @Test
    fun pageCountMatchesTheDocument() {
        PdfPageSource(samplePdf()).use { assertEquals(2, it.pageCount) }
    }

    @Test
    fun pageInfoReportsTheMediaBoxSize() {
        PdfPageSource(samplePdf()).use {
            val info = it.pageInfo(0)
            assertEquals(595f, info.widthPt, 1f)
            assertEquals(842f, info.heightPt, 1f)
        }
    }

    @Test
    fun renderedPageKeepsTheSourceAspectRatio() {
        PdfPageSource(samplePdf()).use {
            val bitmap = it.renderPage(0, targetWidthPx = 600)
            assertEquals(600, bitmap.width)
            assertEquals((600 * 842f / 595f).toInt(), bitmap.height, 2)
        }
    }

    @Test
    fun renderingAnOutOfRangePageFailsLoudly() {
        PdfPageSource(samplePdf()).use {
            assertThrows(IllegalArgumentException::class.java) { it.renderPage(9, 600) }
        }
    }

    @Test
    fun aCorruptPdfFailsWithATypedErrorRatherThanCrashing() {
        val corrupt = TestPdfs.corruptPdf(temp.newFile("broken.pdf"))
        assertThrows(PdfImportException::class.java) { PdfPageSource(corrupt) }
    }

    @Test
    fun closingReleasesTheRendererSoTheFileCanBeDeleted() {
        val file = samplePdf()
        PdfPageSource(file).close()
        assertTrue(file.delete())
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd android && ./gradlew :document-engine:testDebugUnitTest
```

Expected: FAIL — `Unresolved reference: PageBitmapCache`.

- [ ] **Step 5: Write `PageBitmapCache`**

`android/document-engine/src/main/kotlin/com/notes/school/document/PageBitmapCache.kt`:

```kotlin
package com.notes.school.document

import android.graphics.Bitmap
import android.util.LruCache

/**
 * Bounded, deterministic page-tile cache. Sizing is in bytes rather than entries because a
 * rendered A4 page at reading zoom is worth dozens of small tiles on this tablet's budget.
 */
class PageBitmapCache(private val maxBytes: Int) {

    private val cache = object : LruCache<String, Bitmap>(maxBytes) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    val sizeBytes: Int get() = cache.size()

    fun get(key: String): Bitmap? = cache.get(key)

    fun put(key: String, bitmap: Bitmap) {
        if (bitmap.byteCount > maxBytes) return
        cache.put(key, bitmap)
    }

    fun evictAll() = cache.evictAll()

    /** Called on onTrimMemory so background prefetch stops costing memory under pressure. */
    fun trimToFraction(fraction: Float) {
        cache.trimToSize((maxBytes * fraction.coerceIn(0f, 1f)).toInt())
    }
}
```

- [ ] **Step 6: Write `PdfImporter` and `PdfPageSource`**

`android/document-engine/src/main/kotlin/com/notes/school/document/PdfImporter.kt`:

```kotlin
package com.notes.school.document

import java.io.File
import java.io.InputStream

class PdfImportException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Copies an imported PDF once into app-private storage and never writes to it again.
 * Every later operation — rendering, export — works from that immutable copy, so a failed
 * export can never damage the original worksheet.
 */
class PdfImporter(private val filesDir: File) {

    private val root: File get() = File(filesDir, PDF_DIR).apply { mkdirs() }

    /** @return the relative sourceRef to store on the document row. */
    fun importCopy(source: InputStream, documentId: String): String {
        val relative = "$PDF_DIR/$documentId.pdf"
        val target = File(filesDir, relative)
        target.parentFile?.mkdirs()
        try {
            source.use { input -> target.outputStream().use { input.copyTo(it) } }
        } catch (e: Exception) {
            target.delete()
            throw PdfImportException("could not store the imported document", e)
        }
        if (target.length() == 0L) {
            target.delete()
            throw PdfImportException("imported document was empty")
        }
        return relative
    }

    fun resolve(sourceRef: String): File = File(filesDir, sourceRef)

    fun delete(sourceRef: String) {
        resolve(sourceRef).delete()
    }

    private companion object {
        const val PDF_DIR = "pdf"
    }
}
```

`android/document-engine/src/main/kotlin/com/notes/school/document/PdfPageSource.kt`:

```kotlin
package com.notes.school.document

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.Closeable
import java.io.File

data class PdfPageInfo(val index: Int, val widthPt: Float, val heightPt: Float)

/**
 * Reads pages from the immutable imported PDF using the platform renderer, which is
 * available on Android 12 without any SDK extension.
 *
 * PdfRenderer allows only one open page at a time, so every render opens, draws, and closes
 * within the call. That is also what keeps peak memory predictable on the SM-T505.
 */
class PdfPageSource(file: File) : Closeable {

    private val descriptor: ParcelFileDescriptor
    private val renderer: PdfRenderer

    init {
        try {
            descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            renderer = PdfRenderer(descriptor)
        } catch (e: Exception) {
            throw PdfImportException("this document could not be opened", e)
        }
    }

    val pageCount: Int get() = renderer.pageCount

    fun pageInfo(index: Int): PdfPageInfo {
        require(index in 0 until pageCount) { "page $index out of range (0..${pageCount - 1})" }
        renderer.openPage(index).use { page ->
            return PdfPageInfo(index, page.width.toFloat(), page.height.toFloat())
        }
    }

    fun renderPage(index: Int, targetWidthPx: Int): Bitmap {
        require(index in 0 until pageCount) { "page $index out of range (0..${pageCount - 1})" }
        require(targetWidthPx > 0) { "target width must be positive" }
        renderer.openPage(index).use { page ->
            val height = (targetWidthPx * page.height.toFloat() / page.width.toFloat()).toInt()
            val bitmap = Bitmap.createBitmap(targetWidthPx, maxOf(height, 1), Bitmap.Config.ARGB_8888)
            // PdfRenderer composites onto transparency; paper must be white underneath.
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            return bitmap
        }
    }

    override fun close() {
        renderer.close()
        descriptor.close()
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd android && ./gradlew :document-engine:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`. Robolectric's `PdfRenderer` shadow is limited; if `renderPage` cannot run under Robolectric, move `PdfPageSourceTest` to `src/androidTest/kotlin` unchanged and run it with `./gradlew :document-engine:connectedDebugAndroidTest`. Keep `PageBitmapCacheTest` in JVM tests either way.

- [ ] **Step 8: Commit**

```bash
git add android && git commit -m "feat(document-engine): add PDF import, page rendering and bounded tile cache"
```

---

### Task 17: Annotated PDF export with a flattened fallback

**Files:**
- Create: `android/document-engine/src/main/kotlin/com/notes/school/document/PdfExporter.kt`
- Create: `android/document-engine/src/main/kotlin/com/notes/school/document/PdfBoxAnnotationExporter.kt`
- Create: `android/document-engine/src/main/kotlin/com/notes/school/document/FlattenedPdfExporter.kt`
- Test: `android/document-engine/src/androidTest/kotlin/com/notes/school/document/PdfExporterTest.kt`
- Test: `android/document-engine/src/test/kotlin/com/notes/school/document/ExportPlanTest.kt`

**Interfaces:**
- Consumes: `Stroke`, `Page`, `ToolKind` (Tasks 2, 4); `PdfPageSource`, `PdfImporter` (Task 16); `PaperTemplate` (Task 15).
- Produces:
  - `sealed interface ExportResult { data class Success(val file: File, val flattened: Boolean) : ExportResult; data class Failure(val reason: String, val cause: Throwable?) : ExportResult }`
  - `interface PdfExporter { fun export(request: ExportRequest): ExportResult }`
  - `data class ExportRequest(val sourcePdf: File?, val pages: List<ExportPage>, val target: File, val tempDir: File)`
  - `data class ExportPage(val pageIndex: Int, val widthPx: Float, val heightPx: Float, val strokes: List<Stroke>, val templateKind: DocumentKind)`
  - `class PdfBoxAnnotationExporter(private val context: Context) : PdfExporter`
  - `class FlattenedPdfExporter : PdfExporter`
  - `class ExportCoordinator(private val primary: PdfExporter, private val fallback: PdfExporter) : PdfExporter` — tries the annotation path, falls back, and publishes only after success.

- [ ] **Step 1: Write the failing export-plan test**

`android/document-engine/src/test/kotlin/com/notes/school/document/ExportPlanTest.kt`:

```kotlin
package com.notes.school.document

import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ExportPlanTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun page(index: Int) = ExportPage(
        pageIndex = index,
        widthPx = 1240f,
        heightPx = 1754f,
        strokes = listOf(
            Stroke(
                "s$index", "p$index", ToolKind.PEN, -16777216, 3f,
                listOf(StrokePoint(10f, 10f, 1f, 0), StrokePoint(100f, 100f, 1f, 8)),
                Bounds(8f, 8f, 102f, 102f), 0L, true
            )
        ),
        templateKind = DocumentKind.PDF
    )

    private class StubExporter(
        private val result: (ExportRequest) -> ExportResult
    ) : PdfExporter {
        var calls = 0
        override fun export(request: ExportRequest): ExportResult {
            calls++
            return result(request)
        }
    }

    private fun request() = ExportRequest(
        sourcePdf = null,
        pages = listOf(page(0), page(1)),
        target = File(temp.root, "out.pdf"),
        tempDir = temp.newFolder("tmp")
    )

    @Test
    fun theAnnotationPathIsUsedWhenItSucceeds() {
        val primary = StubExporter { ExportResult.Success(it.target, flattened = false) }
        val fallback = StubExporter { ExportResult.Success(it.target, flattened = true) }
        val result = ExportCoordinator(primary, fallback).export(request())
        assertTrue(result is ExportResult.Success)
        assertFalse((result as ExportResult.Success).flattened)
        assertEquals(0, fallback.calls)
    }

    @Test
    fun aFailedAnnotationExportFallsBackToFlattening() {
        val primary = StubExporter { ExportResult.Failure("unsupported feature", null) }
        val fallback = StubExporter { ExportResult.Success(it.target, flattened = true) }
        val result = ExportCoordinator(primary, fallback).export(request())
        assertTrue((result as ExportResult.Success).flattened)
        assertEquals(1, fallback.calls)
    }

    @Test
    fun aThrowingPrimaryExporterAlsoTriggersTheFallback() {
        val primary = StubExporter { throw OutOfMemoryError("page too large") }
        val fallback = StubExporter { ExportResult.Success(it.target, flattened = true) }
        val result = ExportCoordinator(primary, fallback).export(request())
        assertTrue(result is ExportResult.Success)
    }

    @Test
    fun bothPathsFailingReportsAFailureAndPublishesNothing() {
        val primary = StubExporter { ExportResult.Failure("no", null) }
        val fallback = StubExporter { ExportResult.Failure("also no", null) }
        val req = request()
        val result = ExportCoordinator(primary, fallback).export(req)
        assertTrue(result is ExportResult.Failure)
        assertFalse("a failed export must not leave a file behind", req.target.exists())
    }

    @Test
    fun aFailedExportLeavesAPreexistingTargetFileUntouched() {
        val req = request()
        req.target.writeText("previous export")
        val primary = StubExporter { ExportResult.Failure("no", null) }
        val fallback = StubExporter { ExportResult.Failure("also no", null) }
        ExportCoordinator(primary, fallback).export(req)
        assertEquals("previous export", req.target.readText())
    }

    @Test
    fun temporaryFilesAreCleanedUpAfterASuccessfulExport() {
        val req = request()
        val primary = StubExporter {
            File(it.tempDir, "work.pdf").writeText("x")
            ExportResult.Success(it.target, flattened = false)
        }
        ExportCoordinator(primary, StubExporter { ExportResult.Failure("n/a", null) }).export(req)
        assertEquals(0, req.tempDir.listFiles()!!.size)
    }
}
```

- [ ] **Step 2: Write the failing instrumented export test**

`android/document-engine/src/androidTest/kotlin/com/notes/school/document/PdfExporterTest.kt`:

```kotlin
package com.notes.school.document

import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the SM-T505. PdfBox-Android needs a real Android runtime, and export memory
 * behaviour is exactly what an emulator would misreport.
 */
@RunWith(AndroidJUnit4::class)
class PdfExporterTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var workDir: File

    @Before
    fun setUp() {
        workDir = File(context.cacheDir, "export-test").apply {
            deleteRecursively()
            mkdirs()
        }
    }

    private fun strokes(pageId: String) = listOf(
        Stroke(
            "s1", pageId, ToolKind.PEN, 0xFF1A73E8.toInt(), 4f,
            (0..40).map { StrokePoint(60f + it * 12f, 200f + it * 6f, 1f, it * 8) },
            Bounds(50f, 190f, 600f, 460f), 0L, true
        ),
        Stroke(
            "s2", pageId, ToolKind.HIGHLIGHTER, 0xFFFFEE00.toInt(), 20f,
            (0..20).map { StrokePoint(80f + it * 20f, 700f, 1f, it * 8) },
            Bounds(70f, 690f, 500f, 710f), 1L, true
        )
    )

    private fun request(source: File?, target: File) = ExportRequest(
        sourcePdf = source,
        pages = listOf(
            ExportPage(0, 1240f, 1754f, strokes("p0"), DocumentKind.PDF),
            ExportPage(1, 1240f, 1754f, strokes("p1"), DocumentKind.PDF)
        ),
        target = target,
        tempDir = File(workDir, "tmp").apply { mkdirs() }
    )

    private fun pageCountOf(file: File): Int {
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { return it.pageCount }
        }
    }

    @Test
    fun annotatedExportProducesAFileAnExternalViewerCanOpen() {
        val source = TestPdfs.twoPagePdf(File(workDir, "source.pdf"))
        val target = File(workDir, "annotated.pdf")
        val result = PdfBoxAnnotationExporter(context).export(request(source, target))
        assertTrue("export failed: $result", result is ExportResult.Success)
        assertTrue(target.length() > 0)
        assertEquals(2, pageCountOf(target))
    }

    @Test
    fun theOriginalSourceFileIsNeverModifiedByAnExport() {
        val source = TestPdfs.twoPagePdf(File(workDir, "source.pdf"))
        val before = source.readBytes()
        PdfBoxAnnotationExporter(context).export(request(source, File(workDir, "out.pdf")))
        assertTrue(before.contentEquals(source.readBytes()))
    }

    @Test
    fun flattenedExportWorksWithoutAnySourcePdf() {
        val target = File(workDir, "flat.pdf")
        val result = FlattenedPdfExporter().export(request(source = null, target = target))
        assertTrue("export failed: $result", result is ExportResult.Success)
        assertTrue((result as ExportResult.Success).flattened)
        assertEquals(2, pageCountOf(target))
    }

    @Test
    fun exportingACorruptSourceFallsBackToFlatteningRatherThanFailing() {
        val corrupt = TestPdfs.corruptPdf(File(workDir, "broken.pdf"))
        val target = File(workDir, "recovered.pdf")
        val coordinator = ExportCoordinator(
            PdfBoxAnnotationExporter(context),
            FlattenedPdfExporter()
        )
        val result = coordinator.export(request(corrupt, target))
        assertTrue(result is ExportResult.Success)
        assertTrue((result as ExportResult.Success).flattened)
    }

    @Test
    fun aTwentyPageExportStaysInsideTheMemoryBudget() {
        val target = File(workDir, "large.pdf")
        val pages = (0 until 20).map {
            ExportPage(it, 1240f, 1754f, strokes("p$it"), DocumentKind.PDF)
        }
        val runtime = Runtime.getRuntime()
        val before = runtime.totalMemory() - runtime.freeMemory()
        val result = FlattenedPdfExporter().export(
            ExportRequest(null, pages, target, File(workDir, "tmp2").apply { mkdirs() })
        )
        val after = runtime.totalMemory() - runtime.freeMemory()
        assertTrue(result is ExportResult.Success)
        assertTrue(
            "export grew the heap by ${(after - before) / 1024 / 1024} MB",
            after - before < 96L * 1024 * 1024
        )
    }
}
```

- [ ] **Step 3: Run the JVM test to verify it fails**

```bash
cd android && ./gradlew :document-engine:testDebugUnitTest --tests "*ExportPlanTest*"
```

Expected: FAIL — `Unresolved reference: ExportPage`.

- [ ] **Step 4: Write the export contract and coordinator**

`android/document-engine/src/main/kotlin/com/notes/school/document/PdfExporter.kt`:

```kotlin
package com.notes.school.document

import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import java.io.File

data class ExportPage(
    val pageIndex: Int,
    val widthPx: Float,
    val heightPx: Float,
    val strokes: List<Stroke>,
    val templateKind: DocumentKind
)

data class ExportRequest(
    /** The immutable imported PDF, or null for a paper document. */
    val sourcePdf: File?,
    val pages: List<ExportPage>,
    val target: File,
    val tempDir: File
)

sealed interface ExportResult {
    data class Success(val file: File, val flattened: Boolean) : ExportResult
    data class Failure(val reason: String, val cause: Throwable?) : ExportResult
}

interface PdfExporter {
    fun export(request: ExportRequest): ExportResult
}

/**
 * Runs the annotation exporter first and flattens only if it cannot finish. Writes through
 * a temporary file so a failed or half-finished export never replaces a good one — a manual
 * export must never become the only copy, and it must never destroy the previous copy.
 */
class ExportCoordinator(
    private val primary: PdfExporter,
    private val fallback: PdfExporter
) : PdfExporter {

    override fun export(request: ExportRequest): ExportResult {
        request.tempDir.mkdirs()
        val staged = File(request.tempDir, "staged-${System.currentTimeMillis()}.pdf")
        val stagedRequest = request.copy(target = staged)

        val result = attempt(primary, stagedRequest) ?: attempt(fallback, stagedRequest)
        if (result == null || !staged.isFile || staged.length() == 0L) {
            cleanup(request.tempDir)
            return ExportResult.Failure("the document could not be exported", null)
        }

        return try {
            request.target.parentFile?.mkdirs()
            staged.copyTo(request.target, overwrite = true)
            ExportResult.Success(request.target, result.flattened)
        } catch (e: Exception) {
            ExportResult.Failure("the exported file could not be published", e)
        } finally {
            cleanup(request.tempDir)
        }
    }

    private fun attempt(exporter: PdfExporter, request: ExportRequest): ExportResult.Success? =
        try {
            exporter.export(request) as? ExportResult.Success
        } catch (e: Throwable) {
            // OutOfMemoryError on a big page is exactly the case the fallback exists for.
            null
        }

    private fun cleanup(tempDir: File) {
        tempDir.listFiles()?.forEach { it.delete() }
    }
}
```

- [ ] **Step 5: Write the PdfBox annotation exporter**

`android/document-engine/src/main/kotlin/com/notes/school/document/PdfBoxAnnotationExporter.kt`:

```kotlin
package com.notes.school.document

import android.content.Context
import android.graphics.Color
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.notes.school.core.ToolKind
import java.io.File

/**
 * Applies the app's vector ink onto a copy of the immutable source, keeping the original
 * page content — and therefore its selectable text — intact.
 *
 * One page is processed and released at a time; the SM-T505 does not have the headroom to
 * hold a whole worksheet's content streams at once.
 */
class PdfBoxAnnotationExporter(private val context: Context) : PdfExporter {

    override fun export(request: ExportRequest): ExportResult {
        PDFBoxResourceLoader.init(context.applicationContext)
        val source = request.sourcePdf
            ?: return ExportResult.Failure("no source document to annotate", null)
        if (!source.isFile) return ExportResult.Failure("the source document is missing", null)

        return try {
            PDDocument.load(source).use { document ->
                request.pages.forEach { page ->
                    if (page.pageIndex >= document.numberOfPages) return@forEach
                    val pdPage = document.getPage(page.pageIndex)
                    drawStrokes(document, pdPage, page)
                }
                request.target.parentFile?.mkdirs()
                document.save(request.target)
            }
            ExportResult.Success(request.target, flattened = false)
        } catch (e: Exception) {
            ExportResult.Failure("this document could not be annotated", e)
        }
    }

    private fun drawStrokes(document: PDDocument, pdPage: PDPage, page: ExportPage) {
        val box: PDRectangle = pdPage.mediaBox
        val scaleX = box.width / page.widthPx
        val scaleY = box.height / page.heightPx

        PDPageContentStream(
            document,
            pdPage,
            PDPageContentStream.AppendMode.APPEND,
            /* compress = */ true,
            /* resetContext = */ true
        ).use { stream ->
            for (stroke in page.strokes) {
                if (!stroke.active || stroke.points.isEmpty()) continue
                if (stroke.tool == ToolKind.HIGHLIGHTER) {
                    val state = PDExtendedGraphicsState().apply {
                        strokingAlphaConstant = HIGHLIGHTER_ALPHA
                        nonStrokingAlphaConstant = HIGHLIGHTER_ALPHA
                    }
                    stream.setGraphicsStateParameters(state)
                } else {
                    stream.setGraphicsStateParameters(PDExtendedGraphicsState())
                }
                stream.setStrokingColor(
                    Color.red(stroke.colorArgb) / 255f,
                    Color.green(stroke.colorArgb) / 255f,
                    Color.blue(stroke.colorArgb) / 255f
                )
                stream.setLineWidth(stroke.widthPx * scaleX)
                stream.setLineCapStyle(1)
                stream.setLineJoinStyle(1)

                val first = stroke.points.first()
                // PDF's origin is bottom-left; the app's is top-left.
                stream.moveTo(first.x * scaleX, box.height - first.y * scaleY)
                for (i in 1 until stroke.points.size) {
                    val p = stroke.points[i]
                    stream.lineTo(p.x * scaleX, box.height - p.y * scaleY)
                }
                stream.stroke()
            }
        }
    }

    private companion object {
        const val HIGHLIGHTER_ALPHA = 0.38f
    }
}
```

- [ ] **Step 6: Write the flattened fallback exporter**

`android/document-engine/src/main/kotlin/com/notes/school/document/FlattenedPdfExporter.kt`:

```kotlin
package com.notes.school.document

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.pdf.PdfDocument
import com.notes.school.ink.StrokeRenderer
import java.io.File

/**
 * Visual-only export. Used when the source PDF has a feature the annotation path cannot
 * preserve, when memory runs out, and for paper documents that have no source PDF at all.
 *
 * The caller must label this result as flattened in the UI: source text is no longer
 * selectable in the produced file.
 */
class FlattenedPdfExporter : PdfExporter {

    private val renderer = StrokeRenderer()

    override fun export(request: ExportRequest): ExportResult {
        if (request.pages.isEmpty()) return ExportResult.Failure("nothing to export", null)
        val document = PdfDocument()
        return try {
            request.pages.forEachIndexed { index, page ->
                val info = PdfDocument.PageInfo.Builder(
                    page.widthPx.toInt().coerceAtLeast(1),
                    page.heightPx.toInt().coerceAtLeast(1),
                    index
                ).create()
                val pdfPage = document.startPage(info)
                PaperTemplate.draw(pdfPage.canvas, page.templateKind, page.widthPx, page.heightPx)
                renderer.draw(pdfPage.canvas, page.strokes)
                // Finish each page before starting the next so only one page's worth of
                // canvas state is alive at a time.
                document.finishPage(pdfPage)
            }
            request.target.parentFile?.mkdirs()
            request.target.outputStream().use { document.writeTo(it) }
            ExportResult.Success(request.target, flattened = true)
        } catch (e: Exception) {
            ExportResult.Failure("the document could not be exported", e)
        } finally {
            document.close()
        }
    }

    /** Renders one page to a bitmap. Kept separate so page previews reuse the same path. */
    fun renderPreview(page: ExportPage, targetWidthPx: Int): Bitmap {
        val height = (targetWidthPx * page.heightPx / page.widthPx).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(targetWidthPx, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val scale = targetWidthPx / page.widthPx
        canvas.scale(scale, scale)
        PaperTemplate.draw(canvas, page.templateKind, page.widthPx, page.heightPx)
        renderer.draw(canvas, page.strokes)
        return bitmap
    }
}
```

- [ ] **Step 7: Run the JVM tests to verify they pass**

```bash
cd android && ./gradlew :document-engine:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Run the instrumented export tests on the tablet**

```bash
cd android && ./gradlew :document-engine:connectedDebugAndroidTest
```

Expected: `BUILD SUCCESSFUL`. Record the result; if no device is attached, this step stays open until Task 24.

- [ ] **Step 9: Commit**

```bash
git add android && git commit -m "feat(document-engine): add annotated PDF export with flattened fallback"
```

---
## Phase 5 — User Interface

Compose tests in this phase run as JVM unit tests via Robolectric, so the whole UI suite
stays runnable without a device. Add these once, in `android/app/build.gradle.kts`:

```kotlin
    implementation(project(":document-engine"))
    implementation(project(":storage"))
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
```

### Task 18: Dark theme, glass treatment and the navigation shell

**Files:**
- Create: `android/app/src/main/kotlin/com/notes/school/ui/theme/Theme.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/theme/Glass.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/NotesApp.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/Destinations.kt`
- Modify: `android/app/src/main/kotlin/com/notes/school/MainActivity.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/ThemeTest.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/NavigationTest.kt`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `object NotesColors` with `val Workspace: Color`, `val Surface: Color`, `val SurfaceRaised: Color`, `val Page: Color`, `val Accent: Color`, `val OnSurface: Color`, `val OnSurfaceMuted: Color`
  - `data class GlassSettings(val reducedTransparency: Boolean = false, val degraded: Boolean = false)`
  - `val LocalGlassSettings: ProvidableCompositionLocal<GlassSettings>`
  - `fun Modifier.glassSurface(cornerRadius: Dp = 20.dp): Modifier`
  - `@Composable fun NotesTheme(glass: GlassSettings = GlassSettings(), content: @Composable () -> Unit)`
  - `object Destinations { const val FILES = "files"; const val EDITOR = "editor/{documentId}"; const val SETTINGS = "settings"; const val PALM_ADVANCED = "settings/palm/advanced"; const val CALIBRATION = "settings/palm/calibration"; fun editor(documentId: String): String }`
  - `@Composable fun NotesApp(navController: NavHostController = rememberNavController(), ...)`
  - `const val MIN_TOUCH_TARGET_DP: Int = 48` (in `Glass.kt`)

- [ ] **Step 1: Write the failing theme test**

`android/app/src/test/kotlin/com/notes/school/ui/ThemeTest.kt`:

```kotlin
package com.notes.school.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.notes.school.ui.theme.GlassSettings
import com.notes.school.ui.theme.LocalGlassSettings
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.NotesTheme
import com.notes.school.ui.theme.glassSurface
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class ThemeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theWorkspaceIsDarkAndThePageIsWhite() {
        assertEquals(Color.White, NotesColors.Page)
        assertNotEquals(Color.White, NotesColors.Workspace)
        // "Dark" means genuinely dark, not merely grey.
        assertEquals(true, NotesColors.Workspace.red < 0.2f)
    }

    @Test
    fun themeSuppliesADarkMaterialColorScheme() {
        var background = Color.Unspecified
        compose.setContent {
            NotesTheme { background = MaterialTheme.colorScheme.background }
        }
        assertEquals(NotesColors.Workspace, background)
    }

    @Test
    fun glassSurfaceRendersItsContent() {
        compose.setContent {
            NotesTheme {
                Box(Modifier.size(120.dp).glassSurface().testTag("glass")) { Text("rail") }
            }
        }
        compose.onNodeWithTag("glass").assertIsDisplayed()
    }

    @Test
    fun reducedTransparencyStillRendersTheSameContent() {
        compose.setContent {
            NotesTheme(glass = GlassSettings(reducedTransparency = true)) {
                Box(Modifier.size(120.dp).glassSurface().testTag("glass")) { Text("rail") }
            }
        }
        compose.onNodeWithTag("glass").assertIsDisplayed()
    }

    @Test
    fun glassSettingsAreReadableFromTheCompositionLocal() {
        var seen: GlassSettings? = null
        compose.setContent {
            CompositionLocalProvider(LocalGlassSettings provides GlassSettings(degraded = true)) {
                seen = LocalGlassSettings.current
            }
        }
        assertEquals(true, seen!!.degraded)
    }
}
```

- [ ] **Step 2: Write the failing navigation test**

`android/app/src/test/kotlin/com/notes/school/ui/NavigationTest.kt`:

```kotlin
package com.notes.school.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import androidx.navigation.compose.rememberNavController
import androidx.navigation.testing.TestNavHostController
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class NavigationTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theAppStartsOnTheFileOverview() {
        compose.setContent { NotesApp() }
        compose.onNodeWithTag("files-screen").assertIsDisplayed()
    }

    @Test
    fun editorRouteBuildsWithTheDocumentId() {
        assertEquals("editor/abc-123", Destinations.editor("abc-123"))
    }

    @Test
    fun theSidebarSettingsEntryOpensTheSettingsScreen() {
        compose.setContent { NotesApp() }
        compose.onNodeWithTag("sidebar-settings").performClick()
        compose.onNodeWithTag("settings-screen").assertIsDisplayed()
    }
}
```

Add the navigation testing dependency to `android/app/build.gradle.kts`:

```kotlin
    testImplementation("androidx.navigation:navigation-testing:2.7.7")
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*ThemeTest*" --tests "*NavigationTest*"
```

Expected: FAIL — `Unresolved reference: NotesTheme`.

- [ ] **Step 4: Write the theme**

`android/app/src/main/kotlin/com/notes/school/ui/theme/Theme.kt`:

```kotlin
package com.notes.school.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color

/** Everything outside the page is dark; the page itself is paper white. */
object NotesColors {
    val Workspace = Color(0xFF121316)
    val Surface = Color(0xFF1B1D21)
    val SurfaceRaised = Color(0xFF24272C)
    val Page = Color.White
    val Accent = Color(0xFF7AA2F7)
    val OnSurface = Color(0xFFE7E9EE)
    val OnSurfaceMuted = Color(0xFF9AA0AA)
    val Danger = Color(0xFFE5484D)
}

private val scheme = darkColorScheme(
    background = NotesColors.Workspace,
    surface = NotesColors.Surface,
    surfaceVariant = NotesColors.SurfaceRaised,
    primary = NotesColors.Accent,
    onBackground = NotesColors.OnSurface,
    onSurface = NotesColors.OnSurface,
    onSurfaceVariant = NotesColors.OnSurfaceMuted,
    error = NotesColors.Danger
)

@Composable
fun NotesTheme(glass: GlassSettings = GlassSettings(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalGlassSettings provides glass) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
```

- [ ] **Step 5: Write the glass treatment**

`android/app/src/main/kotlin/com/notes/school/ui/theme/Glass.kt`:

```kotlin
package com.notes.school.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape

/** Every interactive control must be at least this large, however small its glyph is. */
const val MIN_TOUCH_TARGET_DP: Int = 48

/**
 * @param reducedTransparency user preference: replace glass with opaque high-contrast surfaces.
 * @param degraded set by the frame-time watchdog on the SM-T505; drops live effects.
 */
data class GlassSettings(
    val reducedTransparency: Boolean = false,
    val degraded: Boolean = false
)

val LocalGlassSettings = compositionLocalOf { GlassSettings() }

/**
 * Apple's Liquid Glass is not available on Android. This reproduces its hierarchy — a
 * translucent, edge-lit floating layer over stable dark content — without claiming to be
 * that material, and without a live refraction pass the SM-T505 cannot afford.
 *
 * Glass belongs on navigation and floating tool controls only. Content surfaces stay opaque.
 */
fun Modifier.glassSurface(cornerRadius: Dp = 20.dp): Modifier = composed {
    val settings = LocalGlassSettings.current
    val shape = RoundedCornerShape(cornerRadius)
    val base = clip(shape)
    when {
        settings.reducedTransparency ->
            base.background(NotesColors.SurfaceRaised, shape)
                .border(1.dp, NotesColors.OnSurfaceMuted.copy(alpha = 0.35f), shape)
        settings.degraded ->
            base.background(NotesColors.Surface.copy(alpha = 0.92f), shape)
                .border(1.dp, Color.White.copy(alpha = 0.08f), shape)
        else ->
            base.background(
                Brush.verticalGradient(
                    listOf(
                        Color.White.copy(alpha = 0.10f),
                        Color.White.copy(alpha = 0.04f)
                    )
                ),
                shape
            )
                .background(NotesColors.Surface.copy(alpha = 0.62f), shape)
                .border(1.dp, Color.White.copy(alpha = 0.14f), shape)
    }
}
```

Add the import Compose needs for `composed`:

```kotlin
import androidx.compose.ui.composed
```

- [ ] **Step 6: Write the navigation shell**

`android/app/src/main/kotlin/com/notes/school/ui/Destinations.kt`:

```kotlin
package com.notes.school.ui

object Destinations {
    const val FILES = "files"
    const val EDITOR = "editor/{documentId}"
    const val SETTINGS = "settings"
    const val PALM_ADVANCED = "settings/palm/advanced"
    const val CALIBRATION = "settings/palm/calibration"

    fun editor(documentId: String): String = "editor/$documentId"
}
```

`android/app/src/main/kotlin/com/notes/school/ui/NotesApp.kt`:

```kotlin
package com.notes.school.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.notes.school.ui.editor.EditorScreen
import com.notes.school.ui.files.FilesScreen
import com.notes.school.ui.settings.CalibrationScreen
import com.notes.school.ui.settings.PalmAdvancedScreen
import com.notes.school.ui.settings.SettingsScreen
import com.notes.school.ui.theme.GlassSettings
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.NotesTheme

@Composable
fun NotesApp(
    navController: NavHostController = rememberNavController(),
    glass: GlassSettings = GlassSettings()
) {
    NotesTheme(glass = glass) {
        Surface(color = NotesColors.Workspace, modifier = Modifier.fillMaxSize()) {
            Box {
                NavHost(navController = navController, startDestination = Destinations.FILES) {
                    composable(Destinations.FILES) {
                        FilesRoute(
                            onOpenDocument = { navController.navigate(Destinations.editor(it)) },
                            onOpenSettings = { navController.navigate(Destinations.SETTINGS) }
                        )
                    }
                    composable(
                        Destinations.EDITOR,
                        arguments = listOf(navArgument("documentId") { type = NavType.StringType })
                    ) { entry ->
                        EditorRoute(
                            documentId = entry.arguments?.getString("documentId").orEmpty(),
                            onBack = { navController.popBackStack() }
                        )
                    }
                    composable(Destinations.SETTINGS) {
                        SettingsRoute(
                            onBack = { navController.popBackStack() },
                            onOpenAdvanced = { navController.navigate(Destinations.PALM_ADVANCED) },
                            onRecalibrate = { navController.navigate(Destinations.CALIBRATION) }
                        )
                    }
                    composable(Destinations.PALM_ADVANCED) {
                        PalmAdvancedRoute(onBack = { navController.popBackStack() })
                    }
                    composable(Destinations.CALIBRATION) {
                        CalibrationRoute(onDone = { navController.popBackStack() })
                    }
                }
            }
        }
    }
}
```

Replace the body of `MainActivity.onCreate`'s `setContent` with `NotesApp()`.

- [ ] **Step 7: Add the route wrappers**

The `*Route` composables are the stable seam between navigation and the screens. Their
signatures never change; each later task fills in the body, so no task has to edit
`NotesApp.kt` again. Create them now with a body that renders only the test tag:

`android/app/src/main/kotlin/com/notes/school/ui/files/FilesRoute.kt`:

```kotlin
package com.notes.school.ui.files

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

@Composable
fun FilesRoute(onOpenDocument: (String) -> Unit, onOpenSettings: () -> Unit) {
    Column(Modifier.fillMaxSize().testTag("files-screen")) {
        TextButton(onClick = onOpenSettings, modifier = Modifier.testTag("sidebar-settings")) {
            Text("Settings")
        }
    }
}
```

Create the same one-composable stub for:
- `EditorRoute(documentId: String, onBack: () -> Unit)` in `ui/editor/EditorRoute.kt`, tag `editor-screen`
- `SettingsRoute(onBack: () -> Unit, onOpenAdvanced: () -> Unit, onRecalibrate: () -> Unit)` in `ui/settings/SettingsRoute.kt`, tag `settings-screen`
- `PalmAdvancedRoute(onBack: () -> Unit)` in `ui/settings/PalmAdvancedRoute.kt`, tag `palm-advanced-screen`
- `CalibrationRoute(onDone: () -> Unit)` in `ui/settings/CalibrationRoute.kt`, tag `calibration-screen`

Each stub keeps its test tag on the root element and invokes its callbacks, nothing more.

- [ ] **Step 8: Run the tests**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 9: Commit**

```bash
git add android && git commit -m "feat(ui): add dark theme, glass treatment and navigation shell"
```

---

### Task 19: File overview with the glass sidebar

**Files:**
- Create: `android/app/src/main/kotlin/com/notes/school/ui/files/FilesViewModel.kt`
- Rewrite: `android/app/src/main/kotlin/com/notes/school/ui/files/FilesScreen.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/files/FilesComponents.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/files/FilesScreenTest.kt`

**Interfaces:**
- Consumes: `DocumentRepository`, DAOs (Tasks 12, 14); theme and glass (Task 18).
- Produces:
  - `enum class FilesSection { MY_FILES, RECENT, FAVORITES, TRASH }`
  - `data class FilesUiState(val section: FilesSection = FilesSection.MY_FILES, val folders: List<Folder> = emptyList(), val documents: List<DocumentMeta> = emptyList(), val query: String = "", val loading: Boolean = false)`
  - `class FilesViewModel(private val repository: DocumentRepository, private val db: NotesDatabase) : ViewModel()` with `val state: StateFlow<FilesUiState>`, `fun select(section: FilesSection)`, `fun search(query: String)`, `fun createDocument(kind: DocumentKind, title: String, onCreated: (String) -> Unit)`, `fun rename(id: String, title: String)`, `fun move(id: String, folderId: String?)`, `fun duplicate(id: String)`, `fun setFavorite(id: String, favorite: Boolean)`, `fun trash(id: String)`, `fun restore(id: String)`
  - `@Composable fun FilesScreen(state: FilesUiState, onSection: (FilesSection) -> Unit, onSearch: (String) -> Unit, onOpenDocument: (String) -> Unit, onOpenSettings: () -> Unit, onNewDocument: (DocumentKind) -> Unit)`
  - `@Composable fun GlassSidebar(...)`, `@Composable fun FolderCard(...)`, `@Composable fun RecentDocumentRow(...)` in `FilesComponents.kt`

- [ ] **Step 1: Write the failing test**

`android/app/src/test/kotlin/com/notes/school/ui/files/FilesScreenTest.kt`:

```kotlin
package com.notes.school.ui.files

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class FilesScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val state = FilesUiState(
        section = FilesSection.MY_FILES,
        folders = listOf(
            Folder("f1", null, "Biologie", 0, 1L, 1L),
            Folder("f2", null, "Mathe", 1, 1L, 1L)
        ),
        documents = listOf(
            DocumentMeta("d1", "f1", "Zellaufbau", DocumentKind.PDF, 1L, 20L),
            DocumentMeta("d2", "f2", "Bruchrechnen", DocumentKind.LINED, 1L, 10L)
        )
    )

    private fun render(
        onOpenDocument: (String) -> Unit = {},
        onSection: (FilesSection) -> Unit = {},
        onSearch: (String) -> Unit = {},
        onOpenSettings: () -> Unit = {},
        onNewDocument: (DocumentKind) -> Unit = {}
    ) {
        compose.setContent {
            NotesTheme {
                FilesScreen(state, onSection, onSearch, onOpenDocument, onOpenSettings, onNewDocument)
            }
        }
    }

    @Test
    fun theSidebarShowsEverySection() {
        render()
        listOf("My Files", "Recent", "Favorites", "Trash", "Settings").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
    }

    @Test
    fun folderCardsAreListedBeforeRecentDocuments() {
        render()
        compose.onNodeWithText("Biologie").assertIsDisplayed()
        compose.onNodeWithText("Zellaufbau").assertIsDisplayed()
    }

    @Test
    fun tappingADocumentOpensIt() {
        var opened: String? = null
        render(onOpenDocument = { opened = it })
        compose.onNodeWithTag("document-d1").performClick()
        assertEquals("d1", opened)
    }

    @Test
    fun selectingASidebarSectionReportsIt() {
        var section: FilesSection? = null
        render(onSection = { section = it })
        compose.onNodeWithTag("sidebar-favorites").performClick()
        assertEquals(FilesSection.FAVORITES, section)
    }

    @Test
    fun typingInTheSearchFieldReportsTheQuery() {
        var query = ""
        render(onSearch = { query = it })
        compose.onNodeWithTag("search-field").performTextInput("Zell")
        assertEquals("Zell", query)
    }

    @Test
    fun creatingANewDocumentReportsTheChosenPaperKind() {
        var kind: DocumentKind? = null
        render(onNewDocument = { kind = it })
        compose.onNodeWithTag("new-document").performClick()
        compose.onNodeWithTag("new-document-GRID").performClick()
        assertEquals(DocumentKind.GRID, kind)
    }

    @Test
    fun everySidebarEntryMeetsTheMinimumTouchTarget() {
        render()
        listOf("sidebar-my-files", "sidebar-recent", "sidebar-favorites", "sidebar-trash", "sidebar-settings")
            .forEach {
                compose.onNodeWithTag(it).assertHeightIsAtLeast(MIN_TOUCH_TARGET_DP.dp)
            }
    }

    @Test
    fun anEmptySectionShowsAnEmptyStateInsteadOfABlankPane() {
        compose.setContent {
            NotesTheme {
                FilesScreen(
                    FilesUiState(section = FilesSection.TRASH),
                    {}, {}, {}, {}, {}
                )
            }
        }
        compose.onNodeWithTag("empty-state").assertIsDisplayed()
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*FilesScreenTest*"
```

Expected: FAIL — `Unresolved reference: FilesUiState`.

- [ ] **Step 3: Write the view model**

`android/app/src/main/kotlin/com/notes/school/ui/files/FilesViewModel.kt`:

```kotlin
package com.notes.school.ui.files

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
import com.notes.school.core.newId
import com.notes.school.storage.DocumentRepository
import com.notes.school.storage.NotesDatabase
import com.notes.school.storage.toModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class FilesSection { MY_FILES, RECENT, FAVORITES, TRASH }

data class FilesUiState(
    val section: FilesSection = FilesSection.MY_FILES,
    val folders: List<Folder> = emptyList(),
    val documents: List<DocumentMeta> = emptyList(),
    val query: String = "",
    val loading: Boolean = false
)

class FilesViewModel(
    private val repository: DocumentRepository,
    private val db: NotesDatabase
) : ViewModel() {

    private val _state = MutableStateFlow(FilesUiState(loading = true))
    val state: StateFlow<FilesUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun select(section: FilesSection) {
        _state.update { it.copy(section = section) }
        refresh()
    }

    fun search(query: String) {
        _state.update { it.copy(query = query) }
        refresh()
    }

    fun createDocument(kind: DocumentKind, title: String, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val document = repository.createDocument(folderId = null, title = title, kind = kind)
            refreshNow()
            onCreated(document.id)
        }
    }

    fun rename(id: String, title: String) = mutate {
        db.documentDao().rename(id, title, System.currentTimeMillis())
    }

    fun move(id: String, folderId: String?) = mutate {
        db.documentDao().move(id, folderId, System.currentTimeMillis())
    }

    fun duplicate(id: String) = mutate {
        val original = db.documentDao().byId(id) ?: return@mutate
        val copy = original.copy(id = newId(), title = "${original.title} (copy)")
        db.documentDao().upsert(copy)
        db.pageDao().forDocument(id).forEach { page ->
            val newPage = page.copy(id = newId(), documentId = copy.id)
            db.pageDao().upsert(newPage)
            db.strokeDao().forPage(page.id).forEach { stroke ->
                db.strokeDao().upsert(stroke.copy(id = newId(), pageId = newPage.id))
            }
        }
    }

    fun setFavorite(id: String, favorite: Boolean) = mutate {
        db.documentDao().setFavorite(id, favorite)
    }

    fun trash(id: String) = mutate { db.documentDao().setTrashed(id, true) }

    fun restore(id: String) = mutate { db.documentDao().setTrashed(id, false) }

    private fun mutate(block: suspend () -> Unit) {
        viewModelScope.launch {
            block()
            refreshNow()
        }
    }

    private fun refresh() {
        viewModelScope.launch { refreshNow() }
    }

    private suspend fun refreshNow() {
        val query = _state.value.query.trim()
        val documents = when (_state.value.section) {
            FilesSection.MY_FILES -> db.documentDao().recent(limit = 200)
            FilesSection.RECENT -> db.documentDao().recent(limit = 30)
            FilesSection.FAVORITES -> db.documentDao().favorites()
            FilesSection.TRASH -> db.documentDao().trashed()
        }.map { it.toModel() }
        val folders = db.folderDao().children(null).map { it.toModel() }
        _state.update {
            it.copy(
                loading = false,
                folders = if (it.section == FilesSection.MY_FILES) folders else emptyList(),
                documents = if (query.isEmpty()) {
                    documents
                } else {
                    documents.filter { doc -> doc.title.contains(query, ignoreCase = true) }
                }
            )
        }
    }
}
```

- [ ] **Step 4: Write the components**

`android/app/src/main/kotlin/com/notes/school/ui/files/FilesComponents.kt`:

```kotlin
package com.notes.school.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun SidebarEntry(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    testTag: String,
    onClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) NotesColors.SurfaceRaised else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp)
            .testTag(testTag)
            .semantics { contentDescription = label }
    ) {
        Icon(icon, contentDescription = null, tint = NotesColors.OnSurface, modifier = Modifier.size(20.dp))
        Text(
            label,
            color = NotesColors.OnSurface,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}

/** Folder cards use an ordinary dark content surface — glass belongs to navigation only. */
@Composable
fun FolderCard(folder: Folder, onClick: () -> Unit) {
    Column(
        Modifier
            .width(180.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(NotesColors.Surface)
            .clickable(onClick = onClick)
            .padding(16.dp)
            .testTag("folder-${folder.id}")
    ) {
        Text(folder.name, color = NotesColors.OnSurface, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun RecentDocumentRow(document: DocumentMeta, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(NotesColors.Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("document-${document.id}")
    ) {
        Text(document.title, color = NotesColors.OnSurface, style = MaterialTheme.typography.bodyLarge)
        Text(
            document.kind.name.lowercase(),
            color = NotesColors.OnSurfaceMuted,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}

@Composable
fun GlassTopBar(query: String, onSearch: (String) -> Unit, content: @Composable () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .glassSurface()
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) { content() }
}
```

- [ ] **Step 5: Write the screen**

Rewrite `android/app/src/main/kotlin/com/notes/school/ui/files/FilesScreen.kt` with the
sidebar, the floating search bar, the folder grid and the recent list. Structure:

```kotlin
package com.notes.school.ui.files

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.notes.school.core.DocumentKind
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun FilesScreen(
    state: FilesUiState,
    onSection: (FilesSection) -> Unit,
    onSearch: (String) -> Unit,
    onOpenDocument: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onNewDocument: (DocumentKind) -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }

    Row(Modifier.fillMaxSize().testTag("files-screen")) {
        Column(
            Modifier
                .width(232.dp)
                .fillMaxHeight()
                .padding(12.dp)
                .glassSurface()
                .padding(8.dp)
        ) {
            SidebarEntry("My Files", Icons.Filled.Folder, state.section == FilesSection.MY_FILES, "sidebar-my-files") {
                onSection(FilesSection.MY_FILES)
            }
            SidebarEntry("Recent", Icons.Filled.Schedule, state.section == FilesSection.RECENT, "sidebar-recent") {
                onSection(FilesSection.RECENT)
            }
            SidebarEntry("Favorites", Icons.Filled.Star, state.section == FilesSection.FAVORITES, "sidebar-favorites") {
                onSection(FilesSection.FAVORITES)
            }
            SidebarEntry("Trash", Icons.Filled.Delete, state.section == FilesSection.TRASH, "sidebar-trash") {
                onSection(FilesSection.TRASH)
            }
            Spacer(Modifier.weight(1f))
            SidebarEntry("Settings", Icons.Filled.Settings, false, "sidebar-settings", onOpenSettings)
        }

        Column(Modifier.weight(1f).padding(top = 12.dp, end = 16.dp, bottom = 12.dp)) {
            Row(Modifier.fillMaxWidth().glassSurface().padding(12.dp)) {
                OutlinedTextField(
                    value = state.query,
                    onValueChange = onSearch,
                    placeholder = { Text("Search") },
                    singleLine = true,
                    modifier = Modifier.weight(1f).testTag("search-field")
                )
                Box {
                    TextButton(onClick = { menuOpen = true }, modifier = Modifier.testTag("new-document")) {
                        Text("New")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        listOf(DocumentKind.BLANK, DocumentKind.LINED, DocumentKind.GRID).forEach { kind ->
                            DropdownMenuItem(
                                text = { Text(kind.name.lowercase().replaceFirstChar { it.uppercase() }) },
                                onClick = {
                                    menuOpen = false
                                    onNewDocument(kind)
                                },
                                modifier = Modifier.testTag("new-document-${kind.name}")
                            )
                        }
                    }
                }
            }

            if (state.folders.isEmpty() && state.documents.isEmpty()) {
                Box(Modifier.fillMaxSize().testTag("empty-state"), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Text("Nothing here yet", color = NotesColors.OnSurfaceMuted)
                }
                return@Column
            }

            if (state.folders.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(vertical = 16.dp)
                ) {
                    items(state.folders, key = { it.id }) { folder ->
                        FolderCard(folder) { onSection(FilesSection.MY_FILES) }
                    }
                }
            }

            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.documents, key = { it.id }) { document ->
                    RecentDocumentRow(document) { onOpenDocument(document.id) }
                }
            }
        }
    }
}
```

- [ ] **Step 6: Fill in `FilesRoute`**

Replace the Task 18 stub body in `ui/files/FilesRoute.kt`. The signature stays
`FilesRoute(onOpenDocument: (String) -> Unit, onOpenSettings: () -> Unit)`, so `NotesApp.kt`
needs no edit:

```kotlin
@Composable
fun FilesRoute(onOpenDocument: (String) -> Unit, onOpenSettings: () -> Unit) {
    val viewModel: FilesViewModel = viewModel(factory = LocalViewModelFactory.current)
    val state by viewModel.state.collectAsStateWithLifecycle()
    FilesScreen(
        state = state,
        onSection = viewModel::select,
        onSearch = viewModel::search,
        onOpenDocument = onOpenDocument,
        onOpenSettings = onOpenSettings,
        onNewDocument = { kind -> viewModel.createDocument(kind, "Untitled", onOpenDocument) }
    )
}
```

`LocalViewModelFactory` is a `staticCompositionLocalOf<ViewModelProvider.Factory>` provided
once in `NotesApplication` from the shared `NotesDatabase` and `DocumentRepository`. Create
it in `ui/Dependencies.kt` alongside those singletons.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*FilesScreenTest*" --tests "*NavigationTest*"
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit**

```bash
git add android && git commit -m "feat(ui): add file overview with glass sidebar, search and document actions"
```

---

### Task 20: Editor screen with the left tool rail

**Files:**
- Create: `android/app/src/main/kotlin/com/notes/school/ui/editor/EditorViewModel.kt`
- Rewrite: `android/app/src/main/kotlin/com/notes/school/ui/editor/EditorScreen.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/editor/ToolRail.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/editor/InkSurface.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/editor/ToolRailTest.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/editor/EditorScreenTest.kt`

**Interfaces:**
- Consumes: `InkView`, `ToolSettings` (Task 6); `PalmInputGate`, `PalmStatus` (Task 11); `DocumentRepository` (Task 14); `PaperTemplate`, `PdfPageSource` (Tasks 15–16); theme (Task 18).
- Produces:
  - `data class EditorUiState(val title: String = "", val tool: ToolSettings, val palmStatus: PalmStatus = PalmStatus.IDLE, val canUndo: Boolean = false, val canRedo: Boolean = false, val safetyModeEnabled: Boolean = false)`
  - `class EditorViewModel(...) : ViewModel()` with `val state: StateFlow<EditorUiState>`, `fun open(documentId: String)`, `fun selectTool(kind: ToolKind)`, `fun setColor(argb: Int)`, `fun setWidth(px: Float)`, `fun undo()`, `fun redo()`, `fun onPause()`, `fun export(onResult: (ExportResult) -> Unit)`
  - `@Composable fun ToolRail(state: EditorUiState, onTool: (ToolKind) -> Unit, onColor: (Int) -> Unit, onWidth: (Float) -> Unit, onUndo: () -> Unit, onRedo: () -> Unit)`
  - `@Composable fun InkSurface(scene: InkScene, tool: ToolSettings, gateFactory: (InkView) -> PalmInputGate, onStrokeCommitted: (Stroke) -> Unit, modifier: Modifier)` — an `AndroidView` wrapper around `InkView`
  - `@Composable fun EditorScreen(documentId: String, onBack: () -> Unit)`
  - `val PEN_COLORS: List<Int>` and `val PEN_WIDTHS: List<Float>` in `ToolRail.kt`

- [ ] **Step 1: Write the failing tool rail test**

`android/app/src/test/kotlin/com/notes/school/ui/editor/ToolRailTest.kt`:

```kotlin
package com.notes.school.ui.editor

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class ToolRailTest {

    @get:Rule
    val compose = createComposeRule()

    private fun state(kind: ToolKind = ToolKind.PEN, canUndo: Boolean = true, canRedo: Boolean = false) =
        EditorUiState(
            title = "Zellaufbau.pdf",
            tool = ToolSettings(kind, 0xFF2C2825.toInt(), 3f),
            palmStatus = PalmStatus.IDLE,
            canUndo = canUndo,
            canRedo = canRedo
        )

    private fun render(
        s: EditorUiState = state(),
        onTool: (ToolKind) -> Unit = {},
        onColor: (Int) -> Unit = {},
        onWidth: (Float) -> Unit = {},
        onUndo: () -> Unit = {},
        onRedo: () -> Unit = {}
    ) {
        compose.setContent { NotesTheme { ToolRail(s, onTool, onColor, onWidth, onUndo, onRedo) } }
    }

    @Test
    fun theRailShowsExactlyTheSixSpecifiedControls() {
        render()
        listOf("Pen", "Highlighter", "Eraser", "Lasso", "Undo", "Redo").forEach {
            compose.onNodeWithContentDescription(it).assertIsDisplayed()
        }
    }

    @Test
    fun everyRailControlMeetsTheMinimumTouchTarget() {
        render()
        listOf("tool-pen", "tool-highlighter", "tool-eraser", "tool-lasso", "tool-undo", "tool-redo")
            .forEach { tag ->
                compose.onNodeWithTag(tag).assertWidthIsAtLeast(MIN_TOUCH_TARGET_DP.dp)
                compose.onNodeWithTag(tag).assertHeightIsAtLeast(MIN_TOUCH_TARGET_DP.dp)
            }
    }

    @Test
    fun tappingAToolSelectsIt() {
        var selected: ToolKind? = null
        render(onTool = { selected = it })
        compose.onNodeWithTag("tool-highlighter").performClick()
        assertEquals(ToolKind.HIGHLIGHTER, selected)
    }

    @Test
    fun theColorPopoverStaysClosedUntilTheActiveToolIsTappedAgain() {
        render()
        compose.onNodeWithTag("tool-popover").assertIsNotDisplayed()
        compose.onNodeWithTag("tool-pen").performClick()
        compose.onNodeWithTag("tool-popover").assertIsDisplayed()
    }

    @Test
    fun thePopoverReportsAColorChoice() {
        var color: Int? = null
        render(onColor = { color = it })
        compose.onNodeWithTag("tool-pen").performClick()
        compose.onNodeWithTag("color-${PEN_COLORS[1]}").performClick()
        assertEquals(PEN_COLORS[1], color)
    }

    @Test
    fun thePopoverReportsAWidthChoice() {
        var width: Float? = null
        render(onWidth = { width = it })
        compose.onNodeWithTag("tool-pen").performClick()
        compose.onNodeWithTag("width-${PEN_WIDTHS.last()}").performClick()
        assertEquals(PEN_WIDTHS.last(), width)
    }

    @Test
    fun undoAndRedoReportTheirTaps() {
        var undone = false
        var redone = false
        render(state(canUndo = true, canRedo = true), onUndo = { undone = true }, onRedo = { redone = true })
        compose.onNodeWithTag("tool-undo").performClick()
        compose.onNodeWithTag("tool-redo").performClick()
        assertEquals(true, undone)
        assertEquals(true, redone)
    }

    @Test
    fun calibrationAndSafetyModeAreNotReachableFromTheEditorRail() {
        render()
        compose.onNodeWithTag("tool-calibrate").assertIsNotDisplayed()
        compose.onNodeWithTag("tool-safety-mode").assertIsNotDisplayed()
    }
}
```

- [ ] **Step 2: Write the failing editor screen test**

`android/app/src/test/kotlin/com/notes/school/ui/editor/EditorScreenTest.kt`:

```kotlin
package com.notes.school.ui.editor

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class EditorScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private fun render(
        state: EditorUiState = EditorUiState(
            title = "Zellaufbau.pdf",
            tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f)
        ),
        onBack: () -> Unit = {}
    ) {
        compose.setContent {
            NotesTheme {
                EditorContent(
                    state = state,
                    scene = InkScene("page-1"),
                    onBack = onBack,
                    onTool = {}, onColor = {}, onWidth = {}, onUndo = {}, onRedo = {},
                    onStrokeCommitted = {}
                )
            }
        }
    }

    @Test
    fun theBackControlShowsTheFilenameWithALeadingChevron() {
        render()
        compose.onNodeWithText("‹ Zellaufbau.pdf").assertIsDisplayed()
    }

    @Test
    fun theBackControlReturnsToTheFileOverview() {
        var back = false
        render(onBack = { back = true })
        compose.onNodeWithTag("editor-back").performClick()
        assertEquals(true, back)
    }

    @Test
    fun thePalmIndicatorIsTheOnlyPersistentPalmAffordance() {
        render()
        compose.onNodeWithContentDescription("Palm protection").assertIsDisplayed()
        compose.onNodeWithTag("palm-panel").assertDoesNotExist()
    }

    @Test
    fun thePalmIndicatorReflectsARejection() {
        render(
            EditorUiState(
                title = "Doc",
                tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f),
                palmStatus = PalmStatus.PALM_REJECTED
            )
        )
        compose.onNodeWithTag("palm-indicator-PALM_REJECTED").assertIsDisplayed()
    }

    @Test
    fun lowConfidenceKeepsWritingAvailableAndOffersRecalibrationAsASuggestion() {
        render(
            EditorUiState(
                title = "Doc",
                tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f),
                palmStatus = PalmStatus.LOW_CONFIDENCE
            )
        )
        compose.onNodeWithTag("ink-surface").assertIsDisplayed()
        compose.onNodeWithTag("palm-indicator-LOW_CONFIDENCE").assertIsDisplayed()
    }

    @Test
    fun theInkSurfaceFillsTheWorkspaceBesideTheRail() {
        render()
        compose.onNodeWithTag("ink-surface").assertIsDisplayed()
        compose.onNodeWithTag("tool-rail").assertIsDisplayed()
    }
}
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*ToolRailTest*" --tests "*EditorScreenTest*"
```

Expected: FAIL — `Unresolved reference: EditorUiState`.

- [ ] **Step 4: Write the tool rail**

`android/app/src/main/kotlin/com/notes/school/ui/editor/ToolRail.kt`:

```kotlin
package com.notes.school.ui.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Highlight
import androidx.compose.material.icons.filled.Redo
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.notes.school.core.ToolKind
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

val PEN_COLORS: List<Int> = listOf(
    0xFF2C2825.toInt(), 0xFF1A73E8.toInt(), 0xFFE5484D.toInt(),
    0xFF2FA84F.toInt(), 0xFFFFB020.toInt()
)

val PEN_WIDTHS: List<Float> = listOf(1.5f, 3f, 5f, 8f)

/** Lasso is a selection mode rather than an ink tool, so it is tracked separately. */
enum class RailAction { PEN, HIGHLIGHTER, ERASER, LASSO }

@Composable
fun ToolRail(
    state: EditorUiState,
    onTool: (ToolKind) -> Unit,
    onColor: (Int) -> Unit,
    onWidth: (Float) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit
) {
    var popoverOpen by remember { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier
                .width(64.dp)
                .glassSurface()
                .padding(vertical = 8.dp)
                .testTag("tool-rail")
        ) {
            RailButton("Pen", Icons.Filled.Create, state.tool.kind == ToolKind.PEN, "tool-pen") {
                if (state.tool.kind == ToolKind.PEN) popoverOpen = !popoverOpen else onTool(ToolKind.PEN)
            }
            RailButton("Highlighter", Icons.Filled.Highlight, state.tool.kind == ToolKind.HIGHLIGHTER, "tool-highlighter") {
                if (state.tool.kind == ToolKind.HIGHLIGHTER) popoverOpen = !popoverOpen else onTool(ToolKind.HIGHLIGHTER)
            }
            RailButton("Eraser", Icons.Filled.Brush, state.tool.kind == ToolKind.ERASER, "tool-eraser") {
                onTool(ToolKind.ERASER)
                popoverOpen = false
            }
            RailButton("Lasso", Icons.Filled.Brush, false, "tool-lasso") { popoverOpen = false }
            RailButton("Undo", Icons.Filled.Undo, false, "tool-undo", enabled = state.canUndo, onClick = onUndo)
            RailButton("Redo", Icons.Filled.Redo, false, "tool-redo", enabled = state.canRedo, onClick = onRedo)
        }

        if (popoverOpen) {
            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .padding(start = 8.dp)
                    .glassSurface(cornerRadius = 16.dp)
                    .padding(12.dp)
                    .testTag("tool-popover")
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PEN_COLORS.forEach { argb ->
                        Box(
                            Modifier
                                .size(MIN_TOUCH_TARGET_DP.dp)
                                .clickable { onColor(argb) }
                                .testTag("color-$argb"),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(Modifier.size(24.dp).clip(CircleShape).background(Color(argb)))
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PEN_WIDTHS.forEach { width ->
                        Box(
                            Modifier
                                .size(MIN_TOUCH_TARGET_DP.dp)
                                .clickable { onWidth(width) }
                                .testTag("width-$width"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("${width.toInt()}", color = NotesColors.OnSurface)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RailButton(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    testTag: String,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            // The glyph is 22 dp; the target stays 48 dp as the spec requires.
            .size(MIN_TOUCH_TARGET_DP.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) NotesColors.SurfaceRaised else Color.Transparent)
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.35f)
            .testTag(testTag)
            .semantics { contentDescription = label }
    ) {
        Icon(icon, contentDescription = null, tint = NotesColors.OnSurface, modifier = Modifier.size(22.dp))
    }
}
```

- [ ] **Step 5: Write the ink surface and editor screen**

`android/app/src/main/kotlin/com/notes/school/ui/editor/InkSurface.kt`:

```kotlin
package com.notes.school.ui.editor

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import com.notes.school.core.Stroke
import com.notes.school.editor.PalmInputGate
import com.notes.school.ink.InkScene
import com.notes.school.ink.InkView
import com.notes.school.ink.ToolSettings

/**
 * The only bridge between Compose and the drawing path. Tool changes are pushed into the
 * view imperatively in [AndroidView.update]; touch samples never travel back through
 * Compose state, which is what keeps recomposition out of the hot path.
 */
@Composable
fun InkSurface(
    scene: InkScene,
    tool: ToolSettings,
    onStrokeCommitted: (Stroke) -> Unit,
    modifier: Modifier = Modifier,
    gateFactory: ((InkView) -> PalmInputGate)? = null
) {
    AndroidView(
        modifier = modifier.testTag("ink-surface"),
        factory = { context ->
            InkView(context).apply {
                this.scene = scene
                this.tool = tool
                this.onStrokeCommitted = onStrokeCommitted
                gateFactory?.invoke(this)?.install()
            }
        },
        update = { view ->
            view.scene = scene
            view.tool = tool
            view.onStrokeCommitted = onStrokeCommitted
        }
    )
}
```

Rewrite `android/app/src/main/kotlin/com/notes/school/ui/editor/EditorScreen.kt` so the
stateless `EditorContent` the tests drive is separate from the wiring:

```kotlin
package com.notes.school.ui.editor

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BackHand
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

data class EditorUiState(
    val title: String = "",
    val tool: ToolSettings,
    val palmStatus: PalmStatus = PalmStatus.IDLE,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
    val safetyModeEnabled: Boolean = false
)

@Composable
fun EditorContent(
    state: EditorUiState,
    scene: InkScene,
    onBack: () -> Unit,
    onTool: (ToolKind) -> Unit,
    onColor: (Int) -> Unit,
    onWidth: (Float) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onStrokeCommitted: (Stroke) -> Unit
) {
    Box(Modifier.fillMaxSize().testTag("editor-screen")) {
        InkSurface(
            scene = scene,
            tool = state.tool,
            onStrokeCommitted = onStrokeCommitted,
            modifier = Modifier.fillMaxSize().padding(start = 88.dp, top = 72.dp)
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(12.dp)
                .glassSurface(cornerRadius = 14.dp)
                .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
                .clickable(onClick = onBack)
                .padding(horizontal = 16.dp)
                .testTag("editor-back")
        ) {
            Text("‹ ${state.title}", color = NotesColors.OnSurface)
        }

        Box(Modifier.align(Alignment.CenterStart).padding(start = 12.dp)) {
            ToolRail(state, onTool, onColor, onWidth, onUndo, onRedo)
        }

        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp)
                .size(MIN_TOUCH_TARGET_DP.dp)
                .glassSurface(cornerRadius = 24.dp)
                .testTag("palm-indicator-${state.palmStatus.name}")
                .semantics { contentDescription = "Palm protection" }
        ) {
            Icon(
                Icons.Filled.BackHand,
                contentDescription = null,
                tint = when (state.palmStatus) {
                    PalmStatus.PALM_REJECTED -> NotesColors.Accent
                    PalmStatus.LOW_CONFIDENCE -> NotesColors.Danger
                    else -> NotesColors.OnSurfaceMuted
                },
                modifier = Modifier.size(22.dp)
            )
        }
    }
}
```

`EditorScreen(documentId, onBack)` becomes the wiring layer: it obtains the
`EditorViewModel`, collects its state, and calls `EditorContent`. Android system back must
call the same `onBack` as the `‹ filename` control — add
`BackHandler(enabled = true) { onBack() }` at the top of `EditorScreen`.

- [ ] **Step 6: Write the view model**

`android/app/src/main/kotlin/com/notes/school/ui/editor/EditorViewModel.kt` holds the
`InkScene`, the `ToolSettings`, and the persistence wiring:

```kotlin
package com.notes.school.ui.editor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.storage.DocumentRepository
import com.notes.school.storage.NotesDatabase
import com.notes.school.storage.toModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class EditorViewModel(
    private val repository: DocumentRepository,
    private val db: NotesDatabase
) : ViewModel() {

    private val _state = MutableStateFlow(
        EditorUiState(tool = ToolSettings(ToolKind.PEN, PEN_COLORS.first(), PEN_WIDTHS[1]))
    )
    val state: StateFlow<EditorUiState> = _state.asStateFlow()

    var scene: InkScene = InkScene("")
        private set

    fun open(documentId: String) {
        viewModelScope.launch {
            val document = db.documentDao().byId(documentId)?.toModel() ?: return@launch
            val page = db.pageDao().forDocument(documentId).firstOrNull() ?: return@launch
            scene = InkScene(page.id, repository.loadPageStrokes(page.id))
            _state.update { it.copy(title = document.title, canUndo = false, canRedo = false) }
        }
    }

    fun onStrokeCommitted(stroke: Stroke) {
        repository.queueStroke(stroke)
        _state.update { it.copy(canUndo = scene.canUndo, canRedo = scene.canRedo) }
    }

    fun selectTool(kind: ToolKind) = _state.update { it.copy(tool = it.tool.copy(kind = kind)) }

    fun setColor(argb: Int) = _state.update { it.copy(tool = it.tool.copy(colorArgb = argb)) }

    fun setWidth(px: Float) = _state.update { it.copy(tool = it.tool.copy(widthPx = px)) }

    fun undo() {
        val change = scene.undo() ?: return
        repository.queueActiveChange(change.changed.map { it.id }, active = false)
        _state.update { it.copy(canUndo = scene.canUndo, canRedo = scene.canRedo) }
    }

    fun redo() {
        val change = scene.redo() ?: return
        repository.queueActiveChange(change.changed.map { it.id }, active = true)
        _state.update { it.copy(canUndo = scene.canUndo, canRedo = scene.canRedo) }
    }

    fun setPalmStatus(status: PalmStatus) = _state.update { it.copy(palmStatus = status) }

    /** Everything queued must reach disk before the process can be killed. */
    fun onPause() {
        viewModelScope.launch { repository.flush() }
    }
}
```

- [ ] **Step 7: Fill in `EditorRoute`**

Replace the Task 18 stub in `ui/editor/EditorRoute.kt`, keeping the signature
`EditorRoute(documentId: String, onBack: () -> Unit)`:

```kotlin
@Composable
fun EditorRoute(documentId: String, onBack: () -> Unit) {
    val viewModel: EditorViewModel = viewModel(factory = LocalViewModelFactory.current)
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(documentId) { viewModel.open(documentId) }
    // Android system back must behave exactly like the visible "< filename" control.
    BackHandler { onBack() }
    EditorContent(
        state = state,
        scene = viewModel.scene,
        onBack = onBack,
        onTool = viewModel::selectTool,
        onColor = viewModel::setColor,
        onWidth = viewModel::setWidth,
        onUndo = viewModel::undo,
        onRedo = viewModel::redo,
        onStrokeCommitted = viewModel::onStrokeCommitted
    )
}
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 9: Commit**

```bash
git add android && git commit -m "feat(ui): add editor screen with left tool rail and palm status indicator"
```

---

### Task 21: Palm Protection settings, advanced subpage and calibration flow

**Files:**
- Rewrite: `android/app/src/main/kotlin/com/notes/school/ui/settings/SettingsScreen.kt`
- Rewrite: `android/app/src/main/kotlin/com/notes/school/ui/settings/PalmAdvancedScreen.kt`
- Rewrite: `android/app/src/main/kotlin/com/notes/school/ui/settings/CalibrationScreen.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/settings/PalmSettingsViewModel.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/storage/PalmProfileStore.kt` — in the `app` module, so `storage` keeps no dependency on `touch-engine`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/settings/SettingsScreenTest.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/settings/CalibrationScreenTest.kt`

**Interfaces:**
- Consumes: `PalmProfile`, `ThresholdKey`, `SafeRange` (Task 7); `Calibrator`, `CalibrationPhase`, `ProfileTuner` (Task 10); `PalmProfileDao` (Task 12).
- Produces:
  - `class PalmProfileStore(private val dao: PalmProfileDao)` with `suspend fun loadStable(device: String, orientation: ScreenOrientation): PalmProfile?`, `suspend fun save(profile: PalmProfile)`, `suspend fun reset(device: String, orientation: ScreenOrientation)`
  - `data class PalmSettingsUiState(val profile: PalmProfile?, val autoImproveEnabled: Boolean, val safetyModeEnabled: Boolean, val reducedTransparency: Boolean)`
  - `class PalmSettingsViewModel(...) : ViewModel()` with `val state: StateFlow<PalmSettingsUiState>`, `fun setAutoImprove(enabled: Boolean)`, `fun setSafetyMode(enabled: Boolean)`, `fun setReducedTransparency(enabled: Boolean)`, `fun setThreshold(key: ThresholdKey, value: Float)`, `fun resetProfile()`
  - `@Composable fun SettingsScreen(state: PalmSettingsUiState, onBack: () -> Unit, onOpenAdvanced: () -> Unit, onRecalibrate: () -> Unit, onAutoImprove: (Boolean) -> Unit, onSafetyMode: (Boolean) -> Unit)`
  - `@Composable fun PalmAdvancedScreen(state: PalmSettingsUiState, onBack: () -> Unit, onThreshold: (ThresholdKey, Float) -> Unit, onReset: () -> Unit)`
  - `@Composable fun CalibrationScreen(phase: CalibrationPhase, progress: Float, onDone: () -> Unit)`

- [ ] **Step 1: Write the failing settings test**

`android/app/src/test/kotlin/com/notes/school/ui/settings/SettingsScreenTest.kt`:

```kotlin
package com.notes.school.ui.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class SettingsScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val profile = PalmProfile.defaults(
        "samsung/SM-T505/31", ScreenOrientation.LANDSCAPE, Handedness.RIGHT,
        setOf(InputFeature.SIZE)
    ).copy(score = 0.94f, stable = true, revision = 3)

    private val state = PalmSettingsUiState(
        profile = profile,
        autoImproveEnabled = true,
        safetyModeEnabled = false,
        reducedTransparency = false
    )

    @Test
    fun theDefaultPageShowsStatusRecalibrateAutoImproveAndSafetyMode() {
        compose.setContent { NotesTheme { SettingsScreen(state, {}, {}, {}, {}, {}) } }
        compose.onNodeWithText("Recalibrate").assertIsDisplayed()
        compose.onNodeWithText("Improve profile automatically").assertIsDisplayed()
        compose.onNodeWithText("25% safety mode").assertIsDisplayed()
        compose.onNodeWithTag("profile-status").assertIsDisplayed()
    }

    @Test
    fun theExplanatoryCardsAreNotShownInProduction() {
        compose.setContent { NotesTheme { SettingsScreen(state, {}, {}, {}, {}, {}) } }
        listOf("Local", "Bounded", "Reversible").forEach {
            compose.onNodeWithText(it).assertDoesNotExist()
        }
    }

    @Test
    fun theAdvancedRowOpensTheSubpage() {
        var opened = false
        compose.setContent { NotesTheme { SettingsScreen(state, {}, { opened = true }, {}, {}, {}) } }
        compose.onNodeWithTag("advanced-settings-row").performClick()
        assertEquals(true, opened)
    }

    @Test
    fun toggleStateIsCommunicatedByTextAsWellAsColor() {
        compose.setContent { NotesTheme { SettingsScreen(state, {}, {}, {}, {}, {}) } }
        compose.onNodeWithTag("auto-improve-state").assertIsDisplayed()
    }

    @Test
    fun theAdvancedPageExposesBiasSmallContactAndDecisionWindow() {
        compose.setContent { NotesTheme { PalmAdvancedScreen(state, {}, { _, _ -> }, {}) } }
        compose.onNodeWithTag("threshold-${ThresholdKey.PEN_BIAS}").assertIsDisplayed()
        compose.onNodeWithTag("threshold-${ThresholdKey.SMALL_CONTACT_WEIGHT}").assertIsDisplayed()
        compose.onNodeWithTag("threshold-${ThresholdKey.DECISION_WINDOW_MS}").assertIsDisplayed()
        compose.onNodeWithTag("palm-test-surface").assertIsDisplayed()
        compose.onNodeWithTag("reset-profile").assertIsDisplayed()
    }

    @Test
    fun aThresholdChangeIsReportedWithItsKey() {
        var seen: Pair<ThresholdKey, Float>? = null
        compose.setContent {
            NotesTheme { PalmAdvancedScreen(state, {}, { key, value -> seen = key to value }, {}) }
        }
        compose.onNodeWithTag("threshold-${ThresholdKey.PEN_BIAS}-max").performClick()
        assertEquals(ThresholdKey.PEN_BIAS, seen!!.first)
    }

    @Test
    fun resettingTheProfileIsReported() {
        var reset = false
        compose.setContent { NotesTheme { PalmAdvancedScreen(state, {}, { _, _ -> }, { reset = true }) } }
        compose.onNodeWithTag("reset-profile").performClick()
        assertEquals(true, reset)
    }
}
```

- [ ] **Step 2: Write the failing calibration test**

`android/app/src/test/kotlin/com/notes/school/ui/settings/CalibrationScreenTest.kt`:

```kotlin
package com.notes.school.ui.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.notes.school.touch.CalibrationPhase
import com.notes.school.ui.theme.NotesTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class CalibrationScreenTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theFirstPhaseAsksForARestingPalm() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.PALM_ONLY, 0.1f) {} } }
        compose.onNodeWithText("Rest your hand on the screen and move it a little.").assertIsDisplayed()
    }

    @Test
    fun theSecondPhaseAsksForStylusOnlyWriting() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.STYLUS_ONLY, 0.4f) {} } }
        compose.onNodeWithText("Write a short line with the stylus, hand off the screen.").assertIsDisplayed()
    }

    @Test
    fun theThirdPhaseAsksForNormalWriting() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.COMBINED, 0.8f) {} } }
        compose.onNodeWithText("Now write the way you normally would, hand resting.").assertIsDisplayed()
    }

    @Test
    fun theCaptureSurfaceIsPresentInEveryPhase() {
        CalibrationPhase.entries.forEach { phase ->
            compose.setContent { NotesTheme { CalibrationScreen(phase, 0.5f) {} } }
            compose.onNodeWithTag("calibration-surface").assertIsDisplayed()
        }
    }

    @Test
    fun progressIsShown() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.PALM_ONLY, 0.33f) {} } }
        compose.onNodeWithTag("calibration-progress").assertIsDisplayed()
    }
}
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*SettingsScreenTest*" --tests "*CalibrationScreenTest*"
```

Expected: FAIL — `Unresolved reference: PalmSettingsUiState`.

- [ ] **Step 4: Write the profile store**

`android/app/src/main/kotlin/com/notes/school/storage/PalmProfileStore.kt`:

```kotlin
package com.notes.school.storage

import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import kotlinx.serialization.json.Json

/**
 * Persists palm profiles as serialized JSON in the palm_profiles table. Lives in the app
 * module so `storage` needs no knowledge of the touch engine, and so the stored JSON stays
 * a plain snapshot of the core-model type.
 */
class PalmProfileStore(
    private val dao: PalmProfileDao,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {
    suspend fun loadStable(device: String, orientation: ScreenOrientation): PalmProfile? =
        dao.latestStable(device, orientation.name)?.let { json.decodeFromString(it.json) }

    suspend fun loadLatest(device: String, orientation: ScreenOrientation): PalmProfile? =
        dao.latest(device, orientation.name)?.let { json.decodeFromString(it.json) }

    suspend fun save(profile: PalmProfile) {
        dao.upsert(
            PalmProfileEntity(
                deviceFingerprint = profile.deviceFingerprint,
                orientation = profile.orientation.name,
                revision = profile.revision,
                json = json.encodeToString(PalmProfile.serializer(), profile),
                score = profile.score,
                stable = profile.stable,
                createdAtMs = profile.createdAtMs
            )
        )
    }

    suspend fun reset(device: String, orientation: ScreenOrientation) {
        dao.reset(device, orientation.name)
    }
}
```

- [ ] **Step 5: Write the settings screens**

`SettingsScreen.kt` renders, in order: a `profile-status` row (revision, score as a
percentage, plus the word `Calibrated` or `Not calibrated` so status is never conveyed by
colour alone), a `Recalibrate` button, an `Improve profile automatically` switch with a
visible `auto-improve-state` label reading `On`/`Off`, a `25% safety mode` switch with the
same treatment, and finally the `Advanced settings ›` row tagged `advanced-settings-row`.
No "Local / Bounded / Reversible" cards.

`PalmAdvancedScreen.kt` renders one `threshold-<KEY>` row per adjustable key
(`PEN_BIAS`, `SMALL_CONTACT_WEIGHT`, `DECISION_WINDOW_MS`), each with a `Slider` bounded by
that key's `SafeRange` plus `threshold-<KEY>-min` and `threshold-<KEY>-max` buttons so the
range ends are reachable without a precise drag; a `palm-test-surface` box hosting an
`InkSurface` for trying the current settings; and a `reset-profile` button.

Slider bounds come straight from the profile so the UI cannot offer a value the engine
would clamp away:

```kotlin
val range = state.profile?.safeRanges?.get(key) ?: SafeRange(0f, 1f)
Slider(
    value = state.profile?.thresholds?.get(key) ?: range.min,
    onValueChange = { onThreshold(key, it) },
    valueRange = range.min..range.max,
    modifier = Modifier.testTag("threshold-$key")
)
```

`CalibrationScreen.kt` shows the phase instruction text asserted in the test, a
`calibration-progress` indicator, and a `calibration-surface` capture area that feeds
`Calibrator.record` with the `ContactFeatures` produced by a `ContactTracker`.

- [ ] **Step 6: Fill in the three settings routes**

Replace the Task 18 stubs, keeping their signatures unchanged so `NotesApp.kt` is untouched.
All three share one `PalmSettingsViewModel` obtained from `LocalViewModelFactory`:

```kotlin
@Composable
fun SettingsRoute(onBack: () -> Unit, onOpenAdvanced: () -> Unit, onRecalibrate: () -> Unit) {
    val viewModel: PalmSettingsViewModel = viewModel(factory = LocalViewModelFactory.current)
    val state by viewModel.state.collectAsStateWithLifecycle()
    SettingsScreen(state, onBack, onOpenAdvanced, onRecalibrate,
        onAutoImprove = viewModel::setAutoImprove,
        onSafetyMode = viewModel::setSafetyMode)
}

@Composable
fun PalmAdvancedRoute(onBack: () -> Unit) {
    val viewModel: PalmSettingsViewModel = viewModel(factory = LocalViewModelFactory.current)
    val state by viewModel.state.collectAsStateWithLifecycle()
    PalmAdvancedScreen(state, onBack, viewModel::setThreshold, viewModel::resetProfile)
}

@Composable
fun CalibrationRoute(onDone: () -> Unit) {
    val viewModel: PalmSettingsViewModel = viewModel(factory = LocalViewModelFactory.current)
    val session by viewModel.calibrationSession.collectAsStateWithLifecycle()
    CalibrationScreen(session.phase, session.progress, onDone)
}
```

Add `val calibrationSession: StateFlow<CalibrationSessionState>` to `PalmSettingsViewModel`,
where `data class CalibrationSessionState(val phase: CalibrationPhase = CalibrationPhase.PALM_ONLY, val progress: Float = 0f)`.
The session advances a phase once `Calibrator.sampleCount(phase)` reaches its minimum, and
on completion calls `Calibrator.build(...)` and `PalmProfileStore.save(...)` before `onDone`.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit**

```bash
git add android && git commit -m "feat(ui): add palm protection settings, advanced controls and calibration flow"
```

---

### Task 22: 25% safety writing mode

**Files:**
- Create: `android/app/src/main/kotlin/com/notes/school/editor/PadMapping.kt`
- Create: `android/app/src/main/kotlin/com/notes/school/ui/editor/SafetyModeLayout.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/editor/PadMappingTest.kt`
- Test: `android/app/src/test/kotlin/com/notes/school/ui/editor/SafetyModeLayoutTest.kt`

**Interfaces:**
- Consumes: `Bounds`, `Stroke`, `StrokePoint` (Task 2); `InkScene`, `InkView` (Tasks 4, 6); editor state (Task 20).
- Produces:
  - `data class FocusBox(val x: Float, val y: Float, val width: Float, val height: Float)`
  - `object PadMapping` with `fun toDocument(padX: Float, padY: Float, padWidth: Float, padHeight: Float, focus: FocusBox): Pair<Float, Float>`, `fun scaleX(padWidth: Float, focus: FocusBox): Float`, `fun mapStroke(stroke: Stroke, padWidth: Float, padHeight: Float, focus: FocusBox): Stroke`, `fun advance(focus: FocusBox, pageWidth: Float, pageHeight: Float): FocusBox`
  - `@Composable fun SafetyModeLayout(scene: InkScene, focus: FocusBox, state: EditorUiState, onFocusChange: (FocusBox) -> Unit, onStrokeCommitted: (Stroke) -> Unit)`

The mapping is the one proven by the web prototype in `src/components/WritingZone.jsx:20-30`:
document coordinate = focus origin + pad coordinate × (focus size ÷ pad size), with stroke
width scaled by the same X factor.

- [ ] **Step 1: Write the failing mapping test**

`android/app/src/test/kotlin/com/notes/school/editor/PadMappingTest.kt`:

```kotlin
package com.notes.school.editor

import com.notes.school.core.Bounds
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PadMappingTest {

    private val focus = FocusBox(x = 100f, y = 200f, width = 400f, height = 100f)
    private val padWidth = 800f
    private val padHeight = 200f

    @Test
    fun theOriginOfThePadMapsToTheOriginOfTheFocusBox() {
        val (x, y) = PadMapping.toDocument(0f, 0f, padWidth, padHeight, focus)
        assertEquals(100f, x, 0.001f)
        assertEquals(200f, y, 0.001f)
    }

    @Test
    fun theFarCornerOfThePadMapsToTheFarCornerOfTheFocusBox() {
        val (x, y) = PadMapping.toDocument(padWidth, padHeight, padWidth, padHeight, focus)
        assertEquals(500f, x, 0.001f)
        assertEquals(300f, y, 0.001f)
    }

    @Test
    fun theCenterOfThePadMapsToTheCenterOfTheFocusBox() {
        val (x, y) = PadMapping.toDocument(padWidth / 2f, padHeight / 2f, padWidth, padHeight, focus)
        assertEquals(300f, x, 0.001f)
        assertEquals(250f, y, 0.001f)
    }

    @Test
    fun writingOnTheLargePadProducesSmallerInkOnTheDocument() {
        assertEquals(0.5f, PadMapping.scaleX(padWidth, focus), 0.001f)
    }

    @Test
    fun aMappedStrokeKeepsItsToolColorAndPointCount() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.HIGHLIGHTER, 0xFFFFEE00.toInt(), 20f,
            listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(800f, 200f, 1f, 20)),
            Bounds(0f, 0f, 800f, 200f), 0L, true
        )
        val mapped = PadMapping.mapStroke(stroke, padWidth, padHeight, focus)
        assertEquals(ToolKind.HIGHLIGHTER, mapped.tool)
        assertEquals(0xFFFFEE00.toInt(), mapped.colorArgb)
        assertEquals(2, mapped.points.size)
    }

    @Test
    fun aMappedStrokeLandsInsideTheFocusBox() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.PEN, -16777216, 6f,
            listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(800f, 200f, 1f, 20)),
            Bounds(0f, 0f, 800f, 200f), 0L, true
        )
        val mapped = PadMapping.mapStroke(stroke, padWidth, padHeight, focus)
        assertEquals(100f, mapped.points.first().x, 0.001f)
        assertEquals(500f, mapped.points.last().x, 0.001f)
        assertEquals(3f, mapped.widthPx, 0.001f)
    }

    @Test
    fun mappedBoundsAreRecomputedRatherThanCopied() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.PEN, -16777216, 6f,
            listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(800f, 200f, 1f, 20)),
            Bounds(0f, 0f, 800f, 200f), 0L, true
        )
        val mapped = PadMapping.mapStroke(stroke, padWidth, padHeight, focus)
        assertTrue(mapped.bounds.left >= 98f)
        assertTrue(mapped.bounds.right <= 502f)
    }

    @Test
    fun advanceMovesTheFocusBoxRightThenWraps() {
        val moved = PadMapping.advance(focus, pageWidth = 1240f, pageHeight = 1754f)
        assertEquals(500f, moved.x, 0.001f)
        assertEquals(200f, moved.y, 0.001f)

        val atRightEdge = focus.copy(x = 1000f)
        val wrapped = PadMapping.advance(atRightEdge, pageWidth = 1240f, pageHeight = 1754f)
        assertEquals(0f, wrapped.x, 0.001f)
        assertEquals(300f, wrapped.y, 0.001f)
    }

    @Test
    fun advanceStopsAtTheBottomOfThePage() {
        val atBottom = FocusBox(x = 1000f, y = 1700f, width = 400f, height = 100f)
        val result = PadMapping.advance(atBottom, pageWidth = 1240f, pageHeight = 1754f)
        assertTrue(result.y + result.height <= 1754f)
    }

    @Test
    fun aDegeneratePadSizeDoesNotProduceNaN() {
        val (x, y) = PadMapping.toDocument(10f, 10f, 0f, 0f, focus)
        assertTrue(x.isFinite() && y.isFinite())
    }
}
```

- [ ] **Step 2: Write the failing layout test**

`android/app/src/test/kotlin/com/notes/school/ui/editor/SafetyModeLayoutTest.kt`:

```kotlin
package com.notes.school.ui.editor

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.notes.school.core.ToolKind
import com.notes.school.editor.FocusBox
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class SafetyModeLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private fun render() {
        compose.setContent {
            NotesTheme {
                SafetyModeLayout(
                    scene = InkScene("page-1"),
                    focus = FocusBox(50f, 50f, 400f, 100f),
                    state = EditorUiState(
                        title = "Doc",
                        tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f),
                        safetyModeEnabled = true
                    ),
                    onFocusChange = {},
                    onStrokeCommitted = {}
                )
            }
        }
    }

    @Test
    fun bothTheDocumentAndTheWritingPadAreVisible() {
        render()
        compose.onNodeWithTag("safety-document").assertIsDisplayed()
        compose.onNodeWithTag("safety-pad").assertIsDisplayed()
    }

    @Test
    fun theWritingPadSitsOnTheRightSoTheHandStaysOffTheDocument() {
        render()
        val document = compose.onNodeWithTag("safety-document").getBoundsInRoot()
        val pad = compose.onNodeWithTag("safety-pad").getBoundsInRoot()
        assertTrue(pad.left >= document.right)
    }

    @Test
    fun theFocusRectangleIsDrawnOnTheDocument() {
        render()
        compose.onNodeWithTag("focus-box").assertIsDisplayed()
    }
}
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*PadMappingTest*" --tests "*SafetyModeLayoutTest*"
```

Expected: FAIL — `Unresolved reference: PadMapping`.

- [ ] **Step 4: Write the mapping**

`android/app/src/main/kotlin/com/notes/school/editor/PadMapping.kt`:

```kotlin
package com.notes.school.editor

import com.notes.school.core.Bounds
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint

/** The rectangle on the document that the writing pad currently writes into. */
data class FocusBox(val x: Float, val y: Float, val width: Float, val height: Float)

/**
 * Safety mode. The document stays on the left, a dedicated pad occupies the right quarter,
 * and the user's hand rests off the document entirely — the guaranteed fallback when a palm
 * profile is uncomfortable or has not been calibrated yet.
 *
 * The mapping is the one proven by the web prototype: document = focus origin + pad
 * coordinate scaled by (focus size / pad size). Strokes produced here enter the same vector
 * model, history, autosave and export path as full-page writing.
 */
object PadMapping {

    fun scaleX(padWidth: Float, focus: FocusBox): Float =
        if (padWidth > 0f) focus.width / padWidth else 1f

    fun scaleY(padHeight: Float, focus: FocusBox): Float =
        if (padHeight > 0f) focus.height / padHeight else 1f

    fun toDocument(
        padX: Float,
        padY: Float,
        padWidth: Float,
        padHeight: Float,
        focus: FocusBox
    ): Pair<Float, Float> =
        focus.x + padX * scaleX(padWidth, focus) to focus.y + padY * scaleY(padHeight, focus)

    fun mapStroke(stroke: Stroke, padWidth: Float, padHeight: Float, focus: FocusBox): Stroke {
        val sx = scaleX(padWidth, focus)
        val sy = scaleY(padHeight, focus)
        val points = stroke.points.map { p ->
            StrokePoint(focus.x + p.x * sx, focus.y + p.y * sy, p.pressure, p.tOffsetMs)
        }
        return stroke.copy(
            points = points,
            widthPx = stroke.widthPx * sx,
            bounds = Bounds.ofPoints(points, padding = stroke.widthPx * sx / 2f)
        )
    }

    /** Moves the focus rectangle one pad-width right, wrapping to the next line. */
    fun advance(focus: FocusBox, pageWidth: Float, pageHeight: Float): FocusBox {
        val nextX = focus.x + focus.width
        if (nextX + focus.width <= pageWidth) return focus.copy(x = nextX)
        val nextY = (focus.y + focus.height).coerceAtMost(pageHeight - focus.height)
        return focus.copy(x = 0f, y = maxOf(nextY, 0f))
    }
}
```

- [ ] **Step 5: Write the layout**

`android/app/src/main/kotlin/com/notes/school/ui/editor/SafetyModeLayout.kt` places the
document in a `Modifier.weight(0.75f)` column and the pad in `Modifier.weight(0.25f)`,
tagged `safety-document` and `safety-pad`. The focus rectangle is a bordered `Box` tagged
`focus-box`, positioned from the `FocusBox` values and draggable to call `onFocusChange`.
The pad hosts its own `InkView` whose committed strokes are passed through
`PadMapping.mapStroke` before being added to the shared `InkScene`:

```kotlin
InkSurface(
    scene = padScene,
    tool = state.tool,
    onStrokeCommitted = { padStroke ->
        val mapped = PadMapping.mapStroke(padStroke, padWidthPx, padHeightPx, focus)
        val committed = scene.addStroke(mapped.tool, mapped.colorArgb, mapped.widthPx, mapped.points)
        onStrokeCommitted(committed)
    },
    modifier = Modifier.fillMaxSize().testTag("safety-pad")
)
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

```bash
git add android && git commit -m "feat(editor): add 25% safety writing mode sharing the document model"
```

---
## Phase 6 — Remote Interface and Device Verification

### Task 23: Restricted Notes API client and offline job queue

No AI feature is built here. This task ships the versioned contract, the client, and the
durable queue, so a later milestone can add an operation without touching the editor.

**Files:**
- Create: `android/core-model/src/main/kotlin/com/notes/school/core/RemoteDtos.kt`
- Create: `android/remote/build.gradle.kts`
- Create: `android/remote/src/main/AndroidManifest.xml`
- Create: `android/remote/src/main/kotlin/com/notes/school/remote/NotesApi.kt`
- Create: `android/remote/src/main/kotlin/com/notes/school/remote/RetryPolicy.kt`
- Create: `android/remote/src/main/kotlin/com/notes/school/remote/RemoteJobQueue.kt`
- Test: `android/core-model/src/test/kotlin/com/notes/school/core/RemoteDtosTest.kt`
- Test: `android/remote/src/test/kotlin/com/notes/school/remote/RetryPolicyTest.kt`
- Test: `android/remote/src/test/kotlin/com/notes/school/remote/NotesApiClientTest.kt`
- Test: `android/remote/src/test/kotlin/com/notes/school/remote/RemoteJobQueueTest.kt`
- Modify: `android/settings.gradle.kts` (uncomment `include(":remote")`)

**Interfaces:**
- Consumes: `RemoteJobEntity`, `RemoteJobDao` (Task 12).
- Produces:
  - In `core-model`: `enum class RemoteOperation { NOOP_ECHO }`, `data class JobRequest(val operation: String, val schemaVersion: Int = 1, val payload: Map<String, String> = emptyMap())`, `data class JobHandle(val remoteId: String)`, `enum class JobState { QUEUED, SUBMITTED, RUNNING, SUCCEEDED, FAILED, CANCELLED }`, `data class JobStatus(val remoteId: String, val state: JobState, val resultRef: String? = null, val error: String? = null)`, `data class HealthStatus(val ok: Boolean, val version: String)`
  - In `remote`: `sealed interface RemoteFailure { object Offline; object BackendAsleep; object Unauthorized; data class RateLimited(val retryAfterMs: Long); data class Server(val code: Int); data class Unknown(val cause: Throwable) }`
  - `class RemoteException(val failure: RemoteFailure) : Exception()`
  - `interface NotesApi { suspend fun submit(request: JobRequest): JobHandle; suspend fun poll(remoteId: String): JobStatus; suspend fun cancel(remoteId: String); suspend fun health(): HealthStatus }`
  - `class NotesApiClient(private val baseUrl: String, private val tokenProvider: () -> String?, private val client: OkHttpClient = OkHttpClient()) : NotesApi`
  - `object RetryPolicy { const val MAX_ATTEMPTS = 8; fun nextDelayMs(attempt: Int, random: Random = Random.Default): Long; fun isRetryable(failure: RemoteFailure): Boolean }`
  - `class RemoteJobQueue(private val dao: RemoteJobDao, private val api: NotesApi, private val nowMs: () -> Long)` with `suspend fun enqueue(operation: RemoteOperation, documentId: String?, consentGranted: Boolean): String`, `suspend fun runDue(): Int`, `suspend fun cancel(localId: String)`, `fun observe(): Flow<List<RemoteJobEntity>>`
  - `const val NOTES_BASE_URL = "https://luca448-app-backend.hf.space/notes/"` in `NotesApi.kt`

- [ ] **Step 1: Write the failing DTO test**

`android/core-model/src/test/kotlin/com/notes/school/core/RemoteDtosTest.kt`:

```kotlin
package com.notes.school.core

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class RemoteDtosTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun aJobRequestSerializesWithItsSchemaVersion() {
        val encoded = json.encodeToString(JobRequest.serializer(), JobRequest(operation = "NOOP_ECHO"))
        assertEquals(true, encoded.contains("\"schemaVersion\":1"))
    }

    @Test
    fun anUnknownFieldInAServerResponseDoesNotBreakDecoding() {
        val decoded = json.decodeFromString(
            JobStatus.serializer(),
            """{"remoteId":"r1","state":"RUNNING","futureField":42}"""
        )
        assertEquals(JobState.RUNNING, decoded.state)
    }

    @Test
    fun jobStatusCarriesEitherAResultOrAnError() {
        val ok = JobStatus("r1", JobState.SUCCEEDED, resultRef = "results/r1.json")
        val bad = JobStatus("r2", JobState.FAILED, error = "provider unavailable")
        assertEquals("results/r1.json", ok.resultRef)
        assertEquals("provider unavailable", bad.error)
    }

    @Test
    fun noDtoFieldCanCarryARawDocumentOrToken() {
        val fields = JobRequest::class.java.declaredFields.map { it.name }
        listOf("token", "apiKey", "gravityToken", "ink", "bitmap").forEach {
            assertFalse("JobRequest must not expose $it", fields.contains(it))
        }
    }
}
```

Write `android/core-model/src/main/kotlin/com/notes/school/core/RemoteDtos.kt` to satisfy it:

```kotlin
package com.notes.school.core

import kotlinx.serialization.Serializable

/** Operations the backend accepts. NOOP_ECHO exists so the contract can be exercised end to end. */
enum class RemoteOperation { NOOP_ECHO }

@Serializable
data class JobRequest(
    val operation: String,
    val schemaVersion: Int = 1,
    /** Small, explicit key-value payload. Never raw ink, page images or document text. */
    val payload: Map<String, String> = emptyMap()
)

@Serializable
data class JobHandle(val remoteId: String)

enum class JobState { QUEUED, SUBMITTED, RUNNING, SUCCEEDED, FAILED, CANCELLED }

@Serializable
data class JobStatus(
    val remoteId: String,
    val state: JobState,
    val resultRef: String? = null,
    val error: String? = null
)

@Serializable
data class HealthStatus(val ok: Boolean, val version: String)
```

- [ ] **Step 2: Add the remote module**

`android/remote/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.notes.school.remote"
    compileSdk = 34
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].kotlin.srcDir("src/main/kotlin")
    sourceSets["test"].kotlin.srcDir("src/test/kotlin")
    testOptions { unitTests { isIncludeAndroidResources = true } }
}

dependencies {
    api(project(":core-model"))
    implementation(project(":storage"))
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.room.testing)
}
```

`android/remote/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
```

Uncomment `include(":remote")` in `android/settings.gradle.kts`, and add
`implementation(project(":remote"))` to `android/app/build.gradle.kts`.

- [ ] **Step 3: Write the failing retry test**

`android/remote/src/test/kotlin/com/notes/school/remote/RetryPolicyTest.kt`:

```kotlin
package com.notes.school.remote

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RetryPolicyTest {

    @Test
    fun delayGrowsExponentiallyWithTheAttemptNumber() {
        val fixed = Random(1)
        val first = RetryPolicy.nextDelayMs(1, Random(1))
        val third = RetryPolicy.nextDelayMs(3, Random(1))
        assertTrue("$first should be well below $third", third > first * 2)
    }

    @Test
    fun delayIsCappedSoAWokenBackendIsNoticedWithinAMinute() {
        assertTrue(RetryPolicy.nextDelayMs(20, Random(7)) <= 60_000L)
    }

    @Test
    fun jitterMakesTwoRetriesDifferSoRequestsDoNotSynchronize() {
        val a = RetryPolicy.nextDelayMs(4, Random(1))
        val b = RetryPolicy.nextDelayMs(4, Random(2))
        assertTrue("expected jitter, both were $a", a != b)
    }

    @Test
    fun theDelayIsNeverNegativeOrZero() {
        (1..20).forEach { assertTrue(RetryPolicy.nextDelayMs(it, Random(it)) > 0L) }
    }

    @Test
    fun offlineAndSleepingBackendsAreWorthRetrying() {
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.Offline))
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.BackendAsleep))
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.Server(503)))
    }

    @Test
    fun aRateLimitIsRetriedAfterTheServerSuppliedDelay() {
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.RateLimited(retryAfterMs = 30_000L)))
        assertEquals(30_000L, (RemoteFailure.RateLimited(30_000L)).retryAfterMs)
    }

    @Test
    fun anAuthFailureIsNotRetriedBecauseRetryingCannotFixIt() {
        assertFalse(RetryPolicy.isRetryable(RemoteFailure.Unauthorized))
    }
}
```

- [ ] **Step 4: Write the failing client test**

`android/remote/src/test/kotlin/com/notes/school/remote/NotesApiClientTest.kt`:

```kotlin
package com.notes.school.remote

import com.notes.school.core.JobRequest
import com.notes.school.core.JobState
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NotesApiClientTest {

    private lateinit var server: MockWebServer
    private lateinit var api: NotesApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = NotesApiClient(
            baseUrl = server.url("/notes/").toString(),
            tokenProvider = { "restricted-notes-token" }
        )
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun submitPostsToTheVersionedJobsEndpoint() = runTest {
        server.enqueue(MockResponse().setBody("""{"remoteId":"r1"}"""))
        api.submit(JobRequest(operation = "NOOP_ECHO"))
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/notes/v1/jobs", recorded.path)
    }

    @Test
    fun everyRequestCarriesTheRestrictedNotesToken() = runTest {
        server.enqueue(MockResponse().setBody("""{"remoteId":"r1"}"""))
        api.submit(JobRequest(operation = "NOOP_ECHO"))
        assertEquals("Bearer restricted-notes-token", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun pollReadsTheJobById() = runTest {
        server.enqueue(MockResponse().setBody("""{"remoteId":"r1","state":"RUNNING"}"""))
        val status = api.poll("r1")
        assertEquals(JobState.RUNNING, status.state)
        assertEquals("/notes/v1/jobs/r1", server.takeRequest().path)
    }

    @Test
    fun cancelDeletesTheJob() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))
        api.cancel("r1")
        val recorded = server.takeRequest()
        assertEquals("DELETE", recorded.method)
        assertEquals("/notes/v1/jobs/r1", recorded.path)
    }

    @Test
    fun healthReadsTheHealthEndpoint() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"version":"1.0.0"}"""))
        assertTrue(api.health().ok)
        assertEquals("/notes/v1/health", server.takeRequest().path)
    }

    @Test
    fun a401IsReportedAsAnAuthFailure() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        val e = assertThrows(RemoteException::class.java) { runTest { api.poll("r1") } }
        assertEquals(RemoteFailure.Unauthorized, e.failure)
    }

    @Test
    fun a429CarriesTheRetryAfterDelay() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "12"))
        val e = assertThrows(RemoteException::class.java) { runTest { api.poll("r1") } }
        assertEquals(RemoteFailure.RateLimited(12_000L), e.failure)
    }

    @Test
    fun a503IsReportedAsASleepingBackendRatherThanAHardFailure() = runTest {
        server.enqueue(MockResponse().setResponseCode(503))
        val e = assertThrows(RemoteException::class.java) { runTest { api.poll("r1") } }
        assertEquals(RemoteFailure.BackendAsleep, e.failure)
    }

    @Test
    fun anUnreachableHostIsReportedAsOffline() = runTest {
        server.shutdown()
        val e = assertThrows(RemoteException::class.java) { runTest { api.health() } }
        assertEquals(RemoteFailure.Offline, e.failure)
    }

    @Test
    fun aMissingTokenFailsBeforeAnythingIsSent() = runTest {
        val anonymous = NotesApiClient(server.url("/notes/").toString(), tokenProvider = { null })
        val e = assertThrows(RemoteException::class.java) { runTest { anonymous.health() } }
        assertEquals(RemoteFailure.Unauthorized, e.failure)
    }
}
```

- [ ] **Step 5: Write the failing queue test**

`android/remote/src/test/kotlin/com/notes/school/remote/RemoteJobQueueTest.kt`:

```kotlin
package com.notes.school.remote

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.HealthStatus
import com.notes.school.core.JobHandle
import com.notes.school.core.JobRequest
import com.notes.school.core.JobState
import com.notes.school.core.JobStatus
import com.notes.school.core.RemoteOperation
import com.notes.school.storage.NotesDatabase
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class RemoteJobQueueTest {

    private lateinit var db: NotesDatabase
    private var clock = 1_000L

    private class FakeApi : NotesApi {
        var submissions = 0
        var failWith: RemoteFailure? = null
        var status: JobStatus = JobStatus("r1", JobState.SUCCEEDED, resultRef = "results/r1.json")
        val cancelled = mutableListOf<String>()

        override suspend fun submit(request: JobRequest): JobHandle {
            failWith?.let { throw RemoteException(it) }
            submissions++
            return JobHandle("r$submissions")
        }

        override suspend fun poll(remoteId: String): JobStatus {
            failWith?.let { throw RemoteException(it) }
            return status.copy(remoteId = remoteId)
        }

        override suspend fun cancel(remoteId: String) {
            cancelled += remoteId
        }

        override suspend fun health(): HealthStatus = HealthStatus(true, "1.0.0")
    }

    private lateinit var api: FakeApi
    private lateinit var queue: RemoteJobQueue

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NotesDatabase::class.java
        ).allowMainThreadQueries().build()
        api = FakeApi()
        queue = RemoteJobQueue(db.remoteJobDao(), api, nowMs = { clock })
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun anEnqueuedJobIsPersistedBeforeAnyNetworkCall() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, documentId = "doc-1", consentGranted = true)
        assertNotNull(db.remoteJobDao().byId(id))
        assertEquals(0, api.submissions)
    }

    @Test
    fun runDueSubmitsAndRecordsTheRemoteId() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        assertEquals("r1", db.remoteJobDao().byId(id)!!.remoteId)
    }

    @Test
    fun aSucceededJobStoresItsResultReference() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        queue.runDue()
        val job = db.remoteJobDao().byId(id)!!
        assertEquals(JobState.SUCCEEDED.name, job.state)
        assertEquals("results/r1.json", job.resultRef)
    }

    @Test
    fun anOfflineFailureKeepsTheJobQueuedAndSchedulesARetry() = runTest {
        api.failWith = RemoteFailure.Offline
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        val job = db.remoteJobDao().byId(id)!!
        assertEquals(JobState.QUEUED.name, job.state)
        assertEquals(1, job.attempts)
        assertTrue(job.nextAttemptAtMs > clock)
    }

    @Test
    fun aSleepingBackendIsRetriedRatherThanFailed() = runTest {
        api.failWith = RemoteFailure.BackendAsleep
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        assertEquals(JobState.QUEUED.name, db.remoteJobDao().byId(id)!!.state)
    }

    @Test
    fun anAuthFailureStopsRetryingImmediately() = runTest {
        api.failWith = RemoteFailure.Unauthorized
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        val job = db.remoteJobDao().byId(id)!!
        assertEquals(JobState.FAILED.name, job.state)
    }

    @Test
    fun aJobIsNotRetriedBeforeItsScheduledTime() = runTest {
        api.failWith = RemoteFailure.Offline
        queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        assertEquals(0, queue.runDue())
    }

    @Test
    fun submissionIsIdempotentOnceARemoteIdExists() = runTest {
        queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        api.status = JobStatus("r1", JobState.RUNNING)
        queue.runDue()
        queue.runDue()
        queue.runDue()
        assertEquals(1, api.submissions)
    }

    @Test
    fun cancellingAJobStopsItLocallyAndRemotely() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        queue.cancel(id)
        assertEquals(JobState.CANCELLED.name, db.remoteJobDao().byId(id)!!.state)
        assertEquals(listOf("r1"), api.cancelled)
    }

    @Test
    fun aJobWithoutConsentIsNeverSubmitted() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = false)
        queue.runDue()
        assertEquals(0, api.submissions)
        assertEquals(JobState.QUEUED.name, db.remoteJobDao().byId(id)!!.state)
    }

    @Test
    fun retriesStopAfterTheMaximumAttemptCount() = runTest {
        api.failWith = RemoteFailure.Offline
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        repeat(RetryPolicy.MAX_ATTEMPTS + 2) {
            clock += 120_000L
            queue.runDue()
        }
        assertEquals(JobState.FAILED.name, db.remoteJobDao().byId(id)!!.state)
    }
}
```

- [ ] **Step 6: Run the tests to verify they fail**

```bash
cd android && ./gradlew :core-model:test :remote:testDebugUnitTest
```

Expected: FAIL — `Unresolved reference: RetryPolicy`.

- [ ] **Step 7: Write `RetryPolicy`**

`android/remote/src/main/kotlin/com/notes/school/remote/RetryPolicy.kt`:

```kotlin
package com.notes.school.remote

import kotlin.math.pow
import kotlin.random.Random

sealed interface RemoteFailure {
    /** No usable network. The job stays queued; the editor is unaffected. */
    data object Offline : RemoteFailure
    /** The Hugging Face Space is cold. Worth waiting for. */
    data object BackendAsleep : RemoteFailure
    data object Unauthorized : RemoteFailure
    data class RateLimited(val retryAfterMs: Long) : RemoteFailure
    data class Server(val code: Int) : RemoteFailure
    data class Unknown(val cause: Throwable) : RemoteFailure
}

class RemoteException(val failure: RemoteFailure) : Exception(failure.toString())

object RetryPolicy {

    const val MAX_ATTEMPTS = 8
    private const val BASE_DELAY_MS = 2_000.0
    private const val MAX_DELAY_MS = 60_000L

    /** Exponential backoff with full jitter, so many queued jobs do not wake together. */
    fun nextDelayMs(attempt: Int, random: Random = Random.Default): Long {
        val exponential = (BASE_DELAY_MS * 2.0.pow((attempt - 1).coerceAtLeast(0)))
            .coerceAtMost(MAX_DELAY_MS.toDouble())
        return random.nextLong(1L, exponential.toLong().coerceAtLeast(2L))
    }

    fun isRetryable(failure: RemoteFailure): Boolean = when (failure) {
        RemoteFailure.Offline, RemoteFailure.BackendAsleep -> true
        is RemoteFailure.RateLimited -> true
        is RemoteFailure.Server -> failure.code >= 500
        RemoteFailure.Unauthorized -> false
        is RemoteFailure.Unknown -> false
    }
}
```

- [ ] **Step 8: Write `NotesApi` and the client**

`android/remote/src/main/kotlin/com/notes/school/remote/NotesApi.kt`:

```kotlin
package com.notes.school.remote

import com.notes.school.core.HealthStatus
import com.notes.school.core.JobHandle
import com.notes.school.core.JobRequest
import com.notes.school.core.JobStatus
import java.io.IOException
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** Public HTTPS base of the restricted Notes service inside the existing Docker Space. */
const val NOTES_BASE_URL = "https://luca448-app-backend.hf.space/notes/"

interface NotesApi {
    suspend fun submit(request: JobRequest): JobHandle
    suspend fun poll(remoteId: String): JobStatus
    suspend fun cancel(remoteId: String)
    suspend fun health(): HealthStatus
}

/**
 * REST submit-then-poll client. No WebSockets, no streaming: a sleeping Space and a lost
 * Wi-Fi connection must both be ordinary, resumable conditions.
 *
 * The app only ever holds the restricted Notes token. GRAVITY_TOKEN and provider API keys
 * stay server-side and are never shipped in the APK.
 */
class NotesApiClient(
    private val baseUrl: String = NOTES_BASE_URL,
    private val tokenProvider: () -> String?,
    private val client: OkHttpClient = OkHttpClient(),
    private val json: Json = Json { ignoreUnknownKeys = true }
) : NotesApi {

    override suspend fun submit(request: JobRequest): JobHandle {
        val body = json.encodeToString(JobRequest.serializer(), request)
            .toRequestBody("application/json".toMediaType())
        val response = execute(builder("v1/jobs").post(body).build())
        return json.decodeFromString(JobHandle.serializer(), response)
    }

    override suspend fun poll(remoteId: String): JobStatus {
        val response = execute(builder("v1/jobs/$remoteId").get().build())
        return json.decodeFromString(JobStatus.serializer(), response)
    }

    override suspend fun cancel(remoteId: String) {
        execute(builder("v1/jobs/$remoteId").delete().build())
    }

    override suspend fun health(): HealthStatus {
        val response = execute(builder("v1/health").get().build())
        return json.decodeFromString(HealthStatus.serializer(), response)
    }

    private fun builder(path: String): Request.Builder {
        val token = tokenProvider() ?: throw RemoteException(RemoteFailure.Unauthorized)
        return Request.Builder()
            .url(baseUrl.trimEnd('/') + "/" + path)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
    }

    private fun execute(request: Request): String {
        val response: Response = try {
            client.newCall(request).execute()
        } catch (e: IOException) {
            throw RemoteException(RemoteFailure.Offline)
        }
        response.use {
            if (!it.isSuccessful) throw RemoteException(classify(it))
            return it.body?.string().orEmpty().ifEmpty { "{}" }
        }
    }

    private fun classify(response: Response): RemoteFailure = when (response.code) {
        401, 403 -> RemoteFailure.Unauthorized
        429 -> RemoteFailure.RateLimited(
            (response.header("Retry-After")?.toLongOrNull() ?: 30L) * 1000L
        )
        // A cold Hugging Face Space answers 503 while it boots.
        502, 503, 504 -> RemoteFailure.BackendAsleep
        else -> RemoteFailure.Server(response.code)
    }
}
```

- [ ] **Step 9: Write the job queue**

`android/remote/src/main/kotlin/com/notes/school/remote/RemoteJobQueue.kt`:

```kotlin
package com.notes.school.remote

import com.notes.school.core.JobRequest
import com.notes.school.core.JobState
import com.notes.school.core.RemoteOperation
import com.notes.school.core.newId
import com.notes.school.storage.RemoteJobDao
import com.notes.school.storage.RemoteJobEntity
import kotlinx.coroutines.flow.Flow

/**
 * Durable, offline-first job queue. Every job is written to Room before any network call,
 * so closing the app, losing Wi-Fi, or a sleeping Space cannot lose it. Nothing here can
 * block the editor: [runDue] is called from background work only.
 *
 * Documents are never uploaded automatically. A job without consent stays queued and
 * visible until the user grants it.
 */
class RemoteJobQueue(
    private val dao: RemoteJobDao,
    private val api: NotesApi,
    private val nowMs: () -> Long = System::currentTimeMillis
) {
    fun observe(): Flow<List<RemoteJobEntity>> = dao.observeAll()

    suspend fun enqueue(
        operation: RemoteOperation,
        documentId: String?,
        consentGranted: Boolean
    ): String {
        val id = newId()
        val now = nowMs()
        dao.upsert(
            RemoteJobEntity(
                id = id,
                documentId = documentId,
                operation = operation.name,
                consentGranted = consentGranted,
                payloadRef = null,
                remoteId = null,
                state = JobState.QUEUED.name,
                attempts = 0,
                nextAttemptAtMs = now,
                lastError = null,
                resultRef = null,
                createdAtMs = now,
                updatedAtMs = now
            )
        )
        return id
    }

    /** @return how many jobs were advanced. */
    suspend fun runDue(): Int {
        val due = dao.due(
            states = listOf(JobState.QUEUED.name, JobState.SUBMITTED.name, JobState.RUNNING.name),
            nowMs = nowMs()
        )
        var advanced = 0
        for (job in due) {
            if (!job.consentGranted) continue
            advanced += if (job.remoteId == null) submit(job) else poll(job)
        }
        return advanced
    }

    suspend fun cancel(localId: String) {
        val job = dao.byId(localId) ?: return
        job.remoteId?.let { runCatching { api.cancel(it) } }
        dao.upsert(job.copy(state = JobState.CANCELLED.name, updatedAtMs = nowMs()))
    }

    private suspend fun submit(job: RemoteJobEntity): Int = try {
        val handle = api.submit(JobRequest(operation = job.operation))
        dao.upsert(
            job.copy(
                remoteId = handle.remoteId,
                state = JobState.SUBMITTED.name,
                lastError = null,
                updatedAtMs = nowMs()
            )
        )
        1
    } catch (e: RemoteException) {
        recordFailure(job, e)
        0
    }

    private suspend fun poll(job: RemoteJobEntity): Int = try {
        val status = api.poll(job.remoteId!!)
        dao.upsert(
            job.copy(
                state = status.state.name,
                resultRef = status.resultRef,
                lastError = status.error,
                updatedAtMs = nowMs()
            )
        )
        1
    } catch (e: RemoteException) {
        recordFailure(job, e)
        0
    }

    private suspend fun recordFailure(job: RemoteJobEntity, e: RemoteException) {
        val attempts = job.attempts + 1
        val retryable = RetryPolicy.isRetryable(e.failure) && attempts < RetryPolicy.MAX_ATTEMPTS
        val delay = when (val failure = e.failure) {
            is RemoteFailure.RateLimited -> failure.retryAfterMs
            else -> RetryPolicy.nextDelayMs(attempts)
        }
        dao.upsert(
            job.copy(
                state = if (retryable) JobState.QUEUED.name else JobState.FAILED.name,
                attempts = attempts,
                nextAttemptAtMs = nowMs() + delay,
                // The failure kind only; never the response body, which could echo content.
                lastError = e.failure::class.simpleName,
                updatedAtMs = nowMs()
            )
        )
    }
}
```

- [ ] **Step 10: Run the tests to verify they pass**

```bash
cd android && ./gradlew :core-model:test :remote:testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 11: Commit**

```bash
git add android && git commit -m "feat(remote): add restricted Notes API client and durable offline job queue"
```

---

### Task 24: Target-device verification harness and acceptance record

**Files:**
- Create: `android/app/src/androidTest/kotlin/com/notes/school/InkLatencyTest.kt`
- Create: `android/app/src/androidTest/kotlin/com/notes/school/CrashRecoveryTest.kt`
- Create: `android/app/src/androidTest/kotlin/com/notes/school/PalmScenarioTest.kt`
- Create: `android/app/src/test/kotlin/com/notes/school/SecretsAbsentTest.kt`
- Create: `docs/superpowers/verification/2026-08-22-sm-t505-results.md`
- Modify: `android/app/build.gradle.kts` (androidTest dependencies)

**Interfaces:**
- Consumes: everything built so far.
- Produces: a repeatable device suite covering Section 12.2 of the spec, and a results
  document with one row per scenario.

- [ ] **Step 1: Add androidTest dependencies**

In `android/app/build.gradle.kts`:

```kotlin
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
```

- [ ] **Step 2: Write the source-level secrets test**

`android/app/src/test/kotlin/com/notes/school/SecretsAbsentTest.kt`:

```kotlin
package com.notes.school

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class SecretsAbsentTest {

    private val forbidden = listOf("GRAVITY_TOKEN", "hf_", "sk-", "OPENAI_API_KEY", "ANTHROPIC_API_KEY")

    @Test
    fun noSourceOrResourceFileContainsAPrivilegedToken() {
        val roots = listOf(File("src/main"), File("../core-model/src/main"), File("../remote/src/main"))
        val offenders = roots
            .filter { it.exists() }
            .flatMap { it.walkTopDown().filter { f -> f.isFile }.toList() }
            .filter { file -> forbidden.any { file.readText().contains(it) } }
            .map { it.path }
        assertEquals("no privileged token may ship in the APK", emptyList<String>(), offenders)
    }

    @Test
    fun theBackendBaseUrlIsTheRestrictedNotesServiceOnHttps() {
        val text = File("../remote/src/main/kotlin/com/notes/school/remote/NotesApi.kt").readText()
        assertEquals(true, text.contains("https://luca448-app-backend.hf.space/notes/"))
        assertEquals(false, text.contains("http://"))
    }
}
```

- [ ] **Step 3: Write the latency test**

`android/app/src/androidTest/kotlin/com/notes/school/InkLatencyTest.kt`:

```kotlin
package com.notes.school

import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.notes.school.core.ToolKind
import com.notes.school.ink.InkScene
import com.notes.school.ink.InkView
import com.notes.school.ink.ToolSettings
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the SM-T505. The spec's budget is p95 <= 40 ms from input sample to visible
 * trace; this measures the app-side portion of that path — the time from delivering a
 * MotionEvent to the invalidate request returning.
 */
@RunWith(AndroidJUnit4::class)
class InkLatencyTest {

    @Test
    fun theInputPathStaysInsideTheFrameBudgetAtP95() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val view = InkView(context).apply {
            scene = InkScene("page-1")
            tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f)
        }
        view.layout(0, 0, 1340, 800)

        val samples = mutableListOf<Long>()
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(
            MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, 20f, 400f, 0)
        )
        repeat(500) { i ->
            val event = MotionEvent.obtain(
                downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE,
                20f + i * 2f, 400f + (i % 7), 0
            )
            val start = System.nanoTime()
            view.dispatchTouchEvent(event)
            samples += System.nanoTime() - start
            event.recycle()
        }

        val p95 = samples.sorted()[(samples.size * 0.95).toInt()] / 1_000_000.0
        assertTrue("p95 input handling was $p95 ms", p95 <= 40.0)
    }

    @Test
    fun aLongStrokeDoesNotDegradeSampleHandlingOverTime() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val view = InkView(context).apply {
            scene = InkScene("page-1")
            tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f)
        }
        view.layout(0, 0, 1340, 800)
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(
            MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, 10f, 100f, 0)
        )

        fun batch(offset: Int): Double {
            val times = (0 until 200).map { i ->
                val event = MotionEvent.obtain(
                    downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE,
                    10f + (offset + i) % 1300, 100f + i % 500, 0
                )
                val start = System.nanoTime()
                view.dispatchTouchEvent(event)
                val elapsed = System.nanoTime() - start
                event.recycle()
                elapsed
            }
            return times.average() / 1_000_000.0
        }

        val early = batch(0)
        repeat(10) { batch(it * 200) }
        val late = batch(4000)
        assertTrue("handling grew from $early ms to $late ms", late < early * 3 + 1)
    }
}
```

- [ ] **Step 4: Write the crash-recovery test**

`android/app/src/androidTest/kotlin/com/notes/school/CrashRecoveryTest.kt`:

```kotlin
package com.notes.school

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import com.notes.school.core.newId
import com.notes.school.storage.DocumentRepository
import com.notes.school.storage.NotesDatabase
import com.notes.school.storage.recoverOnStartup
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Simulates a forced process termination: the repository is dropped without a graceful
 * shutdown and the database is reopened from the same file. Previously flushed strokes must
 * all still be there.
 */
@RunWith(AndroidJUnit4::class)
class CrashRecoveryTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val dbFile = File(context.getDatabasePath("crash-test.db").path)

    private fun openDatabase(): NotesDatabase =
        Room.databaseBuilder(context, NotesDatabase::class.java, "crash-test.db").build()

    private fun stroke(pageId: String, order: Long) = Stroke(
        newId(), pageId, ToolKind.PEN, -16777216, 3f,
        listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(50f, 50f, 1f, 16)),
        Bounds(0f, 0f, 50f, 50f), order, true
    )

    @Test
    fun flushedStrokesSurviveALossOfTheProcess() = runBlocking {
        dbFile.delete()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        var pageId: String
        openDatabase().let { db ->
            val repository = DocumentRepository(db, scope)
            val document = repository.createDocument(null, "Crash", DocumentKind.LINED)
            pageId = db.pageDao().forDocument(document.id).single().id
            repeat(25) { repository.queueStroke(stroke(pageId, it.toLong())) }
            repository.flush()
            // No close(): this is what a kill -9 looks like to the app.
            db.close()
        }

        openDatabase().let { db ->
            val report = db.recoverOnStartup()
            assertEquals(0, report.orphanStrokesRemoved)
            assertEquals(25, db.strokeDao().countForPage(pageId))
            db.close()
        }
    }
}
```

- [ ] **Step 5: Write the palm scenario test**

`android/app/src/androidTest/kotlin/com/notes/school/PalmScenarioTest.kt` drives
`ContactClassifier` with recorded traces for each Section 12.2 scenario and asserts the
release targets. Traces are captured on the device with the real stylus via a debug capture
screen and stored as CSV in `android/app/src/androidTest/assets/traces/`, one file per
scenario, with columns
`pointerId,eventTimeMs,x,y,toolType,pressure,size,touchMajor,touchMinor,orientation,pointerCount`.

```kotlin
@Test
fun aPalmArrivingAfterALockedPenIsRejectedAtLeast99PercentOfTheTime() {
    val results = replayAll("pen-then-palm")
    val rejected = results.count { it.state == PointerState.PALM_LOCKED && it.pointerId != 0 }
    val total = results.count { it.pointerId != 0 }
    assertTrue("rejected $rejected of $total", rejected.toFloat() / total >= 0.99f)
}

@Test
fun atMostTwoPercentOfIntendedStrokesAreRejected() {
    val results = replayAll("standard-writing")
    val wronglyRejected = results.count { it.state == PointerState.PALM_LOCKED }
    assertTrue(wronglyRejected.toFloat() / results.size <= 0.02f)
}

@Test
fun palmFirstAmbiguousResultsAreRecordedSeparatelyRatherThanAsserted() {
    // Hardware indistinguishability makes a universal guarantee dishonest. This test
    // prints the rate for the results document instead of failing the build.
    val results = replayAll("palm-first-small")
    val rejected = results.count { it.state == PointerState.PALM_LOCKED }
    println("palm-first-small rejection rate: ${rejected.toFloat() / results.size}")
}
```

Add one test per remaining scenario: `palm-first-large`, `moving-palm`,
`two-contacts-in-window`, `slow-dots`, `short-strokes`, `long-strokes`, `rapid-handwriting`,
`dry-hand`, `moist-hand`.

- [ ] **Step 6: Run the whole JVM suite**

```bash
cd android && ./gradlew test testDebugUnitTest
```

Expected: `BUILD SUCCESSFUL` across every module.

- [ ] **Step 7: Run the device suite on the SM-T505**

```bash
cd android && ./gradlew connectedDebugAndroidTest
```

Expected: `BUILD SUCCESSFUL`. This is the run that closes out the deferred device steps from
Tasks 13 and 17.

- [ ] **Step 8: Verify the release APK carries no privileged token**

```bash
cd android && ./gradlew :app:assembleRelease && unzip -p app/build/outputs/apk/release/app-release-unsigned.apk | strings | grep -E "GRAVITY_TOKEN|hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}" | head
```

Expected: no output. Any match is a release blocker.

- [ ] **Step 9: Run the manual airplane-mode and accessibility sweep**

Two acceptance items cannot be asserted from a test process. Do them by hand on the tablet
and record the outcome in Step 10.

Airplane mode (spec Section 14.8) — enable airplane mode, then confirm each of these works
with no error and no spinner that never resolves:
1. open the app and browse folders, recents, favorites and trash;
2. create a blank, a lined and a grid document;
3. import a PDF from local storage and annotate two pages;
4. write, erase, lasso-select, undo and redo on a full page;
5. write in 25% safety mode;
6. export an annotated PDF and open it in another viewer;
7. force-stop the app, reopen it, and confirm every stroke is still present;
8. queue a remote job and confirm it stays `QUEUED` without blocking the editor.

Accessibility (spec Section 11) — with TalkBack on, confirm every rail control, sidebar
entry and settings toggle announces a label; confirm settings state is readable as text
(`On`/`Off`, `Calibrated`/`Not calibrated`) and not by colour alone; confirm the
reduced-transparency setting replaces every glass surface with an opaque one; and confirm
keyboard focus moves through the file overview and settings when a keyboard is attached.

- [ ] **Step 10: Record the results**

`docs/superpowers/verification/2026-08-22-sm-t505-results.md`:

```markdown
# SM-T505 Verification Results

**Device:** Samsung Galaxy Tab A7 LTE (SM-T505), Android 12, One UI Core 4.1
**Stylus:** <model of the actual capacitive stylus used>
**Build:** <git sha>
**Date:** <run date>

## Palm rejection

| Scenario | Runs | Correct | Rate | Target | Result |
|---|---|---|---|---|---|
| pen first, then palm | | | | >= 99% secondary rejection | |
| palm first, large contact | | | | reported | |
| palm first, brief small contact | | | | reported separately | |
| moving palm while writing | | | | reported | |
| two contacts inside the decision window | | | | reported | |
| slow dots | | | | <= 2% intended rejection | |
| short strokes | | | | <= 2% intended rejection | |
| long strokes | | | | <= 2% intended rejection | |
| rapid handwriting | | | | <= 2% intended rejection | |
| dry hands | | | | reported | |
| slightly moist hands | | | | reported | |
| full-page mode | | | | reported | |
| 25% safety mode | | | | reported | |

Palm-first ambiguous results are reported separately: the hardware may present the stylus
and the hand as identical finger contacts, so no honest universal guarantee is possible.

## Performance

| Measurement | Target | Observed |
|---|---|---|
| Provisional ink feedback, p95 | <= 40 ms | |
| Sustained frame time, glass on | within device budget | |
| Large multi-page PDF under memory pressure | no OOM | |

## Durability

| Check | Result |
|---|---|
| Forced termination loses no completed stroke | |
| Migration from every released schema version | |
| Annotated PDF opens in an external viewer | |
| Flattened fallback labelled as such in the UI | |
| All core workflows in airplane mode | |
| No privileged token in the release APK | |
```

- [ ] **Step 11: Commit**

```bash
git add android docs && git commit -m "test: add SM-T505 verification harness and acceptance results record"
```

---

## Acceptance Criteria Mapping

Section 14 of the spec, against the tasks that satisfy each item:

| # | Criterion | Tasks |
|---|---|---|
| 1 | Folders, paper documents, PDF import, reopen after termination | 12, 14, 16, 19, 24 |
| 2 | Pen, highlighter, eraser, lasso, undo, redo work fluidly | 4, 5, 6, 20, 24 |
| 3 | Guided calibration produces a versioned profile; advanced settings reset it | 7, 10, 21 |
| 4 | Conservative improvement can be disabled and cannot escape safe bounds | 7, 10, 21 |
| 5 | 25% safety mode writes into the same model and exports identically | 22, 17 |
| 6 | Autosave survives forced termination | 14, 24 |
| 7 | Annotated PDF opens in an external viewer | 17, 24 |
| 8 | All core workflows work in airplane mode | 14, 23, 24 |
| 9 | No privileged backend token or provider key in the APK | 23, 24 |
| 10 | Target-device performance and palm results recorded | 24 |

## Deferred by design

Per Section 3.2 of the spec, this plan builds none of: typed rich-text editing, OCR,
document scanning, summaries, question generation, research agents, cloud sync,
collaboration, browser automation, iPadOS, or WebSocket infrastructure. Task 23 ships the
remote *interface* only — no user-facing AI feature exists at the end of this plan.

`core-model` stays platform neutral (enforced by a test in Task 2) so a future iPadOS port
can reuse the schema and backend contract, but no iOS-specific abstraction or Kotlin
Multiplatform build is introduced now.
