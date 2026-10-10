package com.notes.school.document

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.notes.school.core.DocumentKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PaperTemplateTest {

    private fun render(kind: DocumentKind, width: Int = 400, height: Int = 400): Bitmap {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        PaperTemplate.draw(Canvas(bitmap), kind, width.toFloat(), height.toFloat())
        return bitmap
    }

    private fun nonPageColorPixels(bitmap: Bitmap): Int {
        var count = 0
        for (x in 0 until bitmap.width) {
            for (y in 0 until bitmap.height) {
                if (bitmap.getPixel(x, y) != PaperTemplate.PAGE_COLOR) count++
            }
        }
        return count
    }

    @Test
    fun blankPaperIsUniformWhite() {
        val bitmap = render(DocumentKind.BLANK)
        assertEquals(PaperTemplate.PAGE_COLOR, bitmap.getPixel(0, 0))
        assertEquals(0, nonPageColorPixels(bitmap))
    }

    @Test
    fun thePageStaysWhiteEvenThoughTheAppIsDark() {
        assertEquals(Color.WHITE, PaperTemplate.PAGE_COLOR)
    }

    @Test
    fun linedPaperDrawsHorizontalRulesAndNothingElse() {
        val bitmap = render(DocumentKind.LINED)
        val markedRows = (0 until bitmap.height).count { y ->
            (0 until bitmap.width).any { x -> bitmap.getPixel(x, y) != PaperTemplate.PAGE_COLOR }
        }
        val expectedRules = (400f / PaperTemplate.LINE_SPACING_PX).toInt()
        assertTrue("expected about $expectedRules rules, saw $markedRows rows", markedRows >= expectedRules)
        assertTrue(markedRows < 400)
    }

    @Test
    fun gridPaperMarksBothRowsAndColumns() {
        val bitmap = render(DocumentKind.GRID)
        val markedColumns = (0 until bitmap.width).count { x ->
            (0 until bitmap.height).any { y -> bitmap.getPixel(x, y) != PaperTemplate.PAGE_COLOR }
        }
        assertTrue(markedColumns > (400f / PaperTemplate.GRID_SPACING_PX).toInt() - 1)
    }

    @Test
    fun pdfBackedPagesGetNoTemplateInkDrawnOverThem() {
        val bitmap = render(DocumentKind.PDF)
        assertEquals(0, nonPageColorPixels(bitmap))
    }

    @Test
    fun aZeroSizedPageIsHandledWithoutCrashing() {
        val bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        PaperTemplate.draw(Canvas(bitmap), DocumentKind.LINED, 0f, 0f)
        assertEquals(PaperTemplate.PAGE_COLOR, bitmap.getPixel(0, 0))
    }
}
