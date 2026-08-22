package com.notes.school.remote

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RetryPolicyTest {

    @Test
    fun delayGrowsExponentiallyWithTheAttemptNumber() {
        val first = RetryPolicy.nextDelayMs(1, Random(1))
        val third = RetryPolicy.nextDelayMs(3, Random(1))
        assertTrue("$first should be well below $third", third > first * 2)
    }

    @Test
    fun delayIsCappedSoAWokenBackendIsNoticedWithinAMinute() {
        assertTrue(RetryPolicy.nextDelayMs(20, Random(7)) <= 60_000L)
    }

    @Test
    fun jitterMakesTwoRetriesDifferSoRequestsDoNotSynchronize() {
        val a = RetryPolicy.nextDelayMs(4, Random(1))
        val b = RetryPolicy.nextDelayMs(4, Random(2))
        assertTrue("expected jitter, both were $a", a != b)
    }

    @Test
    fun theDelayIsNeverNegativeOrZero() {
        (1..20).forEach { assertTrue(RetryPolicy.nextDelayMs(it, Random(it)) > 0L) }
    }

    @Test
    fun offlineAndSleepingBackendsAreWorthRetrying() {
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.Offline))
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.BackendAsleep))
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.Server(503)))
    }

    @Test
    fun aRateLimitIsRetriedAfterTheServerSuppliedDelay() {
        assertTrue(RetryPolicy.isRetryable(RemoteFailure.RateLimited(retryAfterMs = 30_000L)))
        assertEquals(30_000L, (RemoteFailure.RateLimited(30_000L)).retryAfterMs)
    }

    @Test
    fun anAuthFailureIsNotRetriedBecauseRetryingCannotFixIt() {
        assertFalse(RetryPolicy.isRetryable(RemoteFailure.Unauthorized))
    }
}
