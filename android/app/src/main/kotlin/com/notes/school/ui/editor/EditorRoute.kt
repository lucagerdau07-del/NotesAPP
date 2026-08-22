package com.notes.school.ui.editor

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

@Composable
fun EditorRoute(documentId: String, onBack: () -> Unit) {
    Box(Modifier.fillMaxSize().testTag("editor-screen")) {
        Text("Editor: $documentId")
    }
}
