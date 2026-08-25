package com.notes.school.storage;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
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
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class PalmProfileDao_Impl implements PalmProfileDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<PalmProfileEntity> __insertionAdapterOfPalmProfileEntity;

  private final SharedSQLiteStatement __preparedStmtOfReset;

  public PalmProfileDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfPalmProfileEntity = new EntityInsertionAdapter<PalmProfileEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `palm_profiles` (`id`,`deviceFingerprint`,`orientation`,`revision`,`json`,`score`,`stable`,`createdAtMs`) VALUES (nullif(?, 0),?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final PalmProfileEntity entity) {
        statement.bindLong(1, entity.getId());
        statement.bindString(2, entity.getDeviceFingerprint());
        statement.bindString(3, entity.getOrientation());
        statement.bindLong(4, entity.getRevision());
        statement.bindString(5, entity.getJson());
        statement.bindDouble(6, entity.getScore());
        final int _tmp = entity.getStable() ? 1 : 0;
        statement.bindLong(7, _tmp);
        statement.bindLong(8, entity.getCreatedAtMs());
      }
    };
    this.__preparedStmtOfReset = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM palm_profiles WHERE deviceFingerprint = ? AND orientation = ?";
        return _query;
      }
    };
  }

  @Override
  public Object upsert(final PalmProfileEntity profile,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfPalmProfileEntity.insert(profile);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object reset(final String device, final String orientation,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfReset.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, device);
        _argIndex = 2;
        _stmt.bindString(_argIndex, orientation);
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
          __preparedStmtOfReset.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object latestStable(final String device, final String orientation,
      final Continuation<? super PalmProfileEntity> $completion) {
    final String _sql = "SELECT * FROM palm_profiles WHERE deviceFingerprint = ? AND orientation = ? AND stable = 1 ORDER BY revision DESC LIMIT 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 2);
    int _argIndex = 1;
    _statement.bindString(_argIndex, device);
    _argIndex = 2;
    _statement.bindString(_argIndex, orientation);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<PalmProfileEntity>() {
      @Override
      @Nullable
      public PalmProfileEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDeviceFingerprint = CursorUtil.getColumnIndexOrThrow(_cursor, "deviceFingerprint");
          final int _cursorIndexOfOrientation = CursorUtil.getColumnIndexOrThrow(_cursor, "orientation");
          final int _cursorIndexOfRevision = CursorUtil.getColumnIndexOrThrow(_cursor, "revision");
          final int _cursorIndexOfJson = CursorUtil.getColumnIndexOrThrow(_cursor, "json");
          final int _cursorIndexOfScore = CursorUtil.getColumnIndexOrThrow(_cursor, "score");
          final int _cursorIndexOfStable = CursorUtil.getColumnIndexOrThrow(_cursor, "stable");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final PalmProfileEntity _result;
          if (_cursor.moveToFirst()) {
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final String _tmpDeviceFingerprint;
            _tmpDeviceFingerprint = _cursor.getString(_cursorIndexOfDeviceFingerprint);
            final String _tmpOrientation;
            _tmpOrientation = _cursor.getString(_cursorIndexOfOrientation);
            final int _tmpRevision;
            _tmpRevision = _cursor.getInt(_cursorIndexOfRevision);
            final String _tmpJson;
            _tmpJson = _cursor.getString(_cursorIndexOfJson);
            final float _tmpScore;
            _tmpScore = _cursor.getFloat(_cursorIndexOfScore);
            final boolean _tmpStable;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfStable);
            _tmpStable = _tmp != 0;
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            _result = new PalmProfileEntity(_tmpId,_tmpDeviceFingerprint,_tmpOrientation,_tmpRevision,_tmpJson,_tmpScore,_tmpStable,_tmpCreatedAtMs);
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
  public Object latest(final String device, final String orientation,
      final Continuation<? super PalmProfileEntity> $completion) {
    final String _sql = "SELECT * FROM palm_profiles WHERE deviceFingerprint = ? AND orientation = ? ORDER BY revision DESC LIMIT 1";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 2);
    int _argIndex = 1;
    _statement.bindString(_argIndex, device);
    _argIndex = 2;
    _statement.bindString(_argIndex, orientation);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<PalmProfileEntity>() {
      @Override
      @Nullable
      public PalmProfileEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDeviceFingerprint = CursorUtil.getColumnIndexOrThrow(_cursor, "deviceFingerprint");
          final int _cursorIndexOfOrientation = CursorUtil.getColumnIndexOrThrow(_cursor, "orientation");
          final int _cursorIndexOfRevision = CursorUtil.getColumnIndexOrThrow(_cursor, "revision");
          final int _cursorIndexOfJson = CursorUtil.getColumnIndexOrThrow(_cursor, "json");
          final int _cursorIndexOfScore = CursorUtil.getColumnIndexOrThrow(_cursor, "score");
          final int _cursorIndexOfStable = CursorUtil.getColumnIndexOrThrow(_cursor, "stable");
          final int _cursorIndexOfCreatedAtMs = CursorUtil.getColumnIndexOrThrow(_cursor, "createdAtMs");
          final PalmProfileEntity _result;
          if (_cursor.moveToFirst()) {
            final long _tmpId;
            _tmpId = _cursor.getLong(_cursorIndexOfId);
            final String _tmpDeviceFingerprint;
            _tmpDeviceFingerprint = _cursor.getString(_cursorIndexOfDeviceFingerprint);
            final String _tmpOrientation;
            _tmpOrientation = _cursor.getString(_cursorIndexOfOrientation);
            final int _tmpRevision;
            _tmpRevision = _cursor.getInt(_cursorIndexOfRevision);
            final String _tmpJson;
            _tmpJson = _cursor.getString(_cursorIndexOfJson);
            final float _tmpScore;
            _tmpScore = _cursor.getFloat(_cursorIndexOfScore);
            final boolean _tmpStable;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfStable);
            _tmpStable = _tmp != 0;
            final long _tmpCreatedAtMs;
            _tmpCreatedAtMs = _cursor.getLong(_cursorIndexOfCreatedAtMs);
            _result = new PalmProfileEntity(_tmpId,_tmpDeviceFingerprint,_tmpOrientation,_tmpRevision,_tmpJson,_tmpScore,_tmpStable,_tmpCreatedAtMs);
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

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
