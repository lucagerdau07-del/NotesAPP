package com.notes.school.document

import android.content.Context
import android.graphics.Color
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.notes.school.core.ToolKind
import java.io.File

/**
 * Applies the app's vector ink onto a copy of the immutable source, keeping the original
 * page content — and therefore its selectable text — intact.
 *
 * One page is processed and released at a time; the SM-T505 does not have the headroom to
 * hold a whole worksheet's content streams at once.
 */
class PdfBoxAnnotationExporter(private val context: Context) : PdfExporter {

    override fun export(request: ExportRequest): ExportResult {
        PDFBoxResourceLoader.init(context.applicationContext)
        val source = request.sourcePdf
            ?: return ExportResult.Failure("no source document to annotate", null)
        if (!source.isFile) return ExportResult.Failure("the source document is missing", null)

        return try {
            PDDocument.load(source).use { document ->
                request.pages.forEach { page ->
                    if (page.pageIndex >= document.numberOfPages) return@forEach
                    val pdPage = document.getPage(page.pageIndex)
                    drawStrokes(document, pdPage, page)
                }
                request.target.parentFile?.mkdirs()
                document.save(request.target)
            }
            ExportResult.Success(request.target, flattened = false)
        } catch (e: Exception) {
            ExportResult.Failure("this document could not be annotated", e)
        }
    }

    private fun drawStrokes(document: PDDocument, pdPage: PDPage, page: ExportPage) {
        val box: PDRectangle = pdPage.mediaBox
        val scaleX = box.width / page.widthPx
        val scaleY = box.height / page.heightPx

        PDPageContentStream(
            document,
            pdPage,
            PDPageContentStream.AppendMode.APPEND,
            /* compress = */ true,
            /* resetContext = */ true
        ).use { stream ->
            for (stroke in page.strokes) {
                if (!stroke.active || stroke.points.isEmpty()) continue
                if (stroke.tool == ToolKind.HIGHLIGHTER) {
                    val state = PDExtendedGraphicsState().apply {
                        strokingAlphaConstant = HIGHLIGHTER_ALPHA
                        nonStrokingAlphaConstant = HIGHLIGHTER_ALPHA
                    }
                    stream.setGraphicsStateParameters(state)
                } else {
                    stream.setGraphicsStateParameters(PDExtendedGraphicsState())
                }
                stream.setStrokingColor(
                    Color.red(stroke.colorArgb) / 255f,
                    Color.green(stroke.colorArgb) / 255f,
                    Color.blue(stroke.colorArgb) / 255f
                )
                stream.setLineWidth(stroke.widthPx * scaleX)
                stream.setLineCapStyle(1)
                stream.setLineJoinStyle(1)

                val first = stroke.points.first()
                // PDF's origin is bottom-left; the app's is top-left.
                stream.moveTo(first.x * scaleX, box.height - first.y * scaleY)
                for (i in 1 until stroke.points.size) {
                    val p = stroke.points[i]
                    stream.lineTo(p.x * scaleX, box.height - p.y * scaleY)
                }
                stream.stroke()
            }
        }
    }

    private companion object {
        const val HIGHLIGHTER_ALPHA = 0.38f
    }
}
