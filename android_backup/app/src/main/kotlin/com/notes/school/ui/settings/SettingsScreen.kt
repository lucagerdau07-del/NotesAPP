package com.notes.school.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun SettingsScreen(
    state: PalmSettingsUiState,
    onBack: () -> Unit,
    onOpenAdvanced: () -> Unit,
    onRecalibrate: () -> Unit,
    onAutoImprove: (Boolean) -> Unit,
    onSafetyMode: (Boolean) -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("settings-screen")
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .glassSurface(cornerRadius = 14.dp)
                .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
                .clickable(onClick = onBack)
                .padding(horizontal = 16.dp)
                .testTag("settings-back")
        ) {
            Text("‹ Settings", color = NotesColors.OnSurface, style = MaterialTheme.typography.titleMedium)
        }

        Spacer(Modifier.height(24.dp))

        // Profile Status Row
        val profile = state.profile
        val isCalibrated = profile != null
        val scorePercent = if (profile != null) (profile.score * 100).toInt() else 0

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .glassSurface()
                .padding(16.dp)
                .testTag("profile-status")
        ) {
            Column {
                Text(
                    text = if (isCalibrated) "Calibrated ($scorePercent%)" else "Not calibrated",
                    color = NotesColors.OnSurface,
                    style = MaterialTheme.typography.titleMedium
                )
                if (isCalibrated) {
                    Text(
                        text = "Revision ${profile!!.revision}",
                        color = NotesColors.OnSurfaceMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }

            Button(
                onClick = onRecalibrate,
                modifier = Modifier.testTag("recalibrate-button")
            ) {
                Text("Recalibrate")
            }
        }

        Spacer(Modifier.height(16.dp))

        // Improve Profile Automatically Row
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .glassSurface()
                .padding(16.dp)
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Improve profile automatically",
                    color = NotesColors.OnSurface,
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    if (state.autoImproveEnabled) "On" else "Off",
                    color = NotesColors.OnSurfaceMuted,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.testTag("auto-improve-state")
                )
            }
            Switch(
                checked = state.autoImproveEnabled,
                onCheckedChange = onAutoImprove,
                modifier = Modifier.testTag("auto-improve-switch")
            )
        }

        Spacer(Modifier.height(16.dp))

        // 25% Safety Mode Row
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .glassSurface()
                .padding(16.dp)
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "25% safety mode",
                    color = NotesColors.OnSurface,
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    if (state.safetyModeEnabled) "On" else "Off",
                    color = NotesColors.OnSurfaceMuted,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.testTag("safety-mode-state")
                )
            }
            Switch(
                checked = state.safetyModeEnabled,
                onCheckedChange = onSafetyMode,
                modifier = Modifier.testTag("safety-mode-switch")
            )
        }

        Spacer(Modifier.height(16.dp))

        // Advanced Settings Row
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .glassSurface()
                .clip(RoundedCornerShape(20.dp))
                .clickable(onClick = onOpenAdvanced)
                .padding(16.dp)
                .testTag("advanced-settings-row")
        ) {
            Text(
                "Advanced settings ›",
                color = NotesColors.OnSurface,
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}
