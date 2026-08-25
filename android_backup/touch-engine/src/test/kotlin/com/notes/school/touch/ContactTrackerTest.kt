package com.notes.school.touch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ContactTrackerTest {

    private lateinit var tracker: ContactTracker

    @Before
    fun setUp() {
        tracker = ContactTracker()
    }

    private fun feed(samples: List<ContactSample>): ContactFeatures =
        samples.map { tracker.onSample(it) }.last()

    @Test
    fun durationIsMeasuredFromTheFirstSample() {
        val features = feed(Traces.penStroke(samples = 5))
        assertEquals(32L, features.durationMs)
    }

    @Test
    fun pathLengthAccumulatesWhileDisplacementStaysDirect() {
        val features = feed(Traces.penStroke(samples = 10, stepPx = 10f))
        assertTrue(features.pathLengthPx > features.displacementPx)
        assertEquals(90f, features.displacementPx, 3f)
    }

    @Test
    fun penTraceHasHigherMeanSpeedThanRestingPalm() {
        val pen = feed(Traces.penStroke())
        tracker.reset()
        val palm = feed(Traces.palmRest())
        assertTrue(pen.meanSpeedPxPerMs > palm.meanSpeedPxPerMs * 5)
    }

    @Test
    fun sizeStatisticsFollowTheReportedContact() {
        val palm = feed(Traces.palmRest(size = 0.55f))
        assertEquals(0.55f, palm.meanSizeNorm, 0.001f)
        assertEquals(0.55f, palm.maxSizeNorm, 0.001f)
    }

    @Test
    fun axisRatioIsMajorOverMinor() {
        val palm = feed(Traces.palmRest())
        assertEquals(88f / 41f, palm.axisRatio, 0.01f)
    }

    @Test
    fun degenerateMinorAxisDoesNotProduceInfinity() {
        val sample = Traces.penStroke(samples = 1).first().copy(touchMinor = 0f)
        val features = tracker.onSample(sample)
        assertTrue(features.axisRatio.isFinite())
    }

    @Test
    fun directionChangesCountZigZag() {
        val features = feed(Traces.penStroke(samples = 12))
        assertTrue("alternating y should register reversals", features.directionChanges > 0)
    }

    @Test
    fun arrivalIndexOrdersSimultaneousContacts() {
        tracker.onSample(Traces.penStroke(pointerId = 0).first())
        tracker.onSample(Traces.palmRest(pointerId = 1).first())
        assertEquals(0, tracker.featuresOf(0)!!.arrivalIndex)
        assertEquals(1, tracker.featuresOf(1)!!.arrivalIndex)
    }

    @Test
    fun pointerCountAtDownIsFrozenAtTouchDown() {
        tracker.onSample(Traces.penStroke(pointerId = 0, pointerCount = 1).first())
        tracker.onSample(Traces.penStroke(pointerId = 0, pointerCount = 3)[1])
        assertEquals(1, tracker.featuresOf(0)!!.pointerCountAtDown)
    }

    @Test
    fun nearestOtherContactIsReportedForSimultaneousPointers() {
        tracker.onSample(Traces.penStroke(pointerId = 0, startX = 100f, startY = 100f).first())
        tracker.onSample(Traces.palmRest(pointerId = 1, startX = 100f, startY = 300f).first())
        assertEquals(200f, tracker.featuresOf(1)!!.nearestOtherContactPx, 2f)
    }

    @Test
    fun loneContactReportsNoNeighbour() {
        val features = feed(Traces.penStroke())
        assertEquals(Float.MAX_VALUE, features.nearestOtherContactPx, 0f)
    }

    @Test
    fun liftReturnsFinalFeaturesAndForgetsThePointer() {
        feed(Traces.penStroke(pointerId = 0))
        val finalFeatures = tracker.onLift(0)!!
        assertEquals(20, finalFeatures.sampleCount)
        assertNull(tracker.featuresOf(0))
        assertEquals(0, tracker.activeCount)
    }

    @Test
    fun resetClearsEverything() {
        feed(Traces.penStroke(pointerId = 0))
        feed(Traces.palmRest(pointerId = 1))
        tracker.reset()
        assertEquals(0, tracker.activeCount)
        assertNull(tracker.featuresOf(0))
    }
}
