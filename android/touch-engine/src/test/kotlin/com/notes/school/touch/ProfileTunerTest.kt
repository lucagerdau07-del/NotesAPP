package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.math.abs

class ProfileTunerTest {

    private lateinit var calibrated: CalibrationResult
    private lateinit var tuner: ProfileTuner

    private fun featuresOf(samples: List<ContactSample>): ContactFeatures {
        val tracker = ContactTracker()
        return samples.map { tracker.onSample(it) }.last()
    }

    @Before
    fun setUp() {
        val calibrator = Calibrator()
        repeat(6) {
            calibrator.record(CalibrationPhase.PALM_ONLY, featuresOf(Traces.palmRest(pointerId = it)), false)
            calibrator.record(CalibrationPhase.STYLUS_ONLY, featuresOf(Traces.penStroke(pointerId = it)), true)
            calibrator.record(CalibrationPhase.COMBINED, featuresOf(Traces.penStroke(pointerId = it, pointerCount = 2)), true)
        }
        calibrated = calibrator.build(
            "samsung/SM-T505/31",
            ScreenOrientation.LANDSCAPE,
            Handedness.RIGHT,
            setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR),
            nowMs = 1_700_000_000_000L
        )
        tuner = ProfileTuner(calibrated.profile, calibrated.samples)
    }

    private fun highConfidence(pen: Boolean, pointerId: Int = 0): Classification {
        val samples = if (pen) Traces.penStroke(pointerId) else Traces.palmRest(pointerId)
        return Classification(
            pointerId = pointerId,
            state = if (pen) PointerState.PEN_LOCKED else PointerState.PALM_LOCKED,
            penConfidence = if (pen) 0.97f else 0.02f,
            features = featuresOf(samples)
        )
    }

    private fun uncertain(pointerId: Int = 5): Classification = Classification(
        pointerId = pointerId,
        state = PointerState.UNKNOWN,
        penConfidence = 0.52f,
        features = featuresOf(Traces.smallPalmTap(pointerId))
    )

    @Test
    fun uncertainContactsAreNeverRecordedAsObservations() {
        repeat(30) { tuner.observe(uncertain()) }
        assertEquals(0, tuner.pendingObservations)
        assertNull(tuner.endSession(nowMs = 1L))
    }

    @Test
    fun lockedButLowConfidenceContactsAreAlsoIgnored() {
        val borderline = highConfidence(pen = true).copy(penConfidence = 0.6f)
        repeat(30) { tuner.observe(borderline) }
        assertEquals(0, tuner.pendingObservations)
    }

    @Test
    fun tooFewObservationsProduceNoCandidate() {
        repeat(3) { tuner.observe(highConfidence(pen = true)) }
        assertNull(tuner.endSession(nowMs = 1L))
    }

    @Test
    fun enoughHighConfidenceObservationsProduceACandidateWithABumpedRevision() {
        repeat(10) { tuner.observe(highConfidence(pen = true)) }
        repeat(10) { tuner.observe(highConfidence(pen = false, pointerId = 1)) }
        val candidate = tuner.endSession(nowMs = 1_700_000_100_000L)!!
        assertEquals(calibrated.profile.revision + 1, candidate.revision)
    }

    @Test
    fun candidateThresholdsNeverDriftFurtherThanTheConfiguredFraction() {
        repeat(40) { tuner.observe(highConfidence(pen = true)) }
        val candidate = tuner.endSession(nowMs = 1L)!!
        ThresholdKey.entries.forEach { key ->
            val before = calibrated.profile.thresholds[key]
            val after = candidate.thresholds[key]
            val allowed = abs(before) * 0.10f + 1e-4f
            assertTrue(
                "$key drifted from $before to $after",
                abs(after - before) <= allowed + 1e-3f
            )
        }
    }

    @Test
    fun candidateThresholdsAlwaysStayInsideTheCalibratedSafeRanges() {
        repeat(60) { tuner.observe(highConfidence(pen = true)) }
        val candidate = tuner.endSession(nowMs = 1L)!!
        candidate.thresholds.values.forEach { (key, value) ->
            val range = candidate.safeRanges.getValue(key)
            assertTrue("$key = $value escaped $range", value >= range.min && value <= range.max)
        }
    }

    @Test
    fun aCandidateThatScoresWorseOnStoredSamplesIsRejected() {
        val poisoned = ProfileTuner(
            calibrated.profile,
            calibrated.samples,
            TunerConfig(maxDriftFraction = 0.10f, minObservations = 4)
        )
        // Feed only palm observations so the candidate drifts toward rejecting everything.
        repeat(40) { poisoned.observe(highConfidence(pen = false, pointerId = 1)) }
        val candidate = poisoned.endSession(nowMs = 1L)
        if (candidate != null) {
            assertTrue(
                "an accepted candidate must not score below the stable profile",
                candidate.score >= calibrated.profile.score - 1e-4f
            )
        }
    }

    @Test
    fun theStableProfileRemainsAvailableAfterACandidateIsProduced() {
        repeat(30) { tuner.observe(highConfidence(pen = true)) }
        tuner.endSession(nowMs = 1L)
        assertEquals(calibrated.profile.revision, tuner.stableProfile.revision)
    }

    @Test
    fun repeatedDegradationRestoresTheLastStableProfile() {
        repeat(30) { tuner.observe(highConfidence(pen = true)) }
        assertNotNull(tuner.endSession(nowMs = 1L))
        assertNull(tuner.reportDegradation())
        val restored = tuner.reportDegradation()!!
        assertEquals(calibrated.profile.revision, restored.revision)
        assertEquals(calibrated.profile.thresholds, restored.thresholds)
    }

    @Test
    fun observationsAreClearedBetweenSessions() {
        repeat(30) { tuner.observe(highConfidence(pen = true)) }
        tuner.endSession(nowMs = 1L)
        assertEquals(0, tuner.pendingObservations)
        assertNull(tuner.endSession(nowMs = 2L))
    }

    @Test
    fun observationsCarryNoInkOrDocumentReference() {
        tuner.observe(highConfidence(pen = true))
        // ContactFeatures is the only thing stored; it exposes motion statistics only.
        val fields = ContactFeatures::class.java.declaredFields.map { it.name }
        listOf("points", "strokeId", "documentId", "pageId", "bitmap").forEach {
            assertTrue("features must not expose $it", !fields.contains(it))
        }
    }
}
