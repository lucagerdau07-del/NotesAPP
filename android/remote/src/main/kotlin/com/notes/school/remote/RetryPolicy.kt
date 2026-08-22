package com.notes.school.remote

import kotlin.math.pow
import kotlin.random.Random

sealed interface RemoteFailure {
    /** No usable network. The job stays queued; the editor is unaffected. */
    data object Offline : RemoteFailure
    /** The Hugging Face Space is cold. Worth waiting for. */
    data object BackendAsleep : RemoteFailure
    data object Unauthorized : RemoteFailure
    data class RateLimited(val retryAfterMs: Long) : RemoteFailure
    data class Server(val code: Int) : RemoteFailure
    data class Unknown(val cause: Throwable) : RemoteFailure
}

class RemoteException(val failure: RemoteFailure) : Exception(failure.toString())

object RetryPolicy {

    const val MAX_ATTEMPTS = 8
    private const val BASE_DELAY_MS = 2_000.0
    private const val MAX_DELAY_MS = 60_000L

    /** Exponential backoff with full jitter, so many queued jobs do not wake together. */
    fun nextDelayMs(attempt: Int, random: Random = Random.Default): Long {
        val exponential = (BASE_DELAY_MS * 2.0.pow((attempt - 1).coerceAtLeast(0)))
            .coerceAtMost(MAX_DELAY_MS.toDouble())
        return random.nextLong(1L, exponential.toLong().coerceAtLeast(2L))
    }

    fun isRetryable(failure: RemoteFailure): Boolean = when (failure) {
        RemoteFailure.Offline, RemoteFailure.BackendAsleep -> true
        is RemoteFailure.RateLimited -> true
        is RemoteFailure.Server -> failure.code >= 500
        RemoteFailure.Unauthorized -> false
        is RemoteFailure.Unknown -> false
    }
}
