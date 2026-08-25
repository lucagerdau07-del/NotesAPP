package com.notes.school.ui.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.notes.school.core.Stroke
import com.notes.school.editor.FocusBox
import com.notes.school.editor.PadMapping
import com.notes.school.ink.InkScene
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun SafetyModeLayout(
    scene: InkScene,
    focus: FocusBox,
    state: EditorUiState,
    onFocusChange: (FocusBox) -> Unit,
    onStrokeCommitted: (Stroke) -> Unit
) {
    val padScene = remember { InkScene("safety-pad-scene") }
    var padSize by remember { mutableStateOf(IntSize(1, 1)) }

    Row(Modifier.fillMaxSize()) {
        // Document pane on the left (75% width)
        Box(
            Modifier
                .weight(0.75f)
                .fillMaxHeight()
                .padding(8.dp)
                .testTag("safety-document")
        ) {
            InkSurface(
                scene = scene,
                tool = state.tool,
                onStrokeCommitted = onStrokeCommitted,
                modifier = Modifier.fillMaxSize()
            )

            // Focus box overlay
            Box(
                Modifier
                    .offset(x = focus.x.dp, y = focus.y.dp)
                    .size(width = focus.width.dp, height = focus.height.dp)
                    .border(2.dp, NotesColors.Accent, RoundedCornerShape(4.dp))
                    .background(NotesColors.Accent.copy(alpha = 0.08f))
                    .testTag("focus-box")
            )
        }

        // Dedicated 25% writing pad on the right
        Box(
            Modifier
                .weight(0.25f)
                .fillMaxHeight()
                .padding(8.dp)
                .glassSurface(cornerRadius = 16.dp)
                .padding(8.dp)
                .onSizeChanged { padSize = it }
        ) {
            val padWidthPx = padSize.width.toFloat().coerceAtLeast(1f)
            val padHeightPx = padSize.height.toFloat().coerceAtLeast(1f)

            InkSurface(
                scene = padScene,
                tool = state.tool,
                onStrokeCommitted = { padStroke ->
                    val mapped = PadMapping.mapStroke(padStroke, padWidthPx, padHeightPx, focus)
                    val committed = scene.addStroke(mapped.tool, mapped.colorArgb, mapped.widthPx, mapped.points)
                    onStrokeCommitted(committed)
                },
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("safety-pad")
            )
        }
    }
}
