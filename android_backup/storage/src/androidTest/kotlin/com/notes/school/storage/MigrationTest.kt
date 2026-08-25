package com.notes.school.storage

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Runs on the SM-T505 (or an emulator). Walks the real SQLite file from every released
 * schema version up to the current one, which is the only way to prove an upgrade does not
 * lose a student's notes.
 */
@RunWith(AndroidJUnit4::class)
class MigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        NotesDatabase::class.java
    )

    @Test
    fun migratesFromEveryReleasedVersionToCurrent() {
        for (start in 1 until NotesDatabase.VERSION) {
            helper.createDatabase(TEST_DB, start).close()
            helper.runMigrationsAndValidate(TEST_DB, NotesDatabase.VERSION, true, *Migrations.ALL)
        }
    }

    @Test
    fun aFreshDatabaseOpensAtTheCurrentVersion() {
        val db = helper.createDatabase(TEST_DB, NotesDatabase.VERSION)
        assertTrue(db.isOpen)
        db.close()
    }

    private companion object {
        const val TEST_DB = "migration-test.db"
    }
}
