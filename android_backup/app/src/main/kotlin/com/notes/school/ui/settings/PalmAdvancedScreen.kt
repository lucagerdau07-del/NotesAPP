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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.notes.school.core.SafeRange
import com.notes.school.core.ThresholdKey
import com.notes.school.core.ToolKind
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.ui.editor.InkSurface
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun PalmAdvancedScreen(
    state: PalmSettingsUiState,
    onBack: () -> Unit,
    onThreshold: (ThresholdKey, Float) -> Unit,
    onReset: () -> Unit
) {
    val scrollState = rememberScrollState()
    val testScene = remember { InkScene("palm-test") }

    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(scrollState)
            .testTag("palm-advanced-screen")
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .glassSurface(cornerRadius = 14.dp)
                .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
                .clickable(onClick = onBack)
                .padding(horizontal = 16.dp)
                .testTag("palm-advanced-back")
        ) {
            Text("‹ Advanced Settings", color = NotesColors.OnSurface, style = MaterialTheme.typography.titleMedium)
        }

        Spacer(Modifier.height(24.dp))

        val keys = listOf(
            ThresholdKey.PEN_BIAS to "Pen Bias",
            ThresholdKey.SMALL_CONTACT_WEIGHT to "Small Contact Weight",
            ThresholdKey.DECISION_WINDOW_MS to "Decision Window (ms)"
        )

        keys.forEach { (key, label) ->
            val range = state.profile?.safeRanges?.get(key) ?: when (key) {
                ThresholdKey.PEN_BIAS -> SafeRange(-0.5f, 0.5f)
                ThresholdKey.SMALL_CONTACT_WEIGHT -> SafeRange(0f, 1f)
                ThresholdKey.DECISION_WINDOW_MS -> SafeRange(0f, 150f)
                else -> SafeRange(0f, 1f)
            }
            val value = state.profile?.thresholds?.get(key) ?: range.min

            Column(
                Modifier
                    .fillMaxWidth()
                    .glassSurface()
                    .padding(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(label, color = NotesColors.OnSurface, style = MaterialTheme.typography.titleSmall)
                    Text(String.format("%.2f", value), color = NotesColors.OnSurfaceMuted, style = MaterialTheme.typography.bodySmall)
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    TextButton(
                        onClick = { onThreshold(key, range.min) },
                        modifier = Modifier.testTag("threshold-$key-min")
                    ) {
                        Text("Min")
                    }

                    Slider(
                        value = value.coerceIn(range.min, range.max),
                        onValueChange = { onThreshold(key, it) },
                        valueRange = range.min..range.max,
                        modifier = Modifier
                            .weight(1f)
                            .testTag("threshold-$key")
                    )

                    TextButton(
                        onClick = { onThreshold(key, range.max) },
                        modifier = Modifier.testTag("threshold-$key-max")
                    ) {
                        Text("Max")
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
        }

        // Test drawing surface
        Text("Test Palm Rejection", color = NotesColors.OnSurface, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .glassSurface()
                .padding(8.dp)
                .testTag("palm-test-surface")
        ) {
            InkSurface(
                scene = testScene,
                tool = ToolSettings(ToolKind.PEN, 0xFF7AA2F7.toInt(), 3f),
                onStrokeCommitted = {},
                modifier = Modifier.fillMaxSize()
            )
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = onReset,
            colors = ButtonDefaults.buttonColors(containerColor = NotesColors.Danger),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("reset-profile")
        ) {
            Text("Reset Profile to Defaults")
        }
    }
}
