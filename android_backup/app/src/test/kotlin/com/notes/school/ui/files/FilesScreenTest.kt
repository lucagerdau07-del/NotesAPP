package com.notes.school.ui.files

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
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
class FilesScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val state = FilesUiState(
        section = FilesSection.MY_FILES,
        folders = listOf(
            Folder("f1", null, "Biologie", 0, 1L, 1L),
            Folder("f2", null, "Mathe", 1, 1L, 1L)
        ),
        documents = listOf(
            DocumentMeta("d1", "f1", "Zellaufbau", DocumentKind.PDF, 1L, 20L),
            DocumentMeta("d2", "f2", "Bruchrechnen", DocumentKind.LINED, 1L, 10L)
        )
    )

    private fun render(
        onOpenDocument: (String) -> Unit = {},
        onSection: (FilesSection) -> Unit = {},
        onSearch: (String) -> Unit = {},
        onOpenSettings: () -> Unit = {},
        onNewDocument: (DocumentKind) -> Unit = {}
    ) {
        compose.setContent {
            NotesTheme {
                FilesScreen(state, onSection, onSearch, onOpenDocument, onOpenSettings, onNewDocument)
            }
        }
    }

    @Test
    fun theSidebarShowsEverySection() {
        render()
        listOf("My Files", "Recent", "Favorites", "Trash", "Settings").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
    }

    @Test
    fun folderCardsAreListedBeforeRecentDocuments() {
        render()
        compose.onNodeWithText("Biologie").assertIsDisplayed()
        compose.onNodeWithText("Zellaufbau").assertIsDisplayed()
    }

    @Test
    fun tappingADocumentOpensIt() {
        var opened: String? = null
        render(onOpenDocument = { opened = it })
        compose.onNodeWithTag("document-d1").performClick()
        assertEquals("d1", opened)
    }

    @Test
    fun selectingASidebarSectionReportsIt() {
        var section: FilesSection? = null
        render(onSection = { section = it })
        compose.onNodeWithTag("sidebar-favorites").performClick()
        assertEquals(FilesSection.FAVORITES, section)
    }

    @Test
    fun typingInTheSearchFieldReportsTheQuery() {
        var query = ""
        render(onSearch = { query = it })
        compose.onNodeWithTag("search-field").performTextInput("Zell")
        assertEquals("Zell", query)
    }

    @Test
    fun creatingANewDocumentReportsTheChosenPaperKind() {
        var kind: DocumentKind? = null
        render(onNewDocument = { kind = it })
        compose.onNodeWithTag("new-document").performClick()
        compose.onNodeWithTag("new-document-GRID").performClick()
        assertEquals(DocumentKind.GRID, kind)
    }

    @Test
    fun everySidebarEntryMeetsTheMinimumTouchTarget() {
        render()
        listOf("sidebar-my-files", "sidebar-recent", "sidebar-favorites", "sidebar-trash", "sidebar-settings")
            .forEach {
                compose.onNodeWithTag(it).assertHeightIsAtLeast(MIN_TOUCH_TARGET_DP.dp)
            }
    }

    @Test
    fun anEmptySectionShowsAnEmptyStateInsteadOfABlankPane() {
        compose.setContent {
            NotesTheme {
                FilesScreen(
                    FilesUiState(section = FilesSection.TRASH),
                    {}, {}, {}, {}, {}
                )
            }
        }
        compose.onNodeWithTag("empty-state").assertIsDisplayed()
    }
}
