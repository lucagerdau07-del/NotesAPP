package com.notes.school.storage;

import androidx.annotation.NonNull;
import androidx.room.DatabaseConfiguration;
import androidx.room.InvalidationTracker;
import androidx.room.RoomDatabase;
import androidx.room.RoomOpenHelper;
import androidx.room.migration.AutoMigrationSpec;
import androidx.room.migration.Migration;
import androidx.room.util.DBUtil;
import androidx.room.util.TableInfo;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteOpenHelper;
import java.lang.Class;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class NotesDatabase_Impl extends NotesDatabase {
  private volatile FolderDao _folderDao;

  private volatile DocumentDao _documentDao;

  private volatile PageDao _pageDao;

  private volatile StrokeDao _strokeDao;

  private volatile PalmProfileDao _palmProfileDao;

  private volatile RemoteJobDao _remoteJobDao;

  @Override
  @NonNull
  protected SupportSQLiteOpenHelper createOpenHelper(@NonNull final DatabaseConfiguration config) {
    final SupportSQLiteOpenHelper.Callback _openCallback = new RoomOpenHelper(config, new RoomOpenHelper.Delegate(1) {
      @Override
      public void createAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `folders` (`id` TEXT NOT NULL, `parentId` TEXT, `name` TEXT NOT NULL, `sortIndex` INTEGER NOT NULL, `createdAtMs` INTEGER NOT NULL, `updatedAtMs` INTEGER NOT NULL, `trashed` INTEGER NOT NULL, PRIMARY KEY(`id`))");
        db.execSQL("CREATE TABLE IF NOT EXISTS `documents` (`id` TEXT NOT NULL, `folderId` TEXT, `title` TEXT NOT NULL, `kind` TEXT NOT NULL, `createdAtMs` INTEGER NOT NULL, `updatedAtMs` INTEGER NOT NULL, `favorite` INTEGER NOT NULL, `trashed` INTEGER NOT NULL, `sourceRef` TEXT, PRIMARY KEY(`id`))");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_documents_folderId` ON `documents` (`folderId`)");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_documents_updatedAtMs` ON `documents` (`updatedAtMs`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `pages` (`id` TEXT NOT NULL, `documentId` TEXT NOT NULL, `pageIndex` INTEGER NOT NULL, `widthPx` REAL NOT NULL, `heightPx` REAL NOT NULL, `sourceType` TEXT NOT NULL, `sourceValue` INTEGER NOT NULL, `scrollX` REAL NOT NULL, `scrollY` REAL NOT NULL, `zoom` REAL NOT NULL, PRIMARY KEY(`id`), FOREIGN KEY(`documentId`) REFERENCES `documents`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_pages_documentId` ON `pages` (`documentId`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `strokes` (`id` TEXT NOT NULL, `pageId` TEXT NOT NULL, `tool` TEXT NOT NULL, `colorArgb` INTEGER NOT NULL, `widthPx` REAL NOT NULL, `pointsBlob` BLOB NOT NULL, `boundsLeft` REAL NOT NULL, `boundsTop` REAL NOT NULL, `boundsRight` REAL NOT NULL, `boundsBottom` REAL NOT NULL, `strokeOrder` INTEGER NOT NULL, `active` INTEGER NOT NULL, PRIMARY KEY(`id`), FOREIGN KEY(`pageId`) REFERENCES `pages`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE )");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_strokes_pageId` ON `strokes` (`pageId`)");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_strokes_pageId_strokeOrder` ON `strokes` (`pageId`, `strokeOrder`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `palm_profiles` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `deviceFingerprint` TEXT NOT NULL, `orientation` TEXT NOT NULL, `revision` INTEGER NOT NULL, `json` TEXT NOT NULL, `score` REAL NOT NULL, `stable` INTEGER NOT NULL, `createdAtMs` INTEGER NOT NULL)");
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_palm_profiles_deviceFingerprint_orientation_revision` ON `palm_profiles` (`deviceFingerprint`, `orientation`, `revision`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS `remote_jobs` (`id` TEXT NOT NULL, `documentId` TEXT, `operation` TEXT NOT NULL, `consentGranted` INTEGER NOT NULL, `payloadRef` TEXT, `remoteId` TEXT, `state` TEXT NOT NULL, `attempts` INTEGER NOT NULL, `nextAttemptAtMs` INTEGER NOT NULL, `lastError` TEXT, `resultRef` TEXT, `createdAtMs` INTEGER NOT NULL, `updatedAtMs` INTEGER NOT NULL, PRIMARY KEY(`id`))");
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_remote_jobs_state` ON `remote_jobs` (`state`)");
        db.execSQL("CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY,identity_hash TEXT)");
        db.execSQL("INSERT OR REPLACE INTO room_master_table (id,identity_hash) VALUES(42, '9786b5f8b33128fc9170d27b10587a7e')");
      }

      @Override
      public void dropAllTables(@NonNull final SupportSQLiteDatabase db) {
        db.execSQL("DROP TABLE IF EXISTS `folders`");
        db.execSQL("DROP TABLE IF EXISTS `documents`");
        db.execSQL("DROP TABLE IF EXISTS `pages`");
        db.execSQL("DROP TABLE IF EXISTS `strokes`");
        db.execSQL("DROP TABLE IF EXISTS `palm_profiles`");
        db.execSQL("DROP TABLE IF EXISTS `remote_jobs`");
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onDestructiveMigration(db);
          }
        }
      }

      @Override
      public void onCreate(@NonNull final SupportSQLiteDatabase db) {
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onCreate(db);
          }
        }
      }

      @Override
      public void onOpen(@NonNull final SupportSQLiteDatabase db) {
        mDatabase = db;
        db.execSQL("PRAGMA foreign_keys = ON");
        internalInitInvalidationTracker(db);
        final List<? extends RoomDatabase.Callback> _callbacks = mCallbacks;
        if (_callbacks != null) {
          for (RoomDatabase.Callback _callback : _callbacks) {
            _callback.onOpen(db);
          }
        }
      }

      @Override
      public void onPreMigrate(@NonNull final SupportSQLiteDatabase db) {
        DBUtil.dropFtsSyncTriggers(db);
      }

      @Override
      public void onPostMigrate(@NonNull final SupportSQLiteDatabase db) {
      }

      @Override
      @NonNull
      public RoomOpenHelper.ValidationResult onValidateSchema(
          @NonNull final SupportSQLiteDatabase db) {
        final HashMap<String, TableInfo.Column> _columnsFolders = new HashMap<String, TableInfo.Column>(7);
        _columnsFolders.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsFolders.put("parentId", new TableInfo.Column("parentId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsFolders.put("name", new TableInfo.Column("name", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsFolders.put("sortIndex", new TableInfo.Column("sortIndex", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsFolders.put("createdAtMs", new TableInfo.Column("createdAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsFolders.put("updatedAtMs", new TableInfo.Column("updatedAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsFolders.put("trashed", new TableInfo.Column("trashed", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysFolders = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesFolders = new HashSet<TableInfo.Index>(0);
        final TableInfo _infoFolders = new TableInfo("folders", _columnsFolders, _foreignKeysFolders, _indicesFolders);
        final TableInfo _existingFolders = TableInfo.read(db, "folders");
        if (!_infoFolders.equals(_existingFolders)) {
          return new RoomOpenHelper.ValidationResult(false, "folders(com.notes.school.storage.FolderEntity).\n"
                  + " Expected:\n" + _infoFolders + "\n"
                  + " Found:\n" + _existingFolders);
        }
        final HashMap<String, TableInfo.Column> _columnsDocuments = new HashMap<String, TableInfo.Column>(9);
        _columnsDocuments.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("folderId", new TableInfo.Column("folderId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("title", new TableInfo.Column("title", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("kind", new TableInfo.Column("kind", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("createdAtMs", new TableInfo.Column("createdAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("updatedAtMs", new TableInfo.Column("updatedAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("favorite", new TableInfo.Column("favorite", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("trashed", new TableInfo.Column("trashed", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsDocuments.put("sourceRef", new TableInfo.Column("sourceRef", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysDocuments = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesDocuments = new HashSet<TableInfo.Index>(2);
        _indicesDocuments.add(new TableInfo.Index("index_documents_folderId", false, Arrays.asList("folderId"), Arrays.asList("ASC")));
        _indicesDocuments.add(new TableInfo.Index("index_documents_updatedAtMs", false, Arrays.asList("updatedAtMs"), Arrays.asList("ASC")));
        final TableInfo _infoDocuments = new TableInfo("documents", _columnsDocuments, _foreignKeysDocuments, _indicesDocuments);
        final TableInfo _existingDocuments = TableInfo.read(db, "documents");
        if (!_infoDocuments.equals(_existingDocuments)) {
          return new RoomOpenHelper.ValidationResult(false, "documents(com.notes.school.storage.DocumentEntity).\n"
                  + " Expected:\n" + _infoDocuments + "\n"
                  + " Found:\n" + _existingDocuments);
        }
        final HashMap<String, TableInfo.Column> _columnsPages = new HashMap<String, TableInfo.Column>(10);
        _columnsPages.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("documentId", new TableInfo.Column("documentId", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("pageIndex", new TableInfo.Column("pageIndex", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("widthPx", new TableInfo.Column("widthPx", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("heightPx", new TableInfo.Column("heightPx", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("sourceType", new TableInfo.Column("sourceType", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("sourceValue", new TableInfo.Column("sourceValue", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("scrollX", new TableInfo.Column("scrollX", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("scrollY", new TableInfo.Column("scrollY", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPages.put("zoom", new TableInfo.Column("zoom", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysPages = new HashSet<TableInfo.ForeignKey>(1);
        _foreignKeysPages.add(new TableInfo.ForeignKey("documents", "CASCADE", "NO ACTION", Arrays.asList("documentId"), Arrays.asList("id")));
        final HashSet<TableInfo.Index> _indicesPages = new HashSet<TableInfo.Index>(1);
        _indicesPages.add(new TableInfo.Index("index_pages_documentId", false, Arrays.asList("documentId"), Arrays.asList("ASC")));
        final TableInfo _infoPages = new TableInfo("pages", _columnsPages, _foreignKeysPages, _indicesPages);
        final TableInfo _existingPages = TableInfo.read(db, "pages");
        if (!_infoPages.equals(_existingPages)) {
          return new RoomOpenHelper.ValidationResult(false, "pages(com.notes.school.storage.PageEntity).\n"
                  + " Expected:\n" + _infoPages + "\n"
                  + " Found:\n" + _existingPages);
        }
        final HashMap<String, TableInfo.Column> _columnsStrokes = new HashMap<String, TableInfo.Column>(12);
        _columnsStrokes.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("pageId", new TableInfo.Column("pageId", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("tool", new TableInfo.Column("tool", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("colorArgb", new TableInfo.Column("colorArgb", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("widthPx", new TableInfo.Column("widthPx", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("pointsBlob", new TableInfo.Column("pointsBlob", "BLOB", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("boundsLeft", new TableInfo.Column("boundsLeft", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("boundsTop", new TableInfo.Column("boundsTop", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("boundsRight", new TableInfo.Column("boundsRight", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("boundsBottom", new TableInfo.Column("boundsBottom", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("strokeOrder", new TableInfo.Column("strokeOrder", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsStrokes.put("active", new TableInfo.Column("active", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysStrokes = new HashSet<TableInfo.ForeignKey>(1);
        _foreignKeysStrokes.add(new TableInfo.ForeignKey("pages", "CASCADE", "NO ACTION", Arrays.asList("pageId"), Arrays.asList("id")));
        final HashSet<TableInfo.Index> _indicesStrokes = new HashSet<TableInfo.Index>(2);
        _indicesStrokes.add(new TableInfo.Index("index_strokes_pageId", false, Arrays.asList("pageId"), Arrays.asList("ASC")));
        _indicesStrokes.add(new TableInfo.Index("index_strokes_pageId_strokeOrder", false, Arrays.asList("pageId", "strokeOrder"), Arrays.asList("ASC", "ASC")));
        final TableInfo _infoStrokes = new TableInfo("strokes", _columnsStrokes, _foreignKeysStrokes, _indicesStrokes);
        final TableInfo _existingStrokes = TableInfo.read(db, "strokes");
        if (!_infoStrokes.equals(_existingStrokes)) {
          return new RoomOpenHelper.ValidationResult(false, "strokes(com.notes.school.storage.StrokeEntity).\n"
                  + " Expected:\n" + _infoStrokes + "\n"
                  + " Found:\n" + _existingStrokes);
        }
        final HashMap<String, TableInfo.Column> _columnsPalmProfiles = new HashMap<String, TableInfo.Column>(8);
        _columnsPalmProfiles.put("id", new TableInfo.Column("id", "INTEGER", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPalmProfiles.put("deviceFingerprint", new TableInfo.Column("deviceFingerprint", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPalmProfiles.put("orientation", new TableInfo.Column("orientation", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPalmProfiles.put("revision", new TableInfo.Column("revision", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPalmProfiles.put("json", new TableInfo.Column("json", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPalmProfiles.put("score", new TableInfo.Column("score", "REAL", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPalmProfiles.put("stable", new TableInfo.Column("stable", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsPalmProfiles.put("createdAtMs", new TableInfo.Column("createdAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysPalmProfiles = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesPalmProfiles = new HashSet<TableInfo.Index>(1);
        _indicesPalmProfiles.add(new TableInfo.Index("index_palm_profiles_deviceFingerprint_orientation_revision", true, Arrays.asList("deviceFingerprint", "orientation", "revision"), Arrays.asList("ASC", "ASC", "ASC")));
        final TableInfo _infoPalmProfiles = new TableInfo("palm_profiles", _columnsPalmProfiles, _foreignKeysPalmProfiles, _indicesPalmProfiles);
        final TableInfo _existingPalmProfiles = TableInfo.read(db, "palm_profiles");
        if (!_infoPalmProfiles.equals(_existingPalmProfiles)) {
          return new RoomOpenHelper.ValidationResult(false, "palm_profiles(com.notes.school.storage.PalmProfileEntity).\n"
                  + " Expected:\n" + _infoPalmProfiles + "\n"
                  + " Found:\n" + _existingPalmProfiles);
        }
        final HashMap<String, TableInfo.Column> _columnsRemoteJobs = new HashMap<String, TableInfo.Column>(13);
        _columnsRemoteJobs.put("id", new TableInfo.Column("id", "TEXT", true, 1, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("documentId", new TableInfo.Column("documentId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("operation", new TableInfo.Column("operation", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("consentGranted", new TableInfo.Column("consentGranted", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("payloadRef", new TableInfo.Column("payloadRef", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("remoteId", new TableInfo.Column("remoteId", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("state", new TableInfo.Column("state", "TEXT", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("attempts", new TableInfo.Column("attempts", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("nextAttemptAtMs", new TableInfo.Column("nextAttemptAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("lastError", new TableInfo.Column("lastError", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("resultRef", new TableInfo.Column("resultRef", "TEXT", false, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("createdAtMs", new TableInfo.Column("createdAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        _columnsRemoteJobs.put("updatedAtMs", new TableInfo.Column("updatedAtMs", "INTEGER", true, 0, null, TableInfo.CREATED_FROM_ENTITY));
        final HashSet<TableInfo.ForeignKey> _foreignKeysRemoteJobs = new HashSet<TableInfo.ForeignKey>(0);
        final HashSet<TableInfo.Index> _indicesRemoteJobs = new HashSet<TableInfo.Index>(1);
        _indicesRemoteJobs.add(new TableInfo.Index("index_remote_jobs_state", false, Arrays.asList("state"), Arrays.asList("ASC")));
        final TableInfo _infoRemoteJobs = new TableInfo("remote_jobs", _columnsRemoteJobs, _foreignKeysRemoteJobs, _indicesRemoteJobs);
        final TableInfo _existingRemoteJobs = TableInfo.read(db, "remote_jobs");
        if (!_infoRemoteJobs.equals(_existingRemoteJobs)) {
          return new RoomOpenHelper.ValidationResult(false, "remote_jobs(com.notes.school.storage.RemoteJobEntity).\n"
                  + " Expected:\n" + _infoRemoteJobs + "\n"
                  + " Found:\n" + _existingRemoteJobs);
        }
        return new RoomOpenHelper.ValidationResult(true, null);
      }
    }, "9786b5f8b33128fc9170d27b10587a7e", "9af6c4fdb03f460001c6898ff1f64030");
    final SupportSQLiteOpenHelper.Configuration _sqliteConfig = SupportSQLiteOpenHelper.Configuration.builder(config.context).name(config.name).callback(_openCallback).build();
    final SupportSQLiteOpenHelper _helper = config.sqliteOpenHelperFactory.create(_sqliteConfig);
    return _helper;
  }

  @Override
  @NonNull
  protected InvalidationTracker createInvalidationTracker() {
    final HashMap<String, String> _shadowTablesMap = new HashMap<String, String>(0);
    final HashMap<String, Set<String>> _viewTables = new HashMap<String, Set<String>>(0);
    return new InvalidationTracker(this, _shadowTablesMap, _viewTables, "folders","documents","pages","strokes","palm_profiles","remote_jobs");
  }

  @Override
  public void clearAllTables() {
    super.assertNotMainThread();
    final SupportSQLiteDatabase _db = super.getOpenHelper().getWritableDatabase();
    final boolean _supportsDeferForeignKeys = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP;
    try {
      if (!_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA foreign_keys = FALSE");
      }
      super.beginTransaction();
      if (_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA defer_foreign_keys = TRUE");
      }
      _db.execSQL("DELETE FROM `folders`");
      _db.execSQL("DELETE FROM `documents`");
      _db.execSQL("DELETE FROM `pages`");
      _db.execSQL("DELETE FROM `strokes`");
      _db.execSQL("DELETE FROM `palm_profiles`");
      _db.execSQL("DELETE FROM `remote_jobs`");
      super.setTransactionSuccessful();
    } finally {
      super.endTransaction();
      if (!_supportsDeferForeignKeys) {
        _db.execSQL("PRAGMA foreign_keys = TRUE");
      }
      _db.query("PRAGMA wal_checkpoint(FULL)").close();
      if (!_db.inTransaction()) {
        _db.execSQL("VACUUM");
      }
    }
  }

  @Override
  @NonNull
  protected Map<Class<?>, List<Class<?>>> getRequiredTypeConverters() {
    final HashMap<Class<?>, List<Class<?>>> _typeConvertersMap = new HashMap<Class<?>, List<Class<?>>>();
    _typeConvertersMap.put(FolderDao.class, FolderDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(DocumentDao.class, DocumentDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(PageDao.class, PageDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(StrokeDao.class, StrokeDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(PalmProfileDao.class, PalmProfileDao_Impl.getRequiredConverters());
    _typeConvertersMap.put(RemoteJobDao.class, RemoteJobDao_Impl.getRequiredConverters());
    return _typeConvertersMap;
  }

  @Override
  @NonNull
  public Set<Class<? extends AutoMigrationSpec>> getRequiredAutoMigrationSpecs() {
    final HashSet<Class<? extends AutoMigrationSpec>> _autoMigrationSpecsSet = new HashSet<Class<? extends AutoMigrationSpec>>();
    return _autoMigrationSpecsSet;
  }

  @Override
  @NonNull
  public List<Migration> getAutoMigrations(
      @NonNull final Map<Class<? extends AutoMigrationSpec>, AutoMigrationSpec> autoMigrationSpecs) {
    final List<Migration> _autoMigrations = new ArrayList<Migration>();
    return _autoMigrations;
  }

  @Override
  public FolderDao folderDao() {
    if (_folderDao != null) {
      return _folderDao;
    } else {
      synchronized(this) {
        if(_folderDao == null) {
          _folderDao = new FolderDao_Impl(this);
        }
        return _folderDao;
      }
    }
  }

  @Override
  public DocumentDao documentDao() {
    if (_documentDao != null) {
      return _documentDao;
    } else {
      synchronized(this) {
        if(_documentDao == null) {
          _documentDao = new DocumentDao_Impl(this);
        }
        return _documentDao;
      }
    }
  }

  @Override
  public PageDao pageDao() {
    if (_pageDao != null) {
      return _pageDao;
    } else {
      synchronized(this) {
        if(_pageDao == null) {
          _pageDao = new PageDao_Impl(this);
        }
        return _pageDao;
      }
    }
  }

  @Override
  public StrokeDao strokeDao() {
    if (_strokeDao != null) {
      return _strokeDao;
    } else {
      synchronized(this) {
        if(_strokeDao == null) {
          _strokeDao = new StrokeDao_Impl(this);
        }
        return _strokeDao;
      }
    }
  }

  @Override
  public PalmProfileDao palmProfileDao() {
    if (_palmProfileDao != null) {
      return _palmProfileDao;
    } else {
      synchronized(this) {
        if(_palmProfileDao == null) {
          _palmProfileDao = new PalmProfileDao_Impl(this);
        }
        return _palmProfileDao;
      }
    }
  }

  @Override
  public RemoteJobDao remoteJobDao() {
    if (_remoteJobDao != null) {
      return _remoteJobDao;
    } else {
      synchronized(this) {
        if(_remoteJobDao == null) {
          _remoteJobDao = new RemoteJobDao_Impl(this);
        }
        return _remoteJobDao;
      }
    }
  }
}
