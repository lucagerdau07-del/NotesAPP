package com.notes.school.ink

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.notes.school.core.Bounds
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StrokeRendererTest {

    private val renderer = StrokeRenderer()

    private fun surface(): Pair<Bitmap, Canvas> {
        val bitmap = Bitmap.createBitmap(200, 200, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        return bitmap to canvas
    }

    private fun horizontalStroke(y: Float, color: Int, tool: ToolKind = ToolKind.PEN) =
        InkScene("p").addStroke(
            tool, color, 6f,
            listOf(StrokePoint(20f, y, 1f, 0), StrokePoint(180f, y, 1f, 20))
        )

    @Test
    fun drawsStrokeInItsColor() {
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, listOf(horizontalStroke(100f, Color.RED)))
        assertEquals(Color.RED, bitmap.getPixel(100, 100))
    }

    @Test
    fun leavesUntouchedPixelsAlone() {
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, listOf(horizontalStroke(100f, Color.RED)))
        assertEquals(Color.WHITE, bitmap.getPixel(100, 10))
    }

    @Test
    fun clipRestrictsDrawingToTheGivenBounds() {
        val (bitmap, canvas) = surface()
        renderer.draw(
            canvas,
            listOf(horizontalStroke(100f, Color.RED)),
            clip = Bounds(0f, 0f, 60f, 200f)
        )
        assertEquals(Color.RED, bitmap.getPixel(40, 100))
        assertEquals(Color.WHITE, bitmap.getPixel(150, 100))
    }

    @Test
    fun highlighterIsDrawnTranslucent() {
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, listOf(horizontalStroke(100f, Color.YELLOW, ToolKind.HIGHLIGHTER)))
        val pixel = bitmap.getPixel(100, 100)
        assertNotEquals(Color.YELLOW, pixel)
        assertTrue("highlighter should blend toward white", Color.blue(pixel) > 0)
    }

    @Test
    fun inactiveStrokesAreNeverDrawn() {
        val scene = InkScene("p")
        scene.addStroke(
            ToolKind.PEN, Color.RED, 6f,
            listOf(StrokePoint(20f, 100f, 1f, 0), StrokePoint(180f, 100f, 1f, 20))
        )
        scene.eraseAt(100f, 100f, radiusPx = 4f)
        val (bitmap, canvas) = surface()
        renderer.draw(canvas, scene.activeStrokes())
        assertEquals(Color.WHITE, bitmap.getPixel(100, 100))
    }

    @Test
    fun drawLiveRendersFromRawBufferWithoutStrokeObjects() {
        val (bitmap, canvas) = surface()
        val buffer = floatArrayOf(20f, 100f, 180f, 100f, 0f, 0f, 0f, 0f)
        renderer.drawLive(canvas, buffer, pointCount = 2, ToolKind.PEN, Color.BLUE, 6f)
        assertEquals(Color.BLUE, bitmap.getPixel(100, 100))
    }

    @Test
    fun drawLiveWithSinglePointDrawsADot() {
        val (bitmap, canvas) = surface()
        renderer.drawLive(canvas, floatArrayOf(100f, 100f), pointCount = 1, ToolKind.PEN, Color.BLUE, 10f)
        assertEquals(Color.BLUE, bitmap.getPixel(100, 100))
    }

    @Test
    fun drawLiveWithZeroPointsDoesNothing() {
        val (bitmap, canvas) = surface()
        renderer.drawLive(canvas, FloatArray(8), pointCount = 0, ToolKind.PEN, Color.BLUE, 6f)
        assertEquals(Color.WHITE, bitmap.getPixel(100, 100))
    }
}
