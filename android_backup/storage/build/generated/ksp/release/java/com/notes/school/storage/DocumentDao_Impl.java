package com.notes.school.storage;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityDeletionOrUpdateAdapter;
import androidx.room.EntityInsertionAdapter;
import androidx.room.EntityUpsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlinx.coroutines.flow.Flow;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class DocumentDao_Impl implements DocumentDao {
  private final RoomDatabase __db;

  private final SharedSQLiteStatement __preparedStmtOfSetFavorite;

  private final SharedSQLiteStatement __preparedStmtOfSetTrashed;

  private final SharedSQLiteStatement __preparedStmtOfRename;

  private final SharedSQLiteStatement __preparedStmtOfMove;

  private final SharedSQLiteStatement __preparedStmtOfTouch;

  private final SharedSQLiteStatement __preparedStmtOfDeleteById;

  private final EntityUpsertionAdapter<DocumentEntity> __upsertionAdapterOfDocumentEntity;

  public DocumentDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__preparedStmtOfSetFavorite = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE documents SET favorite = ? WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfSetTrashed = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE documents SET trashed = ? WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfRename = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE documents SET title = ?, updatedAtMs = ? WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfMove = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE documents SET folderId = ?, updatedAtMs = ? WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfTouch = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE documents SET updatedAtMs = ? WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfDeleteById = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM documents WHERE id = ?";
        return _query;
      }
    };
    this.__upsertionAdapterOfDocumentEntity = new EntityUpsertionAdapter<DocumentEntity>(new EntityInsertionAdapter<DocumentEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT INTO `documents` (`id`,`folderId`,`title`,`kind`,`createdAtMs`,`updatedAtMs`,`favorite`,`trashed`,`sourceRef`) VALUES (?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final DocumentEntity entity) {
        statement.bindString(1, entity.getId());
        if (entity.getFolderId() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getFolderId());
        }
        statement.bindString(3, entity.getTitle());
        statement.bindString(4, entity.getKind());
        statement.bindLong(5, entity.getCreatedAtMs());
        statement.bindLong(6, entity.getUpdatedAtMs());
        final int _tmp = entity.getFavorite() ? 1 : 0;
        statement.bindLong(7, _tmp);
        final int _tmp_1 = entity.getTrashed() ? 1 : 0;
        statement.bindLong(8, _tmp_1);
        if (entity.getSourceRef() == null) {
          statement.bindNull(9);
        } else {
          statement.bindString(9, entity.getSourceRef());
        }
      }
    }, new EntityDeletionOrUpdateAdapter<DocumentEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE `documents` SET `id` = ?,`folderId` = ?,`title` = ?,`kind` = ?,`createdAtMs` = ?,`updatedAtMs` = ?,`favorite` = ?,`trashed` = ?,`sourceRef` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final DocumentEntity entity) {
        statement.bindString(1, entity.getId());
        if (entity.getFolderId() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getFolderId());
        }
        statement.bindString(3, entity.getTitle());
        statement.bindString(4, entity.getKind());
        statement.bindLong(5, entity.getCreatedAtMs());
        statement.bindLong(6, entity.getUpdatedAtMs());
        final int _tmp = entity.getFavorite() ? 1 : 0;
        statement.bindLong(7, _tmp);
        final int _tmp_1 = entity.getTrashed() ? 1 : 0;
        statement.bindLong(8, _tmp_1);
        if (entity.getSourceRef() == null) {
          statement.bindNull(9);
        } else {
          statement.bindString(9, entity.getSourceRef());
        }
        statement.bindString(10, entity.getId());
      }
    });
  }

  @Override
  public Object setFavorite(final String id, final boolean favorite,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfSetFavorite.acquire();
        int _argIndex = 1;
        final int _tmp = favorite ? 1 : 0;
        _stmt.bindLong(_argIndex, _tmp);
        _argIndex = 2;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfSetFavorite.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object setTrashed(final String id, final boolean trashed,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfSetTrashed.acquire();
        int _argIndex = 1;
        final int _tmp = trashed ? 1 : 0;
        _stmt.bindLong(_argIndex, _tmp);
        _argIndex = 2;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfSetTrashed.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object rename(final String id, final String title, final long nowMs,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfRename.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, title);
        _argIndex = 2;
        _stmt.bindLong(_argIndex, nowMs);
        _argIndex = 3;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfRename.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object move(final String id, final String folderId, final long nowMs,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfMove.acquire();
        int _argIndex = 1;
        if (folderId == null) {
          _stmt.bindNull(_argIndex);
        } else {
          _stmt.bindString(_argIndex, folderId);
        }
        _argIndex = 2;
        _stmt.bindLong(_argIndex, nowMs);
        _argIndex = 3;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfMove.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object touch(final String id, final long nowMs,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfTouch.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, nowMs);
        _argIndex = 2;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfTouch.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object deleteById(final String id, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDeleteById.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfDeleteById.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object upsert(final DocumentEntity document,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __upsertionAdapterOfDocumentEntity.upsert(document);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object byId(final String id, final Continuation<? super DocumentEntity> $completion) {
    final String _sql = "SELECT * FROM documents WHERE id = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, id);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<DocumentEntity>() {
      @Override
      @Nullable
      public DocumentEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfFolderId = CursorUtil.getColumnIndexOrThrow(_cursor, "folderId");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfKind = CursorUtil.getColumnIndexOrThrow(_cursor, "kind");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfFavorite = CursorUtil.getColumnIndexOrThrow(_cursor, "favorite");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final int _cursorIndexOfSourceRef = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceRef");
          final DocumentEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpFolderId;
            if (_cursor.isNull(_cursorIndexOfFolderId)) {
              _tmpFolderId = null;
            } else {
              _tmpFolderId = _cursor.getString(_cursorIndexOfFolderId);
            }
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpKind;
            _tmpKind = _cursor.getString(_cursorIndexOfKind);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpFavorite;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfFavorite);
            _tmpFavorite = _tmp != 0;
            final boolean _tmpTrashed;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp_1 != 0;
            final String _tmpSourceRef;
            if (_cursor.isNull(_cursorIndexOfSourceRef)) {
              _tmpSourceRef = null;
            } else {
              _tmpSourceRef = _cursor.getString(_cursorIndexOfSourceRef);
            }
            _result = new DocumentEntity(_tmpId,_tmpFolderId,_tmpTitle,_tmpKind,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpFavorite,_tmpTrashed,_tmpSourceRef);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object inFolder(final String folderId,
      final Continuation<? super List<DocumentEntity>> $completion) {
    final String _sql = "SELECT * FROM documents WHERE folderId = ? AND trashed = 0 ORDER BY updatedAtMs DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, folderId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<DocumentEntity>>() {
      @Override
      @NonNull
      public List<DocumentEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfFolderId = CursorUtil.getColumnIndexOrThrow(_cursor, "folderId");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfKind = CursorUtil.getColumnIndexOrThrow(_cursor, "kind");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfFavorite = CursorUtil.getColumnIndexOrThrow(_cursor, "favorite");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final int _cursorIndexOfSourceRef = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceRef");
          final List<DocumentEntity> _result = new ArrayList<DocumentEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final DocumentEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpFolderId;
            if (_cursor.isNull(_cursorIndexOfFolderId)) {
              _tmpFolderId = null;
            } else {
              _tmpFolderId = _cursor.getString(_cursorIndexOfFolderId);
            }
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpKind;
            _tmpKind = _cursor.getString(_cursorIndexOfKind);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpFavorite;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfFavorite);
            _tmpFavorite = _tmp != 0;
            final boolean _tmpTrashed;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp_1 != 0;
            final String _tmpSourceRef;
            if (_cursor.isNull(_cursorIndexOfSourceRef)) {
              _tmpSourceRef = null;
            } else {
              _tmpSourceRef = _cursor.getString(_cursorIndexOfSourceRef);
            }
            _item = new DocumentEntity(_tmpId,_tmpFolderId,_tmpTitle,_tmpKind,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpFavorite,_tmpTrashed,_tmpSourceRef);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object recent(final int limit,
      final Continuation<? super List<DocumentEntity>> $completion) {
    final String _sql = "SELECT * FROM documents WHERE trashed = 0 ORDER BY updatedAtMs DESC LIMIT ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, limit);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<DocumentEntity>>() {
      @Override
      @NonNull
      public List<DocumentEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfFolderId = CursorUtil.getColumnIndexOrThrow(_cursor, "folderId");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfKind = CursorUtil.getColumnIndexOrThrow(_cursor, "kind");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfFavorite = CursorUtil.getColumnIndexOrThrow(_cursor, "favorite");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final int _cursorIndexOfSourceRef = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceRef");
          final List<DocumentEntity> _result = new ArrayList<DocumentEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final DocumentEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpFolderId;
            if (_cursor.isNull(_cursorIndexOfFolderId)) {
              _tmpFolderId = null;
            } else {
              _tmpFolderId = _cursor.getString(_cursorIndexOfFolderId);
            }
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpKind;
            _tmpKind = _cursor.getString(_cursorIndexOfKind);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpFavorite;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfFavorite);
            _tmpFavorite = _tmp != 0;
            final boolean _tmpTrashed;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp_1 != 0;
            final String _tmpSourceRef;
            if (_cursor.isNull(_cursorIndexOfSourceRef)) {
              _tmpSourceRef = null;
            } else {
              _tmpSourceRef = _cursor.getString(_cursorIndexOfSourceRef);
            }
            _item = new DocumentEntity(_tmpId,_tmpFolderId,_tmpTitle,_tmpKind,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpFavorite,_tmpTrashed,_tmpSourceRef);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object favorites(final Continuation<? super List<DocumentEntity>> $completion) {
    final String _sql = "SELECT * FROM documents WHERE favorite = 1 AND trashed = 0 ORDER BY updatedAtMs DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<DocumentEntity>>() {
      @Override
      @NonNull
      public List<DocumentEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfFolderId = CursorUtil.getColumnIndexOrThrow(_cursor, "folderId");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfKind = CursorUtil.getColumnIndexOrThrow(_cursor, "kind");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfFavorite = CursorUtil.getColumnIndexOrThrow(_cursor, "favorite");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final int _cursorIndexOfSourceRef = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceRef");
          final List<DocumentEntity> _result = new ArrayList<DocumentEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final DocumentEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpFolderId;
            if (_cursor.isNull(_cursorIndexOfFolderId)) {
              _tmpFolderId = null;
            } else {
              _tmpFolderId = _cursor.getString(_cursorIndexOfFolderId);
            }
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpKind;
            _tmpKind = _cursor.getString(_cursorIndexOfKind);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpFavorite;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfFavorite);
            _tmpFavorite = _tmp != 0;
            final boolean _tmpTrashed;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp_1 != 0;
            final String _tmpSourceRef;
            if (_cursor.isNull(_cursorIndexOfSourceRef)) {
              _tmpSourceRef = null;
            } else {
              _tmpSourceRef = _cursor.getString(_cursorIndexOfSourceRef);
            }
            _item = new DocumentEntity(_tmpId,_tmpFolderId,_tmpTitle,_tmpKind,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpFavorite,_tmpTrashed,_tmpSourceRef);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object trashed(final Continuation<? super List<DocumentEntity>> $completion) {
    final String _sql = "SELECT * FROM documents WHERE trashed = 1 ORDER BY updatedAtMs DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<DocumentEntity>>() {
      @Override
      @NonNull
      public List<DocumentEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfFolderId = CursorUtil.getColumnIndexOrThrow(_cursor, "folderId");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfKind = CursorUtil.getColumnIndexOrThrow(_cursor, "kind");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfFavorite = CursorUtil.getColumnIndexOrThrow(_cursor, "favorite");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final int _cursorIndexOfSourceRef = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceRef");
          final List<DocumentEntity> _result = new ArrayList<DocumentEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final DocumentEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpFolderId;
            if (_cursor.isNull(_cursorIndexOfFolderId)) {
              _tmpFolderId = null;
            } else {
              _tmpFolderId = _cursor.getString(_cursorIndexOfFolderId);
            }
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpKind;
            _tmpKind = _cursor.getString(_cursorIndexOfKind);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpFavorite;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfFavorite);
            _tmpFavorite = _tmp != 0;
            final boolean _tmpTrashed;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp_1 != 0;
            final String _tmpSourceRef;
            if (_cursor.isNull(_cursorIndexOfSourceRef)) {
              _tmpSourceRef = null;
            } else {
              _tmpSourceRef = _cursor.getString(_cursorIndexOfSourceRef);
            }
            _item = new DocumentEntity(_tmpId,_tmpFolderId,_tmpTitle,_tmpKind,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpFavorite,_tmpTrashed,_tmpSourceRef);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<DocumentEntity>> observeAll() {
    final String _sql = "SELECT * FROM documents WHERE trashed = 0 ORDER BY updatedAtMs DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"documents"}, new Callable<List<DocumentEntity>>() {
      @Override
      @NonNull
      public List<DocumentEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfFolderId = CursorUtil.getColumnIndexOrThrow(_cursor, "folderId");
          final int _cursorIndexOfTitle = CursorUtil.getColumnIndexOrThrow(_cursor, "title");
          final int _cursorIndexOfKind = CursorUtil.getColumnIndexOrThrow(_cursor, "kind");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfFavorite = CursorUtil.getColumnIndexOrThrow(_cursor, "favorite");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final int _cursorIndexOfSourceRef = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceRef");
          final List<DocumentEntity> _result = new ArrayList<DocumentEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final DocumentEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpFolderId;
            if (_cursor.isNull(_cursorIndexOfFolderId)) {
              _tmpFolderId = null;
            } else {
              _tmpFolderId = _cursor.getString(_cursorIndexOfFolderId);
            }
            final String _tmpTitle;
            _tmpTitle = _cursor.getString(_cursorIndexOfTitle);
            final String _tmpKind;
            _tmpKind = _cursor.getString(_cursorIndexOfKind);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpFavorite;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfFavorite);
            _tmpFavorite = _tmp != 0;
            final boolean _tmpTrashed;
            final int _tmp_1;
            _tmp_1 = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp_1 != 0;
            final String _tmpSourceRef;
            if (_cursor.isNull(_cursorIndexOfSourceRef)) {
              _tmpSourceRef = null;
            } else {
              _tmpSourceRef = _cursor.getString(_cursorIndexOfSourceRef);
            }
            _item = new DocumentEntity(_tmpId,_tmpFolderId,_tmpTitle,_tmpKind,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpFavorite,_tmpTrashed,_tmpSourceRef);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
