package com.notes.school.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

@Composable
fun SettingsRoute(onBack: () -> Unit, onOpenAdvanced: () -> Unit, onRecalibrate: () -> Unit) {
    Box(Modifier.fillMaxSize().testTag("settings-screen")) {
        Text("Settings")
    }
}
