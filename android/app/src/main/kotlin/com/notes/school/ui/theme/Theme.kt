package com.notes.school.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color

/** Everything outside the page is dark; the page itself is paper white. */
object NotesColors {
    val Workspace = Color(0xFF121316)
    val Surface = Color(0xFF1B1D21)
    val SurfaceRaised = Color(0xFF24272C)
    val Page = Color.White
    val Accent = Color(0xFF7AA2F7)
    val OnSurface = Color(0xFFE7E9EE)
    val OnSurfaceMuted = Color(0xFF9AA0AA)
    val Danger = Color(0xFFE5484D)
}

private val scheme = darkColorScheme(
    background = NotesColors.Workspace,
    surface = NotesColors.Surface,
    surfaceVariant = NotesColors.SurfaceRaised,
    primary = NotesColors.Accent,
    onBackground = NotesColors.OnSurface,
    onSurface = NotesColors.OnSurface,
    onSurfaceVariant = NotesColors.OnSurfaceMuted,
    error = NotesColors.Danger
)

@Composable
fun NotesTheme(glass: GlassSettings = GlassSettings(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalGlassSettings provides glass) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
