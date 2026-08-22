package com.notes.school.document

import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ExportPlanTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun page(index: Int) = ExportPage(
        pageIndex = index,
        widthPx = 1240f,
        heightPx = 1754f,
        strokes = listOf(
            Stroke(
                "s$index", "p$index", ToolKind.PEN, -16777216, 3f,
                listOf(StrokePoint(10f, 10f, 1f, 0), StrokePoint(100f, 100f, 1f, 8)),
                Bounds(8f, 8f, 102f, 102f), 0L, true
            )
        ),
        templateKind = DocumentKind.PDF
    )

    private class StubExporter(
        private val result: (ExportRequest) -> ExportResult
    ) : PdfExporter {
        var calls = 0
        override fun export(request: ExportRequest): ExportResult {
            calls++
            return result(request)
        }
    }

    private fun request() = ExportRequest(
        sourcePdf = null,
        pages = listOf(page(0), page(1)),
        target = File(temp.root, "out.pdf"),
        tempDir = temp.newFolder("tmp")
    )

    @Test
    fun theAnnotationPathIsUsedWhenItSucceeds() {
        val primary = StubExporter { ExportResult.Success(it.target, flattened = false) }
        val fallback = StubExporter { ExportResult.Success(it.target, flattened = true) }
        val result = ExportCoordinator(primary, fallback).export(request())
        assertTrue(result is ExportResult.Success)
        assertFalse((result as ExportResult.Success).flattened)
        assertEquals(0, fallback.calls)
    }

    @Test
    fun aFailedAnnotationExportFallsBackToFlattening() {
        val primary = StubExporter { ExportResult.Failure("unsupported feature", null) }
        val fallback = StubExporter { ExportResult.Success(it.target, flattened = true) }
        val result = ExportCoordinator(primary, fallback).export(request())
        assertTrue((result as ExportResult.Success).flattened)
        assertEquals(1, fallback.calls)
    }

    @Test
    fun aThrowingPrimaryExporterAlsoTriggersTheFallback() {
        val primary = StubExporter { throw OutOfMemoryError("page too large") }
        val fallback = StubExporter { ExportResult.Success(it.target, flattened = true) }
        val result = ExportCoordinator(primary, fallback).export(request())
        assertTrue(result is ExportResult.Success)
    }

    @Test
    fun bothPathsFailingReportsAFailureAndPublishesNothing() {
        val primary = StubExporter { ExportResult.Failure("no", null) }
        val fallback = StubExporter { ExportResult.Failure("also no", null) }
        val req = request()
        val result = ExportCoordinator(primary, fallback).export(req)
        assertTrue(result is ExportResult.Failure)
        assertFalse("a failed export must not leave a file behind", req.target.exists())
    }

    @Test
    fun aFailedExportLeavesAPreexistingTargetFileUntouched() {
        val req = request()
        req.target.writeText("previous export")
        val primary = StubExporter { ExportResult.Failure("no", null) }
        val fallback = StubExporter { ExportResult.Failure("also no", null) }
        ExportCoordinator(primary, fallback).export(req)
        assertEquals("previous export", req.target.readText())
    }

    @Test
    fun temporaryFilesAreCleanedUpAfterASuccessfulExport() {
        val req = request()
        val primary = StubExporter {
            File(it.tempDir, "work.pdf").writeText("x")
            ExportResult.Success(it.target, flattened = false)
        }
        ExportCoordinator(primary, StubExporter { ExportResult.Failure("n/a", null) }).export(req)
        assertEquals(0, req.tempDir.listFiles()!!.size)
    }
}
