package com.notes.school.touch

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Accumulates per-pointer motion statistics with O(1) memory per contact. The input
 * callback runs on the UI thread, so nothing here allocates in proportion to the number
 * of samples: each pointer owns one mutable accumulator that is updated in place.
 *
 * Not thread safe. Owned by the view that receives MotionEvents.
 */
class ContactTracker {

    private class Accumulator(
        val pointerId: Int,
        val firstTimeMs: Long,
        val firstX: Float,
        val firstY: Float,
        val pointerCountAtDown: Int,
        val arrivalIndex: Int,
        val toolType: Int
    ) {
        var lastX: Float = firstX
        var lastY: Float = firstY
        var lastTimeMs: Long = firstTimeMs
        var lastDx: Float = 0f
        var lastDy: Float = 0f
        var sampleCount: Int = 0
        var pathLength: Float = 0f
        var peakSpeed: Float = 0f
        var sizeSum: Float = 0f
        var maxSize: Float = 0f
        var pressureSum: Float = 0f
        var touchMajorSum: Float = 0f
        var axisRatioLast: Float = 1f
        var directionChanges: Int = 0
        var nearestOther: Float = Float.MAX_VALUE
    }

    private val live = LinkedHashMap<Int, Accumulator>()
    private var arrivalCounter = 0

    val activeCount: Int get() = live.size

    fun onSample(sample: ContactSample): ContactFeatures {
        val acc = live.getOrPut(sample.pointerId) {
            Accumulator(
                pointerId = sample.pointerId,
                firstTimeMs = sample.eventTimeMs,
                firstX = sample.x,
                firstY = sample.y,
                pointerCountAtDown = sample.pointerCount,
                arrivalIndex = arrivalCounter++,
                toolType = sample.toolType
            )
        }
        update(acc, sample)
        updateNeighbourDistances(sample)
        return snapshot(acc)
    }

    fun onLift(pointerId: Int): ContactFeatures? {
        val acc = live.remove(pointerId) ?: return null
        if (live.isEmpty()) arrivalCounter = 0
        return snapshot(acc)
    }

    fun featuresOf(pointerId: Int): ContactFeatures? = live[pointerId]?.let { snapshot(it) }

    fun reset() {
        live.clear()
        arrivalCounter = 0
    }

    private fun update(acc: Accumulator, sample: ContactSample) {
        if (acc.sampleCount > 0) {
            val dx = sample.x - acc.lastX
            val dy = sample.y - acc.lastY
            val step = sqrt(dx * dx + dy * dy)
            acc.pathLength += step
            val dt = (sample.eventTimeMs - acc.lastTimeMs).coerceAtLeast(1L)
            val speed = step / dt
            if (speed > acc.peakSpeed) acc.peakSpeed = speed
            // A reversal on either axis counts once; handwriting reverses constantly,
            // a sliding palm barely does.
            if (acc.lastDx * dx < 0f || acc.lastDy * dy < 0f) acc.directionChanges++
            acc.lastDx = dx
            acc.lastDy = dy
        }
        acc.lastX = sample.x
        acc.lastY = sample.y
        acc.lastTimeMs = sample.eventTimeMs
        acc.sampleCount++
        acc.sizeSum += sample.size
        if (sample.size > acc.maxSize) acc.maxSize = sample.size
        acc.pressureSum += sample.pressure
        acc.touchMajorSum += sample.touchMajor
        acc.axisRatioLast = if (sample.touchMinor > 0.0001f) {
            sample.touchMajor / sample.touchMinor
        } else {
            1f
        }
    }

    private fun updateNeighbourDistances(sample: ContactSample) {
        val self = live[sample.pointerId] ?: return
        for (other in live.values) {
            if (other.pointerId == self.pointerId) continue
            val dx = other.lastX - self.lastX
            val dy = other.lastY - self.lastY
            val distance = sqrt(dx * dx + dy * dy)
            if (distance < self.nearestOther) self.nearestOther = distance
            if (distance < other.nearestOther) other.nearestOther = distance
        }
    }

    private fun snapshot(acc: Accumulator): ContactFeatures {
        val duration = acc.lastTimeMs - acc.firstTimeMs
        val samples = acc.sampleCount.coerceAtLeast(1)
        val dx = acc.lastX - acc.firstX
        val dy = acc.lastY - acc.firstY
        return ContactFeatures(
            pointerId = acc.pointerId,
            sampleCount = acc.sampleCount,
            durationMs = duration,
            pathLengthPx = acc.pathLength,
            displacementPx = sqrt(dx * dx + dy * dy),
            meanSpeedPxPerMs = if (duration > 0) acc.pathLength / duration else 0f,
            peakSpeedPxPerMs = acc.peakSpeed,
            meanSizeNorm = acc.sizeSum / samples,
            maxSizeNorm = acc.maxSize,
            meanPressure = acc.pressureSum / samples,
            meanTouchMajorPx = acc.touchMajorSum / samples,
            axisRatio = if (acc.axisRatioLast.isFinite()) abs(acc.axisRatioLast) else 1f,
            directionChanges = acc.directionChanges,
            pointerCountAtDown = acc.pointerCountAtDown,
            toolType = acc.toolType,
            arrivalIndex = acc.arrivalIndex,
            nearestOtherContactPx = acc.nearestOther
        )
    }
}
