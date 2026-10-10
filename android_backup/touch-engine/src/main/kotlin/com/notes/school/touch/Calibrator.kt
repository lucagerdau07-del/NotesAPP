package com.notes.school.touch

import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.SafeRange
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey

enum class CalibrationPhase { PALM_ONLY, STYLUS_ONLY, COMBINED }

data class CalibrationSample(
    val phase: CalibrationPhase,
    val features: ContactFeatures,
    val expectedPen: Boolean
)

data class CalibrationResult(
    val profile: PalmProfile,
    val samples: List<CalibrationSample>
)

/**
 * Derives robust ranges and percentiles from a roughly 20 second guided session.
 * Deliberately not a learned model: percentiles are explainable, cheap, and their
 * failure mode is a threshold that is merely wrong rather than unpredictable.
 */
class Calibrator {

    private val samples = mutableListOf<CalibrationSample>()

    fun record(phase: CalibrationPhase, features: ContactFeatures, expectedPen: Boolean) {
        samples += CalibrationSample(phase, features, expectedPen)
    }

    fun sampleCount(phase: CalibrationPhase): Int = samples.count { it.phase == phase }

    fun isComplete(): Boolean = CalibrationPhase.entries.all { sampleCount(it) >= MIN_PER_PHASE }

    fun build(
        deviceFingerprint: String,
        orientation: ScreenOrientation,
        handedness: Handedness,
        availableFeatures: Set<InputFeature>,
        nowMs: Long
    ): CalibrationResult {
        val defaults = PalmProfile.defaults(
            deviceFingerprint, orientation, handedness, availableFeatures
        )
        if (!isComplete()) {
            return CalibrationResult(defaults.copy(createdAtMs = nowMs), samples.toList())
        }

        val penSizes = samples.filter { it.expectedPen }.map { it.features.meanSizeNorm }
        val palmSizes = samples.filterNot { it.expectedPen }.map { it.features.meanSizeNorm }
        val penMajors = samples.filter { it.expectedPen }.map { it.features.meanTouchMajorPx }
        val penSpeeds = samples.filter { it.expectedPen }.map { it.features.meanSpeedPxPerMs }

        val maxPenSize = percentile(penSizes, 0.95f) * 1.15f
        val minPalmSize = maxOf(percentile(palmSizes, 0.05f) * 0.9f, maxPenSize * 1.2f)
        val maxPenMajor = percentile(penMajors, 0.95f) * 1.2f
        val minPenSpeed = maxOf(percentile(penSpeeds, 0.10f) * 0.5f, 0.005f)

        val thresholds = defaults.thresholds
            .with(ThresholdKey.MAX_PEN_SIZE, maxPenSize)
            .with(ThresholdKey.MIN_PALM_SIZE, minPalmSize)
            .with(ThresholdKey.MAX_PEN_TOUCH_MAJOR, maxPenMajor)
            .with(ThresholdKey.MIN_PEN_SPEED, minPenSpeed)

        // Safe ranges are anchored to what this device actually produced, so neither the
        // user nor automatic tuning can drift into a configuration never observed here.
        val safeRanges = defaults.safeRanges.toMutableMap().apply {
            this[ThresholdKey.MAX_PEN_SIZE] = boundedRange(maxPenSize, 0.5f, defaults.safeRanges.getValue(ThresholdKey.MAX_PEN_SIZE))
            this[ThresholdKey.MIN_PALM_SIZE] = boundedRange(minPalmSize, 0.5f, defaults.safeRanges.getValue(ThresholdKey.MIN_PALM_SIZE))
            this[ThresholdKey.MAX_PEN_TOUCH_MAJOR] = boundedRange(maxPenMajor, 0.5f, defaults.safeRanges.getValue(ThresholdKey.MAX_PEN_TOUCH_MAJOR))
            this[ThresholdKey.MIN_PEN_SPEED] = boundedRange(minPenSpeed, 0.8f, defaults.safeRanges.getValue(ThresholdKey.MIN_PEN_SPEED))
        }

        val candidate = defaults.copy(
            revision = 1,
            thresholds = thresholds,
            safeRanges = safeRanges,
            createdAtMs = nowMs
        ).let { it.withThresholds(it.thresholds) }

        val scored = candidate.copy(
            score = scoreProfile(candidate, samples),
            stable = true
        )
        return CalibrationResult(scored, samples.toList())
    }

    private fun boundedRange(center: Float, spreadFraction: Float, hardLimit: SafeRange): SafeRange =
        SafeRange(
            min = maxOf(center * (1f - spreadFraction), hardLimit.min),
            max = minOf(center * (1f + spreadFraction), hardLimit.max)
        )

    private fun percentile(values: List<Float>, p: Float): Float {
        if (values.isEmpty()) return 0f
        val sorted = values.sorted()
        val index = ((sorted.size - 1) * p).toInt().coerceIn(0, sorted.lastIndex)
        return sorted[index]
    }

    companion object {
        private const val MIN_PER_PHASE = 4
    }
}

/** Fraction of stored calibration samples the profile classifies the way the user labelled them. */
fun scoreProfile(profile: PalmProfile, samples: List<CalibrationSample>): Float {
    if (samples.isEmpty()) return 0f
    val classifier = ContactClassifier(profile)
    val correct = samples.count { sample ->
        val confidence = classifier.penConfidence(sample.features)
        (confidence >= 0.5f) == sample.expectedPen
    }
    return correct.toFloat() / samples.size
}
