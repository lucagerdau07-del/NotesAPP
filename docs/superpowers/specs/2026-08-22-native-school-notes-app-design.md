# Native School Notes App — Design Specification

**Date:** 2026-08-22  
**Status:** Approved design, awaiting written-spec review  
**Primary device:** Samsung Galaxy Tab A7 LTE, SM-T505, Android 12, One UI Core 4.1  
**Supersedes:** `2026-07-18-school-notes-app-design.md` and `2026-07-18-document-viewer-design.md` as implementation authority. Those files remain prototype history.

## 1. Objective

Build a native Android note-taking application for school that remains comfortable with a generic capacitive stylus on hardware without an active pen digitizer. The application must support handwritten notes and PDF worksheet annotation while the user rests their palm on the display.

The primary writing mode uses calibrated software palm rejection. The existing right-side writing-pad concept remains available as a dependable 25% safety mode. Core writing and document management work offline. Expensive AI processing is deferred to an HTTPS backend hosted in the existing Hugging Face Docker Space.

The product must be honest about the hardware limitation: software can make palm rejection practical and increasingly personalized, but cannot guarantee the same separation as an active digitizer because the tablet may report both the stylus and hand as ordinary finger contacts.

## 2. Product Principles

1. **Writing is local and immediate.** Network state must never block opening, writing, saving, or exporting a document.
2. **Paper is the content layer.** Everything outside the page uses dark mode; the page itself remains white unless a template specifies otherwise.
3. **Controls stay away from the right writing hand.** The editor uses a narrow vertical tool rail on the left in landscape orientation.
4. **Palm decisions are reversible.** Calibration profiles are versioned, bounded, resettable, and never learn blindly from uncertain classifications.
5. **The safety mode is always available.** A failed or uncomfortable palm profile must not make the app unusable.
6. **Remote AI is optional and isolated.** The Android app never contains the powerful Gravity token and never requires AI for its core job.

## 3. MVP Scope

### 3.1 Included

- Landscape-first native Android application.
- Dark file and folder overview with a Liquid-Glass-inspired navigation sidebar.
- Local folders, recent documents, favorites, rename, move, duplicate, and trash.
- New blank, lined, and grid documents.
- PDF import, page rendering, handwriting annotation, and annotated PDF export.
- Vector pen, highlighter, eraser, lasso selection, undo, and redo.
- Left tool rail with icon-only controls and contextual pen/color/width popover.
- Full-page writing with calibrated software palm rejection.
- Guided calibration using palm-only, stylus-only, and combined movement samples.
- Conservative local profile improvement based only on high-confidence contacts.
- Advanced manual controls for filter bias, small contacts, and decision window.
- 25% right-side safety writing mode based on the proven web prototype concept.
- Crash-safe local autosave and explicit export/share.
- A versioned remote-service interface for later AI jobs, without shipping user-facing AI features in the first milestone.

### 3.2 Deferred

- Typed rich-text editing.
- OCR, automatic document scanning, summaries, question generation, and research agents.
- Cloud synchronization and multi-user collaboration.
- Browser automation from the Android device.
- iPadOS application.
- Real-time collaboration or WebSocket infrastructure.

## 4. Visual and Interaction Design

### 4.1 Editor

- The editor is landscape-first and may lock orientation during writing on the initial release.
- A dark-gray workspace surrounds the white document page.
- The top-left glass control reads `‹ <filename>`, for example `‹ Zellaufbau.pdf`, and returns to the file overview.
- A narrow floating rail on the left contains vector icons only: pen, highlighter, eraser, lasso, undo, and redo.
- Tapping the active pen opens a small contextual popover to the right of the rail for color and width selection.
- A small crossed-out hand icon at the bottom-right is the only persistent palm-status indicator in the editor.
- Calibration, profile controls, and the 25% mode are not exposed as editor panels. They live in Settings.
- All interactive targets are at least 48 dp even when the visible symbol is smaller.

### 4.2 File Overview

- The selected layout is the Glass Sidebar option.
- A floating top navigation/search bar and left sidebar use the glass treatment.
- Folder cards and recent-document rows use ordinary dark content surfaces, not glass.
- The sidebar contains My Files, Recent, Favorites, Trash, and Settings.
- The content area shows subject folders followed by recently opened documents.

### 4.3 Palm Settings

