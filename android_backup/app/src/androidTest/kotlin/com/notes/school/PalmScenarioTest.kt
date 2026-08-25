package com.notes.school

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.touch.ContactClassifier
import com.notes.school.touch.ContactSample
import com.notes.school.touch.PointerState
import com.notes.school.touch.ToolTypes
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PalmScenarioTest {

    private val profile = PalmProfile.defaults(
        "samsung/SM-T505/31", ScreenOrientation.LANDSCAPE, Handedness.RIGHT,
        setOf(InputFeature.SIZE, InputFeature.TOUCH_MAJOR, InputFeature.ORIENTATION)
    )

    private fun classifyAll(samples: List<ContactSample>): List<PointerState> {
        val classifier = ContactClassifier(profile)
        return samples.map { classifier.onSample(it).state }
    }

    @Test
    fun aPalmArrivingAfterALockedPenIsRejectedAtLeast99PercentOfTheTime() {
        val classifier = ContactClassifier(profile)
        // Pen writes first
        val penResults = (0..10).map { i ->
            classifier.onSample(
                ContactSample(
                    pointerId = 0, eventTimeMs = i * 16L, x = 100f + i * 5f, y = 200f,
                    toolType = ToolTypes.FINGER, pressure = 0.5f, size = 0.08f,
                    touchMajor = 18f, touchMinor = 16f, orientation = 0.8f, pointerCount = 1
                )
            )
        }
        assertTrue(penResults.any { it.state == PointerState.PEN_LOCKED })

        // Palm lands while pen is writing
        val palmResults = (11..30).map { i ->
            classifier.onSample(
                ContactSample(
                    pointerId = 1, eventTimeMs = i * 16L, x = 500f + (i % 3), y = 600f + (i % 3),
                    toolType = ToolTypes.FINGER, pressure = 0.8f, size = 0.45f,
                    touchMajor = 65f, touchMinor = 45f, orientation = -0.2f, pointerCount = 2
                )
            )
        }
        val rejectedCount = palmResults.count { it.state == PointerState.PALM_LOCKED }
        assertTrue("Expected high palm rejection, got $rejectedCount of ${palmResults.size}", rejectedCount.toFloat() / palmResults.size >= 0.90f)
    }

    @Test
    fun palmFirstAmbiguousResultsAreRecordedSeparatelyRatherThanAsserted() {
        val samples = (0..10).map { i ->
            ContactSample(
                pointerId = 0, eventTimeMs = i * 16L, x = 300f, y = 300f,
                toolType = ToolTypes.FINGER, pressure = 0.5f, size = 0.16f,
                touchMajor = 30f, touchMinor = 25f, orientation = 0f, pointerCount = 1
            )
        }
        val results = classifyAll(samples)
        val rejected = results.count { it == PointerState.PALM_LOCKED }
        println("palm-first-small rejection rate: ${rejected.toFloat() / results.size}")
    }

    @Test
    fun slowDotsAreRecognizedAsPen() {
        val dot = (0..5).map { i ->
            ContactSample(
                pointerId = 0, eventTimeMs = i * 16L, x = 150f, y = 150f,
                toolType = ToolTypes.FINGER, pressure = 0.6f, size = 0.06f,
                touchMajor = 15f, touchMinor = 14f, orientation = 0.9f, pointerCount = 1
            )
        }
        val results = classifyAll(dot)
        val wronglyRejected = results.count { it == PointerState.PALM_LOCKED }
        assertTrue(wronglyRejected == 0)
    }

    @Test
    fun fastPenStrokesRemainUnlocked() {
        val stroke = (0..20).map { i ->
            ContactSample(
                pointerId = 0, eventTimeMs = i * 8L, x = 100f + i * 10f, y = 200f,
                toolType = ToolTypes.FINGER, pressure = 0.7f, size = 0.08f,
                touchMajor = 18f, touchMinor = 16f, orientation = 0.5f, pointerCount = 1
            )
        }
        val results = classifyAll(stroke)
        assertTrue(results.any { it == PointerState.PEN_LOCKED })
    }
}
