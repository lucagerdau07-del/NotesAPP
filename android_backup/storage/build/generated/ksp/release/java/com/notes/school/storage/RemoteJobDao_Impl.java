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
import androidx.room.util.StringUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.StringBuilder;
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
public final class RemoteJobDao_Impl implements RemoteJobDao {
  private final RoomDatabase __db;

  private final SharedSQLiteStatement __preparedStmtOfDeleteById;

  private final EntityUpsertionAdapter<RemoteJobEntity> __upsertionAdapterOfRemoteJobEntity;

  public RemoteJobDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__preparedStmtOfDeleteById = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM remote_jobs WHERE id = ?";
        return _query;
      }
    };
    this.__upsertionAdapterOfRemoteJobEntity = new EntityUpsertionAdapter<RemoteJobEntity>(new EntityInsertionAdapter<RemoteJobEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT INTO `remote_jobs` (`id`,`documentId`,`operation`,`consentGranted`,`payloadRef`,`remoteId`,`state`,`attempts`,`nextAttemptAtMs`,`lastError`,`resultRef`,`createdAtMs`,`updatedAtMs`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final RemoteJobEntity entity) {
        statement.bindString(1, entity.getId());
        if (entity.getDocumentId() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getDocumentId());
        }
        statement.bindString(3, entity.getOperation());
        final int _tmp = entity.getConsentGranted() ? 1 : 0;
        statement.bindLong(4, _tmp);
        if (entity.getPayloadRef() == null) {
          statement.bindNull(5);
        } else {
          statement.bindString(5, entity.getPayloadRef());
        }
        if (entity.getRemoteId() == null) {
          statement.bindNull(6);
        } else {
          statement.bindString(6, entity.getRemoteId());
        }
        statement.bindString(7, entity.getState());
        statement.bindLong(8, entity.getAttempts());
        statement.bindLong(9, entity.getNextAttemptAtMs());
        if (entity.getLastError() == null) {
          statement.bindNull(10);
        } else {
          statement.bindString(10, entity.getLastError());
        }
        if (entity.getResultRef() == null) {
          statement.bindNull(11);
        } else {
          statement.bindString(11, entity.getResultRef());
        }
        statement.bindLong(12, entity.getCreatedAtMs());
        statement.bindLong(13, entity.getUpdatedAtMs());
      }
    }, new EntityDeletionOrUpdateAdapter<RemoteJobEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE `remote_jobs` SET `id` = ?,`documentId` = ?,`operation` = ?,`consentGranted` = ?,`payloadRef` = ?,`remoteId` = ?,`state` = ?,`attempts` = ?,`nextAttemptAtMs` = ?,`lastError` = ?,`resultRef` = ?,`createdAtMs` = ?,`updatedAtMs` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final RemoteJobEntity entity) {
        statement.bindString(1, entity.getId());
        if (entity.getDocumentId() == null) {
          statement.bindNull(2);
        } else {
          statement.bindString(2, entity.getDocumentId());
        }
        statement.bindString(3, entity.getOperation());
        final int _tmp = entity.getConsentGranted() ? 1 : 0;
        statement.bindLong(4, _tmp);
        if (entity.getPayloadRef() == null) {
          statement.bindNull(5);
        } else {
          statement.bindString(5, entity.getPayloadRef());
        }
        if (entity.getRemoteId() == null) {
          statement.bindNull(6);
        } else {
          statement.bindString(6, entity.getRemoteId());
        }
        statement.bindString(7, entity.getState());
        statement.bindLong(8, entity.getAttempts());
        statement.bindLong(9, entity.getNextAttemptAtMs());
        if (entity.getLastError() == null) {
          statement.bindNull(10);
        } else {
          statement.bindString(10, entity.getLastError());
        }
        if (entity.getResultRef() == null) {
          statement.bindNull(11);
        } else {
          statement.bindString(11, entity.getResultRef());
        }
        statement.bindLong(12, entity.getCreatedAtMs());
        statement.bindLong(13, entity.getUpdatedAtMs());
        statement.bindString(14, entity.getId());
      }
    });
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
  public Object upsert(final RemoteJobEntity job, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __upsertionAdapterOfRemoteJobEntity.upsert(job);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object byId(final String id, final Continuation<? super RemoteJobEntity> $completion) {
    final String _sql = "SELECT * FROM remote_jobs WHERE id = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, id);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<RemoteJobEntity>() {
      @Override
      @Nullable
      public RemoteJobEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDocumentId = CursorUtil.getColumnIndexOrThrow(_cursor, "documentId");
          final int _cursorIndexOfOperation = CursorUtil.getColumnIndexOrThrow(_cursor, "operation");
          final int _cursorIndexOfConsentGranted = CursorUtil.getColumnIndexOrThrow(_cursor, "consentGranted");
          final int _cursorIndexOfPayloadRef = CursorUtil.getColumnIndexOrThrow(_cursor, "payloadRef");
          final int _cursorIndexOfRemoteId = CursorUtil.getColumnIndexOrThrow(_cursor, "remoteId");
          final int _cursorIndexOfState = CursorUtil.getColumnIndexOrThrow(_cursor, "state");
          final int _cursorIndexOfAttempts = CursorUtil.getColumnIndexOrThrow(_cursor, "attempts");
          final int _cursorIndexOfNextAttemptAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "nextAttemptAtMs");
          final int _cursorIndexOfLastError = CursorUtil.getColumnIndexOrThrow(_cursor, "lastError");
          final int _cursorIndexOfResultRef = CursorUtil.getColumnIndexOrThrow(_cursor, "resultRef");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final RemoteJobEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpDocumentId;
            if (_cursor.isNull(_cursorIndexOfDocumentId)) {
              _tmpDocumentId = null;
            } else {
              _tmpDocumentId = _cursor.getString(_cursorIndexOfDocumentId);
            }
            final String _tmpOperation;
            _tmpOperation = _cursor.getString(_cursorIndexOfOperation);
            final boolean _tmpConsentGranted;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfConsentGranted);
            _tmpConsentGranted = _tmp != 0;
            final String _tmpPayloadRef;
            if (_cursor.isNull(_cursorIndexOfPayloadRef)) {
              _tmpPayloadRef = null;
            } else {
              _tmpPayloadRef = _cursor.getString(_cursorIndexOfPayloadRef);
            }
            final String _tmpRemoteId;
            if (_cursor.isNull(_cursorIndexOfRemoteId)) {
              _tmpRemoteId = null;
            } else {
              _tmpRemoteId = _cursor.getString(_cursorIndexOfRemoteId);
            }
            final String _tmpState;
            _tmpState = _cursor.getString(_cursorIndexOfState);
            final int _tmpAttempts;
            _tmpAttempts = _cursor.getInt(_cursorIndexOfAttempts);
            final long _tmpNextAttemptAtMs;
            _tmpNextAttemptAtMs = _cursor.getLong(_cursorIndexOfNextAttemptAtMs);
            final String _tmpLastError;
            if (_cursor.isNull(_cursorIndexOfLastError)) {
              _tmpLastError = null;
            } else {
              _tmpLastError = _cursor.getString(_cursorIndexOfLastError);
            }
            final String _tmpResultRef;
            if (_cursor.isNull(_cursorIndexOfResultRef)) {
              _tmpResultRef = null;
            } else {
              _tmpResultRef = _cursor.getString(_cursorIndexOfResultRef);
            }
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            _result = new RemoteJobEntity(_tmpId,_tmpDocumentId,_tmpOperation,_tmpConsentGranted,_tmpPayloadRef,_tmpRemoteId,_tmpState,_tmpAttempts,_tmpNextAttemptAtMs,_tmpLastError,_tmpResultRef,_tmpCreatedAtMs,_tmpUpdatedAtMs);
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
  public Object due(final List<String> states, final long nowMs,
      final Continuation<? super List<RemoteJobEntity>> $completion) {
    final StringBuilder _stringBuilder = StringUtil.newStringBuilder();
    _stringBuilder.append("SELECT * FROM remote_jobs WHERE state IN (");
    final int _inputSize = states.size();
    StringUtil.appendPlaceholders(_stringBuilder, _inputSize);
    _stringBuilder.append(") AND nextAttemptAtMs <= ");
    _stringBuilder.append("?");
    _stringBuilder.append(" ORDER BY createdAtMs");
    final String _sql = _stringBuilder.toString();
    final int _argCount = 1 + _inputSize;
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, _argCount);
    int _argIndex = 1;
    for (String _item : states) {
      _statement.bindString(_argIndex, _item);
      _argIndex++;
    }
    _argIndex = 1 + _inputSize;
    _statement.bindLong(_argIndex, nowMs);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<RemoteJobEntity>>() {
      @Override
      @NonNull
      public List<RemoteJobEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDocumentId = CursorUtil.getColumnIndexOrThrow(_cursor, "documentId");
          final int _cursorIndexOfOperation = CursorUtil.getColumnIndexOrThrow(_cursor, "operation");
          final int _cursorIndexOfConsentGranted = CursorUtil.getColumnIndexOrThrow(_cursor, "consentGranted");
          final int _cursorIndexOfPayloadRef = CursorUtil.getColumnIndexOrThrow(_cursor, "payloadRef");
          final int _cursorIndexOfRemoteId = CursorUtil.getColumnIndexOrThrow(_cursor, "remoteId");
          final int _cursorIndexOfState = CursorUtil.getColumnIndexOrThrow(_cursor, "state");
          final int _cursorIndexOfAttempts = CursorUtil.getColumnIndexOrThrow(_cursor, "attempts");
          final int _cursorIndexOfNextAttemptAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "nextAttemptAtMs");
          final int _cursorIndexOfLastError = CursorUtil.getColumnIndexOrThrow(_cursor, "lastError");
          final int _cursorIndexOfResultRef = CursorUtil.getColumnIndexOrThrow(_cursor, "resultRef");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final List<RemoteJobEntity> _result = new ArrayList<RemoteJobEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final RemoteJobEntity _item_1;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpDocumentId;
            if (_cursor.isNull(_cursorIndexOfDocumentId)) {
              _tmpDocumentId = null;
            } else {
              _tmpDocumentId = _cursor.getString(_cursorIndexOfDocumentId);
            }
            final String _tmpOperation;
            _tmpOperation = _cursor.getString(_cursorIndexOfOperation);
            final boolean _tmpConsentGranted;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfConsentGranted);
            _tmpConsentGranted = _tmp != 0;
            final String _tmpPayloadRef;
            if (_cursor.isNull(_cursorIndexOfPayloadRef)) {
              _tmpPayloadRef = null;
            } else {
              _tmpPayloadRef = _cursor.getString(_cursorIndexOfPayloadRef);
            }
            final String _tmpRemoteId;
            if (_cursor.isNull(_cursorIndexOfRemoteId)) {
              _tmpRemoteId = null;
            } else {
              _tmpRemoteId = _cursor.getString(_cursorIndexOfRemoteId);
            }
            final String _tmpState;
            _tmpState = _cursor.getString(_cursorIndexOfState);
            final int _tmpAttempts;
            _tmpAttempts = _cursor.getInt(_cursorIndexOfAttempts);
            final long _tmpNextAttemptAtMs;
            _tmpNextAttemptAtMs = _cursor.getLong(_cursorIndexOfNextAttemptAtMs);
            final String _tmpLastError;
            if (_cursor.isNull(_cursorIndexOfLastError)) {
              _tmpLastError = null;
            } else {
              _tmpLastError = _cursor.getString(_cursorIndexOfLastError);
            }
            final String _tmpResultRef;
            if (_cursor.isNull(_cursorIndexOfResultRef)) {
              _tmpResultRef = null;
            } else {
              _tmpResultRef = _cursor.getString(_cursorIndexOfResultRef);
            }
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            _item_1 = new RemoteJobEntity(_tmpId,_tmpDocumentId,_tmpOperation,_tmpConsentGranted,_tmpPayloadRef,_tmpRemoteId,_tmpState,_tmpAttempts,_tmpNextAttemptAtMs,_tmpLastError,_tmpResultRef,_tmpCreatedAtMs,_tmpUpdatedAtMs);
            _result.add(_item_1);
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
  public Flow<List<RemoteJobEntity>> observeAll() {
    final String _sql = "SELECT * FROM remote_jobs ORDER BY createdAtMs DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"remote_jobs"}, new Callable<List<RemoteJobEntity>>() {
      @Override
      @NonNull
      public List<RemoteJobEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDocumentId = CursorUtil.getColumnIndexOrThrow(_cursor, "documentId");
          final int _cursorIndexOfOperation = CursorUtil.getColumnIndexOrThrow(_cursor, "operation");
          final int _cursorIndexOfConsentGranted = CursorUtil.getColumnIndexOrThrow(_cursor, "consentGranted");
          final int _cursorIndexOfPayloadRef = CursorUtil.getColumnIndexOrThrow(_cursor, "payloadRef");
          final int _cursorIndexOfRemoteId = CursorUtil.getColumnIndexOrThrow(_cursor, "remoteId");
          final int _cursorIndexOfState = CursorUtil.getColumnIndexOrThrow(_cursor, "state");
          final int _cursorIndexOfAttempts = CursorUtil.getColumnIndexOrThrow(_cursor, "attempts");
          final int _cursorIndexOfNextAttemptAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "nextAttemptAtMs");
          final int _cursorIndexOfLastError = CursorUtil.getColumnIndexOrThrow(_cursor, "lastError");
          final int _cursorIndexOfResultRef = CursorUtil.getColumnIndexOrThrow(_cursor, "resultRef");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final int _cursorIndexOfUpdatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "updatedAtMs");
          final List<RemoteJobEntity> _result = new ArrayList<RemoteJobEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final RemoteJobEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpDocumentId;
            if (_cursor.isNull(_cursorIndexOfDocumentId)) {
              _tmpDocumentId = null;
            } else {
              _tmpDocumentId = _cursor.getString(_cursorIndexOfDocumentId);
            }
            final String _tmpOperation;
            _tmpOperation = _cursor.getString(_cursorIndexOfOperation);
            final boolean _tmpConsentGranted;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfConsentGranted);
            _tmpConsentGranted = _tmp != 0;
            final String _tmpPayloadRef;
            if (_cursor.isNull(_cursorIndexOfPayloadRef)) {
              _tmpPayloadRef = null;
            } else {
              _tmpPayloadRef = _cursor.getString(_cursorIndexOfPayloadRef);
            }
            final String _tmpRemoteId;
            if (_cursor.isNull(_cursorIndexOfRemoteId)) {
              _tmpRemoteId = null;
            } else {
              _tmpRemoteId = _cursor.getString(_cursorIndexOfRemoteId);
            }
            final String _tmpState;
            _tmpState = _cursor.getString(_cursorIndexOfState);
            final int _tmpAttempts;
            _tmpAttempts = _cursor.getInt(_cursorIndexOfAttempts);
            final long _tmpNextAttemptAtMs;
            _tmpNextAttemptAtMs = _cursor.getLong(_cursorIndexOfNextAttemptAtMs);
            final String _tmpLastError;
            if (_cursor.isNull(_cursorIndexOfLastError)) {
              _tmpLastError = null;
            } else {
              _tmpLastError = _cursor.getString(_cursorIndexOfLastError);
            }
            final String _tmpResultRef;
            if (_cursor.isNull(_cursorIndexOfResultRef)) {
              _tmpResultRef = null;
            } else {
              _tmpResultRef = _cursor.getString(_cursorIndexOfResultRef);
            }
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            final long _tmpUpdatedAtMs;
            _tmpUpdatedAtMs = _cursor.getLong(_cursorIndexOfUpdatedAtMs);
            _item = new RemoteJobEntity(_tmpId,_tmpDocumentId,_tmpOperation,_tmpConsentGranted,_tmpPayloadRef,_tmpRemoteId,_tmpState,_tmpAttempts,_tmpNextAttemptAtMs,_tmpLastError,_tmpResultRef,_tmpCreatedAtMs,_tmpUpdatedAtMs);
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
