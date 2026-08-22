package com.notes.school.ui.files

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notes.school.ui.LocalViewModelFactory

@Composable
fun FilesRoute(onOpenDocument: (String) -> Unit, onOpenSettings: () -> Unit) {
    val factory = LocalViewModelFactory.current
    if (factory != null) {
        val viewModel: FilesViewModel = viewModel(factory = factory)
        val state by viewModel.state.collectAsStateWithLifecycle()
        FilesScreen(
            state = state,
            onSection = viewModel::select,
            onSearch = viewModel::search,
            onOpenDocument = onOpenDocument,
            onOpenSettings = onOpenSettings,
            onNewDocument = { kind -> viewModel.createDocument(kind, "Untitled", onOpenDocument) }
        )
    } else {
        FilesScreen(
            state = FilesUiState(),
            onSection = {},
            onSearch = {},
            onOpenDocument = onOpenDocument,
            onOpenSettings = onOpenSettings,
            onNewDocument = {}
        )
    }
}
