package com.notes.school.ink

import android.graphics.Color
import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class InkViewTest {

    private lateinit var view: InkView
    private lateinit var scene: InkScene
    private val committed = mutableListOf<Stroke>()

    @Before
    fun setUp() {
        scene = InkScene("page-1")
        view = InkView(ApplicationProvider.getApplicationContext()).apply {
            this.scene = this@InkViewTest.scene
            tool = ToolSettings(ToolKind.PEN, Color.BLACK, 3f)
            onStrokeCommitted = { committed += it }
        }
        view.layout(0, 0, 800, 600)
        committed.clear()
    }

    private fun event(action: Int, x: Float, y: Float, downTime: Long): MotionEvent =
        MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, x, y, 0)

    private fun drawLine() {
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 90f, 10f, downTime))
    }

    @Test
    fun aCompletedGestureBecomesExactlyOneStroke() {
        drawLine()
        assertEquals(1, scene.activeStrokes().size)
        assertEquals(1, committed.size)
        assertEquals(3, committed.single().points.size)
    }

    @Test
    fun strokeUsesTheCurrentToolSettings() {
        view.tool = ToolSettings(ToolKind.HIGHLIGHTER, Color.YELLOW, 18f)
        drawLine()
        val stroke = committed.single()
        assertEquals(ToolKind.HIGHLIGHTER, stroke.tool)
        assertEquals(Color.YELLOW, stroke.colorArgb)
        assertEquals(18f, stroke.widthPx, 0f)
    }

    @Test
    fun cancelDiscardsTheInProgressStroke() {
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_CANCEL, 50f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(0, committed.size)
    }

    @Test
    fun eraserToolDeactivatesStrokesInsteadOfAddingOne() {
        drawLine()
        view.tool = ToolSettings(ToolKind.ERASER, Color.BLACK, 3f, eraserRadiusPx = 12f)
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 50f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 50f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(1, scene.allStrokes().size)
    }

    @Test
    fun rejectedPointerNeverProducesAStroke() {
        view.pointerGate = { _, _ -> PointerVerdict.REJECT }
        drawLine()
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(0, committed.size)
    }

    @Test
    fun provisionalPointerIsBufferedAndOnlyCommittedOnPromotion() {
        view.pointerGate = { _, _ -> PointerVerdict.PROVISIONAL }
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        view.promoteProvisional(pointerId = 0)
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 90f, 10f, downTime))
        assertEquals(1, scene.activeStrokes().size)
        assertEquals(3, committed.single().points.size)
    }

    @Test
    fun discardedProvisionalPointerLeavesNoTrace() {
        view.pointerGate = { _, _ -> PointerVerdict.PROVISIONAL }
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(event(MotionEvent.ACTION_DOWN, 10f, 10f, downTime))
        view.dispatchTouchEvent(event(MotionEvent.ACTION_MOVE, 50f, 10f, downTime))
        view.discardProvisional(pointerId = 0)
        view.dispatchTouchEvent(event(MotionEvent.ACTION_UP, 90f, 10f, downTime))
        assertEquals(0, scene.activeStrokes().size)
        assertEquals(0, committed.size)
    }

    @Test
    fun undoAndRedoGoThroughTheScene() {
        drawLine()
        view.undo()
        assertEquals(0, scene.activeStrokes().size)
        view.redo()
        assertEquals(1, scene.activeStrokes().size)
    }

    @Test
    fun eventsWithoutASceneAreIgnoredWithoutCrashing() {
        view.scene = null
        drawLine()
        assertEquals(0, committed.size)
        assertNull(view.scene)
    }

    @Test
    fun pointTimestampsAreRelativeToTheStrokeStart() {
        drawLine()
        assertEquals(0, committed.single().points.first().tOffsetMs)
        assertTrue(committed.single().points.last().tOffsetMs >= 0)
    }
}
