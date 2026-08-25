package com.notes.school.storage

import androidx.room.withTransaction
import com.notes.school.core.DocumentKind
import com.notes.school.core.DocumentMeta
import com.notes.school.core.Page
import com.notes.school.core.PageSource
import com.notes.school.core.Stroke
import com.notes.school.core.newId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.yield

private sealed interface SaveOp {
    data class Write(val stroke: Stroke) : SaveOp
    data class SetActive(val strokeIds: List<String>, val active: Boolean) : SaveOp
}

/**
 * Autosave. A completed stroke is handed over with [queueStroke], which never touches disk
 * on the calling thread. A background coroutine drains the queue and writes each batch in a
 * single transaction, so a crash either has the whole batch or none of it — and previously
 * committed strokes are untouched either way.
 *
 * ponytail: batching is time-agnostic — the drain loop writes whatever is queued as soon as
 * it is scheduled. If disk churn shows up in profiling, add a real debounce keyed on
 * [flushIntervalMs].
 */
class DocumentRepository(
    private val db: NotesDatabase,
    private val scope: CoroutineScope,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val flushIntervalMs: Long = 400L
) {
    private val queue = ArrayDeque<SaveOp>()
    private val queueLock = Mutex()
    private val wakeup = Channel<Unit>(Channel.CONFLATED)
    private var closed = false

    private val worker = scope.launch {
        while (!closed) {
            try {
                wakeup.receive()
                drain()
            } catch (e: Exception) {
                break
            }
        }
    }

    suspend fun createDocument(
        folderId: String?,
        title: String,
        kind: DocumentKind,
        pageCount: Int = 1
    ): DocumentMeta {
        val now = nowMs()
        val document = DocumentMeta(
            id = newId(),
            folderId = folderId,
            title = title,
            kind = kind,
            createdAtMs = now,
            updatedAtMs = now
        )
        val pages = (0 until pageCount).map { index ->
            Page(
                id = newId(),
                documentId = document.id,
                index = index,
                widthPx = A4_WIDTH_PX,
                heightPx = A4_HEIGHT_PX,
                source = PageSource.Template(kind)
            )
        }
        db.withTransaction {
            db.documentDao().upsert(document.toEntity())
            db.pageDao().upsertAll(pages.map { it.toEntity() })
        }
        return document
    }

    suspend fun loadPageStrokes(pageId: String): List<Stroke> =
        db.strokeDao().forPage(pageId).map { it.toModel() }

    fun queueStroke(stroke: Stroke) {
        if (closed) return
        scope.launch {
            queueLock.withLock { queue.addLast(SaveOp.Write(stroke)) }
            wakeup.trySend(Unit)
        }
    }

    fun queueActiveChange(strokeIds: List<String>, active: Boolean) {
        if (closed || strokeIds.isEmpty()) return
        scope.launch {
            queueLock.withLock { queue.addLast(SaveOp.SetActive(strokeIds, active)) }
            wakeup.trySend(Unit)
        }
    }

    /** Writes everything currently queued. Call on pause, on close, and before export. */
    suspend fun flush() {
        yield()
        drain()
    }

    suspend fun saveViewport(pageId: String, x: Float, y: Float, zoom: Float) {
        db.pageDao().saveViewport(pageId, x, y, zoom)
    }

    fun close() {
        closed = true
        wakeup.close()
        worker.cancel()
    }

    private suspend fun drain() {
        val batch = queueLock.withLock {
            if (queue.isEmpty()) return
            val copy = queue.toList()
            queue.clear()
            copy
        }
        val writes = batch.filterIsInstance<SaveOp.Write>().map { it.stroke }
        val flags = batch.filterIsInstance<SaveOp.SetActive>()
        db.withTransaction {
            if (writes.isNotEmpty()) {
                db.strokeDao().upsertAll(writes.map { it.toEntity() })
            }
            flags.forEach { db.strokeDao().setActive(it.strokeIds, it.active) }
            val touched = writes.map { it.pageId }.distinct()
            val now = nowMs()
            touched.forEach { pageId ->
                db.pageDao().byId(pageId)?.let { db.documentDao().touch(it.documentId, now) }
            }
        }
    }

    private companion object {
        // A4 at 150 dpi — comfortable on the SM-T505 without oversized bitmaps.
        const val A4_WIDTH_PX = 1240f
        const val A4_HEIGHT_PX = 1754f
    }
}
