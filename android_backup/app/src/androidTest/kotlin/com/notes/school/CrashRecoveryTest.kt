package com.notes.school

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import com.notes.school.core.newId
import com.notes.school.storage.DocumentRepository
import com.notes.school.storage.NotesDatabase
import com.notes.school.storage.recoverOnStartup
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Simulates a forced process termination: the repository is dropped without a graceful
 * shutdown and the database is reopened from the same file. Previously flushed strokes must
 * all still be there.
 */
@RunWith(AndroidJUnit4::class)
class CrashRecoveryTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val dbFile = File(context.getDatabasePath("crash-test.db").path)

    private fun openDatabase(): NotesDatabase =
        Room.databaseBuilder(context, NotesDatabase::class.java, "crash-test.db").build()

    private fun stroke(pageId: String, order: Long) = Stroke(
        newId(), pageId, ToolKind.PEN, -16777216, 3f,
        listOf(StrokePoint(0f, 0f, 1f, 0), StrokePoint(50f, 50f, 1f, 16)),
        Bounds(0f, 0f, 50f, 50f), order, true
    )

    @Test
    fun flushedStrokesSurviveALossOfTheProcess() = runBlocking {
        dbFile.delete()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        var pageId: String
        openDatabase().let { db ->
            val repository = DocumentRepository(db, scope)
            val document = repository.createDocument(null, "Crash", DocumentKind.LINED)
            pageId = db.pageDao().forDocument(document.id).single().id
            repeat(25) { repository.queueStroke(stroke(pageId, it.toLong())) }
            repository.flush()
            // No close(): this is what a kill -9 looks like to the app.
            db.close()
        }

        openDatabase().let { db ->
            val report = db.recoverOnStartup()
            assertEquals(0, report.orphanStrokesRemoved)
            assertEquals(25, db.strokeDao().countForPage(pageId))
            db.close()
        }
    }
}
