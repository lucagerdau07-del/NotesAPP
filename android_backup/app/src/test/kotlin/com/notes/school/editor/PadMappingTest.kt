package com.notes.school.editor

import com.notes.school.core.Bounds
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PadMappingTest {

    private val focus = FocusBox(x = 100f, y = 200f, width = 400f, height = 100f)
    private val padWidth = 800f
    private val padHeight = 200f

    @Test
    fun theOriginOfThePadMapsToTheOriginOfTheFocusBox() {
        val (x, y) = PadMapping.toDocument(0f, 0f, padWidth, padHeight, focus)
        assertEquals(100f, x, 0.001f)
        assertEquals(200f, y, 0.001f)
    }

    @Test
    fun theFarCornerOfThePadMapsToTheFarCornerOfTheFocusBox() {
        val (x, y) = PadMapping.toDocument(padWidth, padHeight, padWidth, padHeight, focus)
        assertEquals(500f, x, 0.001f)
        assertEquals(300f, y, 0.001f)
    }

    @Test
    fun theCenterOfThePadMapsToTheCenterOfTheFocusBox() {
        val (x, y) = PadMapping.toDocument(padWidth / 2f, padHeight / 2f, padWidth, padHeight, focus)
        assertEquals(300f, x, 0.001f)
        assertEquals(250f, y, 0.001f)
    }

    @Test
    fun writingOnTheLargePadProducesSmallerInkOnTheDocument() {
        assertEquals(0.5f, PadMapping.scaleX(padWidth, focus), 0.001f)
    }

    @Test
    fun aMappedStrokeKeepsItsToolColorAndPointCount() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.HIGHLIGHTER, 0xFFFFEE00.toInt(), 20f,
            listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(800f, 200f, 1f, 20)),
            Bounds(0f, 0f, 800f, 200f), 0L, true
        )
        val mapped = PadMapping.mapStroke(stroke, padWidth, padHeight, focus)
        assertEquals(ToolKind.HIGHLIGHTER, mapped.tool)
        assertEquals(0xFFFFEE00.toInt(), mapped.colorArgb)
        assertEquals(2, mapped.points.size)
    }

    @Test
    fun aMappedStrokeLandsInsideTheFocusBox() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.PEN, -16777216, 6f,
            listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(800f, 200f, 1f, 20)),
            Bounds(0f, 0f, 800f, 200f), 0L, true
        )
        val mapped = PadMapping.mapStroke(stroke, padWidth, padHeight, focus)
        assertEquals(100f, mapped.points.first().x, 0.001f)
        assertEquals(500f, mapped.points.last().x, 0.001f)
        assertEquals(3f, mapped.widthPx, 0.001f)
    }

    @Test
    fun mappedBoundsAreRecomputedRatherThanCopied() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.PEN, -16777216, 6f,
            listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(800f, 200f, 1f, 20)),
            Bounds(0f, 0f, 800f, 200f), 0L, true
        )
        val mapped = PadMapping.mapStroke(stroke, padWidth, padHeight, focus)
        assertTrue(mapped.bounds.left >= 98f)
        assertTrue(mapped.bounds.right <= 502f)
    }

    @Test
    fun advanceMovesTheFocusBoxRightThenWraps() {
        val moved = PadMapping.advance(focus, pageWidth = 1240f, pageHeight = 1754f)
        assertEquals(500f, moved.x, 0.001f)
        assertEquals(200f, moved.y, 0.001f)

        val atRightEdge = focus.copy(x = 1000f)
        val wrapped = PadMapping.advance(atRightEdge, pageWidth = 1240f, pageHeight = 1754f)
        assertEquals(0f, wrapped.x, 0.001f)
        assertEquals(300f, wrapped.y, 0.001f)
    }

    @Test
    fun advanceStopsAtTheBottomOfThePage() {
        val atBottom = FocusBox(x = 1000f, y = 1700f, width = 400f, height = 100f)
        val result = PadMapping.advance(atBottom, pageWidth = 1240f, pageHeight = 1754f)
        assertTrue(result.y + result.height <= 1754f)
    }

    @Test
    fun aDegeneratePadSizeDoesNotProduceNaN() {
        val (x, y) = PadMapping.toDocument(10f, 10f, 0f, 0f, focus)
        assertTrue(x.isFinite() && y.isFinite())
    }
}
