package com.notes.school.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class StrokeCodecTest {

    private val sample = listOf(
        StrokePoint(0f, 0f, 0f, 0),
        StrokePoint(12.5f, -3.25f, 0.75f, 16),
        StrokePoint(1024.125f, 2048.5f, 1f, 512)
    )

    @Test
    fun roundTripPreservesEveryField() {
        assertEquals(sample, StrokeCodec.decode(StrokeCodec.encode(sample)))
    }

    @Test
    fun emptyStrokeRoundTrips() {
        assertEquals(emptyList<StrokePoint>(), StrokeCodec.decode(StrokeCodec.encode(emptyList())))
    }

    @Test
    fun blobLayoutIsHeaderPlusFixedSizeRecords() {
        val blob = StrokeCodec.encode(sample)
        assertEquals(8 + 16 * sample.size, blob.size)
        assertEquals(StrokeCodec.VERSION.toByte(), blob[0])
    }

    @Test
    fun unknownVersionIsRejected() {
        val blob = StrokeCodec.encode(sample)
        blob[0] = 99
        val e = assertThrows(StrokeCodecException::class.java) { StrokeCodec.decode(blob) }
        assertTrue(e.message!!.contains("version"))
    }

    @Test
    fun truncatedPayloadIsRejected() {
        val blob = StrokeCodec.encode(sample)
        assertThrows(StrokeCodecException::class.java) {
            StrokeCodec.decode(blob.copyOf(blob.size - 5))
        }
    }

    @Test
    fun tenThousandPointsRoundTripUnchanged() {
        val big = (0 until 10_000).map { StrokePoint(it * 0.5f, it * 0.25f, 0.5f, it * 4) }
        assertEquals(big, StrokeCodec.decode(StrokeCodec.encode(big)))
    }
}
