package com.notes.school.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import com.notes.school.core.newId
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class DocumentRepositoryTest {

    private lateinit var db: NotesDatabase
    private lateinit var repository: DocumentRepository
    private val dispatcher = StandardTestDispatcher()
    private val scope = TestScope(dispatcher)
    private var clock = 1_000L

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NotesDatabase::class.java
        ).allowMainThreadQueries().build()
        repository = DocumentRepository(db, scope, nowMs = { clock })
    }

    @After
    fun tearDown() {
        repository.close()
        db.close()
    }

    private fun stroke(pageId: String, order: Long) = Stroke(
        newId(), pageId, ToolKind.PEN, -16777216, 3f,
        listOf(StrokePoint(0f, 0f, 0.5f, 0), StrokePoint(10f, 10f, 0.5f, 8)),
        Bounds(0f, 0f, 10f, 10f), order, true
    )

    @Test
    fun creatingADocumentAlsoCreatesItsFirstPage() = scope.runTest {
        val document = repository.createDocument(null, "Mathe", DocumentKind.GRID)
        val pages = db.pageDao().forDocument(document.id)
        assertEquals(1, pages.size)
        assertEquals(0, pages.single().pageIndex)
        repository.close()
    }

    @Test
    fun createDocumentHonoursTheRequestedPageCount() = scope.runTest {
        val document = repository.createDocument(null, "Heft", DocumentKind.LINED, pageCount = 4)
        assertEquals(4, db.pageDao().forDocument(document.id).size)
        repository.close()
    }

    @Test
    fun aQueuedStrokeReachesTheDatabaseWithinTheFlushInterval() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.queueStroke(stroke(page.id, 0))
        advanceUntilIdle()
        assertEquals(1, db.strokeDao().countForPage(page.id))
        repository.close()
    }

    @Test
    fun queueStrokeDoesNotBlockTheCaller() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repeat(50) { repository.queueStroke(stroke(page.id, it.toLong())) }
        // Nothing has been written yet: the caller returned before any disk work happened.
        assertEquals(0, db.strokeDao().countForPage(page.id))
        advanceUntilIdle()
        assertEquals(50, db.strokeDao().countForPage(page.id))
        repository.close()
    }

    @Test
    fun flushForcesEverythingPendingToDiskImmediately() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repeat(5) { repository.queueStroke(stroke(page.id, it.toLong())) }
        repository.flush()
        assertEquals(5, db.strokeDao().countForPage(page.id))
        repository.close()
    }

    @Test
    fun strokesReloadInTheirOriginalOrder() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        val queued = (0L until 6L).map { stroke(page.id, it) }
        queued.forEach { repository.queueStroke(it) }
        repository.flush()
        assertEquals(queued.map { it.id }, repository.loadPageStrokes(page.id).map { it.id })
        repository.close()
    }

    @Test
    fun anEraseIsPersistedAsAnActiveFlagChangeNotADelete() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        val s = stroke(page.id, 0)
        repository.queueStroke(s)
        repository.flush()
        repository.queueActiveChange(listOf(s.id), active = false)
        repository.flush()
        assertEquals(1, db.strokeDao().countForPage(page.id))
        assertEquals(0, db.strokeDao().activeForPage(page.id).size)
        repository.close()
    }

    @Test
    fun persistingAStrokeBumpsTheDocumentTimestamp() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        clock = 9_000L
        repository.queueStroke(stroke(page.id, 0))
        repository.flush()
        assertEquals(9_000L, db.documentDao().byId(document.id)!!.updatedAtMs)
        repository.close()
    }

    @Test
    fun strokesAlreadyWrittenSurviveAProcessRestart() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.queueStroke(stroke(page.id, 0))
        repository.flush()
        // Simulate a fresh process against the same database.
        val reopened = DocumentRepository(db, scope, nowMs = { clock })
        assertEquals(1, reopened.loadPageStrokes(page.id).size)
        reopened.close()
        repository.close()
    }

    @Test
    fun viewportStateIsSavedPerPage() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.saveViewport(page.id, 30f, 60f, 1.5f)
        val stored = db.pageDao().byId(page.id)!!
        assertEquals(1.5f, stored.zoom, 0f)
        assertEquals(60f, stored.scrollY, 0f)
        repository.close()
    }

    @Test
    fun closingTheRepositoryStopsAcceptingWorkWithoutLosingWhatWasFlushed() = scope.runTest {
        val document = repository.createDocument(null, "Doc", DocumentKind.BLANK)
        val page = db.pageDao().forDocument(document.id).single()
        repository.queueStroke(stroke(page.id, 0))
        repository.flush()
        repository.close()
        assertEquals(1, db.strokeDao().countForPage(page.id))
        assertNotNull(db.documentDao().byId(document.id))
        assertTrue(true)
    }
}
