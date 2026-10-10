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
        if (buffer != null) {
            val start = strokeStartMs[pointerId] ?: event.eventTime
            buffer.add(
                event.getX(index),
                event.getY(index),
                event.getPressure(index),
                (event.eventTime - start).toInt()
            )
            if (pointerId !in provisional && buffer.count > 0) {
                commit(buffer)
            }
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
