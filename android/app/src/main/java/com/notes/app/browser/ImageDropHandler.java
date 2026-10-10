package com.notes.app.browser;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Pure/side-effect helpers for turning a dragged-out browser image into a data URL. */
final class ImageDropHandler {
  private static final String USER_AGENT =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
  private static final String REFERER = "https://www.google.com/";
  private static final int TIMEOUT_MS = 10000;
  private static final long MAX_DOWNLOAD_BYTES = 20L * 1024 * 1024;

  private ImageDropHandler() {}

  static boolean isDataUrl(String url) {
    return url != null && url.regionMatches(true, 0, "data:", 0, 5);
  }

  /** WebView hands us physical/device pixels; the note canvas works in CSS px. */
  static double toCssPixels(float physicalPixels, float density) {
    float safeDensity = density > 0 ? density : 1f;
    return physicalPixels / safeDensity;
  }

  /**
   * Downloads {@code imageUrl} and returns it as a "data:<mime>;base64,..." string, or null on
   * any failure. Already-a-data-URL input is returned unchanged. Blocking — call off the main
   * thread.
   */
  static String downloadAsDataUrl(String imageUrl) {
    if (isDataUrl(imageUrl)) return imageUrl;
    if (!SidebarBrowserView.isSafeWebUrl(imageUrl)) return null;
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(imageUrl).openConnection();
      connection.setConnectTimeout(TIMEOUT_MS);
      connection.setReadTimeout(TIMEOUT_MS);
      connection.setRequestProperty("User-Agent", USER_AGENT);
      connection.setRequestProperty("Referer", REFERER);
      int status = connection.getResponseCode();
      if (status < 200 || status >= 300) return null;
      long contentLength = connection.getContentLengthLong();
      if (contentLength >= 0 && contentLength > MAX_DOWNLOAD_BYTES) return null;
      String mime = contentTypeOf(connection);
      byte[] bytes = readAll(connection.getInputStream());
      String encoded = Base64.encodeToString(bytes, Base64.NO_WRAP);
      return "data:" + mime + ";base64," + encoded;
    } catch (IOException | RuntimeException error) {
      return null;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private static String contentTypeOf(HttpURLConnection connection) {
    String mime = connection.getContentType();
    if (mime == null || !mime.startsWith("image/")) return "image/jpeg";
    int semicolon = mime.indexOf(';');
    return semicolon >= 0 ? mime.substring(0, semicolon).trim() : mime;
  }

  private static byte[] readAll(InputStream input) throws IOException {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int read;
    while ((read = input.read(chunk)) != -1) {
      buffer.write(chunk, 0, read);
      if (buffer.size() > MAX_DOWNLOAD_BYTES) throw new IOException("image too large");
    }
    return buffer.toByteArray();
  }
}
