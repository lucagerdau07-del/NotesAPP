package com.notes.school.core

import java.nio.ByteBuffer
import java.nio.ByteOrder

class StrokeCodecException(message: String) : RuntimeException(message)

/**
 * Versioned little-endian binary encoding for stroke point arrays stored in Room BLOB columns.
 *
 * Layout:
 *   header : u8 version | u8 reserved | u16 reserved | u32 pointCount   (8 bytes)
 *   record : f32 x | f32 y | f32 pressure | u32 tOffsetMs               (16 bytes, repeated)
 *
 * The header is a fixed 8 bytes so a future version can extend the record while an
 * older reader can still read the version and count.
 */
object StrokeCodec {

    const val VERSION: Int = 1
    private const val HEADER_BYTES = 8
    private const val RECORD_BYTES = 16

    fun encode(points: List<StrokePoint>): ByteArray {
        val buffer = ByteBuffer
            .allocate(HEADER_BYTES + RECORD_BYTES * points.size)
            .order(ByteOrder.LITTLE_ENDIAN)
        buffer.put(VERSION.toByte())
        buffer.put(0)
        buffer.putShort(0)
        buffer.putInt(points.size)
        for (p in points) {
            buffer.putFloat(p.x)
            buffer.putFloat(p.y)
            buffer.putFloat(p.pressure)
            buffer.putInt(p.tOffsetMs)
        }
        return buffer.array()
    }

    fun decode(blob: ByteArray): List<StrokePoint> {
        if (blob.size < HEADER_BYTES) throw StrokeCodecException("blob shorter than header")
        val buffer = ByteBuffer.wrap(blob).order(ByteOrder.LITTLE_ENDIAN)
        val version = buffer.get().toInt() and 0xFF
        if (version != VERSION) throw StrokeCodecException("unsupported stroke blob version $version")
        buffer.get()
        buffer.short
        val count = buffer.int
        if (count < 0) throw StrokeCodecException("negative point count")
        val expected = HEADER_BYTES + RECORD_BYTES * count
        if (blob.size != expected) {
            throw StrokeCodecException("truncated blob: expected $expected bytes, got ${blob.size}")
        }
        val points = ArrayList<StrokePoint>(count)
        repeat(count) {
            points.add(
                StrokePoint(
                    x = buffer.float,
                    y = buffer.float,
                    pressure = buffer.float,
                    tOffsetMs = buffer.int
                )
            )
        }
        return points
    }
}
