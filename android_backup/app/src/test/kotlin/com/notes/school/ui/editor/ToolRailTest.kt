package com.notes.school.ui.editor

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class ToolRailTest {

    @get:Rule
    val compose = createComposeRule()

    private fun state(kind: ToolKind = ToolKind.PEN, canUndo: Boolean = true, canRedo: Boolean = false) =
        EditorUiState(
            title = "Zellaufbau.pdf",
            tool = ToolSettings(kind, 0xFF2C2825.toInt(), 3f),
            palmStatus = PalmStatus.IDLE,
            canUndo = canUndo,
            canRedo = canRedo
        )

    private fun render(
        s: EditorUiState = state(),
        onTool: (ToolKind) -> Unit = {},
        onColor: (Int) -> Unit = {},
        onWidth: (Float) -> Unit = {},
        onUndo: () -> Unit = {},
        onRedo: () -> Unit = {}
    ) {
        compose.setContent { NotesTheme { ToolRail(s, onTool, onColor, onWidth, onUndo, onRedo) } }
    }

    @Test
    fun theRailShowsExactlyTheSixSpecifiedControls() {
        render()
        listOf("Pen", "Highlighter", "Eraser", "Lasso", "Undo", "Redo").forEach {
            compose.onNodeWithContentDescription(it).assertIsDisplayed()
        }
    }

    @Test
    fun everyRailControlMeetsTheMinimumTouchTarget() {
        render()
        listOf("tool-pen", "tool-highlighter", "tool-eraser", "tool-lasso", "tool-undo", "tool-redo")
            .forEach { tag ->
                compose.onNodeWithTag(tag).assertWidthIsAtLeast(MIN_TOUCH_TARGET_DP.dp)
                compose.onNodeWithTag(tag).assertHeightIsAtLeast(MIN_TOUCH_TARGET_DP.dp)
            }
    }

    @Test
    fun tappingAToolSelectsIt() {
        var selected: ToolKind? = null
        render(onTool = { selected = it })
        compose.onNodeWithTag("tool-highlighter").performClick()
        assertEquals(ToolKind.HIGHLIGHTER, selected)
    }

    @Test
    fun theColorPopoverStaysClosedUntilTheActiveToolIsTappedAgain() {
        render()
        compose.onNodeWithTag("tool-popover").assertIsNotDisplayed()
        compose.onNodeWithTag("tool-pen").performClick()
        compose.onNodeWithTag("tool-popover").assertIsDisplayed()
    }

    @Test
    fun thePopoverReportsAColorChoice() {
        var color: Int? = null
        render(onColor = { color = it })
        compose.onNodeWithTag("tool-pen").performClick()
        compose.onNodeWithTag("color-${PEN_COLORS[1]}").performClick()
        assertEquals(PEN_COLORS[1], color)
    }

    @Test
    fun thePopoverReportsAWidthChoice() {
        var width: Float? = null
        render(onWidth = { width = it })
        compose.onNodeWithTag("tool-pen").performClick()
        compose.onNodeWithTag("width-${PEN_WIDTHS.last()}").performClick()
        assertEquals(PEN_WIDTHS.last(), width)
    }

    @Test
    fun undoAndRedoReportTheirTaps() {
        var undone = false
        var redone = false
        render(state(canUndo = true, canRedo = true), onUndo = { undone = true }, onRedo = { redone = true })
        compose.onNodeWithTag("tool-undo").performClick()
        compose.onNodeWithTag("tool-redo").performClick()
        assertEquals(true, undone)
        assertEquals(true, redone)
    }

    @Test
    fun calibrationAndSafetyModeAreNotReachableFromTheEditorRail() {
        render()
        compose.onNodeWithTag("tool-calibrate").assertIsNotDisplayed()
        compose.onNodeWithTag("tool-safety-mode").assertIsNotDisplayed()
    }
}
