package com.notes.school.ink

import com.notes.school.core.StrokePoint
import kotlin.math.sqrt

object Segments {

    /** Shortest distance from (px, py) to the segment a-b, clamped at the endpoints. */
    fun distanceToSegment(
        px: Float, py: Float,
        ax: Float, ay: Float,
        bx: Float, by: Float
    ): Float {
        val abx = bx - ax
        val aby = by - ay
        val lengthSquared = abx * abx + aby * aby
        val t = if (lengthSquared <= 0f) {
            0f
        } else {
            (((px - ax) * abx + (py - ay) * aby) / lengthSquared).coerceIn(0f, 1f)
        }
        val dx = px - (ax + t * abx)
        val dy = py - (ay + t * aby)
        return sqrt(dx * dx + dy * dy)
    }

    /** Even-odd ray casting. Polygons with fewer than three vertices contain nothing. */
    fun polygonContains(polygon: List<StrokePoint>, x: Float, y: Float): Boolean {
        if (polygon.size < 3) return false
        var inside = false
        var j = polygon.lastIndex
        for (i in polygon.indices) {
            val pi = polygon[i]
            val pj = polygon[j]
            val crossesRay = (pi.y > y) != (pj.y > y)
            if (crossesRay) {
                val xAtY = (pj.x - pi.x) * (y - pi.y) / (pj.y - pi.y) + pi.x
                if (x < xAtY) inside = !inside
            }
            j = i
        }
        return inside
    }
}
