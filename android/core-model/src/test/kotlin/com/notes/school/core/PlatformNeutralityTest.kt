package com.notes.school.core

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class PlatformNeutralityTest {

    @Test
    fun noSourceFileImportsAndroidTypes() {
        val offenders = File("src/main/kotlin").walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { file -> file.readLines().any { it.trimStart().startsWith("import android") } }
            .map { it.path }
            .toList()
        assertEquals("core-model must stay platform neutral", emptyList<String>(), offenders)
    }
}
