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
