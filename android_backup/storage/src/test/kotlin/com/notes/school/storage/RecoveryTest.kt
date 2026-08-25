package com.notes.school.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.newId
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class RecoveryTest {

    private lateinit var db: NotesDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NotesDatabase::class.java
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seedDocumentWithStroke(): Pair<String, String> {
        val document = DocumentEntity(newId(), null, "Doc", "LINED", 1L, 1L, false, false, null)
        db.documentDao().upsert(document)
        val page = PageEntity(newId(), document.id, 0, 100f, 100f, "TEMPLATE", 1, 0f, 0f, 1f)
        db.pageDao().upsert(page)
        db.strokeDao().upsert(
            StrokeEntity(
                newId(), page.id, "PEN", -16777216, 3f, ByteArray(8),
                0f, 0f, 1f, 1f, 0L, true
            )
        )
        return document.id to page.id
    }

    @Test
    fun recoveryLeavesAHealthyDatabaseUntouched() = runTest {
        val (_, pageId) = seedDocumentWithStroke()
        val report = db.recoverOnStartup()
        assertEquals(0, report.orphanStrokesRemoved)
        assertEquals(1, db.strokeDao().countForPage(pageId))
    }

    @Test
    fun committedStrokesAreNeverDiscardedByRecovery() = runTest {
        val (documentId, pageId) = seedDocumentWithStroke()
        repeat(3) { db.recoverOnStartup() }
        assertEquals(1, db.strokeDao().countForPage(pageId))
        assertEquals(documentId, db.documentDao().byId(documentId)!!.id)
    }

    @Test
    fun recoveryIsIdempotent() = runTest {
        seedDocumentWithStroke()
        val first = db.recoverOnStartup()
        val second = db.recoverOnStartup()
        assertEquals(first, second)
    }
}
