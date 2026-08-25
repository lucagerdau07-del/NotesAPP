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
