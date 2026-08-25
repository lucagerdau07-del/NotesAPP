package com.notes.school.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import com.notes.school.core.ThresholdKey
import com.notes.school.storage.PalmProfileStore
import com.notes.school.touch.CalibrationPhase
import com.notes.school.touch.Calibrator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PalmSettingsUiState(
    val profile: PalmProfile? = null,
    val autoImproveEnabled: Boolean = true,
    val safetyModeEnabled: Boolean = false,
    val reducedTransparency: Boolean = false
)

data class CalibrationSessionState(
    val phase: CalibrationPhase = CalibrationPhase.PALM_ONLY,
    val progress: Float = 0f
)

class PalmSettingsViewModel(
    private val profileStore: PalmProfileStore,
    private val device: String = "samsung/SM-T505/31",
    private val orientation: ScreenOrientation = ScreenOrientation.LANDSCAPE
) : ViewModel() {

    private val _state = MutableStateFlow(PalmSettingsUiState())
    val state: StateFlow<PalmSettingsUiState> = _state.asStateFlow()

    private val _calibrationSession = MutableStateFlow(CalibrationSessionState())
    val calibrationSession: StateFlow<CalibrationSessionState> = _calibrationSession.asStateFlow()

    private val calibrator = Calibrator()

    init {
        loadProfile()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            val profile = profileStore.loadStable(device, orientation)
                ?: profileStore.loadLatest(device, orientation)
            _state.update { it.copy(profile = profile) }
        }
    }

    fun setAutoImprove(enabled: Boolean) {
        _state.update { it.copy(autoImproveEnabled = enabled) }
    }

    fun setSafetyMode(enabled: Boolean) {
        _state.update { it.copy(safetyModeEnabled = enabled) }
    }

    fun setReducedTransparency(enabled: Boolean) {
        _state.update { it.copy(reducedTransparency = enabled) }
    }

    fun setThreshold(key: ThresholdKey, value: Float) {
        val current = _state.value.profile ?: return
        val updated = current.withThresholds(current.thresholds.with(key, value))
        _state.update { it.copy(profile = updated) }
        viewModelScope.launch {
            profileStore.save(updated)
        }
    }

    fun resetProfile() {
        viewModelScope.launch {
            profileStore.reset(device, orientation)
            _state.update { it.copy(profile = null) }
        }
    }

    fun onCalibrationProgress(phase: CalibrationPhase, progress: Float) {
        _calibrationSession.update { it.copy(phase = phase, progress = progress) }
    }
}
