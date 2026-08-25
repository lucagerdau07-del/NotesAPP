package com.notes.school.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DocumentsTest {

    @Test
    fun boundsOfPointsCoversAllPointsPlusPadding() {
        val points = listOf(
            StrokePoint(10f, 20f, 0.5f, 0),
            StrokePoint(30f, 5f, 0.5f, 8),
            StrokePoint(15f, 40f, 0.5f, 16)
        )
        val b = Bounds.ofPoints(points, padding = 2f)
        assertEquals(8f, b.left, 0.001f)
        assertEquals(3f, b.top, 0.001f)
        assertEquals(32f, b.right, 0.001f)
        assertEquals(42f, b.bottom, 0.001f)
        assertEquals(24f, b.width, 0.001f)
        assertEquals(39f, b.height, 0.001f)
    }

    @Test
    fun boundsOfEmptyPointsIsEmptyAtOrigin() {
        val b = Bounds.ofPoints(emptyList(), padding = 4f)
        assertEquals(Bounds.EMPTY, b)
    }

    @Test
    fun unionExpandsToCoverBoth() {
        val a = Bounds(0f, 0f, 10f, 10f)
        val b = Bounds(5f, -5f, 20f, 8f)
        assertEquals(Bounds(0f, -5f, 20f, 10f), a.union(b))
    }

    @Test
    fun intersectsIsTrueOnOverlapAndFalseOnGap() {
        assertTrue(Bounds(0f, 0f, 10f, 10f).intersects(Bounds(9f, 9f, 20f, 20f)))
        assertFalse(Bounds(0f, 0f, 10f, 10f).intersects(Bounds(11f, 0f, 20f, 10f)))
    }

    @Test
    fun newIdIsUniqueAcrossCalls() {
        assertEquals(500, (1..500).map { newId() }.toSet().size)
    }

    @Test
    fun strokeDefaultsToActive() {
        val s = Stroke(
            id = newId(),
            pageId = "page-1",
            tool = ToolKind.PEN,
            colorArgb = 0xFF2C2825.toInt(),
            widthPx = 3f,
            points = listOf(StrokePoint(0f, 0f, 1f, 0)),
            bounds = Bounds.EMPTY,
            order = 1
        )
        assertTrue(s.active)
    }
}
