package com.notes.school.remote

import com.notes.school.core.JobRequest
import com.notes.school.core.JobState
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NotesApiClientTest {

    private lateinit var server: MockWebServer
    private lateinit var api: NotesApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = NotesApiClient(
            baseUrl = server.url("/notes/").toString(),
            tokenProvider = { "restricted-notes-token" }
        )
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun submitPostsToTheVersionedJobsEndpoint() = runTest {
        server.enqueue(MockResponse().setBody("""{"remoteId":"r1"}"""))
        api.submit(JobRequest(operation = "NOOP_ECHO"))
        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/notes/v1/jobs", recorded.path)
    }

    @Test
    fun everyRequestCarriesTheRestrictedNotesToken() = runTest {
        server.enqueue(MockResponse().setBody("""{"remoteId":"r1"}"""))
        api.submit(JobRequest(operation = "NOOP_ECHO"))
        assertEquals("Bearer restricted-notes-token", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun pollReadsTheJobById() = runTest {
        server.enqueue(MockResponse().setBody("""{"remoteId":"r1","state":"RUNNING"}"""))
        val status = api.poll("r1")
        assertEquals(JobState.RUNNING, status.state)
        assertEquals("/notes/v1/jobs/r1", server.takeRequest().path)
    }

    @Test
    fun cancelDeletesTheJob() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))
        api.cancel("r1")
        val recorded = server.takeRequest()
        assertEquals("DELETE", recorded.method)
        assertEquals("/notes/v1/jobs/r1", recorded.path)
    }

    @Test
    fun healthReadsTheHealthEndpoint() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"version":"1.0.0"}"""))
        assertTrue(api.health().ok)
        assertEquals("/notes/v1/health", server.takeRequest().path)
    }

    @Test
    fun a401IsReportedAsAnAuthFailure() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        try {
            api.poll("r1")
            fail("Expected RemoteException")
        } catch (e: RemoteException) {
            assertEquals(RemoteFailure.Unauthorized, e.failure)
        }
    }

    @Test
    fun a429CarriesTheRetryAfterDelay() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "12"))
        try {
            api.poll("r1")
            fail("Expected RemoteException")
        } catch (e: RemoteException) {
            assertEquals(RemoteFailure.RateLimited(12_000L), e.failure)
        }
    }

    @Test
    fun a503IsReportedAsASleepingBackendRatherThanAHardFailure() = runTest {
        server.enqueue(MockResponse().setResponseCode(503))
        try {
            api.poll("r1")
            fail("Expected RemoteException")
        } catch (e: RemoteException) {
            assertEquals(RemoteFailure.BackendAsleep, e.failure)
        }
    }

    @Test
    fun anUnreachableHostIsReportedAsOffline() = runTest {
        server.shutdown()
        try {
            api.health()
            fail("Expected RemoteException")
        } catch (e: RemoteException) {
            assertEquals(RemoteFailure.Offline, e.failure)
        }
    }

    @Test
    fun aMissingTokenFailsBeforeAnythingIsSent() = runTest {
        val anonymous = NotesApiClient(server.url("/notes/").toString(), tokenProvider = { null })
        try {
            anonymous.health()
            fail("Expected RemoteException")
        } catch (e: RemoteException) {
            assertEquals(RemoteFailure.Unauthorized, e.failure)
        }
    }
}
