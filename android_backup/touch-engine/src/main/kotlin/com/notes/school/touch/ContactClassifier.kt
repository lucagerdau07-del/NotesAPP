package com.notes.school.touch

import com.notes.school.core.PalmProfile
import com.notes.school.core.ThresholdKey

enum class PointerState { UNKNOWN, PEN_CANDIDATE, PALM_CANDIDATE, PEN_LOCKED, PALM_LOCKED }

data class Classification(
    val pointerId: Int,
    val state: PointerState,
    /** 0f = certainly palm, 1f = certainly pen. */
    val penConfidence: Float,
    val features: ContactFeatures
)

/**
 * Explicit per-pointer state machine.
 *
 * Two properties matter more than raw accuracy:
 *  - once a pointer reaches PEN_LOCKED it stays there for the rest of the stroke, so a
 *    palm landing mid-word can never interrupt writing;
 *  - a pointer needs consecutive agreeing samples to lock, so it cannot oscillate.
 *
 * Contacts that are still ambiguous stay in a candidate state. The view renders them as
 * provisional ink and calls [forceDecision] when the decision window expires.
 */
class ContactClassifier(
    profile: PalmProfile,
    private val tracker: ContactTracker = ContactTracker()
) {
    var profile: PalmProfile = profile
        private set

    private class PointerRecord(var state: PointerState = PointerState.UNKNOWN) {
        var penVotes: Int = 0
        var palmVotes: Int = 0
        var lastConfidence: Float = 0.5f
    }

    private val records = HashMap<Int, PointerRecord>()

    var lockedPenPointerId: Int? = null
        private set

    fun updateProfile(profile: PalmProfile) {
        this.profile = profile
    }

    fun onSample(sample: ContactSample): Classification {
        val features = tracker.onSample(sample)
        val record = records.getOrPut(sample.pointerId) { PointerRecord() }

        if (record.state == PointerState.PEN_LOCKED || record.state == PointerState.PALM_LOCKED) {
            return Classification(sample.pointerId, record.state, record.lastConfidence, features)
        }

        // A pen is already writing: everything else is a palm, immediately and without appeal.
        val lockedPen = lockedPenPointerId
        if (lockedPen != null && lockedPen != sample.pointerId) {
            record.state = PointerState.PALM_LOCKED
            record.lastConfidence = 0f
            return Classification(sample.pointerId, record.state, 0f, features)
        }

        val confidence = penConfidence(features)
        record.lastConfidence = confidence

        val margin = 0.5f + MARGIN_HALF_WIDTH
        val lowerMargin = 0.5f - MARGIN_HALF_WIDTH
        when {
            confidence >= margin -> {
                record.penVotes++
                record.palmVotes = 0
                record.state = PointerState.PEN_CANDIDATE
            }
            confidence <= lowerMargin -> {
                record.palmVotes++
                record.penVotes = 0
                record.state = PointerState.PALM_CANDIDATE
            }
            else -> record.state = PointerState.UNKNOWN
        }

        if (record.penVotes >= VOTES_TO_LOCK) {
            record.state = PointerState.PEN_LOCKED
            lockedPenPointerId = sample.pointerId
        } else if (record.palmVotes >= VOTES_TO_LOCK) {
            record.state = PointerState.PALM_LOCKED
        }

        return Classification(sample.pointerId, record.state, confidence, features)
    }

    /** Resolves a still-ambiguous pointer once its decision window has elapsed. */
    fun forceDecision(pointerId: Int): Classification? {
        val record = records[pointerId] ?: return null
        val features = tracker.featuresOf(pointerId) ?: return null
        if (record.state == PointerState.PEN_LOCKED || record.state == PointerState.PALM_LOCKED) {
            return Classification(pointerId, record.state, record.lastConfidence, features)
        }
        val confidence = penConfidence(features)
        val bias = profile.thresholds[ThresholdKey.PEN_BIAS]
        // Bias shifts only the tie-break, never the evidence itself.
        val decided = confidence + bias * MARGIN_HALF_WIDTH * 2f
        record.state = if (decided >= 0.5f) PointerState.PEN_LOCKED else PointerState.PALM_LOCKED
        record.lastConfidence = confidence
        if (record.state == PointerState.PEN_LOCKED) lockedPenPointerId = pointerId
        return Classification(pointerId, record.state, confidence, features)
    }

    fun onLift(pointerId: Int): Classification? {
        val record = records.remove(pointerId)
        val features = tracker.onLift(pointerId)
        if (lockedPenPointerId == pointerId) lockedPenPointerId = null
        if (record == null || features == null) return null
        return Classification(pointerId, record.state, record.lastConfidence, features)
    }

    fun reset() {
        records.clear()
        tracker.reset()
        lockedPenPointerId = null
    }

    /**
     * Weighted evidence, 0f = palm, 1f = pen. Every term is a bounded 0..1 vote, so a
     * single missing device signal degrades the result instead of destroying it.
     */
    fun penConfidence(features: ContactFeatures): Float {
        val t = profile.thresholds
        val sizeVote = ramp(features.meanSizeNorm, t[ThresholdKey.MAX_PEN_SIZE], t[ThresholdKey.MIN_PALM_SIZE])
        val majorVote = ramp(features.meanTouchMajorPx, t[ThresholdKey.MAX_PEN_TOUCH_MAJOR], t[ThresholdKey.MAX_PEN_TOUCH_MAJOR] * 2.5f)
        val speedVote = (features.meanSpeedPxPerMs / (t[ThresholdKey.MIN_PEN_SPEED] * 4f))
            .coerceIn(0f, 1f)
        val shapeVote = ramp(features.axisRatio, 1.2f, 2.0f)
        val soloVote = if (features.pointerCountAtDown <= 1) 1f else 0.25f
        val toolVote = when (features.toolType) {
            ToolTypes.STYLUS -> 1f
            ToolTypes.ERASER -> 0f
            else -> 0.5f // FINGER tells us nothing on this hardware
        }

        var score =
            W_SIZE * sizeVote +
                W_MAJOR * majorVote +
                W_SPEED * speedVote +
                W_SHAPE * shapeVote +
                W_SOLO * soloVote +
                W_TOOL * toolVote

        // A small but nearly stationary contact is the classic palm-first failure. Make it
        // pay for the ambiguity in proportion to the configured weighting.
        if (features.meanSizeNorm <= t[ThresholdKey.MAX_PEN_SIZE] * 2f && speedVote < 0.3f) {
            score -= t[ThresholdKey.SMALL_CONTACT_WEIGHT] * SMALL_CONTACT_PENALTY
        }
        return score.coerceIn(0f, 1f)
    }

    /** 1f at or below [good], 0f at or above [bad], linear in between. */
    private fun ramp(value: Float, good: Float, bad: Float): Float {
        if (bad <= good) return if (value <= good) 1f else 0f
        return ((bad - value) / (bad - good)).coerceIn(0f, 1f)
    }

    companion object {
        /** Confidence a decision must reach before Task 10 may learn anything from it. */
        const val HIGH_CONFIDENCE: Float = 0.85f

        private const val VOTES_TO_LOCK = 3
        private const val MARGIN_HALF_WIDTH = 0.18f
        private const val SMALL_CONTACT_PENALTY = 0.35f

        private const val W_SIZE = 0.38f
        private const val W_MAJOR = 0.24f
        private const val W_SPEED = 0.20f
        private const val W_SHAPE = 0.10f
        private const val W_SOLO = 0.04f
        private const val W_TOOL = 0.04f
    }
}
