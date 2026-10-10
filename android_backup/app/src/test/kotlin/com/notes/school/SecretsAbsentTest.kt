package com.notes.school

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class SecretsAbsentTest {

    private val forbidden = listOf("GRAVITY_TOKEN", "hf_", "sk-", "OPENAI_API_KEY", "ANTHROPIC_API_KEY")

    @Test
    fun noSourceOrResourceFileContainsAPrivilegedToken() {
        val roots = listOf(File("src/main"), File("../core-model/src/main"), File("../remote/src/main"))
        val offenders = roots
            .filter { it.exists() }
            .flatMap { it.walkTopDown().filter { f -> f.isFile }.toList() }
            .filter { file -> forbidden.any { file.readText().contains(it) } }
            .map { it.path }
        assertEquals("no privileged token may ship in the APK", emptyList<String>(), offenders)
    }

    @Test
    fun theBackendBaseUrlIsTheRestrictedNotesServiceOnHttps() {
        val text = File("../remote/src/main/kotlin/com/notes/school/remote/NotesApi.kt").readText()
        assertEquals(true, text.contains("https://luca448-app-backend.hf.space/notes/"))
        assertEquals(false, text.contains("http://"))
    }
}
