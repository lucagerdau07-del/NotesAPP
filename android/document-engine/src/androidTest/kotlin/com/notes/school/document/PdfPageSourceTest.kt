package com.notes.school.document

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PdfPageSourceTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun samplePdf(name: String = "sample.pdf"): File = TestPdfs.twoPagePdf(temp.newFile(name))

    @Test
    fun pageCountMatchesTheDocument() {
        PdfPageSource(samplePdf()).use { assertEquals(2, it.pageCount) }
    }

    @Test
    fun pageInfoReportsTheMediaBoxSize() {
        PdfPageSource(samplePdf()).use {
            val info = it.pageInfo(0)
            assertEquals(595f, info.widthPt, 1f)
            assertEquals(842f, info.heightPt, 1f)
        }
    }

    @Test
    fun renderedPageKeepsTheSourceAspectRatio() {
        PdfPageSource(samplePdf()).use {
            val bitmap = it.renderPage(0, targetWidthPx = 600)
            assertEquals(600, bitmap.width)
            assertEquals((600 * 842.0 / 595.0), bitmap.height.toDouble(), 2.0)
        }
    }

    @Test
    fun renderingAnOutOfRangePageFailsLoudly() {
        PdfPageSource(samplePdf()).use {
            assertThrows(IllegalArgumentException::class.java) { it.renderPage(9, 600) }
        }
    }

    @Test
    fun aCorruptPdfFailsWithATypedErrorRatherThanCrashing() {
        val corrupt = TestPdfs.corruptPdf(temp.newFile("broken.pdf"))
        assertThrows(PdfImportException::class.java) { PdfPageSource(corrupt) }
    }

    @Test
    fun closingReleasesTheRendererSoTheFileCanBeDeleted() {
        val file = samplePdf("closing.pdf")
        PdfPageSource(file).close()
        assertTrue(file.delete())
    }
}
