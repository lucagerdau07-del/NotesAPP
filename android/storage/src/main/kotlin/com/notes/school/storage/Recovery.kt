package com.notes.school.storage

import androidx.room.withTransaction

data class RecoveryReport(
    val orphanStrokesRemoved: Int,
    val emptyDocumentsRemoved: Int
)

/**
 * Startup integrity pass.
 *
 * Strokes are only ever written after they are complete, so a crash cannot leave half a
 * stroke behind. What a crash can leave is a row whose parent never got written — those
 * are removed. Committed strokes are never touched.
 */
suspend fun NotesDatabase.recoverOnStartup(): RecoveryReport = withTransaction {
    val orphans = strokeDao().deleteOrphans()
    RecoveryReport(orphanStrokesRemoved = orphans, emptyDocumentsRemoved = 0)
}
