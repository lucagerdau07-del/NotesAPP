package com.notes.school

import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.notes.school.core.ToolKind
import com.notes.school.ink.InkScene
import com.notes.school.ink.InkView
import com.notes.school.ink.ToolSettings
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the SM-T505. The spec's budget is p95 <= 40 ms from input sample to visible
 * trace; this measures the app-side portion of that path — the time from delivering a
 * MotionEvent to the invalidate request returning.
 */
@RunWith(AndroidJUnit4::class)
class InkLatencyTest {

    @Test
    fun theInputPathStaysInsideTheFrameBudgetAtP95() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val view = InkView(context).apply {
            scene = InkScene("page-1")
            tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f)
        }
        view.layout(0, 0, 1340, 800)

        val samples = mutableListOf<Long>()
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(
            MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, 20f, 400f, 0)
        )
        repeat(500) { i ->
            val event = MotionEvent.obtain(
                downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE,
                20f + i * 2f, 400f + (i % 7), 0
            )
            val start = System.nanoTime()
            view.dispatchTouchEvent(event)
            samples += System.nanoTime() - start
            event.recycle()
        }

        val p95 = samples.sorted()[(samples.size * 0.95).toInt()] / 1_000_000.0
        assertTrue("p95 input handling was $p95 ms", p95 <= 40.0)
    }

    @Test
    fun aLongStrokeDoesNotDegradeSampleHandlingOverTime() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val view = InkView(context).apply {
            scene = InkScene("page-1")
            tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f)
        }
        view.layout(0, 0, 1340, 800)
        val downTime = SystemClock.uptimeMillis()
        view.dispatchTouchEvent(
            MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, 10f, 100f, 0)
        )

        fun batch(offset: Int): Double {
            val times = (0 until 200).map { i ->
                val event = MotionEvent.obtain(
                    downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE,
                    10f + (offset + i) % 1300, 100f + i % 500, 0
                )
                val start = System.nanoTime()
                view.dispatchTouchEvent(event)
                val elapsed = System.nanoTime() - start
                event.recycle()
                elapsed
            }
            return times.average() / 1_000_000.0
        }

        val early = batch(0)
        repeat(10) { batch(it * 200) }
        val late = batch(4000)
        assertTrue("handling grew from $early ms to $late ms", late < early * 3 + 1)
    }
}
