package com.notes.school.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.notes.school.ui.theme.GlassSettings
import com.notes.school.ui.theme.LocalGlassSettings
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.NotesTheme
import com.notes.school.ui.theme.glassSurface
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class ThemeTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theWorkspaceIsDarkAndThePageIsWhite() {
        assertEquals(Color.White, NotesColors.Page)
        assertNotEquals(Color.White, NotesColors.Workspace)
        // "Dark" means genuinely dark, not merely grey.
        assertEquals(true, NotesColors.Workspace.red < 0.2f)
    }

    @Test
    fun themeSuppliesADarkMaterialColorScheme() {
        var background = Color.Unspecified
        compose.setContent {
            NotesTheme { background = MaterialTheme.colorScheme.background }
        }
        assertEquals(NotesColors.Workspace, background)
    }

    @Test
    fun glassSurfaceRendersItsContent() {
        compose.setContent {
            NotesTheme {
                Box(Modifier.size(120.dp).glassSurface().testTag("glass")) { Text("rail") }
            }
        }
        compose.onNodeWithTag("glass").assertIsDisplayed()
    }

    @Test
    fun reducedTransparencyStillRendersTheSameContent() {
        compose.setContent {
            NotesTheme(glass = GlassSettings(reducedTransparency = true)) {
                Box(Modifier.size(120.dp).glassSurface().testTag("glass")) { Text("rail") }
            }
        }
        compose.onNodeWithTag("glass").assertIsDisplayed()
    }

    @Test
    fun glassSettingsAreReadableFromTheCompositionLocal() {
        var seen: GlassSettings? = null
        compose.setContent {
            CompositionLocalProvider(LocalGlassSettings provides GlassSettings(degraded = true)) {
                seen = LocalGlassSettings.current
            }
        }
        assertEquals(true, seen!!.degraded)
    }
}
