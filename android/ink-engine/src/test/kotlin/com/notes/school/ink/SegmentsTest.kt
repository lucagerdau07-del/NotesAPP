package com.notes.school.ink

import com.notes.school.core.StrokePoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SegmentsTest {

    @Test
    fun perpendicularDistanceToMiddleOfSegment() {
        assertEquals(5f, Segments.distanceToSegment(5f, 5f, 0f, 0f, 10f, 0f), 0.001f)
    }

    @Test
    fun distanceClampsToNearestEndpointBeyondSegment() {
        assertEquals(5f, Segments.distanceToSegment(15f, 0f, 0f, 0f, 10f, 0f), 0.001f)
        assertEquals(5f, Segments.distanceToSegment(-5f, 0f, 0f, 0f, 10f, 0f), 0.001f)
    }

    @Test
    fun degenerateSegmentBehavesLikePointDistance() {
        assertEquals(3f, Segments.distanceToSegment(3f, 4f, 0f, 4f, 0f, 4f), 0.001f)
    }

    private fun square(size: Float) = listOf(
        StrokePoint(0f, 0f, 0f, 0),
        StrokePoint(size, 0f, 0f, 0),
        StrokePoint(size, size, 0f, 0),
        StrokePoint(0f, size, 0f, 0)
    )

    @Test
    fun polygonContainsInteriorPoint() {
        assertTrue(Segments.polygonContains(square(10f), 5f, 5f))
    }

    @Test
    fun polygonRejectsExteriorPoint() {
        assertFalse(Segments.polygonContains(square(10f), 15f, 5f))
    }

    @Test
    fun polygonWithFewerThanThreePointsContainsNothing() {
        assertFalse(Segments.polygonContains(listOf(StrokePoint(0f, 0f, 0f, 0)), 0f, 0f))
    }
}
