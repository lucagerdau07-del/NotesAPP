package com.notes.school.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        FolderEntity::class,
        DocumentEntity::class,
        PageEntity::class,
        StrokeEntity::class,
        PalmProfileEntity::class,
        RemoteJobEntity::class
    ],
    version = NotesDatabase.VERSION,
    exportSchema = true
)
abstract class NotesDatabase : RoomDatabase() {

    abstract fun folderDao(): FolderDao
    abstract fun documentDao(): DocumentDao
    abstract fun pageDao(): PageDao
    abstract fun strokeDao(): StrokeDao
    abstract fun palmProfileDao(): PalmProfileDao
    abstract fun remoteJobDao(): RemoteJobDao

    companion object {
        const val VERSION = 1
        const val NAME = "notes.db"

        fun open(context: Context): NotesDatabase =
            Room.databaseBuilder(context.applicationContext, NotesDatabase::class.java, NAME)
                .addMigrations(*Migrations.ALL)
                .build()
    }
}

/**
 * Every schema change adds a Migration here and commits the new schemas/N.json.
 * Version 1 is the baseline and has no migration.
 */
object Migrations {
    val ALL: Array<androidx.room.migration.Migration> = emptyArray()
}
