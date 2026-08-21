package com.notes.school.core

import kotlinx.serialization.Serializable

@Serializable
data class Folder(
    val id: String,
    val parentId: String?,
    val name: String,
    val sortIndex: Int,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val trashed: Boolean = false
)

enum class DocumentKind { BLANK, LINED, GRID, PDF }

@Serializable
data class DocumentMeta(
    val id: String,
    val folderId: String?,
    val title: String,
    val kind: DocumentKind,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val favorite: Boolean = false,
    val trashed: Boolean = false,
    /** Relative path inside app-private storage for an imported PDF, else null. */
    val sourceRef: String? = null
)

@Serializable
sealed interface PageSource {
    @Serializable
    data class Template(val kind: DocumentKind) : PageSource

    @Serializable
    data class PdfPage(val pageIndex: Int) : PageSource
}

@Serializable
data class Page(
    val id: String,
    val documentId: String,
    val index: Int,
    val widthPx: Float,
    val heightPx: Float,
    val source: PageSource,
    /** Last viewport the user left the page in, so reopening restores position. */
    val scrollX: Float = 0f,
    val scrollY: Float = 0f,
    val zoom: Float = 1f
)
