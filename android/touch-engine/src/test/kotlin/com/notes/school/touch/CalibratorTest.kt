package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CalibratorTest {

    private lateinit var calibrator: Calibrator
    private val features = setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR, InputFeature.PRESSURE)

    @Before
    fun setUp() {
        calibrator = Calibrator()
    }

    private fun featuresOf(samples: List<ContactSample>): ContactFeatures {
        val tracker = ContactTracker()
        return samples.map { tracker.onSample(it) }.last()
    }

    private fun runGuidedCalibration() {
        repeat(6) {
            calibrator.record(
                CalibrationPhase.PALM_ONLY,
                featuresOf(Traces.palmRest(pointerId = it)),
                expectedPen = false
            )
        }
        repeat(6) {
            calibrator.record(
                CalibrationPhase.STYLUS_ONLY,
                featuresOf(Traces.penStroke(pointerId = it)),
                expectedPen = true
            )
        }
        repeat(3) {
            calibrator.record(
                CalibrationPhase.COMBINED,
                featuresOf(Traces.penStroke(pointerId = it, pointerCount = 2)),
                expectedPen = true
            )
            calibrator.record(
                CalibrationPhase.COMBINED,
                featuresOf(Traces.palmRest(pointerId = it + 10, pointerCount = 2)),
                expectedPen = false
            )
        }
    }

    private fun build() = calibrator.build(
        deviceFingerprint = "samsung/SM-T505/31",
        orientation = ScreenOrientation.LANDSCAPE,
        handedness = Handedness.RIGHT,
        availableFeatures = features,
        nowMs = 1_700_000_000_000L
    )

    @Test
    fun calibrationIsIncompleteUntilEveryPhaseHasSamples() {
        assertFalse(calibrator.isComplete())
        calibrator.record(CalibrationPhase.PALM_ONLY, featuresOf(Traces.palmRest()), false)
        assertFalse(calibrator.isComplete())
    }

    @Test
    fun completeCalibrationReportsPerPhaseCounts() {
        runGuidedCalibration()
        assertTrue(calibrator.isComplete())
        assertEquals(6, calibrator.sampleCount(CalibrationPhase.PALM_ONLY))
        assertEquals(6, calibrator.sampleCount(CalibrationPhase.STYLUS_ONLY))
        assertEquals(6, calibrator.sampleCount(CalibrationPhase.COMBINED))
    }

    @Test
    fun builtProfileSeparatesTheObservedStylusAndPalmSizes() {
        runGuidedCalibration()
        val t = build().profile.thresholds
        assertTrue(t[ThresholdKey.MAX_PEN_SIZE] > 0.06f)
        assertTrue(t[ThresholdKey.MAX_PEN_SIZE] < t[ThresholdKey.MIN_PALM_SIZE])
        assertTrue(t[ThresholdKey.MIN_PALM_SIZE] <= 0.55f)
    }

    @Test
    fun builtProfileIsStableAndCarriesItsScoreAndDevice() {
        runGuidedCalibration()
        val profile = build().profile
        assertTrue(profile.stable)
        assertTrue("score was ${profile.score}", profile.score >= 0.9f)
        assertEquals("samsung/SM-T505/31", profile.deviceFingerprint)
        assertEquals(ScreenOrientation.LANDSCAPE, profile.orientation)
        assertEquals(1, profile.revision)
    }

    @Test
    fun safeRangesAreDerivedFromTheObservedDataNotHardcoded() {
        runGuidedCalibration()
        val profile = build().profile
        val range = profile.safeRanges.getValue(ThresholdKey.MAX_PEN_SIZE)
        val value = profile.thresholds[ThresholdKey.MAX_PEN_SIZE]
        assertTrue(range.min <= value && value <= range.max)
        assertTrue("range must be bounded", range.max - range.min < 0.4f)
    }

    @Test
    fun buildReturnsTheStoredSamplesForLaterValidation() {
        runGuidedCalibration()
        assertEquals(18, build().samples.size)
    }

    @Test
    fun incompleteCalibrationFallsBackToConservativeDefaults() {
        calibrator.record(CalibrationPhase.PALM_ONLY, featuresOf(Traces.palmRest()), false)
        val profile = build().profile
        assertFalse(profile.stable)
        assertEquals(0.14f, profile.thresholds[ThresholdKey.MAX_PEN_SIZE], 0.0001f)
    }

    @Test
    fun scoreProfileMeasuresAgreementWithStoredSamples() {
        runGuidedCalibration()
        val result = build()
        assertEquals(result.profile.score, scoreProfile(result.profile, result.samples), 0.0001f)
    }
}
