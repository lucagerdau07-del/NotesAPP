package com.notes.school.ui.editor

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notes.school.core.ToolKind
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.LocalViewModelFactory

@Composable
fun EditorRoute(documentId: String, onBack: () -> Unit) {
    BackHandler { onBack() }
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
