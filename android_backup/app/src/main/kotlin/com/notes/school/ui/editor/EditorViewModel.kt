package com.notes.school.ui.editor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notes.school.core.Stroke
import com.notes.school.core.ToolKind
import com.notes.school.editor.PalmStatus
import com.notes.school.ink.InkScene
import com.notes.school.ink.ToolSettings
import com.notes.school.storage.DocumentRepository
import com.notes.school.storage.NotesDatabase
import com.notes.school.storage.toModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class EditorViewModel(
    private val repository: DocumentRepository,
    private val db: NotesDatabase
) : ViewModel() {

    private val _state = MutableStateFlow(
        EditorUiState(tool = ToolSettings(ToolKind.PEN, PEN_COLORS.first(), PEN_WIDTHS[1]))
    )
    val state: StateFlow<EditorUiState> = _state.asStateFlow()

    var scene: InkScene = InkScene("")
        private set

    fun open(documentId: String) {
        viewModelScope.launch {
            val document = db.documentDao().byId(documentId)?.toModel() ?: return@launch
            val page = db.pageDao().forDocument(documentId).firstOrNull() ?: return@launch
            scene = InkScene(page.id, repository.loadPageStrokes(page.id))
            _state.update { it.copy(title = document.title, canUndo = false, canRedo = false) }
        }
    }

    fun onStrokeCommitted(stroke: Stroke) {
        repository.queueStroke(stroke)
        _state.update { it.copy(canUndo = scene.canUndo, canRedo = scene.canRedo) }
    }

    fun selectTool(kind: ToolKind) = _state.update { it.copy(tool = it.tool.copy(kind = kind)) }

    fun setColor(argb: Int) = _state.update { it.copy(tool = it.tool.copy(colorArgb = argb)) }

    fun setWidth(px: Float) = _state.update { it.copy(tool = it.tool.copy(widthPx = px)) }

    fun undo() {
        val change = scene.undo() ?: return
        repository.queueActiveChange(change.changed.map { it.id }, active = false)
        _state.update { it.copy(canUndo = scene.canUndo, canRedo = scene.canRedo) }
    }

    fun redo() {
        val change = scene.redo() ?: return
        repository.queueActiveChange(change.changed.map { it.id }, active = true)
        _state.update { it.copy(canUndo = scene.canUndo, canRedo = scene.canRedo) }
    }

    fun setPalmStatus(status: PalmStatus) = _state.update { it.copy(palmStatus = status) }

    /** Everything queued must reach disk before the process can be killed. */
    fun onPause() {
        viewModelScope.launch { repository.flush() }
    }
}
