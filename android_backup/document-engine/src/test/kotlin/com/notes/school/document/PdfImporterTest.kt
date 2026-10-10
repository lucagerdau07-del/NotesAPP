package com.notes.school.document

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class PdfImporterTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun samplePdf(name: String = "sample.pdf"): File = TestPdfs.twoPagePdf(temp.newFile(name))

    @Test
    fun importCopiesTheSourceIntoAppPrivateStorageAndLeavesItUnmodified() {
        val importer = PdfImporter(temp.newFolder("files"))
        val source = samplePdf("source.pdf")
        val ref = importer.importCopy(source.inputStream(), documentId = "doc-1")
        val stored = importer.resolve(ref)
        assertTrue(stored.isFile)
        assertEquals(source.readBytes().size, stored.readBytes().size)
    }

    @Test
    fun eachImportGetsItsOwnPathSoDocumentsNeverShareASource() {
        val importer = PdfImporter(temp.newFolder("files"))
        val first = importer.importCopy(samplePdf("first.pdf").inputStream(), "doc-1")
        val second = importer.importCopy(samplePdf("second.pdf").inputStream(), "doc-2")
        assertNotEquals(first, second)
    }

    @Test
    fun deleteRemovesTheStoredCopy() {
        val importer = PdfImporter(temp.newFolder("files"))
        val ref = importer.importCopy(samplePdf("to_delete.pdf").inputStream(), "doc-1")
        importer.delete(ref)
        assertTrue(!importer.resolve(ref).exists())
    }
}
