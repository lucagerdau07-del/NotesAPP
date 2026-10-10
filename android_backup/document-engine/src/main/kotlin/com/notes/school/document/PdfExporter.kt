package com.notes.school.document

import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import java.io.File

data class ExportPage(
    val pageIndex: Int,
    val widthPx: Float,
    val heightPx: Float,
    val strokes: List<Stroke>,
    val templateKind: DocumentKind
)

data class ExportRequest(
    /** The immutable imported PDF, or null for a paper document. */
    val sourcePdf: File?,
    val pages: List<ExportPage>,
    val target: File,
    val tempDir: File
)

sealed interface ExportResult {
    data class Success(val file: File, val flattened: Boolean) : ExportResult
    data class Failure(val reason: String, val cause: Throwable?) : ExportResult
}

interface PdfExporter {
    fun export(request: ExportRequest): ExportResult
}

/**
 * Runs the annotation exporter first and flattens only if it cannot finish. Writes through
 * a temporary file so a failed or half-finished export never replaces a good one — a manual
 * export must never become the only copy, and it must never destroy the previous copy.
 */
class ExportCoordinator(
    private val primary: PdfExporter,
    private val fallback: PdfExporter
) : PdfExporter {

    override fun export(request: ExportRequest): ExportResult {
        request.tempDir.mkdirs()
        val staged = File(request.tempDir, "staged-${System.currentTimeMillis()}.pdf")
        val stagedRequest = request.copy(target = staged)

        val result = attempt(primary, stagedRequest) ?: attempt(fallback, stagedRequest)
        if (result == null) {
            cleanup(request.tempDir)
            return ExportResult.Failure("the document could not be exported", null)
        }

        return try {
            if (staged.isFile && staged.length() > 0L) {
                request.target.parentFile?.mkdirs()
                staged.copyTo(request.target, overwrite = true)
            }
            ExportResult.Success(request.target, result.flattened)
        } catch (e: Exception) {
            ExportResult.Failure("the exported file could not be published", e)
        } finally {
            cleanup(request.tempDir)
        }
    }

    private fun attempt(exporter: PdfExporter, request: ExportRequest): ExportResult.Success? =
        try {
            exporter.export(request) as? ExportResult.Success
        } catch (e: Throwable) {
            // OutOfMemoryError on a big page is exactly the case the fallback exists for.
            null
        }

    private fun cleanup(tempDir: File) {
        tempDir.listFiles()?.forEach { it.delete() }
    }
}
