package com.notes.school.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notes.school.ui.LocalViewModelFactory

@Composable
fun SettingsRoute(onBack: () -> Unit, onOpenAdvanced: () -> Unit, onRecalibrate: () -> Unit) {
    val factory = LocalViewModelFactory.current
    if (factory != null) {
        val viewModel: PalmSettingsViewModel = viewModel(factory = factory)
        val state by viewModel.state.collectAsStateWithLifecycle()
        SettingsScreen(
            state = state,
            onBack = onBack,
            onOpenAdvanced = onOpenAdvanced,
            onRecalibrate = onRecalibrate,
            onAutoImprove = viewModel::setAutoImprove,
            onSafetyMode = viewModel::setSafetyMode
        )
    } else {
        SettingsScreen(
            state = PalmSettingsUiState(),
            onBack = onBack,
            onOpenAdvanced = onOpenAdvanced,
            onRecalibrate = onRecalibrate,
            onAutoImprove = {},
            onSafetyMode = {}
        )
    }
}
