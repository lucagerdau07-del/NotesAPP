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
