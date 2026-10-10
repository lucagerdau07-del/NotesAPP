package com.notes.school.ui.files

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
import com.notes.school.ui.theme.MIN_TOUCH_TARGET_DP
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun SidebarEntry(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    testTag: String,
    onClick: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) NotesColors.SurfaceRaised else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp)
            .testTag(testTag)
            .semantics { contentDescription = label }
    ) {
        Icon(icon, contentDescription = null, tint = NotesColors.OnSurface, modifier = Modifier.size(20.dp))
        Text(
            label,
            color = NotesColors.OnSurface,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}

/** Folder cards use an ordinary dark content surface — glass belongs to navigation only. */
@Composable
fun FolderCard(folder: Folder, onClick: () -> Unit) {
    Column(
        Modifier
            .width(180.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(NotesColors.Surface)
            .clickable(onClick = onClick)
            .padding(16.dp)
            .testTag("folder-${folder.id}")
    ) {
        Text(folder.name, color = NotesColors.OnSurface, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
fun RecentDocumentRow(document: DocumentMeta, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MIN_TOUCH_TARGET_DP.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(NotesColors.Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("document-${document.id}")
    ) {
        Text(document.title, color = NotesColors.OnSurface, style = MaterialTheme.typography.bodyLarge)
        Text(
            document.kind.name.lowercase(),
            color = NotesColors.OnSurfaceMuted,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}

@Composable
fun GlassTopBar(query: String, onSearch: (String) -> Unit, content: @Composable () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .glassSurface()
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) { content() }
}
