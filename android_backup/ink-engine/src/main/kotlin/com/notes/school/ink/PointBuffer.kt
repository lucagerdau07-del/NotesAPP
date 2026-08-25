package com.notes.school.ink

import com.notes.school.core.Bounds
import com.notes.school.core.StrokePoint

/**
 * Growable primitive buffer for one in-progress stroke. Coordinates live in a flat
 * FloatArray so the input callback allocates nothing per sample; the array is only
 * ever reallocated when a stroke outgrows it, and is reused across strokes.
 */
class PointBuffer(initialCapacity: Int = 512) {

    var xy: FloatArray = FloatArray(initialCapacity * 2)
        private set
    private var pressures = FloatArray(initialCapacity)
    private var times = IntArray(initialCapacity)

    var count: Int = 0
        private set

    fun add(x: Float, y: Float, pressure: Float, tOffsetMs: Int) {
        ensureCapacity(count + 1)
        xy[count * 2] = x
        xy[count * 2 + 1] = y
        pressures[count] = pressure
        times[count] = tOffsetMs
        count++
    }

    fun clear() {
        count = 0
    }

    fun toStrokePoints(): List<StrokePoint> {
        val out = ArrayList<StrokePoint>(count)
        for (i in 0 until count) {
            out.add(StrokePoint(xy[i * 2], xy[i * 2 + 1], pressures[i], times[i]))
        }
        return out
    }

    fun boundsWith(widthPx: Float): Bounds {
        if (count == 0) return Bounds.EMPTY
        var l = Float.MAX_VALUE
        var t = Float.MAX_VALUE
        var r = -Float.MAX_VALUE
        var b = -Float.MAX_VALUE
        for (i in 0 until count) {
            val x = xy[i * 2]
            val y = xy[i * 2 + 1]
            if (x < l) l = x
            if (y < t) t = y
            if (x > r) r = x
            if (y > b) b = y
        }
        val pad = widthPx / 2f
        return Bounds(l - pad, t - pad, r + pad, b + pad)
    }

    private fun ensureCapacity(required: Int) {
        if (required <= pressures.size) return
        val newCapacity = maxOf(required, pressures.size * 2)
        xy = xy.copyOf(newCapacity * 2)
        pressures = pressures.copyOf(newCapacity)
        times = times.copyOf(newCapacity)
    }
}
