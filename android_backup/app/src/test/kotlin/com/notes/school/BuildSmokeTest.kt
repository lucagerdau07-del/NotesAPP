package com.notes.school

import org.junit.Assert.assertEquals
import org.junit.Test

class BuildSmokeTest {
    @Test
    fun applicationIdMatchesSpecNamespace() {
        assertEquals("com.notes.school", BuildConfig.APPLICATION_ID)
    }
}
