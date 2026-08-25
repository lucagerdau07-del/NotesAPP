package com.notes.school.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PalmProfileTest {

    private fun profile() = PalmProfile.defaults(
        deviceFingerprint = "samsung/SM-T505/31",
        orientation = ScreenOrientation.LANDSCAPE,
        handedness = Handedness.RIGHT,
        availableFeatures = setOf(InputFeature.SIZE, InputFeature.PRESSURE, InputFeature.TOOL_TYPE)
    )

    @Test
    fun safeRangeClampsBothDirections() {
        val range = SafeRange(0.1f, 0.5f)
        assertEquals(0.1f, range.clamp(-3f), 0f)
        assertEquals(0.5f, range.clamp(9f), 0f)
        assertEquals(0.3f, range.clamp(0.3f), 0f)
    }

    @Test
    fun defaultProfileDefinesEverySafeRangeAndThreshold() {
        val p = profile()
        ThresholdKey.entries.forEach { key ->
            assertTrue("missing threshold $key", p.thresholds.values.containsKey(key))
            assertTrue("missing safe range $key", p.safeRanges.containsKey(key))
        }
    }

    @Test
    fun defaultProfileIsNotMarkedStableUntilCalibrated() {
        assertFalse(profile().stable)
        assertEquals(0f, profile().score, 0f)
    }

    @Test
    fun withThresholdsClampsValuesIntoTheirSafeRange() {
        val p = profile()
        val runaway = p.thresholds.with(ThresholdKey.MAX_PEN_SIZE, 999f)
        val clamped = p.withThresholds(runaway)
        val allowed = p.safeRanges.getValue(ThresholdKey.MAX_PEN_SIZE)
        assertEquals(allowed.max, clamped.thresholds[ThresholdKey.MAX_PEN_SIZE], 0.0001f)
    }

    @Test
    fun withThresholdsKeepsInRangeValuesUnchanged() {
        val p = profile()
        val allowed = p.safeRanges.getValue(ThresholdKey.DECISION_WINDOW_MS)
        val target = (allowed.min + allowed.max) / 2f
        val updated = p.withThresholds(p.thresholds.with(ThresholdKey.DECISION_WINDOW_MS, target))
        assertEquals(target, updated.thresholds[ThresholdKey.DECISION_WINDOW_MS], 0.0001f)
    }

    @Test
    fun thresholdsWithReturnsANewInstanceAndLeavesTheOriginalAlone() {
        val original = profile().thresholds
        val updated = original.with(ThresholdKey.PEN_BIAS, 0.4f)
        assertEquals(0.4f, updated[ThresholdKey.PEN_BIAS], 0f)
        assertEquals(0f, original[ThresholdKey.PEN_BIAS], 0f)
    }

    @Test
    fun penBiasSafeRangeIsSymmetricAndBounded() {
        val range = profile().safeRanges.getValue(ThresholdKey.PEN_BIAS)
        assertEquals(-1f, range.min, 0f)
        assertEquals(1f, range.max, 0f)
    }
}
