package com.notes.school.storage

import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Folder
import com.notes.school.core.Page
import com.notes.school.core.PageSource
import com.notes.school.core.Stroke
import com.notes.school.core.StrokeCodec
import com.notes.school.core.ToolKind

private const val SOURCE_TEMPLATE = "TEMPLATE"
private const val SOURCE_PDF = "PDF"

fun Folder.toEntity() = FolderEntity(id, parentId, name, sortIndex, createdAtMs, updatedAtMs, trashed)

fun FolderEntity.toModel() = Folder(id, parentId, name, sortIndex, createdAtMs, updatedAtMs, trashed)

fun DocumentMeta.toEntity() = DocumentEntity(
    id, folderId, title, kind.name, createdAtMs, updatedAtMs, favorite, trashed, sourceRef
)

fun DocumentEntity.toModel() = DocumentMeta(
    id, folderId, title, DocumentKind.valueOf(kind), createdAtMs, updatedAtMs, favorite, trashed, sourceRef
)

fun Page.toEntity(): PageEntity {
    val (type, value) = when (val s = source) {
        is PageSource.Template -> SOURCE_TEMPLATE to s.kind.ordinal
        is PageSource.PdfPage -> SOURCE_PDF to s.pageIndex
    }
    return PageEntity(id, documentId, index, widthPx, heightPx, type, value, scrollX, scrollY, zoom)
}

fun PageEntity.toModel() = Page(
    id = id,
    documentId = documentId,
    index = pageIndex,
    widthPx = widthPx,
    heightPx = heightPx,
    source = when (sourceType) {
        SOURCE_PDF -> PageSource.PdfPage(sourceValue)
        else -> PageSource.Template(DocumentKind.entries[sourceValue])
    },
    scrollX = scrollX,
    scrollY = scrollY,
    zoom = zoom
)

fun Stroke.toEntity() = StrokeEntity(
    id = id,
    pageId = pageId,
    tool = tool.name,
    colorArgb = colorArgb,
    widthPx = widthPx,
    pointsBlob = StrokeCodec.encode(points),
    boundsLeft = bounds.left,
    boundsTop = bounds.top,
    boundsRight = bounds.right,
    boundsBottom = bounds.bottom,
    strokeOrder = order,
    active = active
)

fun StrokeEntity.toModel() = Stroke(
    id = id,
    pageId = pageId,
    tool = ToolKind.valueOf(tool),
    colorArgb = colorArgb,
    widthPx = widthPx,
    points = StrokeCodec.decode(pointsBlob),
    bounds = Bounds(boundsLeft, boundsTop, boundsRight, boundsBottom),
    order = strokeOrder,
    active = active
)
