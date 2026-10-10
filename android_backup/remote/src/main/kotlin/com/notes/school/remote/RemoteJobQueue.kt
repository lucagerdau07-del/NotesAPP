package com.notes.school.remote

import com.notes.school.core.JobRequest
import com.notes.school.core.JobState
import com.notes.school.core.RemoteOperation
import com.notes.school.core.newId
import com.notes.school.storage.RemoteJobDao
import com.notes.school.storage.RemoteJobEntity
import kotlinx.coroutines.flow.Flow

/**
 * Durable, offline-first job queue. Every job is written to Room before any network call,
 * so closing the app, losing Wi-Fi, or a sleeping Space cannot lose it. Nothing here can
 * block the editor: [runDue] is called from background work only.
 *
 * Documents are never uploaded automatically. A job without consent stays queued and
 * visible until the user grants it.
 */
class RemoteJobQueue(
    private val dao: RemoteJobDao,
    private val api: NotesApi,
    private val nowMs: () -> Long = System::currentTimeMillis
) {
    fun observe(): Flow<List<RemoteJobEntity>> = dao.observeAll()

    suspend fun enqueue(
        operation: RemoteOperation,
        documentId: String?,
        consentGranted: Boolean
    ): String {
        val id = newId()
        val now = nowMs()
        dao.upsert(
            RemoteJobEntity(
                id = id,
                documentId = documentId,
                operation = operation.name,
                consentGranted = consentGranted,
                payloadRef = null,
                remoteId = null,
                state = JobState.QUEUED.name,
                attempts = 0,
                nextAttemptAtMs = now,
                lastError = null,
                resultRef = null,
                createdAtMs = now,
                updatedAtMs = now
            )
        )
        return id
    }

    /** @return how many jobs were advanced. */
    suspend fun runDue(): Int {
        val due = dao.due(
            states = listOf(JobState.QUEUED.name, JobState.SUBMITTED.name, JobState.RUNNING.name),
            nowMs = nowMs()
        )
        var advanced = 0
        for (job in due) {
            if (!job.consentGranted) continue
            advanced += if (job.remoteId == null) submit(job) else poll(job)
        }
        return advanced
    }

    suspend fun cancel(localId: String) {
        val job = dao.byId(localId) ?: return
        job.remoteId?.let { runCatching { api.cancel(it) } }
        dao.upsert(job.copy(state = JobState.CANCELLED.name, updatedAtMs = nowMs()))
    }

    private suspend fun submit(job: RemoteJobEntity): Int = try {
        val handle = api.submit(JobRequest(operation = job.operation))
        dao.upsert(
            job.copy(
                remoteId = handle.remoteId,
                state = JobState.SUBMITTED.name,
                lastError = null,
                updatedAtMs = nowMs()
            )
        )
        1
    } catch (e: RemoteException) {
        recordFailure(job, e)
        0
    }

    private suspend fun poll(job: RemoteJobEntity): Int = try {
        val status = api.poll(job.remoteId!!)
        dao.upsert(
            job.copy(
                state = status.state.name,
                resultRef = status.resultRef,
                lastError = status.error,
                updatedAtMs = nowMs()
            )
        )
        1
    } catch (e: RemoteException) {
        recordFailure(job, e)
        0
    }

    private suspend fun recordFailure(job: RemoteJobEntity, e: RemoteException) {
        val attempts = job.attempts + 1
        val retryable = RetryPolicy.isRetryable(e.failure) && attempts < RetryPolicy.MAX_ATTEMPTS
        val delay = when (val failure = e.failure) {
            is RemoteFailure.RateLimited -> failure.retryAfterMs
            else -> RetryPolicy.nextDelayMs(attempts)
        }
        dao.upsert(
            job.copy(
                state = if (retryable) JobState.QUEUED.name else JobState.FAILED.name,
                attempts = attempts,
                nextAttemptAtMs = nowMs() + delay,
                // The failure kind only; never the response body, which could echo content.
                lastError = e.failure::class.simpleName,
                updatedAtMs = nowMs()
            )
        )
    }
}
