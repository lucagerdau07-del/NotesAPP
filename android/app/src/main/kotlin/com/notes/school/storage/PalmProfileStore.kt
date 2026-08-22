package com.notes.school.storage

import com.notes.school.core.PalmProfile
import com.notes.school.core.ScreenOrientation
import kotlinx.serialization.json.Json

/**
 * Persists palm profiles as serialized JSON in the palm_profiles table. Lives in the app
 * module so `storage` needs no knowledge of the touch engine, and so the stored JSON stays
 * a plain snapshot of the core-model type.
 */
class PalmProfileStore(
    private val dao: PalmProfileDao,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {
    suspend fun loadStable(device: String, orientation: ScreenOrientation): PalmProfile? =
        dao.latestStable(device, orientation.name)?.let { json.decodeFromString(it.json) }

    suspend fun loadLatest(device: String, orientation: ScreenOrientation): PalmProfile? =
        dao.latest(device, orientation.name)?.let { json.decodeFromString(it.json) }

    suspend fun save(profile: PalmProfile) {
        dao.upsert(
            PalmProfileEntity(
                deviceFingerprint = profile.deviceFingerprint,
                orientation = profile.orientation.name,
                revision = profile.revision,
                json = json.encodeToString(PalmProfile.serializer(), profile),
                score = profile.score,
                stable = profile.stable,
                createdAtMs = profile.createdAtMs
            )
        )
    }

    suspend fun reset(device: String, orientation: ScreenOrientation) {
        dao.reset(device, orientation.name)
    }
}
