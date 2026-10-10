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
