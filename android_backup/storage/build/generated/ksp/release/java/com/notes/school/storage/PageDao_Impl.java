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

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class PageDao_Impl implements PageDao {
  private final RoomDatabase __db;

  private final SharedSQLiteStatement __preparedStmtOfSaveViewport;

  private final EntityUpsertionAdapter<PageEntity> __upsertionAdapterOfPageEntity;

  public PageDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__preparedStmtOfSaveViewport = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE pages SET scrollX = ?, scrollY = ?, zoom = ? WHERE id = ?";
        return _query;
      }
    };
    this.__upsertionAdapterOfPageEntity = new EntityUpsertionAdapter<PageEntity>(new EntityInsertionAdapter<PageEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT INTO `pages` (`id`,`documentId`,`pageIndex`,`widthPx`,`heightPx`,`sourceType`,`sourceValue`,`scrollX`,`scrollY`,`zoom`) VALUES (?,?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final PageEntity entity) {
        statement.bindString(1, entity.getId());
        statement.bindString(2, entity.getDocumentId());
        statement.bindLong(3, entity.getPageIndex());
        statement.bindDouble(4, entity.getWidthPx());
        statement.bindDouble(5, entity.getHeightPx());
        statement.bindString(6, entity.getSourceType());
        statement.bindLong(7, entity.getSourceValue());
        statement.bindDouble(8, entity.getScrollX());
        statement.bindDouble(9, entity.getScrollY());
        statement.bindDouble(10, entity.getZoom());
      }
    }, new EntityDeletionOrUpdateAdapter<PageEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "UPDATE `pages` SET `id` = ?,`documentId` = ?,`pageIndex` = ?,`widthPx` = ?,`heightPx` = ?,`sourceType` = ?,`sourceValue` = ?,`scrollX` = ?,`scrollY` = ?,`zoom` = ? WHERE `id` = ?";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final PageEntity entity) {
        statement.bindString(1, entity.getId());
        statement.bindString(2, entity.getDocumentId());
        statement.bindLong(3, entity.getPageIndex());
        statement.bindDouble(4, entity.getWidthPx());
        statement.bindDouble(5, entity.getHeightPx());
        statement.bindString(6, entity.getSourceType());
        statement.bindLong(7, entity.getSourceValue());
        statement.bindDouble(8, entity.getScrollX());
        statement.bindDouble(9, entity.getScrollY());
        statement.bindDouble(10, entity.getZoom());
        statement.bindString(11, entity.getId());
      }
    });
  }

  @Override
  public Object saveViewport(final String id, final float x, final float y, final float zoom,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfSaveViewport.acquire();
        int _argIndex = 1;
        _stmt.bindDouble(_argIndex, x);
        _argIndex = 2;
        _stmt.bindDouble(_argIndex, y);
        _argIndex = 3;
        _stmt.bindDouble(_argIndex, zoom);
        _argIndex = 4;
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
          __preparedStmtOfSaveViewport.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object upsert(final PageEntity page, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __upsertionAdapterOfPageEntity.upsert(page);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object upsertAll(final List<PageEntity> pages,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __upsertionAdapterOfPageEntity.upsert(pages);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object forDocument(final String documentId,
      final Continuation<? super List<PageEntity>> $completion) {
    final String _sql = "SELECT * FROM pages WHERE documentId = ? ORDER BY pageIndex";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, documentId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<PageEntity>>() {
      @Override
      @NonNull
      public List<PageEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDocumentId = CursorUtil.getColumnIndexOrThrow(_cursor, "documentId");
          final int _cursorIndexOfPageIndex = CursorUtil.getColumnIndexOrThrow(_cursor, "pageIndex");
          final int _cursorIndexOfWidthPx = CursorUtil.getColumnIndexOrThrow(_cursor, "widthPx");
          final int _cursorIndexOfHeightPx = CursorUtil.getColumnIndexOrThrow(_cursor, "heightPx");
          final int _cursorIndexOfSourceType = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceType");
          final int _cursorIndexOfSourceValue = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceValue");
          final int _cursorIndexOfScrollX = CursorUtil.getColumnIndexOrThrow(_cursor, "scrollX");
          final int _cursorIndexOfScrollY = CursorUtil.getColumnIndexOrThrow(_cursor, "scrollY");
          final int _cursorIndexOfZoom = CursorUtil.getColumnIndexOrThrow(_cursor, "zoom");
          final List<PageEntity> _result = new ArrayList<PageEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final PageEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpDocumentId;
            _tmpDocumentId = _cursor.getString(_cursorIndexOfDocumentId);
            final int _tmpPageIndex;
            _tmpPageIndex = _cursor.getInt(_cursorIndexOfPageIndex);
            final float _tmpWidthPx;
            _tmpWidthPx = _cursor.getFloat(_cursorIndexOfWidthPx);
            final float _tmpHeightPx;
            _tmpHeightPx = _cursor.getFloat(_cursorIndexOfHeightPx);
            final String _tmpSourceType;
            _tmpSourceType = _cursor.getString(_cursorIndexOfSourceType);
            final int _tmpSourceValue;
            _tmpSourceValue = _cursor.getInt(_cursorIndexOfSourceValue);
            final float _tmpScrollX;
            _tmpScrollX = _cursor.getFloat(_cursorIndexOfScrollX);
            final float _tmpScrollY;
            _tmpScrollY = _cursor.getFloat(_cursorIndexOfScrollY);
            final float _tmpZoom;
            _tmpZoom = _cursor.getFloat(_cursorIndexOfZoom);
            _item = new PageEntity(_tmpId,_tmpDocumentId,_tmpPageIndex,_tmpWidthPx,_tmpHeightPx,_tmpSourceType,_tmpSourceValue,_tmpScrollX,_tmpScrollY,_tmpZoom);
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
  public Object byId(final String id, final Continuation<? super PageEntity> $completion) {
    final String _sql = "SELECT * FROM pages WHERE id = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, id);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<PageEntity>() {
      @Override
      @Nullable
      public PageEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfDocumentId = CursorUtil.getColumnIndexOrThrow(_cursor, "documentId");
          final int _cursorIndexOfPageIndex = CursorUtil.getColumnIndexOrThrow(_cursor, "pageIndex");
          final int _cursorIndexOfWidthPx = CursorUtil.getColumnIndexOrThrow(_cursor, "widthPx");
          final int _cursorIndexOfHeightPx = CursorUtil.getColumnIndexOrThrow(_cursor, "heightPx");
          final int _cursorIndexOfSourceType = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceType");
          final int _cursorIndexOfSourceValue = CursorUtil.getColumnIndexOrThrow(_cursor, "sourceValue");
          final int _cursorIndexOfScrollX = CursorUtil.getColumnIndexOrThrow(_cursor, "scrollX");
          final int _cursorIndexOfScrollY = CursorUtil.getColumnIndexOrThrow(_cursor, "scrollY");
          final int _cursorIndexOfZoom = CursorUtil.getColumnIndexOrThrow(_cursor, "zoom");
          final PageEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpDocumentId;
            _tmpDocumentId = _cursor.getString(_cursorIndexOfDocumentId);
            final int _tmpPageIndex;
            _tmpPageIndex = _cursor.getInt(_cursorIndexOfPageIndex);
            final float _tmpWidthPx;
            _tmpWidthPx = _cursor.getFloat(_cursorIndexOfWidthPx);
            final float _tmpHeightPx;
            _tmpHeightPx = _cursor.getFloat(_cursorIndexOfHeightPx);
            final String _tmpSourceType;
            _tmpSourceType = _cursor.getString(_cursorIndexOfSourceType);
            final int _tmpSourceValue;
            _tmpSourceValue = _cursor.getInt(_cursorIndexOfSourceValue);
            final float _tmpScrollX;
            _tmpScrollX = _cursor.getFloat(_cursorIndexOfScrollX);
            final float _tmpScrollY;
            _tmpScrollY = _cursor.getFloat(_cursorIndexOfScrollY);
            final float _tmpZoom;
            _tmpZoom = _cursor.getFloat(_cursorIndexOfZoom);
            _result = new PageEntity(_tmpId,_tmpDocumentId,_tmpPageIndex,_tmpWidthPx,_tmpHeightPx,_tmpSourceType,_tmpSourceValue,_tmpScrollX,_tmpScrollY,_tmpZoom);
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
