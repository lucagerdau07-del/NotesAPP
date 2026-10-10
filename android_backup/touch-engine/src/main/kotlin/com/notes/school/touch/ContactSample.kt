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