- The default Palm Protection settings page stays compact.
- It shows profile status, `Recalibrate`, `Improve profile automatically`, and `25% safety mode`.
- A row labeled `Advanced settings ›` opens a separate subpage.
- The advanced subpage contains recognition bias, small-contact weighting, decision-window controls, a test surface, and profile reset.
- Explanatory cards such as “Local / Bounded / Reversible” are not displayed in the production UI.

### 4.4 Liquid-Glass-Inspired Treatment

Apple's actual Liquid Glass implementation is not available on Android. The app reproduces its hierarchy and optical character without claiming to use Apple's system material:

- Glass is limited to navigation and floating tool controls.
- Content surfaces use stable dark materials.
- Small glass regions may use cached blur, luminosity adjustment, edge highlights, and subtle touch-responsive specular movement.
- The SM-T505 performance profile disables live refraction and falls back to a translucent gradient with static highlights if frame timing degrades.
- A reduced-transparency setting provides a fully opaque high-contrast alternative.

## 5. Native Android Architecture

### 5.1 Technology Direction

- Kotlin is the implementation language.
- Jetpack Compose renders the app shell, file overview, settings, dialogs, and non-drawing controls.
- A dedicated custom Android `View` renders ink and consumes raw `MotionEvent` input. The hot drawing path does not depend on Compose recomposition.
- Coroutines and flows coordinate persistence and background work outside the input callback.
- Room stores structured local state.
- Imported PDFs and generated previews live in app-private file storage.
- `android.graphics.pdf.PdfRenderer` is the baseline renderer because it is available on the target Android 12 device without relying on a recent SDK extension.
- PdfBox-Android is the baseline writer for preserving original PDF content during annotated export. The implementation starts from the verified Apache-2.0 release `com.tom-roush:pdfbox-android:2.0.27.0` and changes version only after target-device regression testing.

### 5.2 Repository Layout

The existing React/Vite project remains intact as a frozen interaction prototype. The native application is added as a separate `android/` Gradle project. The first implementation does not move or delete the prototype.

Proposed native modules:

- `android/app`: application shell, navigation, dependency composition, and Android resources.
- `android/core-model`: platform-neutral document, page, stroke, tool, and profile models.
- `android/ink-engine`: low-latency stroke capture, rendering, selection, erasing, and history.
- `android/touch-engine`: feature extraction, classification state machine, calibration, and profile adaptation.
- `android/document-engine`: paper templates, PDF rendering, page viewport, and export abstraction.
- `android/storage`: Room database, app-private files, autosave, migrations, and recovery.
- `android/remote`: offline job queue and restricted Notes API client.

`core-model` contains no Android UI types. Its schemas and backend DTOs are designed so they can later be moved to Kotlin Multiplatform or reimplemented in Swift without changing stored documents.

## 6. Ink and Touch Pipeline

### 6.1 Captured Input

For every pointer and historical sample, the touch engine records only the numerical input features needed for classification:

- pointer ID and event time;
- x/y coordinates and historical coordinates;
- Android tool type when available;
- pressure and normalized size;
- touch major/minor axes and orientation when supplied by the device;
- velocity, acceleration, direction change, and contact duration;
- active pointer count;
- order and spatial relationship between simultaneous contacts.

A generic capacitive stylus may appear as `TOOL_TYPE_FINGER`, so tool type is only a hint and never the primary decision.

### 6.2 Classification State Machine

Each contact moves through an explicit state machine:

1. `Unknown`: insufficient evidence.
2. `PenCandidate`: small moving contact with pen-like trajectory.
3. `PalmCandidate`: large, stationary, multi-contact, or palm-like geometry.
4. `PenLocked`: the pointer is accepted for the remainder of that stroke.
5. `PalmLocked`: the pointer is ignored until it lifts.

The state machine uses hysteresis so a pointer cannot alternate rapidly between pen and palm. Once a pen pointer is locked, newly arriving palm contacts do not interrupt it. This makes the common “pen first, palm later” sequence highly reliable.

Ambiguous contacts are rendered into a provisional overlay for a short bounded decision window rather than immediately committed. If accepted, their buffered points become a vector stroke; if rejected, the provisional trace disappears. The default window is determined by calibration and may be adjusted in Advanced Settings. The renderer targets immediate visual feedback even while commitment is delayed.

The hardest case remains a small palm contact arriving before the stylus. Calibration and trajectory evidence reduce mistakes, but the safety mode remains the guaranteed fallback.

### 6.3 Calibration

Calibration is local and takes approximately 20 seconds:

