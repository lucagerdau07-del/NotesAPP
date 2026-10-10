package com.notes.school.ui.editor

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.notes.school.core.ToolKind
import com.notes.school.editor.FocusBox
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.theme.NotesTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], qualifiers = "w1340dp-h800dp-land")
class SafetyModeLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private fun render() {
        compose.setContent {
            NotesTheme {
                SafetyModeLayout(
                    scene = InkScene("page-1"),
                    focus = FocusBox(50f, 50f, 400f, 100f),
                    state = EditorUiState(
                        title = "Doc",
                        tool = ToolSettings(ToolKind.PEN, 0xFF2C2825.toInt(), 3f),
                        safetyModeEnabled = true
                    ),
                    onFocusChange = {},
                    onStrokeCommitted = {}
                )
            }
        }
    }

    @Test
    fun bothTheDocumentAndTheWritingPadAreVisible() {
        render()
        compose.onNodeWithTag("safety-document").assertIsDisplayed()
        compose.onNodeWithTag("safety-pad").assertIsDisplayed()
    }

    @Test
    fun theWritingPadSitsOnTheRightSoTheHandStaysOffTheDocument() {
        render()
        val document = compose.onNodeWithTag("safety-document").getBoundsInRoot()
        val pad = compose.onNodeWithTag("safety-pad").getBoundsInRoot()
        assertTrue(pad.left >= document.right)
    }

    @Test
    fun theFocusRectangleIsDrawnOnTheDocument() {
        render()
        compose.onNodeWithTag("focus-box").assertIsDisplayed()
    }
}
