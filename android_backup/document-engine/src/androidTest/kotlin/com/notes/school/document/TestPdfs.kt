package com.notes.school.document

import java.io.File

/**
 * Generates a minimal valid PDF at runtime, so the repository carries no binary fixture
 * and the corpus stays free of anything resembling real schoolwork.
 */
object TestPdfs {

    fun twoPagePdf(target: File): File {
        val objects = mutableListOf<String>()
        objects += "<< /Type /Catalog /Pages 2 0 R >>"
        objects += "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>"
        objects += "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << >> >>"
        objects += "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << >> >>"
        val content = "0 0 1 RG 4 w 100 100 m 400 700 l S"
        objects += "<< /Length ${content.length} >>\nstream\n$content\nendstream"

        val builder = StringBuilder("%PDF-1.4\n")
        val offsets = mutableListOf<Int>()
        objects.forEachIndexed { index, body ->
            offsets += builder.length
            builder.append("${index + 1} 0 obj\n$body\nendobj\n")
        }
        val xrefStart = builder.length
        builder.append("xref\n0 ${objects.size + 1}\n")
        builder.append("0000000000 65535 f \n")
        offsets.forEach { builder.append(String.format("%010d 00000 n \n", it)) }
        builder.append("trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\n")
        builder.append("startxref\n$xrefStart\n%%EOF\n")

        target.parentFile?.mkdirs()
        target.writeText(builder.toString())
        return target
    }

    fun corruptPdf(target: File): File {
        target.parentFile?.mkdirs()
        target.writeText("%PDF-1.4\nthis is not a pdf body at all\n")
        return target
    }
}
