package com.notes.school.core

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class RemoteDtosTest {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    @Test
    fun aJobRequestSerializesWithItsSchemaVersion() {
        val encoded = json.encodeToString(JobRequest.serializer(), JobRequest(operation = "NOOP_ECHO"))
        assertEquals(true, encoded.contains("\"schemaVersion\":1"))
    }

    @Test
    fun anUnknownFieldInAServerResponseDoesNotBreakDecoding() {
        val decoded = json.decodeFromString(
            JobStatus.serializer(),
            """{"remoteId":"r1","state":"RUNNING","futureField":42}"""
        )
        assertEquals(JobState.RUNNING, decoded.state)
    }

    @Test
    fun jobStatusCarriesEitherAResultOrAnError() {
        val ok = JobStatus("r1", JobState.SUCCEEDED, resultRef = "results/r1.json")
        val bad = JobStatus("r2", JobState.FAILED, error = "provider unavailable")
        assertEquals("results/r1.json", ok.resultRef)
        assertEquals("provider unavailable", bad.error)
    }

    @Test
    fun noDtoFieldCanCarryARawDocumentOrToken() {
        val fields = JobRequest::class.java.declaredFields.map { it.name }
        listOf("token", "apiKey", "gravityToken", "ink", "bitmap").forEach {
            assertFalse("JobRequest must not expose $it", fields.contains(it))
        }
    }
}
