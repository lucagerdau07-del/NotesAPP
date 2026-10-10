package com.notes.school.ui.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.notes.school.core.Handedness
import com.notes.school.core.InputFeature
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class SettingsScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val profile = PalmProfile.defaults(
        "samsung/SM-T505/31", ScreenOrientation.LANDSCAPE, Handedness.RIGHT,
        setOf(InputFeature.SIZE)
    ).copy(score = 0.94f, stable = true, revision = 3)

    private val state = PalmSettingsUiState(
        profile = profile,
        autoImproveEnabled = true,
        safetyModeEnabled = false,
        reducedTransparency = false
    )

    @Test
    fun theDefaultPageShowsStatusRecalibrateAutoImproveAndSafetyMode() {
        compose.setContent { NotesTheme { SettingsScreen(state, {}, {}, {}, {}, {}) } }
        compose.onNodeWithText("Recalibrate").assertIsDisplayed()
        compose.onNodeWithText("Improve profile automatically").assertIsDisplayed()
        compose.onNodeWithText("25% safety mode").assertIsDisplayed()
        compose.onNodeWithTag("profile-status").assertIsDisplayed()
    }

    @Test
    fun theExplanatoryCardsAreNotShownInProduction() {
        compose.setContent { NotesTheme { SettingsScreen(state, {}, {}, {}, {}, {}) } }
        listOf("Local", "Bounded", "Reversible").forEach {
            compose.onNodeWithText(it).assertDoesNotExist()
        }
    }

    @Test
    fun theAdvancedRowOpensTheSubpage() {
        var opened = false
        compose.setContent { NotesTheme { SettingsScreen(state, {}, { opened = true }, {}, {}, {}) } }
        compose.onNodeWithTag("advanced-settings-row").performClick()
        assertEquals(true, opened)
    }

    @Test
    fun toggleStateIsCommunicatedByTextAsWellAsColor() {
        compose.setContent { NotesTheme { SettingsScreen(state, {}, {}, {}, {}, {}) } }
        compose.onNodeWithTag("auto-improve-state").assertIsDisplayed()
    }

    @Test
    fun theAdvancedPageExposesBiasSmallContactAndDecisionWindow() {
        compose.setContent { NotesTheme { PalmAdvancedScreen(state, {}, { _, _ -> }, {}) } }
        compose.onNodeWithTag("threshold-${ThresholdKey.PEN_BIAS}").assertIsDisplayed()
        compose.onNodeWithTag("threshold-${ThresholdKey.SMALL_CONTACT_WEIGHT}").assertIsDisplayed()
        compose.onNodeWithTag("threshold-${ThresholdKey.DECISION_WINDOW_MS}").assertIsDisplayed()
        compose.onNodeWithTag("palm-test-surface").assertIsDisplayed()
        compose.onNodeWithTag("reset-profile").assertIsDisplayed()
    }

    @Test
    fun aThresholdChangeIsReportedWithItsKey() {
        var seen: Pair<ThresholdKey, Float>? = null
        compose.setContent {
            NotesTheme { PalmAdvancedScreen(state, {}, { key, value -> seen = key to value }, {}) }
        }
        compose.onNodeWithTag("threshold-${ThresholdKey.PEN_BIAS}-max").performClick()
        assertEquals(ThresholdKey.PEN_BIAS, seen!!.first)
    }

    @Test
    fun resettingTheProfileIsReported() {
        var reset = false
        compose.setContent { NotesTheme { PalmAdvancedScreen(state, {}, { _, _ -> }, { reset = true }) } }
        compose.onNodeWithTag("reset-profile").performClick()
        assertEquals(true, reset)
    }
}
