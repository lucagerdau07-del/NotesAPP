package com.notes.school.document

import android.graphics.Bitmap
import android.util.LruCache

/**
 * Bounded, deterministic page-tile cache. Sizing is in bytes rather than entries because a
 * rendered A4 page at reading zoom is worth dozens of small tiles on this tablet's budget.
 */
class PageBitmapCache(private val maxBytes: Int) {

    private val cache = object : LruCache<String, Bitmap>(maxBytes) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    val sizeBytes: Int get() = cache.size()

    fun get(key: String): Bitmap? = cache.get(key)

    fun put(key: String, bitmap: Bitmap) {
        if (bitmap.byteCount > maxBytes) return
        cache.put(key, bitmap)
    }

    fun evictAll() = cache.evictAll()

    /** Called on onTrimMemory so background prefetch stops costing memory under pressure. */
    fun trimToFraction(fraction: Float) {
        cache.trimToSize((maxBytes * fraction.coerceIn(0f, 1f)).toInt())
    }
}
