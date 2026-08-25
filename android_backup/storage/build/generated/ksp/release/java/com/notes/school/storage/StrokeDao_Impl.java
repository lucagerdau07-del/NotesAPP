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
import androidx.room.util.StringUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Integer;
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

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class StrokeDao_Impl implements StrokeDao {
  private final RoomDatabase __db;

  private final SharedSQLiteStatement __preparedStmtOfDeleteOrphans;

  private final EntityUpsertionAdapter<StrokeEntity> __upsertionAdapterOfStrokeEntity;

  public StrokeDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__preparedStmtOfDeleteOrphans = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM strokes WHERE pageId NOT IN (SELECT id FROM pages)";
        return _query;
      }
    };
    this.__upsertionAdapterOfStrokeEntity = new EntityUpsertionAdapter<StrokeEntity>(new EntityInsertionAdapter<StrokeEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT INTO `strokes` (`id`,`pageId`,`tool`,`colorArgb`,`widthPx`,`pointsBlob`,`boundsLeft`,`boundsTop`,`boundsRight`,`boundsBottom`,`strokeOrder`,`active`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final StrokeEntity entity) {
        statement.bindString(1, entity.getId());
        statement.bindString(2, entity.getPageId());
        statement.bindString(3, entity.getTool());
        statement.bindLong(4, entity.getColorArgb());
        statement.bindDouble(5, entity.getWidthPx());
        statement.bindBlob(6, entity.getPointsBlob());
        statement.bindDouble(7, entity.getBoundsLeft());
        statement.bindDouble(8, entity.getBoundsTop());
        statement.bindDouble(9, entity.getBoundsRight());
        statement.bindDouble(10, entity.getBoundsBottom());
        statement.bindLong(11, entity.getStrokeOrder());
        final int _tmp = entity.getActive() ? 1 : 0;
        statement.bindLong(12, _tmp);
      }
    }, new EntityDeletionOrUpdateAdapter<StrokeEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE `strokes` SET `id` = ?,`pageId` = ?,`tool` = ?,`colorArgb` = ?,`widthPx` = ?,`pointsBlob` = ?,`boundsLeft` = ?,`boundsTop` = ?,`boundsRight` = ?,`boundsBottom` = ?,`strokeOrder` = ?,`active` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final StrokeEntity entity) {
        statement.bindString(1, entity.getId());
        statement.bindString(2, entity.getPageId());
        statement.bindString(3, entity.getTool());
        statement.bindLong(4, entity.getColorArgb());
        statement.bindDouble(5, entity.getWidthPx());
        statement.bindBlob(6, entity.getPointsBlob());
        statement.bindDouble(7, entity.getBoundsLeft());
        statement.bindDouble(8, entity.getBoundsTop());
        statement.bindDouble(9, entity.getBoundsRight());
        statement.bindDouble(10, entity.getBoundsBottom());
        statement.bindLong(11, entity.getStrokeOrder());
        final int _tmp = entity.getActive() ? 1 : 0;
        statement.bindLong(12, _tmp);
        statement.bindString(13, entity.getId());
      }
    });
  }

  @Override
  public Object deleteOrphans(final Continuation<? super Integer> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Integer>() {
      @Override
      @NonNull
      public Integer call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDeleteOrphans.acquire();
        try {
          __db.beginTransaction();
          try {
            final Integer _result = _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return _result;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfDeleteOrphans.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object upsert(final StrokeEntity stroke, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __upsertionAdapterOfStrokeEntity.upsert(stroke);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object upsertAll(final List<StrokeEntity> strokes,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __upsertionAdapterOfStrokeEntity.upsert(strokes);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object forPage(final String pageId,
      final Continuation<? super List<StrokeEntity>> $completion) {
    final String _sql = "SELECT * FROM strokes WHERE pageId = ? ORDER BY strokeOrder";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, pageId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<StrokeEntity>>() {
      @Override
      @NonNull
      public List<StrokeEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPageId = CursorUtil.getColumnIndexOrThrow(_cursor, "pageId");
          final int _cursorIndexOfTool = CursorUtil.getColumnIndexOrThrow(_cursor, "tool");
          final int _cursorIndexOfColorArgb = CursorUtil.getColumnIndexOrThrow(_cursor, "colorArgb");
          final int _cursorIndexOfWidthPx = CursorUtil.getColumnIndexOrThrow(_cursor, "widthPx");
          final int _cursorIndexOfPointsBlob = CursorUtil.getColumnIndexOrThrow(_cursor, "pointsBlob");
          final int _cursorIndexOfBoundsLeft = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsLeft");
          final int _cursorIndexOfBoundsTop = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsTop");
          final int _cursorIndexOfBoundsRight = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsRight");
          final int _cursorIndexOfBoundsBottom = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsBottom");
          final int _cursorIndexOfStrokeOrder = CursorUtil.getColumnIndexOrThrow(_cursor, "strokeOrder");
          final int _cursorIndexOfActive = CursorUtil.getColumnIndexOrThrow(_cursor, "active");
          final List<StrokeEntity> _result = new ArrayList<StrokeEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final StrokeEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpPageId;
            _tmpPageId = _cursor.getString(_cursorIndexOfPageId);
            final String _tmpTool;
            _tmpTool = _cursor.getString(_cursorIndexOfTool);
            final int _tmpColorArgb;
            _tmpColorArgb = _cursor.getInt(_cursorIndexOfColorArgb);
            final float _tmpWidthPx;
            _tmpWidthPx = _cursor.getFloat(_cursorIndexOfWidthPx);
            final byte[] _tmpPointsBlob;
            _tmpPointsBlob = _cursor.getBlob(_cursorIndexOfPointsBlob);
            final float _tmpBoundsLeft;
            _tmpBoundsLeft = _cursor.getFloat(_cursorIndexOfBoundsLeft);
            final float _tmpBoundsTop;
            _tmpBoundsTop = _cursor.getFloat(_cursorIndexOfBoundsTop);
            final float _tmpBoundsRight;
            _tmpBoundsRight = _cursor.getFloat(_cursorIndexOfBoundsRight);
            final float _tmpBoundsBottom;
            _tmpBoundsBottom = _cursor.getFloat(_cursorIndexOfBoundsBottom);
            final long _tmpStrokeOrder;
            _tmpStrokeOrder = _cursor.getLong(_cursorIndexOfStrokeOrder);
            final boolean _tmpActive;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfActive);
            _tmpActive = _tmp != 0;
            _item = new StrokeEntity(_tmpId,_tmpPageId,_tmpTool,_tmpColorArgb,_tmpWidthPx,_tmpPointsBlob,_tmpBoundsLeft,_tmpBoundsTop,_tmpBoundsRight,_tmpBoundsBottom,_tmpStrokeOrder,_tmpActive);
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
  public Object activeForPage(final String pageId,
      final Continuation<? super List<StrokeEntity>> $completion) {
    final String _sql = "SELECT * FROM strokes WHERE pageId = ? AND active = 1 ORDER BY strokeOrder";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, pageId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<StrokeEntity>>() {
      @Override
      @NonNull
      public List<StrokeEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfPageId = CursorUtil.getColumnIndexOrThrow(_cursor, "pageId");
          final int _cursorIndexOfTool = CursorUtil.getColumnIndexOrThrow(_cursor, "tool");
          final int _cursorIndexOfColorArgb = CursorUtil.getColumnIndexOrThrow(_cursor, "colorArgb");
          final int _cursorIndexOfWidthPx = CursorUtil.getColumnIndexOrThrow(_cursor, "widthPx");
          final int _cursorIndexOfPointsBlob = CursorUtil.getColumnIndexOrThrow(_cursor, "pointsBlob");
          final int _cursorIndexOfBoundsLeft = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsLeft");
          final int _cursorIndexOfBoundsTop = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsTop");
          final int _cursorIndexOfBoundsRight = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsRight");
          final int _cursorIndexOfBoundsBottom = CursorUtil.getColumnIndexOrThrow(_cursor, "boundsBottom");
          final int _cursorIndexOfStrokeOrder = CursorUtil.getColumnIndexOrThrow(_cursor, "strokeOrder");
          final int _cursorIndexOfActive = CursorUtil.getColumnIndexOrThrow(_cursor, "active");
          final List<StrokeEntity> _result = new ArrayList<StrokeEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final StrokeEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpPageId;
            _tmpPageId = _cursor.getString(_cursorIndexOfPageId);
            final String _tmpTool;
            _tmpTool = _cursor.getString(_cursorIndexOfTool);
            final int _tmpColorArgb;
            _tmpColorArgb = _cursor.getInt(_cursorIndexOfColorArgb);
            final float _tmpWidthPx;
            _tmpWidthPx = _cursor.getFloat(_cursorIndexOfWidthPx);
            final byte[] _tmpPointsBlob;
            _tmpPointsBlob = _cursor.getBlob(_cursorIndexOfPointsBlob);
            final float _tmpBoundsLeft;
            _tmpBoundsLeft = _cursor.getFloat(_cursorIndexOfBoundsLeft);
            final float _tmpBoundsTop;
            _tmpBoundsTop = _cursor.getFloat(_cursorIndexOfBoundsTop);
            final float _tmpBoundsRight;
            _tmpBoundsRight = _cursor.getFloat(_cursorIndexOfBoundsRight);
            final float _tmpBoundsBottom;
            _tmpBoundsBottom = _cursor.getFloat(_cursorIndexOfBoundsBottom);
            final long _tmpStrokeOrder;
            _tmpStrokeOrder = _cursor.getLong(_cursorIndexOfStrokeOrder);
            final boolean _tmpActive;
            final int _tmp;
            _tmp = _cursor.getInt(_cursorIndexOfActive);
            _tmpActive = _tmp != 0;
            _item = new StrokeEntity(_tmpId,_tmpPageId,_tmpTool,_tmpColorArgb,_tmpWidthPx,_tmpPointsBlob,_tmpBoundsLeft,_tmpBoundsTop,_tmpBoundsRight,_tmpBoundsBottom,_tmpStrokeOrder,_tmpActive);
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
  public Object countForPage(final String pageId, final Continuation<? super Integer> $completion) {
    final String _sql = "SELECT COUNT(*) FROM strokes WHERE pageId = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, pageId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<Integer>() {
      @Override
      @NonNull
      public Integer call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final Integer _result;
          if (_cursor.moveToFirst()) {
            final int _tmp;
            _tmp = _cursor.getInt(0);
            _result = _tmp;
          } else {
            _result = 0;
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
  public Object setActive(final List<String> ids, final boolean active,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final StringBuilder _stringBuilder = StringUtil.newStringBuilder();
        _stringBuilder.append("UPDATE strokes SET active = ");
        _stringBuilder.append("?");
        _stringBuilder.append(" WHERE id IN (");
        final int _inputSize = ids.size();
        StringUtil.appendPlaceholders(_stringBuilder, _inputSize);
        _stringBuilder.append(")");
        final String _sql = _stringBuilder.toString();
        final SupportSQLiteStatement _stmt = __db.compileStatement(_sql);
        int _argIndex = 1;
        final int _tmp = active ? 1 : 0;
        _stmt.bindLong(_argIndex, _tmp);
        _argIndex = 2;
        for (String _item : ids) {
          _stmt.bindString(_argIndex, _item);
          _argIndex++;
        }
        __db.beginTransaction();
        try {
          _stmt.executeUpdateDelete();
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
