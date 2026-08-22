package com.notes.school.remote

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.notes.school.core.HealthStatus
import com.notes.school.core.JobHandle
import com.notes.school.core.JobRequest
import com.notes.school.core.JobState
import com.notes.school.core.JobStatus
import com.notes.school.core.RemoteOperation
import com.notes.school.storage.NotesDatabase
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class RemoteJobQueueTest {

    private lateinit var db: NotesDatabase
    private var clock = 1_000L

    private class FakeApi : NotesApi {
        var submissions = 0
        var failWith: RemoteFailure? = null
        var status: JobStatus = JobStatus("r1", JobState.SUCCEEDED, resultRef = "results/r1.json")
        val cancelled = mutableListOf<String>()

        override suspend fun submit(request: JobRequest): JobHandle {
            failWith?.let { throw RemoteException(it) }
            submissions++
            return JobHandle("r$submissions")
        }

        override suspend fun poll(remoteId: String): JobStatus {
            failWith?.let { throw RemoteException(it) }
            return status.copy(remoteId = remoteId)
        }

        override suspend fun cancel(remoteId: String) {
            cancelled += remoteId
        }

        override suspend fun health(): HealthStatus = HealthStatus(true, "1.0.0")
    }

    private lateinit var api: FakeApi
    private lateinit var queue: RemoteJobQueue

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NotesDatabase::class.java
        ).allowMainThreadQueries().build()
        api = FakeApi()
        queue = RemoteJobQueue(db.remoteJobDao(), api, nowMs = { clock })
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun anEnqueuedJobIsPersistedBeforeAnyNetworkCall() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, documentId = "doc-1", consentGranted = true)
        assertNotNull(db.remoteJobDao().byId(id))
        assertEquals(0, api.submissions)
    }

    @Test
    fun runDueSubmitsAndRecordsTheRemoteId() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        assertEquals("r1", db.remoteJobDao().byId(id)!!.remoteId)
    }

    @Test
    fun aSucceededJobStoresItsResultReference() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        queue.runDue()
        val job = db.remoteJobDao().byId(id)!!
        assertEquals(JobState.SUCCEEDED.name, job.state)
        assertEquals("results/r1.json", job.resultRef)
    }

    @Test
    fun anOfflineFailureKeepsTheJobQueuedAndSchedulesARetry() = runTest {
        api.failWith = RemoteFailure.Offline
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        val job = db.remoteJobDao().byId(id)!!
        assertEquals(JobState.QUEUED.name, job.state)
        assertEquals(1, job.attempts)
        assertTrue(job.nextAttemptAtMs > clock)
    }

    @Test
    fun aSleepingBackendIsRetriedRatherThanFailed() = runTest {
        api.failWith = RemoteFailure.BackendAsleep
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        assertEquals(JobState.QUEUED.name, db.remoteJobDao().byId(id)!!.state)
    }

    @Test
    fun anAuthFailureStopsRetryingImmediately() = runTest {
        api.failWith = RemoteFailure.Unauthorized
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        val job = db.remoteJobDao().byId(id)!!
        assertEquals(JobState.FAILED.name, job.state)
    }

    @Test
    fun aJobIsNotRetriedBeforeItsScheduledTime() = runTest {
        api.failWith = RemoteFailure.Offline
        queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        assertEquals(0, queue.runDue())
    }

    @Test
    fun submissionIsIdempotentOnceARemoteIdExists() = runTest {
        queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        api.status = JobStatus("r1", JobState.RUNNING)
        queue.runDue()
        queue.runDue()
        queue.runDue()
        assertEquals(1, api.submissions)
    }

    @Test
    fun cancellingAJobStopsItLocallyAndRemotely() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        queue.runDue()
        queue.cancel(id)
        assertEquals(JobState.CANCELLED.name, db.remoteJobDao().byId(id)!!.state)
        assertEquals(listOf("r1"), api.cancelled)
    }

    @Test
    fun aJobWithoutConsentIsNeverSubmitted() = runTest {
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = false)
        queue.runDue()
        assertEquals(0, api.submissions)
        assertEquals(JobState.QUEUED.name, db.remoteJobDao().byId(id)!!.state)
    }

    @Test
    fun retriesStopAfterTheMaximumAttemptCount() = runTest {
        api.failWith = RemoteFailure.Offline
        val id = queue.enqueue(RemoteOperation.NOOP_ECHO, "doc-1", consentGranted = true)
        repeat(RetryPolicy.MAX_ATTEMPTS + 2) {
            clock += 120_000L
            queue.runDue()
        }
        assertEquals(JobState.FAILED.name, db.remoteJobDao().byId(id)!!.state)
    }
}
