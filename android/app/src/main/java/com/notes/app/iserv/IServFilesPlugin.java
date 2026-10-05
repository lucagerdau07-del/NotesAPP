package com.notes.app.iserv;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.database.Cursor;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.UUID;

// Opens the system file picker directly inside the user's IServ folder
// (the IServ app's DocumentsProvider). The folder is chosen once via the tree
// picker and remembered; afterwards the picker starts there. Files are read
// through the provider only when picked, copied to the cache for the WebView.
@CapacitorPlugin(name = "IServFiles")
public class IServFilesPlugin extends Plugin {

  private static final String PREFS = "iserv_files";
  private static final String KEY_TREE = "tree";

  private SharedPreferences prefs() {
    return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  // Lets the user choose the IServ folder once (system tree picker).
  @PluginMethod
  public void chooseFolder(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
    intent.addFlags(
      Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
    );
    startActivityForResult(call, intent, "treeResult");
  }

  @ActivityCallback
  private void treeResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() == Activity.RESULT_OK && data != null && data.getData() != null) {
      Uri tree = data.getData();
      getContext()
        .getContentResolver()
        .takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
      prefs().edit().putString(KEY_TREE, tree.toString()).apply();
    }
    call.resolve();
  }

  // Normal file picker for "Datei öffnen". The system picker reopens wherever it was last
  // (e.g. the IServ folder), so always start it in Downloads instead.
  @PluginMethod
  public void pickFiles(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("*/*");
    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/pdf", "image/png", "image/jpeg" });
    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    intent.putExtra(
      DocumentsContract.EXTRA_INITIAL_URI,
      DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download")
    );
    startActivityForResult(call, intent, "pickResult");
  }

  @ActivityCallback
  private void pickResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSArray files = new JSArray();
    Intent data = result.getData();
    if (result.getResultCode() == Activity.RESULT_OK && data != null) {
      java.util.List<Uri> uris = new java.util.ArrayList<>();
      if (data.getClipData() != null) {
        for (int i = 0; i < data.getClipData().getItemCount(); i++) {
          uris.add(data.getClipData().getItemAt(i).getUri());
        }
      } else if (data.getData() != null) {
        uris.add(data.getData());
      }
      try {
        for (Uri uri : uris) files.put(copyToCache(uri));
      } catch (Exception error) {
        call.reject("Datei konnte nicht gelesen werden", error);
        return;
      }
    }
    JSObject out = new JSObject();
    out.put("files", files);
    call.resolve(out);
  }

  // Children of docId (default: the remembered folder). Rejects "no-folder" if none chosen yet.
  @PluginMethod
  public void list(PluginCall call) {
    String tree = prefs().getString(KEY_TREE, null);
    if (tree == null) {
      call.reject("no-folder");
      return;
    }
    Uri treeUri = Uri.parse(tree);
    String rootId = DocumentsContract.getTreeDocumentId(treeUri);
    String docId = call.getString("docId", rootId);
    JSArray items = new JSArray();
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId);
    try (
      Cursor cursor = getContext()
        .getContentResolver()
        .query(
          children,
          new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
          },
          null,
          null,
          null
        )
    ) {
      while (cursor != null && cursor.moveToNext()) {
        JSObject item = new JSObject();
        item.put("id", cursor.getString(0));
        item.put("name", cursor.getString(1));
        item.put("isDir", DocumentsContract.Document.MIME_TYPE_DIR.equals(cursor.getString(2)));
        item.put("type", cursor.getString(2));
        items.put(item);
      }
    } catch (Exception error) {
      call.reject("IServ-Ordner konnte nicht gelesen werden", error);
      return;
    }
    JSObject out = new JSObject();
    out.put("items", items);
    out.put("rootId", rootId);
    call.resolve(out);
  }

  // Reads one file through the provider into the cache only when asked for.
  @PluginMethod
  public void read(PluginCall call) {
    String tree = prefs().getString(KEY_TREE, null);
    String docId = call.getString("docId");
    if (tree == null || docId == null) {
      call.reject("Missing folder or docId");
      return;
    }
    try {
      call.resolve(copyToCache(DocumentsContract.buildDocumentUriUsingTree(Uri.parse(tree), docId)));
    } catch (Exception error) {
      call.reject("IServ-Datei konnte nicht gelesen werden", error);
    }
  }

  @PluginMethod
  public void forget(PluginCall call) {
    prefs().edit().remove(KEY_TREE).apply();
    call.resolve();
  }

  private JSObject copyToCache(Uri uri) throws Exception {
    Context context = getContext();
    String name = "datei";
    try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (index >= 0) name = cursor.getString(index);
      }
    }
    File dir = new File(context.getCacheDir(), "iserv/" + UUID.randomUUID());
    dir.mkdirs();
    File target = new File(dir, name.replaceAll("[\\/:*?\"<>|]", "_"));
    try (
      InputStream in = context.getContentResolver().openInputStream(uri);
      FileOutputStream out = new FileOutputStream(target)
    ) {
      byte[] buffer = new byte[65536];
      int read;
      while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
    }
    JSObject file = new JSObject();
    file.put("path", target.getAbsolutePath());
    file.put("name", name);
    file.put("type", context.getContentResolver().getType(uri));
    return file;
  }

}
