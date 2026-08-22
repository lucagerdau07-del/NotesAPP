package com.notes.school.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class NavigationTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theAppStartsOnTheFileOverview() {
        compose.setContent { NotesApp() }
        compose.onNodeWithTag("files-screen").assertIsDisplayed()
    }

    @Test
    fun editorRouteBuildsWithTheDocumentId() {
        assertEquals("editor/abc-123", Destinations.editor("abc-123"))
    }

    @Test
    fun theSidebarSettingsEntryOpensTheSettingsScreen() {
        compose.setContent { NotesApp() }
        compose.onNodeWithTag("sidebar-settings").performClick()
        compose.onNodeWithTag("settings-screen").assertIsDisplayed()
    }
}
