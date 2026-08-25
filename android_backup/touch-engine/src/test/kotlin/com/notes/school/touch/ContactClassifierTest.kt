package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ContactClassifierTest {

    private lateinit var classifier: ContactClassifier

    private fun defaultProfile() = PalmProfile.defaults(
        deviceFingerprint = "samsung/SM-T505/31",
        orientation = ScreenOrientation.LANDSCAPE,
        handedness = Handedness.RIGHT,
        availableFeatures = setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR, InputFeature.PRESSURE)
    )

    @Before
    fun setUp() {
        classifier = ContactClassifier(defaultProfile())
    }

    private fun feed(samples: List<ContactSample>): Classification =
        samples.map { classifier.onSample(it) }.last()

    @Test
    fun aClearPenTraceLocksAsPen() {
        val result = feed(Traces.penStroke())
        assertEquals(PointerState.PEN_LOCKED, result.state)
        assertTrue(result.penConfidence >= ContactClassifier.HIGH_CONFIDENCE)
    }

    @Test
    fun aClearPalmRestLocksAsPalm() {
        val result = feed(Traces.palmRest())
        assertEquals(PointerState.PALM_LOCKED, result.state)
        assertTrue(result.penConfidence < 0.2f)
    }

    @Test
    fun theFirstSampleIsNeverImmediatelyLocked() {
        val first = classifier.onSample(Traces.penStroke().first())
        assertNotEquals(PointerState.PEN_LOCKED, first.state)
    }

    @Test
    fun palmArrivingAfterALockedPenIsRejectedWithoutInterruptingIt() {
        feed(Traces.penStroke(pointerId = 0))
        assertEquals(0, classifier.lockedPenPointerId)
        val palm = classifier.onSample(Traces.palmRest(pointerId = 1, startMs = 1_200L).first())
        assertEquals(PointerState.PALM_LOCKED, palm.state)
        assertEquals(0, classifier.lockedPenPointerId)
    }

    @Test
    fun aLockedPenStaysLockedEvenIfItSlowsToAStop() {
        feed(Traces.penStroke(pointerId = 0))
        val stalled = Traces.palmRest(pointerId = 0, startMs = 2_000L, samples = 10)
        val result = feed(stalled)
        assertEquals(PointerState.PEN_LOCKED, result.state)
    }

    @Test
    fun ambiguousContactStaysUndecidedInsideTheDecisionWindow() {
        val result = feed(Traces.smallPalmTap(samples = 3))
        assertTrue(
            "expected an undecided state, got ${result.state}",
            result.state == PointerState.UNKNOWN ||
                result.state == PointerState.PEN_CANDIDATE ||
                result.state == PointerState.PALM_CANDIDATE
        )
    }

    @Test
    fun forceDecisionResolvesAnAmbiguousContactAfterTheWindow() {
        feed(Traces.smallPalmTap(samples = 3))
        val decided = classifier.forceDecision(2)!!
        assertTrue(
            decided.state == PointerState.PEN_LOCKED || decided.state == PointerState.PALM_LOCKED
        )
    }

    @Test
    fun negativePenBiasResolvesAmbiguityTowardPalm() {
        val cautious = defaultProfile().let {
            it.withThresholds(it.thresholds.with(ThresholdKey.PEN_BIAS, -1f))
        }
        classifier.updateProfile(cautious)
        feed(Traces.smallPalmTap(samples = 3))
        assertEquals(PointerState.PALM_LOCKED, classifier.forceDecision(2)!!.state)
    }

    @Test
    fun positivePenBiasResolvesAmbiguityTowardPen() {
        val eager = defaultProfile().let {
            it.withThresholds(it.thresholds.with(ThresholdKey.PEN_BIAS, 1f))
        }
        classifier.updateProfile(eager)
        feed(Traces.smallPalmTap(samples = 3))
        assertEquals(PointerState.PEN_LOCKED, classifier.forceDecision(2)!!.state)
    }

    @Test
    fun aPointerNeverFlipsFromPenLockedToPalmLocked() {
        val states = mutableListOf<PointerState>()
        Traces.penStroke(pointerId = 0).forEach { states += classifier.onSample(it).state }
        Traces.palmRest(pointerId = 0, startMs = 3_000L).forEach {
            states += classifier.onSample(it).state
        }
        assertTrue(states.contains(PointerState.PEN_LOCKED))
        assertTrue(states.none { it == PointerState.PALM_LOCKED })
    }

    @Test
    fun manyStationaryContactsAtOnceAreAllTreatedAsPalm() {
        val a = classifier.onSample(Traces.palmRest(pointerId = 1, pointerCount = 3).first())
        val b = classifier.onSample(Traces.palmRest(pointerId = 2, pointerCount = 3).first())
        assertTrue(a.penConfidence < 0.5f)
        assertTrue(b.penConfidence < 0.5f)
    }

    @Test
    fun liftClearsThePenLockSoTheNextStrokeStartsFresh() {
        feed(Traces.penStroke(pointerId = 0))
        classifier.onLift(0)
        assertNull(classifier.lockedPenPointerId)
    }

    @Test
    fun resetClearsAllPointerState() {
        feed(Traces.penStroke(pointerId = 0))
        classifier.reset()
        assertNull(classifier.lockedPenPointerId)
        assertNull(classifier.forceDecision(0))
    }

    @Test
    fun aWiderMaxPenSizeAcceptsALargerContactAsPen() {
        val generous = defaultProfile().let {
            it.withThresholds(it.thresholds.with(ThresholdKey.MAX_PEN_SIZE, 0.40f))
        }
        classifier.updateProfile(generous)
        val result = feed(Traces.penStroke(size = 0.22f))
        assertEquals(PointerState.PEN_LOCKED, result.state)
    }
}
