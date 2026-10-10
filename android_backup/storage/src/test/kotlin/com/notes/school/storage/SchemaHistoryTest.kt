package com.notes.school.storage

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class SchemaHistoryTest {

    private val schemaDir = listOf(
        File("schemas/com.notes.school.storage.NotesDatabase"),
        File("storage/schemas/com.notes.school.storage.NotesDatabase")
    ).firstOrNull { it.isDirectory } ?: File("schemas/com.notes.school.storage.NotesDatabase")

    @Test
    fun everyReleasedVersionHasACommittedSchema() {
        for (version in 1..NotesDatabase.VERSION) {
            val file = File(schemaDir, "$version.json")
            assertTrue("missing committed schema for version $version at ${file.absolutePath}", file.isFile)
        }
    }

    @Test
    fun aMigrationExistsForEveryVersionStep() {
        // Version 1 needs no migration; every later version needs exactly one path into it.
        val targets = Migrations.ALL.map { it.endVersion }.toSet()
        for (version in 2..NotesDatabase.VERSION) {
            assertTrue("no migration ends at version $version", targets.contains(version))
        }
    }
}
