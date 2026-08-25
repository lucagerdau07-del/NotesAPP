package com.notes.school.storage

import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Page
import com.notes.school.core.PageSource
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Test

class MappersTest {

    @Test
    fun strokePointsAreStoredAsAnEncodedBlobNotAsText() {
        val stroke = Stroke(
            "s1", "p1", ToolKind.HIGHLIGHTER, 0xFFFFEE00.toInt(), 18f,
            listOf(StrokePoint(1f, 2f, 0.5f, 0)), Bounds(0f, 1f, 2f, 3f), 7L, true
        )
        val entity = stroke.toEntity()
        assertEquals(8 + 16, entity.pointsBlob.size)
        assertEquals(stroke, entity.toModel())
    }

    @Test
    fun templatePageSourceRoundTrips() {
        val page = Page("pg", "doc", 0, 100f, 200f, PageSource.Template(DocumentKind.GRID))
        assertEquals(page, page.toEntity().toModel())
    }

    @Test
    fun pdfPageSourceRoundTripsWithItsIndex() {
        val page = Page("pg", "doc", 3, 100f, 200f, PageSource.PdfPage(pageIndex = 12))
        val restored = page.toEntity().toModel()
        assertEquals(PageSource.PdfPage(12), restored.source)
        assertEquals(page, restored)
    }

    @Test
    fun viewportStateSurvivesTheRoundTrip() {
        val page = Page("pg", "doc", 0, 100f, 200f, PageSource.Template(DocumentKind.BLANK), 40f, 80f, 1.75f)
        assertEquals(page, page.toEntity().toModel())
    }
}
