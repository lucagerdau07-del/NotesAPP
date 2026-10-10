package com.notes.school.core

import kotlinx.serialization.Serializable

@Serializable
data class Bounds(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float
) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top

    fun union(other: Bounds): Bounds = Bounds(
        left = minOf(left, other.left),
        top = minOf(top, other.top),
        right = maxOf(right, other.right),
        bottom = maxOf(bottom, other.bottom)
    )

    fun contains(x: Float, y: Float): Boolean =
        x >= left && x <= right && y >= top && y <= bottom

    fun intersects(other: Bounds): Boolean =
        left <= other.right && other.left <= right &&
            top <= other.bottom && other.top <= bottom

    fun inflate(by: Float): Bounds = Bounds(left - by, top - by, right + by, bottom + by)

    companion object {
        val EMPTY = Bounds(0f, 0f, 0f, 0f)

        fun ofPoints(points: List<StrokePoint>, padding: Float = 0f): Bounds {
            if (points.isEmpty()) return EMPTY
            var l = Float.MAX_VALUE
            var t = Float.MAX_VALUE
            var r = -Float.MAX_VALUE
            var b = -Float.MAX_VALUE
            for (p in points) {
                if (p.x < l) l = p.x
                if (p.y < t) t = p.y
                if (p.x > r) r = p.x
                if (p.y > b) b = p.y
            }
            return Bounds(l - padding, t - padding, r + padding, b + padding)
        }
    }
}
