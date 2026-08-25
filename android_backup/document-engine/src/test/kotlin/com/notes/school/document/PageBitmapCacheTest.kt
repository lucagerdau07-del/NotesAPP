package com.notes.school.document

import android.graphics.Bitmap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class PageBitmapCacheTest {

    /** 100 x 100 ARGB_8888 = 40_000 bytes. */
    private fun tile() = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888)

    @Test
    fun storedTilesComeBackByKey() {
        val cache = PageBitmapCache(maxBytes = 200_000)
        val bitmap = tile()
        cache.put("page-0", bitmap)
        assertEquals(bitmap, cache.get("page-0"))
    }

    @Test
    fun missingKeysReturnNull() {
        assertNull(PageBitmapCache(maxBytes = 200_000).get("nope"))
    }

    @Test
    fun theCacheNeverExceedsItsByteBudget() {
        val cache = PageBitmapCache(maxBytes = 100_000)
        repeat(10) { cache.put("page-$it", tile()) }
        assertTrue("size was ${cache.sizeBytes}", cache.sizeBytes <= 100_000)
    }

    @Test
    fun theLeastRecentlyUsedTileIsEvictedFirst() {
        val cache = PageBitmapCache(maxBytes = 90_000)
        cache.put("a", tile())
        cache.put("b", tile())
        cache.get("a") // a becomes most recently used
        cache.put("c", tile())
        assertNotNull(cache.get("a"))
        assertNull(cache.get("b"))
    }

    @Test
    fun evictAllEmptiesTheCache() {
        val cache = PageBitmapCache(maxBytes = 200_000)
        cache.put("a", tile())
        cache.evictAll()
        assertEquals(0, cache.sizeBytes)
        assertNull(cache.get("a"))
    }

    @Test
    fun trimToFractionShrinksTheCacheUnderMemoryPressure() {
        val cache = PageBitmapCache(maxBytes = 400_000)
        repeat(8) { cache.put("page-$it", tile()) }
        cache.trimToFraction(0.25f)
        assertTrue("size was ${cache.sizeBytes}", cache.sizeBytes <= 100_000)
    }
}
