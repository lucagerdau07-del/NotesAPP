package com.notes.school.remote

import com.notes.school.core.HealthStatus
import com.notes.school.core.JobHandle
import com.notes.school.core.JobRequest
import com.notes.school.core.JobStatus
import java.io.IOException
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** Public HTTPS base of the restricted Notes service inside the existing Docker Space. */
const val NOTES_BASE_URL = "https://luca448-app-backend.hf.space/notes/"

interface NotesApi {
    suspend fun submit(request: JobRequest): JobHandle
    suspend fun poll(remoteId: String): JobStatus
    suspend fun cancel(remoteId: String)
    suspend fun health(): HealthStatus
}

/**
 * REST submit-then-poll client. No WebSockets, no streaming: a sleeping Space and a lost
 * Wi-Fi connection must both be ordinary, resumable conditions.
 *
 * The app only ever holds the restricted Notes token. GRAVITY_TOKEN and provider API keys
 * stay server-side and are never shipped in the APK.
 */
class NotesApiClient(
    private val baseUrl: String = NOTES_BASE_URL,
    private val tokenProvider: () -> String?,
    private val client: OkHttpClient = OkHttpClient(),
    private val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
) : NotesApi {

    override suspend fun submit(request: JobRequest): JobHandle {
        val body = json.encodeToString(JobRequest.serializer(), request)
            .toRequestBody("application/json".toMediaType())
        val response = execute(builder("v1/jobs").post(body).build())
        return json.decodeFromString(JobHandle.serializer(), response)
    }

    override suspend fun poll(remoteId: String): JobStatus {
        val response = execute(builder("v1/jobs/$remoteId").get().build())
        return json.decodeFromString(JobStatus.serializer(), response)
    }

    override suspend fun cancel(remoteId: String) {
        execute(builder("v1/jobs/$remoteId").delete().build())
    }

    override suspend fun health(): HealthStatus {
        val response = execute(builder("v1/health").get().build())
        return json.decodeFromString(HealthStatus.serializer(), response)
    }

    private fun builder(path: String): Request.Builder {
        val token = tokenProvider() ?: throw RemoteException(RemoteFailure.Unauthorized)
        return Request.Builder()
            .url(baseUrl.trimEnd('/') + "/" + path)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
    }

    private fun execute(request: Request): String {
        val response: Response = try {
            client.newCall(request).execute()
        } catch (e: IOException) {
            throw RemoteException(RemoteFailure.Offline)
        }
        response.use {
            if (!it.isSuccessful) throw RemoteException(classify(it))
            return it.body?.string().orEmpty().ifEmpty { "{}" }
        }
    }

    private fun classify(response: Response): RemoteFailure = when (response.code) {
        401, 403 -> RemoteFailure.Unauthorized
        429 -> RemoteFailure.RateLimited(
            (response.header("Retry-After")?.toLongOrNull() ?: 30L) * 1000L
        )
        // A cold Hugging Face Space answers 503 while it boots.
        502, 503, 504 -> RemoteFailure.BackendAsleep
        else -> RemoteFailure.Server(response.code)
    }
}
