package com.notes.school.document

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.Closeable
import java.io.File

data class PdfPageInfo(val index: Int, val widthPt: Float, val heightPt: Float)

/**
 * Reads pages from the immutable imported PDF using the platform renderer, which is
 * available on Android 12 without any SDK extension.
 *
 * PdfRenderer allows only one open page at a time, so every render opens, draws, and closes
 * within the call. That is also what keeps peak memory predictable on the SM-T505.
 */
class PdfPageSource(file: File) : Closeable {

    private val descriptor: ParcelFileDescriptor
    private val renderer: PdfRenderer

    init {
        try {
            descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            renderer = PdfRenderer(descriptor)
        } catch (e: Exception) {
            throw PdfImportException("this document could not be opened", e)
        }
    }

    val pageCount: Int get() = renderer.pageCount

    fun pageInfo(index: Int): PdfPageInfo {
        require(index in 0 until pageCount) { "page $index out of range (0..${pageCount - 1})" }
        renderer.openPage(index).use { page ->
            return PdfPageInfo(index, page.width.toFloat(), page.height.toFloat())
        }
    }

    fun renderPage(index: Int, targetWidthPx: Int): Bitmap {
        require(index in 0 until pageCount) { "page $index out of range (0..${pageCount - 1})" }
        require(targetWidthPx > 0) { "target width must be positive" }
        renderer.openPage(index).use { page ->
            val height = (targetWidthPx * page.height.toFloat() / page.width.toFloat()).toInt()
            val bitmap = Bitmap.createBitmap(targetWidthPx, maxOf(height, 1), Bitmap.Config.ARGB_8888)
            // PdfRenderer composites onto transparency; paper must be white underneath.
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            return bitmap
        }
    }

    override fun close() {
        renderer.close()
        descriptor.close()
    }
}
