package com.notes.school.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.notes.school.touch.CalibrationPhase
import com.notes.school.ui.LocalViewModelFactory

@Composable
fun CalibrationRoute(onDone: () -> Unit) {
    val factory = LocalViewModelFactory.current
    if (factory != null) {
        val viewModel: PalmSettingsViewModel = viewModel(factory = factory)
        val session by viewModel.calibrationSession.collectAsStateWithLifecycle()
        CalibrationScreen(session.phase, session.progress, onDone)
    } else {
        CalibrationScreen(CalibrationPhase.PALM_ONLY, 0f, onDone)
    }
}