1. The user rests their palm naturally and makes small placement movements.
2. The user writes a short sample with the capacitive stylus without the palm.
3. The user writes while resting and moving the palm as they would in class.

The engine derives robust ranges and percentiles rather than training a large neural network. The profile includes device build, orientation, handedness, feature availability, thresholds, confidence margins, and an evaluation score.

### 6.4 Conservative Profile Improvement

Automatic improvement is feasible without heavy local AI. It updates lightweight statistics only from high-confidence contacts. It must obey all of these rules:

- uncertain contacts never become training samples;
- changes are accumulated during a session and applied only after a stroke or document session, never mid-stroke;
- every threshold has a hard safe range derived from calibration;
- the previous stable profile remains available;
- a candidate profile must pass stored calibration samples before activation;
- repeated degradation automatically restores the last stable version;
- raw ink, page images, and document text are not included in the profile.

Manual advanced controls set the baseline bias. Automatic improvement may move only within a small bounded range around that baseline.

### 6.5 25% Safety Mode

Safety mode keeps the document on the left and a dedicated writing pad on the right. The user's hand can remain off-screen. Strokes are mapped from the pad into a focus rectangle on the document using the coordinate mapping proven by the prototype. The mode shares the same vector stroke model, history, autosave, and export pipeline as full-page writing.

## 7. Document Model and Persistence

### 7.1 Data Model

- `Folder`: ID, parent ID, name, ordering, timestamps, trash state.
- `Document`: ID, folder ID, title, document type, timestamps, favorite state, source reference.
- `Page`: ID, document ID, order, size, template or PDF page reference, viewport metadata.
- `Stroke`: ID, page ID, tool, color, width, encoded point blob, bounds, creation order, active state.
- `PalmProfile`: version, device fingerprint, orientation, feature ranges, thresholds, score, stable state.
- `RemoteJob`: local ID, document reference, operation, consent state, payload reference, remote ID, retry state, result reference.

Stroke point arrays use a versioned compact binary encoding inside Room BLOB fields. Each completed stroke is one transaction. Erasing and undo initially change logical state instead of destructively rewriting old data, enabling recovery and deterministic history.

### 7.2 Autosave and Recovery

- A completed stroke is queued for persistence immediately and committed within a short bounded interval.
- The active stroke remains in memory only until completion or cancellation.
- Document metadata and stroke operations use transactions.
- On startup, incomplete operations are discarded or recovered without corrupting prior committed strokes.
- Database schema versions and migrations are tested from every released version.
- A manual export never becomes the only copy of a document.

### 7.3 PDF Handling

- The imported source PDF is immutable and stored once in app-private storage.
- `PdfRenderer` produces page tiles and thumbnails with a bounded memory cache.
- Ink remains a separate vector overlay during editing.
- PdfBox-Android opens a copy of the immutable source and applies the app's vector ink as PDF annotation or appearance content, preserving the original page content and selectable text.
- Export processes one page at a time and closes temporary objects aggressively to stay inside the tablet's memory budget.
- A flattened visual export is available if PdfBox-Android rejects an unsupported source feature or cannot complete within the memory budget. The fallback is explicitly labeled because source text may no longer remain selectable.
- Large PDFs render only visible and adjacent pages; background prefetch stops under memory pressure.

## 8. Offline and Remote Architecture

### 8.1 Offline-First Behavior

Opening, writing, organizing, searching local metadata, autosaving, and exporting require no network. Remote operations are explicit jobs queued in Room. Closing the app, losing Wi-Fi, or a sleeping Hugging Face Space does not lose the job.

### 8.2 Restricted Notes API

Later AI features use a dedicated service inside the existing Docker Space:

- Public base: `https://luca448-app-backend.hf.space/notes/`
- Internal service port: `7863`
- Transport: HTTPS on port 443 through Nginx
- Pattern: REST submission followed by polling; no WebSockets
- Authentication: a dedicated restricted Notes token
- The Android app never receives `GRAVITY_TOKEN` and has no shell, Git, or arbitrary filesystem route.

The initial contract reserves versioned endpoints similar to:

- `POST /notes/v1/jobs`
- `GET /notes/v1/jobs/{id}`
- `DELETE /notes/v1/jobs/{id}`
- `GET /notes/v1/health`

The backend may call the existing Gravity AI gateway internally and choose free or inexpensive providers. API provider secrets remain server-side. The client applies exponential retry with jitter, distinguishes offline/sleeping/auth/rate-limit failures, and provides a manual retry action.

