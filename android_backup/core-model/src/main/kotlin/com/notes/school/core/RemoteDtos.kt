package com.notes.school.core

import kotlinx.serialization.Serializable

/** Operations the backend accepts. NOOP_ECHO exists so the contract can be exercised end to end. */
enum class RemoteOperation { NOOP_ECHO }

@Serializable
data class JobRequest(
    val operation: String,
    val schemaVersion: Int = 1,
    /** Small, explicit key-value payload. Never raw ink, page images or document text. */
    val payload: Map<String, String> = emptyMap()
)

@Serializable
data class JobHandle(val remoteId: String)

enum class JobState { QUEUED, SUBMITTED, RUNNING, SUCCEEDED, FAILED, CANCELLED }

@Serializable
data class JobStatus(
    val remoteId: String,
    val state: JobState,
    val resultRef: String? = null,
    val error: String? = null
)

@Serializable
data class HealthStatus(val ok: Boolean, val version: String)
