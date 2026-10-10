package com.notes.school.document

import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the SM-T505. PdfBox-Android needs a real Android runtime, and export memory
 * behaviour is exactly what an emulator would misreport.
 */
@RunWith(AndroidJUnit4::class)
class PdfExporterTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var workDir: File

    @Before
    fun setUp() {
        workDir = File(context.cacheDir, "export-test").apply {
            deleteRecursively()
            mkdirs()
        }
    }

    private fun strokes(pageId: String) = listOf(
        Stroke(
            "s1", pageId, ToolKind.PEN, 0xFF1A73E8.toInt(), 4f,
            (0..40).map { StrokePoint(60f + it * 12f, 200f + it * 6f, 1f, it * 8) },
            Bounds(50f, 190f, 600f, 460f), 0L, true
        ),
        Stroke(
            "s2", pageId, ToolKind.HIGHLIGHTER, 0xFFFFEE00.toInt(), 20f,
            (0..20).map { StrokePoint(80f + it * 20f, 700f, 1f, it * 8) },
            Bounds(70f, 690f, 500f, 710f), 1L, true
        )
    )

    private fun request(source: File?, target: File) = ExportRequest(
        sourcePdf = source,
        pages = listOf(
            ExportPage(0, 1240f, 1754f, strokes("p0"), DocumentKind.PDF),
            ExportPage(1, 1240f, 1754f, strokes("p1"), DocumentKind.PDF)
        ),
        target = target,
        tempDir = File(workDir, "tmp").apply { mkdirs() }
    )

    private fun pageCountOf(file: File): Int {
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { return it.pageCount }
        }
    }

    @Test
    fun annotatedExportProducesAFileAnExternalViewerCanOpen() {
        val source = TestPdfs.twoPagePdf(File(workDir, "source.pdf"))
        val target = File(workDir, "annotated.pdf")
        val result = PdfBoxAnnotationExporter(context).export(request(source, target))
        assertTrue("export failed: $result", result is ExportResult.Success)
        assertTrue(target.length() > 0)
        assertEquals(2, pageCountOf(target))
    }

    @Test
    fun theOriginalSourceFileIsNeverModifiedByAnExport() {
        val source = TestPdfs.twoPagePdf(File(workDir, "source.pdf"))
        val before = source.readBytes()
        PdfBoxAnnotationExporter(context).export(request(source, File(workDir, "out.pdf")))
        assertTrue(before.contentEquals(source.readBytes()))
    }

    @Test
    fun flattenedExportWorksWithoutAnySourcePdf() {
        val target = File(workDir, "flat.pdf")
        val result = FlattenedPdfExporter().export(request(source = null, target = target))
        assertTrue("export failed: $result", result is ExportResult.Success)
        assertTrue((result as ExportResult.Success).flattened)
        assertEquals(2, pageCountOf(target))
    }

    @Test
    fun exportingACorruptSourceFallsBackToFlatteningRatherThanFailing() {
        val corrupt = TestPdfs.corruptPdf(File(workDir, "broken.pdf"))
        val target = File(workDir, "recovered.pdf")
        val coordinator = ExportCoordinator(
            PdfBoxAnnotationExporter(context),
            FlattenedPdfExporter()
        )
        val result = coordinator.export(request(corrupt, target))
        assertTrue(result is ExportResult.Success)
        assertTrue((result as ExportResult.Success).flattened)
    }

    @Test
    fun aTwentyPageExportStaysInsideTheMemoryBudget() {
        val target = File(workDir, "large.pdf")
        val pages = (0 until 20).map {
            ExportPage(it, 1240f, 1754f, strokes("p$it"), DocumentKind.PDF)
        }
        val runtime = Runtime.getRuntime()
        val before = runtime.totalMemory() - runtime.freeMemory()
        val result = FlattenedPdfExporter().export(
            ExportRequest(null, pages, target, File(workDir, "tmp2").apply { mkdirs() })
        )
        val after = runtime.totalMemory() - runtime.freeMemory()
        assertTrue(result is ExportResult.Success)
        assertTrue(
            "export grew the heap by ${(after - before) / 1024 / 1024} MB",
            after - before < 96L * 1024 * 1024
        )
    }
}
