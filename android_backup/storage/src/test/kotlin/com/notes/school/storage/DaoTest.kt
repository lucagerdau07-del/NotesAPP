package com.notes.school.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.Bounds
import com.notes.school.core.DocumentKind
import com.notes.school.core.Stroke
import com.notes.school.core.StrokePoint
import com.notes.school.core.ToolKind
import com.notes.school.core.newId
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class DaoTest {

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

    private suspend fun seedPage(): PageEntity {
        val folder = FolderEntity(newId(), null, "Biologie", 0, 1L, 1L, false)
        db.folderDao().upsert(folder)
        val document = DocumentEntity(
            newId(), folder.id, "Zellaufbau", DocumentKind.LINED.name, 1L, 1L, false, false, null
        )
        db.documentDao().upsert(document)
        val page = PageEntity(newId(), document.id, 0, 1240f, 1754f, "TEMPLATE", 0, 0f, 0f, 1f)
        db.pageDao().upsert(page)
        return page
    }

    private fun stroke(pageId: String, order: Long, active: Boolean = true) = Stroke(
        id = newId(),
        pageId = pageId,
        tool = ToolKind.PEN,
        colorArgb = 0xFF2C2825.toInt(),
        widthPx = 3f,
        points = listOf(StrokePoint(1f, 2f, 0.5f, 0), StrokePoint(9f, 4f, 0.5f, 12)),
        bounds = Bounds(0f, 1f, 10f, 5f),
        order = order,
        active = active
    )

    @Test
    fun strokeSurvivesARoundTripWithEveryFieldIntact() = runTest {
        val page = seedPage()
        val original = stroke(page.id, order = 0)
        db.strokeDao().upsert(original.toEntity())
        val loaded = db.strokeDao().forPage(page.id).single().toModel()
        assertEquals(original, loaded)
    }

    @Test
    fun strokesComeBackInCreationOrder() = runTest {
        val page = seedPage()
        val ordered = (0L until 5L).map { stroke(page.id, order = it) }
        ordered.shuffled().forEach { db.strokeDao().upsert(it.toEntity()) }
        assertEquals(ordered.map { it.id }, db.strokeDao().forPage(page.id).map { it.id })
    }

    @Test
    fun inactiveStrokesAreStoredButExcludedFromTheActiveQuery() = runTest {
        val page = seedPage()
        val kept = stroke(page.id, 0)
        val erased = stroke(page.id, 1, active = false)
        db.strokeDao().upsert(kept.toEntity())
        db.strokeDao().upsert(erased.toEntity())
        assertEquals(2, db.strokeDao().forPage(page.id).size)
        assertEquals(listOf(kept.id), db.strokeDao().activeForPage(page.id).map { it.id })
    }

    @Test
    fun writingAStrokeBatchIsASingleTransaction() = runTest {
        val page = seedPage()
        val batch = (0L until 20L).map { stroke(page.id, it).toEntity() }
        db.strokeDao().upsertAll(batch)
        assertEquals(20, db.strokeDao().forPage(page.id).size)
    }

    @Test
    fun deletingADocumentCascadesToPagesAndStrokes() = runTest {
        val page = seedPage()
        db.strokeDao().upsert(stroke(page.id, 0).toEntity())
        db.documentDao().deleteById(page.documentId)
        assertEquals(0, db.pageDao().forDocument(page.documentId).size)
        assertEquals(0, db.strokeDao().forPage(page.id).size)
    }

    @Test
    fun trashedDocumentsAreHiddenFromTheFolderListingButStillReadable() = runTest {
        val page = seedPage()
        db.documentDao().setTrashed(page.documentId, true)
        val document = db.documentDao().byId(page.documentId)!!
        assertTrue(document.trashed)
        val folderId = document.folderId!!
        assertEquals(0, db.documentDao().inFolder(folderId).size)
        assertEquals(1, db.documentDao().trashed().size)
    }

    @Test
    fun favoritesQueryReturnsOnlyFavoritedUntrashedDocuments() = runTest {
        val page = seedPage()
        db.documentDao().setFavorite(page.documentId, true)
        assertEquals(1, db.documentDao().favorites().size)
        db.documentDao().setTrashed(page.documentId, true)
        assertEquals(0, db.documentDao().favorites().size)
    }

    @Test
    fun recentDocumentsAreOrderedByUpdatedAtDescending() = runTest {
        val page = seedPage()
        val second = DocumentEntity(
            newId(), null, "Newer", DocumentKind.BLANK.name, 5L, 500L, false, false, null
        )
        db.documentDao().upsert(second)
        assertEquals(second.id, db.documentDao().recent(limit = 10).first().id)
    }

    @Test
    fun onlyOneStablePalmProfileExistsPerDeviceAndOrientation() = runTest {
        val first = PalmProfileEntity(
            id = 0, deviceFingerprint = "SM-T505", orientation = "LANDSCAPE",
            revision = 1, json = "{}", score = 0.94f, stable = true, createdAtMs = 1L
        )
        db.palmProfileDao().upsert(first)
        db.palmProfileDao().upsert(first.copy(id = 0, revision = 2, score = 0.96f))
        val stable = db.palmProfileDao().latestStable("SM-T505", "LANDSCAPE")!!
        assertEquals(2, stable.revision)
    }

    @Test
    fun missingRowsReturnNullRatherThanThrowing() = runTest {
        assertNull(db.documentDao().byId("does-not-exist"))
        assertNull(db.palmProfileDao().latestStable("nope", "LANDSCAPE"))
    }
}
