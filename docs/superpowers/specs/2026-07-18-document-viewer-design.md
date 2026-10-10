# Document Viewer & Focus Box Architecture Design

## 1. Overview
The core ergonomic innovation of this application is the physical separation of the writing surface (Right Pad) from the document viewing surface (Left Monitor). This prevents palm-rejection issues on capacitive touchscreens.

## 2. Architecture

### 2.1 The Monitor (Left Side: `DocumentView`)
- Acts as the master display.
- Renders the background (initially a College Block dot-grid, later expandable to PDF via pdf.js).
- Hosts a master `HTML5 Canvas` that spans the entire document size.
- This master canvas holds the persistent state of all handwritten notes.

### 2.2 The Pad (Right Side: `WritingZone`)
- Acts purely as an input device.
- Captures user strokes via pointer events.
- Does NOT persistently save the strokes.
- Provides a "Treadmill" area on the right edge (trigger zone). When the stylus hits this zone, it triggers the Auto-Advance logic.

### 2.3 The Focus Box (The Bridge)
- A visually distinct, draggable and resizable overlay `<div>` on the Left Side.
- Represents the exact physical area on the Master Canvas that corresponds to the Right Pad.
- When the user draws a stroke on the Right Pad, the app translates the coordinates:
  `Master X = FocusBox.x + (Pad.x * (FocusBox.width / Pad.width))`
  `Master Y = FocusBox.y + (Pad.y * (FocusBox.height / Pad.height))`
- The stroke is immediately drawn onto the Master Canvas in real-time.

### 2.4 Auto-Advance (Treadmill Effect)
- When the stylus enters the right-most 15% of the Pad, the Focus Box smoothly translates horizontally to the right.
- The Pad's visual context is shifted leftwards to simulate continuous writing space, preventing the need to lift the hand to scroll.

## 3. Performance Considerations
- **Zero Latency:** Both the Pad and Monitor canvases must use direct DOM context drawing during pointer events to avoid React state-batching latency during active strokes.
- **High-DPI:** All canvas contexts must respect `window.devicePixelRatio` to prevent blurry lines.

## 4. State Management
- The Master Canvas state (history for undo/redo) is held in a higher-level context, not locally inside the Pad.
- The Pad only manages its ephemeral "current stroke" state.
