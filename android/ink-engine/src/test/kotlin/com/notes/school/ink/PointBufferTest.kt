package com.notes.school.ink

import com.notes.school.core.StrokePoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class PointBufferTest {

    @Test
    fun addStoresCoordinatesContiguously() {
        val buffer = PointBuffer(initialCapacity = 4)
        buffer.add(1f, 2f, 0.5f, 0)
        buffer.add(3f, 4f, 0.5f, 8)
        assertEquals(2, buffer.count)
        assertEquals(1f, buffer.xy[0], 0f)
        assertEquals(2f, buffer.xy[1], 0f)
        assertEquals(3f, buffer.xy[2], 0f)
        assertEquals(4f, buffer.xy[3], 0f)
    }

    @Test
    fun bufferGrowsBeyondInitialCapacity() {
        val buffer = PointBuffer(initialCapacity = 2)
        repeat(100) { buffer.add(it.toFloat(), it.toFloat(), 0.5f, it) }
        assertEquals(100, buffer.count)
        assertEquals(99f, buffer.xy[198], 0f)
    }

    @Test
    fun clearResetsCountButKeepsTheAllocatedArray() {
        val buffer = PointBuffer(initialCapacity = 64)
        repeat(10) { buffer.add(1f, 1f, 1f, it) }
        val array = buffer.xy
        buffer.clear()
        assertEquals(0, buffer.count)
        assertSame(array, buffer.xy)
    }

    @Test
    fun toStrokePointsProducesTheRecordedSamples() {
        val buffer = PointBuffer()
        buffer.add(1f, 2f, 0.25f, 0)
        buffer.add(3f, 4f, 0.75f, 16)
        assertEquals(
            listOf(StrokePoint(1f, 2f, 0.25f, 0), StrokePoint(3f, 4f, 0.75f, 16)),
            buffer.toStrokePoints()
        )
    }

    @Test
    fun boundsWithIncludesHalfTheStrokeWidth() {
        val buffer = PointBuffer()
        buffer.add(10f, 10f, 1f, 0)
        buffer.add(20f, 30f, 1f, 8)
        val b = buffer.boundsWith(widthPx = 4f)
        assertEquals(8f, b.left, 0.001f)
        assertEquals(32f, b.bottom, 0.001f)
    }
}
