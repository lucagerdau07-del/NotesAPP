package com.notes.school.touch

import com.notes.school.core.PalmProfile
import com.notes.school.core.ThresholdKey
import kotlin.math.abs

data class TunerConfig(
    /** How far a threshold may move away from the stable baseline, as a fraction. */
    val maxDriftFraction: Float = 0.10f,
    val minObservations: Int = 12,
    val degradationsBeforeRollback: Int = 2
)

/**
 * Conservative, bounded, reversible profile improvement.
 *
 * Rules enforced here, each with a test in ProfileTunerTest:
 *  - only high-confidence locked contacts become observations;
 *  - nothing is applied mid-stroke — only [endSession] produces a candidate;
 *  - every threshold stays inside its calibrated safe range and within
 *    [TunerConfig.maxDriftFraction] of the stable baseline;
 *  - a candidate must score at least as well as the stable profile on the stored
 *    calibration samples, or it is discarded;
 *  - repeated degradation restores the last stable profile;
 *  - observations hold motion statistics only, never ink or document references.
 */
class ProfileTuner(
    stable: PalmProfile,
    private val validation: List<CalibrationSample>,
    private val config: TunerConfig = TunerConfig()
) {
    var stableProfile: PalmProfile = stable
        private set

    private var activeProfile: PalmProfile = stable
    private val penObservations = mutableListOf<ContactFeatures>()
    private val palmObservations = mutableListOf<ContactFeatures>()
    private var degradations = 0

    val pendingObservations: Int get() = penObservations.size + palmObservations.size

    fun observe(classification: Classification) {
        when (classification.state) {
            PointerState.PEN_LOCKED ->
                if (classification.penConfidence >= ContactClassifier.HIGH_CONFIDENCE) {
                    penObservations += classification.features
                }
            PointerState.PALM_LOCKED ->
                if (classification.penConfidence <= 1f - ContactClassifier.HIGH_CONFIDENCE) {
                    palmObservations += classification.features
                }
            else -> Unit // uncertain contacts never become training samples
        }
    }

    /** Produces a validated candidate profile, or null when there is nothing safe to apply. */
    fun endSession(nowMs: Long): PalmProfile? {
        if (pendingObservations < config.minObservations) {
            clearObservations()
            return null
        }

        var thresholds = stableProfile.thresholds
        if (penObservations.isNotEmpty()) {
            val observedPenSize = percentile(penObservations.map { it.meanSizeNorm }, 0.95f) * 1.1f
            thresholds = thresholds.with(
                ThresholdKey.MAX_PEN_SIZE,
                drift(stableProfile.thresholds[ThresholdKey.MAX_PEN_SIZE], observedPenSize)
            )
            val observedPenMajor = percentile(penObservations.map { it.meanTouchMajorPx }, 0.95f) * 1.1f
            thresholds = thresholds.with(
                ThresholdKey.MAX_PEN_TOUCH_MAJOR,
                drift(stableProfile.thresholds[ThresholdKey.MAX_PEN_TOUCH_MAJOR], observedPenMajor)
            )
        }
        if (palmObservations.isNotEmpty()) {
            val observedPalmSize = percentile(palmObservations.map { it.meanSizeNorm }, 0.05f) * 0.95f
            thresholds = thresholds.with(
                ThresholdKey.MIN_PALM_SIZE,
                drift(stableProfile.thresholds[ThresholdKey.MIN_PALM_SIZE], observedPalmSize)
            )
        }
        clearObservations()

        val candidate = stableProfile
            .withThresholds(thresholds)
            .copy(revision = stableProfile.revision + 1, createdAtMs = nowMs, stable = false)
        val candidateScore = scoreProfile(candidate, validation)
        if (candidateScore < stableProfile.score) return null

        activeProfile = candidate.copy(score = candidateScore)
        return activeProfile
    }

    /**
     * Called when the user recalibrates, undoes palm ink repeatedly, or the app detects the
     * active profile behaving worse than the stable one. Returns the restored profile once
     * the configured number of reports is reached, else null.
     */
    fun reportDegradation(): PalmProfile? {
        degradations++
        if (degradations < config.degradationsBeforeRollback) return null
        degradations = 0
        activeProfile = stableProfile
        return stableProfile
    }

    /** Promotes the current candidate once it has survived a full session. */
    fun promoteActiveToStable() {
        stableProfile = activeProfile.copy(stable = true)
    }

    private fun clearObservations() {
        penObservations.clear()
        palmObservations.clear()
    }

    private fun drift(baseline: Float, target: Float): Float {
        val allowed = abs(baseline) * config.maxDriftFraction
        return target.coerceIn(baseline - allowed, baseline + allowed)
    }

    private fun percentile(values: List<Float>, p: Float): Float {
        if (values.isEmpty()) return 0f
        val sorted = values.sorted()
        return sorted[((sorted.size - 1) * p).toInt().coerceIn(0, sorted.lastIndex)]
    }
}
