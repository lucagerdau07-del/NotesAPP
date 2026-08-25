package com.notes.school.storage;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
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
public final class FolderDao_Impl implements FolderDao {
  private final RoomDatabase __db;

  private final SharedSQLiteStatement __preparedStmtOfSetTrashed;

  private final SharedSQLiteStatement __preparedStmtOfDeleteById;

  private final EntityUpsertionAdapter<FolderEntity> __upsertionAdapterOfFolderEntity;

  public FolderDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__preparedStmtOfSetTrashed = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE folders SET trashed = ?, updatedAtMs = ? WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfDeleteById = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM folders WHERE id = ?";
        return _query;
      }
    };
    this.__upsertionAdapterOfFolderEntity = new EntityUpsertionAdapter<FolderEntity>(new EntityInsertionAdapter<FolderEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT INTO `folders` (`id`,`parentId`,`name`,`sortIndex`,`createdAtMs`,`updatedAtMs`,`trashed`) VALUES (?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final FolderEntity entity) {
        statement.bindString(1, entity.getId());
        if (entity.getParentId() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getParentId());
        }
        statement.bindString(3, entity.getName());
        statement.bindLong(4, entity.getSortIndex());
        statement.bindLong(5, entity.getCreatedAtMs());
        statement.bindLong(6, entity.getUpdatedAtMs());
        final int _tmp = entity.getTrashed() ? 1 : 0;
        statement.bindLong(7, _tmp);
      }
    }, new EntityDeletionOrUpdateAdapter<FolderEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE `folders` SET `id` = ?,`parentId` = ?,`name` = ?,`sortIndex` = ?,`createdAtMs` = ?,`updatedAtMs` = ?,`trashed` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final FolderEntity entity) {
        statement.bindString(1, entity.getId());
        if (entity.getParentId() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getParentId());
        }
        statement.bindString(3, entity.getName());
        statement.bindLong(4, entity.getSortIndex());
        statement.bindLong(5, entity.getCreatedAtMs());
        statement.bindLong(6, entity.getUpdatedAtMs());
        final int _tmp = entity.getTrashed() ? 1 : 0;
        statement.bindLong(7, _tmp);
        statement.bindString(8, entity.getId());
      }
    });
  }

  @Override
  public Object setTrashed(final String id, final boolean trashed, final long nowMs,
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
          __preparedStmtOfSetTrashed.release(_stmt);
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
  public Object upsert(final FolderEntity folder, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __upsertionAdapterOfFolderEntity.upsert(folder);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object children(final String parentId,
      final Continuation<? super List<FolderEntity>> $completion) {
    final String _sql = "SELECT * FROM folders WHERE trashed = 0 AND parentId IS ? ORDER BY sortIndex";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    if (parentId == null) {
      _statement.bindNull(_argIndex);
    } else {
      _statement.bindString(_argIndex, parentId);
    }
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<FolderEntity>>() {
      @Override
      @NonNull
      public List<FolderEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfParentId = CursorUtil.getColumnIndexOrThrow(_cursor, "parentId");
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfSortIndex = CursorUtil.getColumnIndexOrThrow(_cursor, "sortIndex");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final List<FolderEntity> _result = new ArrayList<FolderEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final FolderEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpParentId;
            if (_cursor.isNull(_cursorIndexOfParentId)) {
              _tmpParentId = null;
            } else {
              _tmpParentId = _cursor.getString(_cursorIndexOfParentId);
            }
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final int _tmpSortIndex;
            _tmpSortIndex = _cursor.getInt(_cursorIndexOfSortIndex);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpTrashed;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp != 0;
            _item = new FolderEntity(_tmpId,_tmpParentId,_tmpName,_tmpSortIndex,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpTrashed);
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
  public Flow<List<FolderEntity>> observeAll() {
    final String _sql = "SELECT * FROM folders WHERE trashed = 0 ORDER BY sortIndex";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"folders"}, new Callable<List<FolderEntity>>() {
      @Override
      @NonNull
      public List<FolderEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfParentId = CursorUtil.getColumnIndexOrThrow(_cursor, "parentId");
          final int _cursorIndexOfName = CursorUtil.getColumnIndexOrThrow(_cursor, "name");
          final int _cursorIndexOfSortIndex = CursorUtil.getColumnIndexOrThrow(_cursor, "sortIndex");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final int _cursorIndexOfTrashed = CursorUtil.getColumnIndexOrThrow(_cursor, "trashed");
          final List<FolderEntity> _result = new ArrayList<FolderEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final FolderEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpParentId;
            if (_cursor.isNull(_cursorIndexOfParentId)) {
              _tmpParentId = null;
            } else {
              _tmpParentId = _cursor.getString(_cursorIndexOfParentId);
            }
            final String _tmpName;
            _tmpName = _cursor.getString(_cursorIndexOfName);
            final int _tmpSortIndex;
            _tmpSortIndex = _cursor.getInt(_cursorIndexOfSortIndex);
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            final boolean _tmpTrashed;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfTrashed);
            _tmpTrashed = _tmp != 0;
            _item = new FolderEntity(_tmpId,_tmpParentId,_tmpName,_tmpSortIndex,_tmpCreatedAtMs,_tmpUpdatedAtMs,_tmpTrashed);
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
