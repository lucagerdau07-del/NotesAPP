package com.notes.school.core

import kotlinx.serialization.Serializable

enum class ThresholdKey {
    /** Normalized contact size at or below which a contact may still be the stylus. */
    MAX_PEN_SIZE,
    /** Touch major axis in px at or below which a contact may still be the stylus. */
    MAX_PEN_TOUCH_MAJOR,
    /** Normalized contact size at or above which a contact is treated as palm geometry. */
    MIN_PALM_SIZE,
    /** px per ms a contact must reach before it can lock as pen. */
    MIN_PEN_SPEED,
    /** How long ambiguous ink stays provisional before a decision is forced. */
    DECISION_WINDOW_MS,
    /** Manual bias, -1 = reject aggressively, +1 = accept aggressively. */
    PEN_BIAS,
    /** How much extra evidence a suspiciously small contact must supply. */
    SMALL_CONTACT_WEIGHT
}

@Serializable
data class SafeRange(val min: Float, val max: Float) {
    fun clamp(value: Float): Float = value.coerceIn(min, max)
}

@Serializable
data class Thresholds(val values: Map<ThresholdKey, Float>) {
    operator fun get(key: ThresholdKey): Float =
        values[key] ?: error("threshold $key missing from profile")

    fun with(key: ThresholdKey, value: Float): Thresholds =
        Thresholds(values + (key to value))
}

enum class ScreenOrientation { LANDSCAPE, PORTRAIT }

enum class Handedness { RIGHT, LEFT }

/** Which numeric signals this device actually reports. Missing ones are never used. */
enum class InputFeature { TOOL_TYPE, PRESSURE, SIZE, TOUCH_MAJOR, TOUCH_MINOR, ORIENTATION }

/**
 * A versioned, bounded, reversible palm-rejection profile.
 *
 * [safeRanges] is the hard boundary derived from calibration: neither manual settings nor
 * automatic tuning may move a threshold outside it. [withThresholds] is the only way to
 * change thresholds, and it always clamps.
 */
@Serializable
data class PalmProfile(
    val schemaVersion: Int,
    val revision: Int,
    val deviceFingerprint: String,
    val orientation: ScreenOrientation,
    val handedness: Handedness,
    val availableFeatures: Set<InputFeature>,
    val thresholds: Thresholds,
    val safeRanges: Map<ThresholdKey, SafeRange>,
    /** 0f..1f agreement with the stored calibration samples. */
    val score: Float,
    /** True once this revision has passed validation and may be rolled back to. */
    val stable: Boolean,
    val createdAtMs: Long
) {
    fun withThresholds(candidate: Thresholds): PalmProfile {
        val clamped = candidate.values.mapValues { (key, value) ->
            safeRanges[key]?.clamp(value) ?: value
        }
        return copy(thresholds = Thresholds(clamped))
    }

    companion object {
        const val SCHEMA_VERSION: Int = 1

        /**
         * Conservative starting point used before calibration and as the reset target.
         * Values are deliberately cautious: a wrong reject is recoverable by rewriting,
         * a wrong accept leaves a palm smear the user must erase.
         */
        fun defaults(
            deviceFingerprint: String,
            orientation: ScreenOrientation,
            handedness: Handedness,
            availableFeatures: Set<InputFeature>
        ): PalmProfile = PalmProfile(
            schemaVersion = SCHEMA_VERSION,
            revision = 0,
            deviceFingerprint = deviceFingerprint,
            orientation = orientation,
            handedness = handedness,
            availableFeatures = availableFeatures,
            thresholds = Thresholds(
                mapOf(
                    ThresholdKey.MAX_PEN_SIZE to 0.14f,
                    ThresholdKey.MAX_PEN_TOUCH_MAJOR to 26f,
                    ThresholdKey.MIN_PALM_SIZE to 0.28f,
                    ThresholdKey.MIN_PEN_SPEED to 0.03f,
                    ThresholdKey.DECISION_WINDOW_MS to 90f,
                    ThresholdKey.PEN_BIAS to 0f,
                    ThresholdKey.SMALL_CONTACT_WEIGHT to 0.5f
                )
            ),
            safeRanges = mapOf(
                ThresholdKey.MAX_PEN_SIZE to SafeRange(0.02f, 0.40f),
                ThresholdKey.MAX_PEN_TOUCH_MAJOR to SafeRange(6f, 70f),
                ThresholdKey.MIN_PALM_SIZE to SafeRange(0.10f, 0.90f),
                ThresholdKey.MIN_PEN_SPEED to SafeRange(0f, 0.5f),
                ThresholdKey.DECISION_WINDOW_MS to SafeRange(30f, 180f),
                ThresholdKey.PEN_BIAS to SafeRange(-1f, 1f),
                ThresholdKey.SMALL_CONTACT_WEIGHT to SafeRange(0f, 1f)
            ),
            score = 0f,
            stable = false,
            createdAtMs = 0L
        )
    }
}
