package com.notes.school.document

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.pdf.PdfDocument
import com.notes.school.ink.StrokeRenderer
import java.io.File

/**
 * Visual-only export. Used when the source PDF has a feature the annotation path cannot
 * preserve, when memory runs out, and for paper documents that have no source PDF at all.
 *
 * The caller must label this result as flattened in the UI: source text is no longer
 * selectable in the produced file.
 */
class FlattenedPdfExporter : PdfExporter {

    private val renderer = StrokeRenderer()

    override fun export(request: ExportRequest): ExportResult {
        if (request.pages.isEmpty()) return ExportResult.Failure("nothing to export", null)
        val document = PdfDocument()
        return try {
            request.pages.forEachIndexed { index, page ->
                val info = PdfDocument.PageInfo.Builder(
                    page.widthPx.toInt().coerceAtLeast(1),
                    page.heightPx.toInt().coerceAtLeast(1),
                    index
                ).create()
                val pdfPage = document.startPage(info)
                PaperTemplate.draw(pdfPage.canvas, page.templateKind, page.widthPx, page.heightPx)
                renderer.draw(pdfPage.canvas, page.strokes)
                // Finish each page before starting the next so only one page's worth of
                // canvas state is alive at a time.
                document.finishPage(pdfPage)
            }
            request.target.parentFile?.mkdirs()
            request.target.outputStream().use { document.writeTo(it) }
            ExportResult.Success(request.target, flattened = true)
        } catch (e: Exception) {
            ExportResult.Failure("the document could not be exported", e)
        } finally {
            document.close()
        }
    }

    /** Renders one page to a bitmap. Kept separate so page previews reuse the same path. */
    fun renderPreview(page: ExportPage, targetWidthPx: Int): Bitmap {
        val height = (targetWidthPx * page.heightPx / page.widthPx).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(targetWidthPx, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val scale = targetWidthPx / page.widthPx
        canvas.scale(scale, scale)
        PaperTemplate.draw(canvas, page.templateKind, page.widthPx, page.heightPx)
        renderer.draw(canvas, page.strokes)
        return bitmap
    }
}
