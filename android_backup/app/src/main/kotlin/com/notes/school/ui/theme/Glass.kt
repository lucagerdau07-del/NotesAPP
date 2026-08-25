package com.notes.school.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Every interactive control must be at least this large, however small its glyph is. */
const val MIN_TOUCH_TARGET_DP: Int = 48

/**
 * @param reducedTransparency user preference: replace glass with opaque high-contrast surfaces.
 * @param degraded set by the frame-time watchdog on the SM-T505; drops live effects.
 */
data class GlassSettings(
    val reducedTransparency: Boolean = false,
    val degraded: Boolean = false
)

val LocalGlassSettings = compositionLocalOf { GlassSettings() }

/**
 * Apple's Liquid Glass is not available on Android. This reproduces its hierarchy — a
 * translucent, edge-lit floating layer over stable dark content — without claiming to be
 * that material, and without a live refraction pass the SM-T505 cannot afford.
 *
 * Glass belongs on navigation and floating tool controls only. Content surfaces stay opaque.
 */
fun Modifier.glassSurface(cornerRadius: Dp = 20.dp): Modifier = composed {
    val settings = LocalGlassSettings.current
    val shape = RoundedCornerShape(cornerRadius)
    val base = clip(shape)
    when {
        settings.reducedTransparency ->
            base.background(NotesColors.SurfaceRaised, shape)
                .border(1.dp, NotesColors.OnSurfaceMuted.copy(alpha = 0.35f), shape)
        settings.degraded ->
            base.background(NotesColors.Surface.copy(alpha = 0.92f), shape)
                .border(1.dp, Color.White.copy(alpha = 0.08f), shape)
        else ->
            base.background(
                Brush.verticalGradient(
                    listOf(
                        Color.White.copy(alpha = 0.10f),
                        Color.White.copy(alpha = 0.04f)
                    )
                ),
                shape
            )
                .background(NotesColors.Surface.copy(alpha = 0.62f), shape)
                .border(1.dp, Color.White.copy(alpha = 0.14f), shape)
    }
}
