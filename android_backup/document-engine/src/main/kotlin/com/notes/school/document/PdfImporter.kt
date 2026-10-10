package com.notes.school.document

import java.io.File
import java.io.InputStream

class PdfImportException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Copies an imported PDF once into app-private storage and never writes to it again.
 * Every later operation — rendering, export — works from that immutable copy, so a failed
 * export can never damage the original worksheet.
 */
class PdfImporter(private val filesDir: File) {

    private val root: File get() = File(filesDir, PDF_DIR).apply { mkdirs() }

    /** @return the relative sourceRef to store on the document row. */
    fun importCopy(source: InputStream, documentId: String): String {
        val relative = "$PDF_DIR/$documentId.pdf"
        val target = File(filesDir, relative)
        target.parentFile?.mkdirs()
        try {
            source.use { input -> target.outputStream().use { input.copyTo(it) } }
        } catch (e: Exception) {
            target.delete()
            throw PdfImportException("could not store the imported document", e)
        }
        if (target.length() == 0L) {
            target.delete()
            throw PdfImportException("imported document was empty")
        }
        return relative
    }

    fun resolve(sourceRef: String): File = File(filesDir, sourceRef)

    fun delete(sourceRef: String) {
        resolve(sourceRef).delete()
    }

    private companion object {
        const val PDF_DIR = "pdf"
    }
}
