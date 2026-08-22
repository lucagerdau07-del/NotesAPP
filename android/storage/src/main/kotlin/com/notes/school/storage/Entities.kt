package com.notes.school.storage

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "folders")
data class FolderEntity(
    @PrimaryKey val id: String,
    val parentId: String?,
    val name: String,
    val sortIndex: Int,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val trashed: Boolean
)

@Entity(
    tableName = "documents",
    indices = [Index("folderId"), Index("updatedAtMs")]
)
data class DocumentEntity(
    @PrimaryKey val id: String,
    val folderId: String?,
    val title: String,
    val kind: String,
    val createdAtMs: Long,
    val updatedAtMs: Long,
    val favorite: Boolean,
    val trashed: Boolean,
    /** Relative path of the immutable imported PDF inside app-private storage. */
    val sourceRef: String?
)

@Entity(
    tableName = "pages",
    indices = [Index("documentId")],
    foreignKeys = [
        ForeignKey(
            entity = DocumentEntity::class,
            parentColumns = ["id"],
            childColumns = ["documentId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class PageEntity(
    @PrimaryKey val id: String,
    val documentId: String,
    val pageIndex: Int,
    val widthPx: Float,
    val heightPx: Float,
    /** "TEMPLATE" or "PDF". */
    val sourceType: String,
    /** Template ordinal for TEMPLATE, PDF page index for PDF. */
    val sourceValue: Int,
    val scrollX: Float,
    val scrollY: Float,
    val zoom: Float
)

@Entity(
    tableName = "strokes",
    indices = [Index("pageId"), Index(value = ["pageId", "strokeOrder"])],
    foreignKeys = [
        ForeignKey(
            entity = PageEntity::class,
            parentColumns = ["id"],
            childColumns = ["pageId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class StrokeEntity(
    @PrimaryKey val id: String,
    val pageId: String,
    val tool: String,
    val colorArgb: Int,
    val widthPx: Float,
    /** StrokeCodec-encoded point array. */
    val pointsBlob: ByteArray,
    val boundsLeft: Float,
    val boundsTop: Float,
    val boundsRight: Float,
    val boundsBottom: Float,
    val strokeOrder: Long,
    val active: Boolean
) {
    // Room data classes holding a ByteArray need explicit equality.
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is StrokeEntity) return false
        return id == other.id &&
            pageId == other.pageId &&
            tool == other.tool &&
            colorArgb == other.colorArgb &&
            widthPx == other.widthPx &&
            pointsBlob.contentEquals(other.pointsBlob) &&
            boundsLeft == other.boundsLeft &&
            boundsTop == other.boundsTop &&
            boundsRight == other.boundsRight &&
            boundsBottom == other.boundsBottom &&
            strokeOrder == other.strokeOrder &&
            active == other.active
    }

    override fun hashCode(): Int = id.hashCode() * 31 + strokeOrder.hashCode()
}

@Entity(
    tableName = "palm_profiles",
    indices = [Index(value = ["deviceFingerprint", "orientation", "revision"], unique = true)]
)
data class PalmProfileEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val deviceFingerprint: String,
    val orientation: String,
    val revision: Int,
    /** Serialized PalmProfile. Contains thresholds only — never ink or page content. */
    val json: String,
    val score: Float,
    val stable: Boolean,
    val createdAtMs: Long
)

@Entity(tableName = "remote_jobs", indices = [Index("state")])
data class RemoteJobEntity(
    @PrimaryKey val id: String,
    val documentId: String?,
    val operation: String,
    val consentGranted: Boolean,
    /** Relative path of the payload file in app-private storage, if any. */
    val payloadRef: String?,
    val remoteId: String?,
    val state: String,
    val attempts: Int,
    val nextAttemptAtMs: Long,
    val lastError: String?,
    val resultRef: String?,
    val createdAtMs: Long,
    val updatedAtMs: Long
)
