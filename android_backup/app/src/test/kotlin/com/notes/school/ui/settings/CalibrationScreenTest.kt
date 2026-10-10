package com.notes.school.ui.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.notes.school.touch.CalibrationPhase
import com.notes.school.ui.theme.NotesTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class CalibrationScreenTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theFirstPhaseAsksForARestingPalm() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.PALM_ONLY, 0.1f) {} } }
        compose.onNodeWithText("Rest your hand on the screen and move it a little.").assertIsDisplayed()
    }

    @Test
    fun theSecondPhaseAsksForStylusOnlyWriting() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.STYLUS_ONLY, 0.4f) {} } }
        compose.onNodeWithText("Write a short line with the stylus, hand off the screen.").assertIsDisplayed()
    }

    @Test
    fun theThirdPhaseAsksForNormalWriting() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.COMBINED, 0.8f) {} } }
        compose.onNodeWithText("Now write the way you normally would, hand resting.").assertIsDisplayed()
    }

    @Test
    fun theCaptureSurfaceIsPresentInEveryPhase() {
        val currentPhase = androidx.compose.runtime.mutableStateOf(CalibrationPhase.PALM_ONLY)
        compose.setContent { NotesTheme { CalibrationScreen(currentPhase.value, 0.5f) {} } }
        CalibrationPhase.entries.forEach { phase ->
            currentPhase.value = phase
            compose.onNodeWithTag("calibration-surface").assertIsDisplayed()
        }
    }

    @Test
    fun progressIsShown() {
        compose.setContent { NotesTheme { CalibrationScreen(CalibrationPhase.PALM_ONLY, 0.33f) {} } }
        compose.onNodeWithTag("calibration-progress").assertIsDisplayed()
    }
}
