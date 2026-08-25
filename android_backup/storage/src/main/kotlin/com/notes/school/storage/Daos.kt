package com.notes.school.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface FolderDao {
    @Upsert suspend fun upsert(folder: FolderEntity)
    @Query("SELECT * FROM folders WHERE trashed = 0 AND parentId IS :parentId ORDER BY sortIndex")
    suspend fun children(parentId: String?): List<FolderEntity>
    @Query("SELECT * FROM folders WHERE trashed = 0 ORDER BY sortIndex")
    fun observeAll(): Flow<List<FolderEntity>>
    @Query("UPDATE folders SET trashed = :trashed, updatedAtMs = :nowMs WHERE id = :id")
    suspend fun setTrashed(id: String, trashed: Boolean, nowMs: Long = System.currentTimeMillis())
    @Query("DELETE FROM folders WHERE id = :id") suspend fun deleteById(id: String)
}

@Dao
interface DocumentDao {
    @Upsert suspend fun upsert(document: DocumentEntity)
    @Query("SELECT * FROM documents WHERE id = :id") suspend fun byId(id: String): DocumentEntity?
    @Query("SELECT * FROM documents WHERE folderId = :folderId AND trashed = 0 ORDER BY updatedAtMs DESC")
    suspend fun inFolder(folderId: String): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE trashed = 0 ORDER BY updatedAtMs DESC LIMIT :limit")
    suspend fun recent(limit: Int): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE favorite = 1 AND trashed = 0 ORDER BY updatedAtMs DESC")
    suspend fun favorites(): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE trashed = 1 ORDER BY updatedAtMs DESC")
    suspend fun trashed(): List<DocumentEntity>
    @Query("SELECT * FROM documents WHERE trashed = 0 ORDER BY updatedAtMs DESC")
    fun observeAll(): Flow<List<DocumentEntity>>
    @Query("UPDATE documents SET favorite = :favorite WHERE id = :id")
    suspend fun setFavorite(id: String, favorite: Boolean)
    @Query("UPDATE documents SET trashed = :trashed WHERE id = :id")
    suspend fun setTrashed(id: String, trashed: Boolean)
    @Query("UPDATE documents SET title = :title, updatedAtMs = :nowMs WHERE id = :id")
    suspend fun rename(id: String, title: String, nowMs: Long)
    @Query("UPDATE documents SET folderId = :folderId, updatedAtMs = :nowMs WHERE id = :id")
    suspend fun move(id: String, folderId: String?, nowMs: Long)
    @Query("UPDATE documents SET updatedAtMs = :nowMs WHERE id = :id")
    suspend fun touch(id: String, nowMs: Long)
    @Query("DELETE FROM documents WHERE id = :id") suspend fun deleteById(id: String)
}

@Dao
interface PageDao {
    @Upsert suspend fun upsert(page: PageEntity)
    @Upsert suspend fun upsertAll(pages: List<PageEntity>)
    @Query("SELECT * FROM pages WHERE documentId = :documentId ORDER BY pageIndex")
    suspend fun forDocument(documentId: String): List<PageEntity>
    @Query("SELECT * FROM pages WHERE id = :id") suspend fun byId(id: String): PageEntity?
    @Query("UPDATE pages SET scrollX = :x, scrollY = :y, zoom = :zoom WHERE id = :id")
    suspend fun saveViewport(id: String, x: Float, y: Float, zoom: Float)
}

@Dao
interface StrokeDao {
    @Upsert suspend fun upsert(stroke: StrokeEntity)

    @Transaction
    @Upsert
    suspend fun upsertAll(strokes: List<StrokeEntity>)

    @Query("SELECT * FROM strokes WHERE pageId = :pageId ORDER BY strokeOrder")
    suspend fun forPage(pageId: String): List<StrokeEntity>
    @Query("SELECT * FROM strokes WHERE pageId = :pageId AND active = 1 ORDER BY strokeOrder")
    suspend fun activeForPage(pageId: String): List<StrokeEntity>
    @Query("UPDATE strokes SET active = :active WHERE id IN (:ids)")
    suspend fun setActive(ids: List<String>, active: Boolean)
    @Query("SELECT COUNT(*) FROM strokes WHERE pageId = :pageId") suspend fun countForPage(pageId: String): Int
    @Query("DELETE FROM strokes WHERE pageId NOT IN (SELECT id FROM pages)")
    suspend fun deleteOrphans(): Int
}

@Dao
interface PalmProfileDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(profile: PalmProfileEntity)
    @Query(
        "SELECT * FROM palm_profiles WHERE deviceFingerprint = :device AND orientation = :orientation " +
            "AND stable = 1 ORDER BY revision DESC LIMIT 1"
    )
    suspend fun latestStable(device: String, orientation: String): PalmProfileEntity?
    @Query(
        "SELECT * FROM palm_profiles WHERE deviceFingerprint = :device AND orientation = :orientation " +
            "ORDER BY revision DESC LIMIT 1"
    )
    suspend fun latest(device: String, orientation: String): PalmProfileEntity?
    @Query("DELETE FROM palm_profiles WHERE deviceFingerprint = :device AND orientation = :orientation")
    suspend fun reset(device: String, orientation: String)
}

@Dao
interface RemoteJobDao {
    @Upsert suspend fun upsert(job: RemoteJobEntity)
    @Query("SELECT * FROM remote_jobs WHERE id = :id") suspend fun byId(id: String): RemoteJobEntity?
    @Query("SELECT * FROM remote_jobs WHERE state IN (:states) AND nextAttemptAtMs <= :nowMs ORDER BY createdAtMs")
    suspend fun due(states: List<String>, nowMs: Long): List<RemoteJobEntity>
    @Query("SELECT * FROM remote_jobs ORDER BY createdAtMs DESC")
    fun observeAll(): Flow<List<RemoteJobEntity>>
    @Query("DELETE FROM remote_jobs WHERE id = :id") suspend fun deleteById(id: String)
}
