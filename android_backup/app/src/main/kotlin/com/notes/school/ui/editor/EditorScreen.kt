package com.notes.school.ui.editor

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BackHand
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.LocalViewModelFactory
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

data class EditorUiState(
    val title: String = "",
    val tool: ToolSettings,
    val palmStatus: PalmStatus = PalmStatus.IDLE,
    val canUndo: Boolean = false,
    val canRedo: Boolean = false,
    val safetyModeEnabled: Boolean = false
)

@Composable
fun EditorScreen(documentId: String, onBack: () -> Unit) {
    BackHandler(enabled = true) { onBack() }
    val factory = LocalViewModelFactory.current
    if (factory != null) {
        val viewModel: EditorViewModel = viewModel(factory = factory)
        val state by viewModel.state.collectAsStateWithLifecycle()
        LaunchedEffect(documentId) { viewModel.open(documentId) }
        EditorContent(
            state = state,
            scene = viewModel.scene,
            onBack = onBack,
            onTool = viewModel::selectTool,
            onColor = viewModel::setColor,
            onWidth = viewModel::setWidth,
            onUndo = viewModel::undo,
            onRedo = viewModel::redo,
            onStrokeCommitted = viewModel::onStrokeCommitted
        )
    } else {
        EditorContent(
            state = EditorUiState(
                title = documentId,
                tool = ToolSettings(ToolKind.PEN, PEN_COLORS.first(), PEN_WIDTHS[1])
            ),
            scene = InkScene(documentId),
            onBack = onBack,
            onTool = {},
            onColor = {},
            onWidth = {},
            onUndo = {},
            onRedo = {},
            onStrokeCommitted = {}
        )
    }
}

@Composable
fun EditorContent(
    state: EditorUiState,
    scene: InkScene,
    onBack: () -> Unit,
    onTool: (ToolKind) -> Unit,
    onColor: (Int) -> Unit,
    onWidth: (Float) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onStrokeCommitted: (Stroke) -> Unit
) {
    Box(Modifier.fillMaxSize().testTag("editor-screen")) {
        InkSurface(
            scene = scene,
            tool = state.tool,
            onStrokeCommitted = onStrokeCommitted,
            modifier = Modifier.fillMaxSize().padding(start = 88.dp, top = 72.dp)
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(12.dp)
                .glassSurface(cornerRadius = 14.dp)
                .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
                .clickable(onClick = onBack)
                .padding(horizontal = 16.dp)
                .testTag("editor-back")
        ) {
            Text("‹ ${state.title}", color = NotesColors.OnSurface)
        }

        Box(Modifier.align(Alignment.CenterStart).padding(start = 12.dp)) {
            ToolRail(state, onTool, onColor, onWidth, onUndo, onRedo)
        }

        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp)
                .size(MIN_TOUCH_TARGET_DP.dp)
                .glassSurface(cornerRadius = 24.dp)
                .testTag("palm-indicator-${state.palmStatus.name}")
                .semantics { contentDescription = "Palm protection" }
        ) {
            Icon(
                Icons.Filled.BackHand,
                contentDescription = null,
                tint = when (state.palmStatus) {
                    PalmStatus.PALM_REJECTED -> NotesColors.Accent
                    PalmStatus.LOW_CONFIDENCE -> NotesColors.Danger
                    else -> NotesColors.OnSurfaceMuted
                },
                modifier = Modifier.size(22.dp)
            )
        }
    }
}
