package com.notes.school.ui.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Highlight
import androidx.compose.material.icons.filled.Redo
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.notes.school.core.ToolKind
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

val PEN_COLORS: List<Int> = listOf(
    0xFF2C2825.toInt(), 0xFF1A73E8.toInt(), 0xFFE5484D.toInt(),
    0xFF2FA84F.toInt(), 0xFFFFB020.toInt()
)

val PEN_WIDTHS: List<Float> = listOf(1.5f, 3f, 5f, 8f)

/** Lasso is a selection mode rather than an ink tool, so it is tracked separately. */
enum class RailAction { PEN, HIGHLIGHTER, ERASER, LASSO }

@Composable
fun ToolRail(
    state: EditorUiState,
    onTool: (ToolKind) -> Unit,
    onColor: (Int) -> Unit,
    onWidth: (Float) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit
) {
    var popoverOpen by remember { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier
                .width(64.dp)
                .glassSurface()
                .padding(vertical = 8.dp)
                .testTag("tool-rail")
        ) {
            RailButton("Pen", Icons.Filled.Create, state.tool.kind == ToolKind.PEN, "tool-pen") {
                if (state.tool.kind == ToolKind.PEN) popoverOpen = !popoverOpen else onTool(ToolKind.PEN)
            }
            RailButton("Highlighter", Icons.Filled.Highlight, state.tool.kind == ToolKind.HIGHLIGHTER, "tool-highlighter") {
                if (state.tool.kind == ToolKind.HIGHLIGHTER) popoverOpen = !popoverOpen else onTool(ToolKind.HIGHLIGHTER)
            }
            RailButton("Eraser", Icons.Filled.Brush, state.tool.kind == ToolKind.ERASER, "tool-eraser") {
                onTool(ToolKind.ERASER)
                popoverOpen = false
            }
            RailButton("Lasso", Icons.Filled.Brush, false, "tool-lasso") { popoverOpen = false }
            RailButton("Undo", Icons.Filled.Undo, false, "tool-undo", enabled = state.canUndo, onClick = onUndo)
            RailButton("Redo", Icons.Filled.Redo, false, "tool-redo", enabled = state.canRedo, onClick = onRedo)
        }

        if (popoverOpen) {
            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .padding(start = 8.dp)
                    .glassSurface(cornerRadius = 16.dp)
                    .padding(12.dp)
                    .testTag("tool-popover")
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PEN_COLORS.forEach { argb ->
                        Box(
                            Modifier
                                .size(MIN_TOUCH_TARGET_DP.dp)
                                .clickable { onColor(argb) }
                                .testTag("color-$argb"),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(Modifier.size(24.dp).clip(CircleShape).background(Color(argb)))
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PEN_WIDTHS.forEach { width ->
                        Box(
                            Modifier
                                .size(MIN_TOUCH_TARGET_DP.dp)
                                .clickable { onWidth(width) }
                                .testTag("width-$width"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("${width.toInt()}", color = NotesColors.OnSurface)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RailButton(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    testTag: String,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            // The glyph is 22 dp; the target stays 48 dp as the spec requires.
            .size(MIN_TOUCH_TARGET_DP.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) NotesColors.SurfaceRaised else Color.Transparent)
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.35f)
            .testTag(testTag)
            .semantics { contentDescription = label }
    ) {
        Icon(icon, contentDescription = null, tint = NotesColors.OnSurface, modifier = Modifier.size(22.dp))
    }
}
