package com.notes.school.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

@Composable
fun CalibrationRoute(onDone: () -> Unit) {
    Box(Modifier.fillMaxSize().testTag("calibration-screen")) {
        Text("Calibration")
    }
}
