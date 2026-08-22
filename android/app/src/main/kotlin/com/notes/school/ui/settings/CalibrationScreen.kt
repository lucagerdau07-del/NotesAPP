package com.notes.school.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.notes.school.core.ToolKind
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.touch.CalibrationPhase
import com.notes.school.ui.editor.InkSurface
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun CalibrationScreen(
    phase: CalibrationPhase,
    progress: Float,
    onDone: () -> Unit
) {
    val calibrationScene = remember { InkScene("calibration") }

    val instructionText = when (phase) {
        CalibrationPhase.PALM_ONLY -> "Rest your hand on the screen and move it a little."
        CalibrationPhase.STYLUS_ONLY -> "Write a short line with the stylus, hand off the screen."
        CalibrationPhase.COMBINED -> "Now write the way you normally would, hand resting."
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("calibration-screen")
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                "Palm Calibration",
                color = NotesColors.OnSurface,
                style = MaterialTheme.typography.headlineMedium
            )
            Spacer(Modifier.height(12.dp))
            Text(
                instructionText,
                color = NotesColors.OnSurfaceMuted,
                style = MaterialTheme.typography.bodyLarge
            )
            Spacer(Modifier.height(16.dp))
            LinearProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth(0.6f)
                    .testTag("calibration-progress")
            )
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(vertical = 16.dp)
                .glassSurface()
                .padding(8.dp)
                .testTag("calibration-surface")
        ) {
            InkSurface(
                scene = calibrationScene,
                tool = ToolSettings(ToolKind.PEN, 0xFF7AA2F7.toInt(), 3f),
                onStrokeCommitted = {},
                modifier = Modifier.fillMaxSize()
            )
        }

        Button(
            onClick = onDone,
            modifier = Modifier.testTag("calibration-done")
        ) {
            Text(if (progress >= 1f) "Finish" else "Skip")
        }
    }
}
