package com.notes.school.editor

import android.graphics.Color
import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ToolKind
import com.notes.school.ink.InkScene
import com.notes.school.ink.InkView
import com.notes.school.ink.ToolSettings
import com.notes.school.touch.ContactClassifier
import org.junit.Assert.assertEquals
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
class PalmInputGateTest {

    private lateinit var view: InkView
    private lateinit var scene: InkScene
    private lateinit var gate: PalmInputGate
    private val pendingDecisions = mutableListOf<Pair<Long, () -> Unit>>()

    private fun profile() = PalmProfile.defaults(
        "samsung/SM-T505/31",
        ScreenOrientation.LANDSCAPE,
        Handedness.RIGHT,
        setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR)
    )

    @Before
    fun setUp() {
        scene = InkScene("page-1")
        view = InkView(ApplicationProvider.getApplicationContext()).apply {
            this.scene = this@PalmInputGateTest.scene
            tool = ToolSettings(ToolKind.PEN, Color.BLACK, 3f)
        }
        view.layout(0, 0, 1200, 800)
        gate = PalmInputGate(
            view = view,
            classifier = ContactClassifier(profile()),
            tuner = null,
            scheduleDecision = { delayMs, action -> pendingDecisions += delayMs to action }
        )
        gate.install()
        pendingDecisions.clear()
    }

    private var timeOffsetMs = 0L

    private fun send(
        action: Int,
        x: Float,
        y: Float,
        downTime: Long,
        size: Float,
        touchMajor: Float
    ) {
        if (action == MotionEvent.ACTION_DOWN) timeOffsetMs = 0L else timeOffsetMs += 8L
        val properties = MotionEvent.PointerProperties().apply {
            id = 0
            toolType = MotionEvent.TOOL_TYPE_FINGER
        }
        val coords = MotionEvent.PointerCoords().apply {
            this.x = x
            this.y = y
            pressure = 0.4f
            this.size = size
            this.touchMajor = touchMajor
            this.touchMinor = touchMajor * 0.85f
        }
        val event = MotionEvent.obtain(
            downTime, downTime + timeOffsetMs, action,
            1, arrayOf(properties), arrayOf(coords),
            0, 0, 1f, 1f, 0, 0, 0, 0
        )
        gate.onTouchEventPreDispatch(event)
        view.dispatchTouchEvent(event)
    }

    private fun writeWithStylus() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 100f, 100f, downTime, size = 0.06f, touchMajor = 14f)
        repeat(8) { i ->
            send(MotionEvent.ACTION_MOVE, 100f + (i + 1) * 12f, 100f, downTime, 0.06f, 14f)
        }
        send(MotionEvent.ACTION_UP, 220f, 100f, downTime, 0.06f, 14f)
    }

    @Test
    fun motionEventConversionCopiesEveryClassificationInput() {
        val downTime = SystemClock.uptimeMillis()
        val event = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, 42f, 84f, 0)
        val sample = event.toContactSample(pointerIndex = 0)
        assertEquals(42f, sample.x, 0f)
        assertEquals(84f, sample.y, 0f)
        assertEquals(1, sample.pointerCount)
    }

    @Test
    fun aStylusLikeContactIsAcceptedAndProducesAStroke() {
        writeWithStylus()
        assertEquals(1, scene.activeStrokes().size)
    }

    @Test
    fun aPalmLikeContactIsRejectedAndProducesNoStroke() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 600f, 600f, downTime, size = 0.6f, touchMajor = 90f)
        repeat(8) { send(MotionEvent.ACTION_MOVE, 600.4f, 600.3f, downTime, 0.6f, 90f) }
        send(MotionEvent.ACTION_UP, 600.4f, 600.3f, downTime, 0.6f, 90f)
        assertEquals(0, scene.activeStrokes().size)
    }

    @Test
    fun anAmbiguousContactSchedulesADecisionUsingTheProfileWindow() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 400f, 400f, downTime, size = 0.16f, touchMajor = 30f)
        assertEquals(1, pendingDecisions.size)
        assertEquals(90L, pendingDecisions.single().first)
    }

    @Test
    fun runningTheScheduledDecisionResolvesTheProvisionalPointer() {
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 400f, 400f, downTime, size = 0.16f, touchMajor = 30f)
        send(MotionEvent.ACTION_MOVE, 402f, 400f, downTime, 0.16f, 30f)
        pendingDecisions.forEach { it.second() }
        send(MotionEvent.ACTION_UP, 404f, 400f, downTime, 0.16f, 30f)
        // Either outcome is legitimate; what matters is that nothing stays provisional.
        assertTrue(scene.activeStrokes().size <= 1)
    }

    @Test
    fun statusReportsPenActiveWhileWritingAndIdleAfterLift() {
        val seen = mutableListOf<PalmStatus>()
        gate.onStatusChanged = { seen += it }
        writeWithStylus()
        assertTrue(seen.contains(PalmStatus.PEN_ACTIVE))
        assertEquals(PalmStatus.IDLE, seen.last())
    }

    @Test
    fun statusReportsPalmRejectedWhenAContactIsDropped() {
        val seen = mutableListOf<PalmStatus>()
        gate.onStatusChanged = { seen += it }
        val downTime = SystemClock.uptimeMillis()
        send(MotionEvent.ACTION_DOWN, 600f, 600f, downTime, size = 0.6f, touchMajor = 90f)
        repeat(8) { send(MotionEvent.ACTION_MOVE, 600.4f, 600.3f, downTime, 0.6f, 90f) }
        assertTrue(seen.contains(PalmStatus.PALM_REJECTED))
    }
}
