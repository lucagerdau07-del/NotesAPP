package com.notes.school.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notes.school.ui.LocalViewModelFactory

@Composable
fun PalmAdvancedRoute(onBack: () -> Unit) {
    val factory = LocalViewModelFactory.current
    if (factory != null) {
        val viewModel: PalmSettingsViewModel = viewModel(factory = factory)
        val state by viewModel.state.collectAsStateWithLifecycle()
        PalmAdvancedScreen(state, onBack, viewModel::setThreshold, viewModel::resetProfile)
    } else {
        PalmAdvancedScreen(PalmSettingsUiState(), onBack, { _, _ -> }, {})
    }
}
