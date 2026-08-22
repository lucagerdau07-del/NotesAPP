package com.notes.school.ui.editor

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class EditorScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private fun render(
        state: EditorUiState = EditorUiState(
            title = "Zellaufbau.pdf",
            tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f)
        ),
        onBack: () -> Unit = {}
    ) {
        compose.setContent {
            NotesTheme {
                EditorContent(
                    state = state,
                    scene = InkScene("page-1"),
                    onBack = onBack,
                    onTool = {}, onColor = {}, onWidth = {}, onUndo = {}, onRedo = {},
                    onStrokeCommitted = {}
                )
            }
        }
    }

    @Test
    fun theBackControlShowsTheFilenameWithALeadingChevron() {
        render()
        compose.onNodeWithText("‹ Zellaufbau.pdf").assertIsDisplayed()
    }

    @Test
    fun theBackControlReturnsToTheFileOverview() {
        var back = false
        render(onBack = { back = true })
        compose.onNodeWithTag("editor-back").performClick()
        assertEquals(true, back)
    }

    @Test
    fun thePalmIndicatorIsTheOnlyPersistentPalmAffordance() {
        render()
        compose.onNodeWithContentDescription("Palm protection").assertIsDisplayed()
        compose.onNodeWithTag("palm-panel").assertDoesNotExist()
    }

    @Test
    fun thePalmIndicatorReflectsARejection() {
        render(
            EditorUiState(
                title = "Doc",
                tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f),
                palmStatus = PalmStatus.PALM_REJECTED
            )
        )
        compose.onNodeWithTag("palm-indicator-PALM_REJECTED").assertIsDisplayed()
    }

    @Test
    fun lowConfidenceKeepsWritingAvailableAndOffersRecalibrationAsASuggestion() {
        render(
            EditorUiState(
                title = "Doc",
                tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f),
                palmStatus = PalmStatus.LOW_CONFIDENCE
            )
        )
        compose.onNodeWithTag("ink-surface").assertIsDisplayed()
        compose.onNodeWithTag("palm-indicator-LOW_CONFIDENCE").assertIsDisplayed()
    }

    @Test
    fun theInkSurfaceFillsTheWorkspaceBesideTheRail() {
        render()
        compose.onNodeWithTag("ink-surface").assertIsDisplayed()
        compose.onNodeWithTag("tool-rail").assertIsDisplayed()
    }
}
