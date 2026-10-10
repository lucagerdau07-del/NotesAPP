package com.notes.school.ui.files

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.notes.school.core.DocumentKind
import com.notes.school.ui.theme.NotesColors
import com.notes.school.ui.theme.glassSurface

@Composable
fun FilesScreen(
    state: FilesUiState,
    onSection: (FilesSection) -> Unit,
    onSearch: (String) -> Unit,
    onOpenDocument: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onNewDocument: (DocumentKind) -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }

    Row(Modifier.fillMaxSize().testTag("files-screen")) {
        Column(
            Modifier
                .width(232.dp)
                .fillMaxHeight()
                .padding(12.dp)
                .glassSurface()
                .padding(8.dp)
        ) {
            SidebarEntry("My Files", Icons.Filled.Home, state.section == FilesSection.MY_FILES, "sidebar-my-files") {
                onSection(FilesSection.MY_FILES)
            }
            SidebarEntry("Recent", Icons.Filled.DateRange, state.section == FilesSection.RECENT, "sidebar-recent") {
                onSection(FilesSection.RECENT)
            }
            SidebarEntry("Favorites", Icons.Filled.Star, state.section == FilesSection.FAVORITES, "sidebar-favorites") {
                onSection(FilesSection.FAVORITES)
            }
            SidebarEntry("Trash", Icons.Filled.Delete, state.section == FilesSection.TRASH, "sidebar-trash") {
                onSection(FilesSection.TRASH)
            }
            Spacer(Modifier.weight(1f))
            SidebarEntry("Settings", Icons.Filled.Settings, false, "sidebar-settings", onOpenSettings)
        }

        Column(Modifier.weight(1f).padding(top = 12.dp, end = 16.dp, bottom = 12.dp)) {
            Row(Modifier.fillMaxWidth().glassSurface().padding(12.dp)) {
                OutlinedTextField(
                    value = state.query,
                    onValueChange = onSearch,
                    placeholder = { Text("Search") },
                    singleLine = true,
                    modifier = Modifier.weight(1f).testTag("search-field")
                )
                Box {
                    TextButton(onClick = { menuOpen = true }, modifier = Modifier.testTag("new-document")) {
                        Text("New")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        listOf(DocumentKind.BLANK, DocumentKind.LINED, DocumentKind.GRID).forEach { kind ->
                            DropdownMenuItem(
                                text = { Text(kind.name.lowercase().replaceFirstChar { it.uppercase() }) },
                                onClick = {
                                    menuOpen = false
                                    onNewDocument(kind)
                                },
                                modifier = Modifier.testTag("new-document-${kind.name}")
                            )
                        }
                    }
                }
            }

            if (state.folders.isEmpty() && state.documents.isEmpty()) {
                Box(Modifier.fillMaxSize().testTag("empty-state"), contentAlignment = Alignment.Center) {
                    Text("Nothing here yet", color = NotesColors.OnSurfaceMuted)
                }
                return@Column
            }

            if (state.folders.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(vertical = 16.dp)
                ) {
                    items(state.folders, key = { it.id }) { folder ->
                        FolderCard(folder) { onSection(FilesSection.MY_FILES) }
                    }
                }
            }

            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.documents, key = { it.id }) { document ->
                    RecentDocumentRow(document) { onOpenDocument(document.id) }
                }
            }
        }
    }
}
