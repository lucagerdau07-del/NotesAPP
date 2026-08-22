package com.notes.school.ui.files

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

@Composable
fun FilesRoute(onOpenDocument: (String) -> Unit, onOpenSettings: () -> Unit) {
    Column(Modifier.fillMaxSize().testTag("files-screen")) {
        TextButton(onClick = onOpenSettings, modifier = Modifier.testTag("sidebar-settings")) {
            Text("Settings")
        }
    }
}
