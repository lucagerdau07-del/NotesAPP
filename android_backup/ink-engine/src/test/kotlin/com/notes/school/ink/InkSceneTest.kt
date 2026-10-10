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
