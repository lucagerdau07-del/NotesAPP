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
