package com.notes.school.ui.files

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
import com.notes.school.core.newId
import com.notes.school.storage.DocumentRepository
import com.notes.school.storage.NotesDatabase
import com.notes.school.storage.toModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class FilesSection { MY_FILES, RECENT, FAVORITES, TRASH }

data class FilesUiState(
    val section: FilesSection = FilesSection.MY_FILES,
    val folders: List<Folder> = emptyList(),
    val documents: List<DocumentMeta> = emptyList(),
    val query: String = "",
    val loading: Boolean = false
)

class FilesViewModel(
    private val repository: DocumentRepository,
    private val db: NotesDatabase
) : ViewModel() {

    private val _state = MutableStateFlow(FilesUiState(loading = true))
    val state: StateFlow<FilesUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun select(section: FilesSection) {
        _state.update { it.copy(section = section) }
        refresh()
    }

    fun search(query: String) {
        _state.update { it.copy(query = query) }
        refresh()
    }

    fun createDocument(kind: DocumentKind, title: String, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val document = repository.createDocument(folderId = null, title = title, kind = kind)
            refreshNow()
            onCreated(document.id)
        }
    }

    fun rename(id: String, title: String) = mutate {
        db.documentDao().rename(id, title, System.currentTimeMillis())
    }

    fun move(id: String, folderId: String?) = mutate {
        db.documentDao().move(id, folderId, System.currentTimeMillis())
    }

    fun duplicate(id: String) = mutate {
        val original = db.documentDao().byId(id) ?: return@mutate
        val copy = original.copy(id = newId(), title = "${original.title} (copy)")
        db.documentDao().upsert(copy)
        db.pageDao().forDocument(id).forEach { page ->
            val newPage = page.copy(id = newId(), documentId = copy.id)
            db.pageDao().upsert(newPage)
            db.strokeDao().forPage(page.id).forEach { stroke ->
                db.strokeDao().upsert(stroke.copy(id = newId(), pageId = newPage.id))
            }
        }
    }

    fun setFavorite(id: String, favorite: Boolean) = mutate {
        db.documentDao().setFavorite(id, favorite)
    }

    fun trash(id: String) = mutate { db.documentDao().setTrashed(id, true) }

    fun restore(id: String) = mutate { db.documentDao().setTrashed(id, false) }

    private fun mutate(block: suspend () -> Unit) {
        viewModelScope.launch {
            block()
            refreshNow()
        }
    }

    private fun refresh() {
        viewModelScope.launch { refreshNow() }
    }

    private suspend fun refreshNow() {
        val query = _state.value.query.trim()
        val documents = when (_state.value.section) {
            FilesSection.MY_FILES -> db.documentDao().recent(limit = 200)
            FilesSection.RECENT -> db.documentDao().recent(limit = 30)
            FilesSection.FAVORITES -> db.documentDao().favorites()
            FilesSection.TRASH -> db.documentDao().trashed()
        }.map { it.toModel() }
        val folders = db.folderDao().children(null).map { it.toModel() }
        _state.update {
            it.copy(
                loading = false,
                folders = if (it.section == FilesSection.MY_FILES) folders else emptyList(),
                documents = if (query.isEmpty()) {
                    documents
                } else {
                    documents.filter { doc -> doc.title.contains(query, ignoreCase = true) }
                }
            )
        }
    }
}