Documents are not uploaded automatically in the MVP. Future scanning and AI processing require a per-folder consent policy and a visible job record. The app can remain fully useful with remote services disabled.

## 9. Performance Budgets

Performance is measured on the SM-T505, not inferred from an emulator.

- Provisional ink feedback target: p95 at or below 40 ms from input sample to visible trace.
- No Compose state update for every touch sample.
- Input processing must avoid allocation proportional to point count in the event callback.
- Rendering invalidates stroke bounds rather than the full canvas where practical.
- Visible-page vector data and PDF tiles use bounded caches with deterministic eviction.
- Autosave, export, thumbnails, and remote jobs never run on the UI thread.
- Glass effects automatically reduce quality if sustained frame time exceeds the device budget.

## 10. Error Handling and Safety

- If confidence becomes too low, the UI keeps writing available and recommends recalibration or safety mode; it does not silently block all input.
- The user can restore the last stable palm profile or reset to calibrated defaults.
- A corrupt or unsupported PDF opens an error view without affecting other documents.
- Export writes to a temporary destination and publishes the file only after successful completion.
- Database failures preserve the previous committed state and surface a recoverable error.
- Remote failures remain queued locally and never block the editor.
- Logs exclude document contents, raw ink, API tokens, and imported filenames unless the user explicitly exports diagnostics.

## 11. Accessibility and Device Behavior

- All controls expose content descriptions and support keyboard focus where applicable.
- Touch targets are at least 48 dp.
- Blue is not the only status signal; state also uses shape or text in settings.
- Reduced transparency replaces glass with opaque surfaces.
- The editor prioritizes right-handed landscape use. Left-handed and portrait layouts are future adaptations, not hidden promises in the MVP.
- Android system back behavior matches the visible `‹ filename` navigation.

## 12. Verification Strategy

### 12.1 Automated Tests

- Unit tests for stroke encoding, bounds, transforms, erasing, selection, and undo/redo.
- Deterministic touch-state-machine tests using recorded numerical traces with document content removed.
- Calibration and profile-version tests, including safe bounds, rollback, and no-learning-from-uncertain-events properties.
- Room DAO, transaction, migration, and crash-recovery tests.
- PDF page-order, rotation, cache, and export tests against a small representative corpus.
- Offline queue tests for retry, cancellation, idempotency, sleeping backend, authentication failure, and rate limits.
- Compose UI tests for file navigation and settings.

### 12.2 Target-Device Tests

The release candidate is exercised on the SM-T505 with the actual intended capacitive stylus. The repeatable test set includes:

- pen first, then palm;
- palm first with large contact;
- palm first with a brief small contact;
- moving palm while writing;
- two contacts appearing within the ambiguous decision window;
- slow dots, short strokes, long strokes, and rapid handwriting;
- dry and slightly moist hands;
- full-page and 25% safety modes;
- a large multi-page PDF under memory pressure.

The primary release targets after calibration are at least 99% rejection of secondary palm contacts once a pen pointer is locked, at most 2% intended-stroke rejection in the standard writing corpus, and no unrecoverable document loss during forced process termination. Palm-first ambiguous results are reported separately because hardware indistinguishability prevents an honest universal guarantee.

## 13. Future iPadOS Port

The iPadOS application can use SwiftUI for its shell and PencilKit for Apple Pencil input and platform palm rejection. It will reuse the versioned document schema, PDF behavior, backend contract, and product flows. The first Android release does not carry iOS-specific abstractions or a full Kotlin Multiplatform build; `core-model` is kept platform-neutral so extraction is possible when an iPadOS project actually begins.

## 14. Acceptance Criteria for the Android MVP

The MVP is complete when:

1. A user can create folders and paper documents, import a PDF, and reopen everything after process termination.
2. Pen, highlighter, eraser, lasso, undo, and redo work fluidly on the target tablet.
3. Guided calibration produces a versioned profile, full-page writing uses it, and advanced settings can reset it.
4. Conservative profile improvement can be disabled and cannot escape calibrated safe bounds.
5. The 25% safety mode writes into the same document model and exports identically.
6. Autosave survives forced app termination without losing previously completed strokes.
7. An annotated PDF can be exported and opened by an external PDF viewer.
8. All core workflows work in airplane mode.
9. No privileged backend token or provider API key is present in the APK.
10. Target-device performance and palm-rejection results are recorded against the test scenarios in Section 12.
