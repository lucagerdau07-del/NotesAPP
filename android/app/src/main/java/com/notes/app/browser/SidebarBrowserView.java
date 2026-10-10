package com.notes.app.browser;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.OnBackPressedDispatcherOwner;

public final class SidebarBrowserView {
  public interface Events {
    void emit(String type, String url, String title, String message);
  }

  /** Marks a drag as "one of our images", so the drop side ignores unrelated system drags. */
  static final String IMAGE_DRAG_LABEL = "notes-app-image";

  private final Activity activity;
  private final FrameLayout root;
  private final Events events;
  private WebView webView;
  private FrameLayout wrapper;
  private OnBackPressedCallback backCallback;
  private boolean requestedVisible;

  public SidebarBrowserView(Activity activity, Events events) {
    this.activity = activity;
    this.events = events;
    this.root = activity.findViewById(android.R.id.content);
  }

  public static boolean isSafeWebUrl(String value) {
    if (value == null) return false;
    Uri uri = Uri.parse(value);
    String scheme = uri.getScheme();
    return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
  }

  @SuppressLint("SetJavaScriptEnabled")
  public void mount(int x, int y, int width, int height) {
    if (webView == null) {
      webView = new WebView(activity);
      webView.setBackgroundColor(Color.WHITE);
      WebSettings settings = webView.getSettings();
      settings.setJavaScriptEnabled(true);
      settings.setDomStorageEnabled(true);
      settings.setSafeBrowsingEnabled(true);
      settings.setAllowFileAccess(false);
      settings.setAllowContentAccess(false);
      settings.setAllowFileAccessFromFileURLs(false);
      settings.setAllowUniversalAccessFromFileURLs(false);
      String desktopUa = settings.getUserAgentString().replaceAll("; wv\\)", ")");
      settings.setUserAgentString(desktopUa);
      CookieManager cookies = CookieManager.getInstance();
      cookies.setAcceptCookie(true);
      cookies.setAcceptThirdPartyCookies(webView, true);
      webView.setWebViewClient(new Client());
      webView.setWebChromeClient(new Chrome());
      webView.setDownloadListener((url, userAgent, disposition, mime, length) -> openExternal(url));
      webView.setOnLongClickListener(v -> {
        WebView.HitTestResult result = webView.getHitTestResult();
        int type = result.getType();
        if (type != WebView.HitTestResult.IMAGE_TYPE
            && type != WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {
          return false;
        }
        String imageUrl = result.getExtra();
        if (imageUrl == null) return false;
        ClipData clip = ClipData.newPlainText(IMAGE_DRAG_LABEL, imageUrl);
        return webView.startDragAndDrop(clip, new ImageDragShadow(webView), null, 0);
      });
      // Clipping the WebView itself via outline is unreliable — Chromium's WebView
      // composites through a hardware surface that ignores View-level outline clip
      // on some Android versions. Clipping the wrapping FrameLayout instead (whose
      // canvas the WebView draws into) works consistently.
      // The panel (.editor-sidebar) is a rounded 30px card whose top corners belong
      // to the toolbar (clipped fine by CSS overflow:hidden); only the wrapper's
      // bottom-right corner is the panel's rounded outer corner, so only that one
      // gets clipped here.
      wrapper = new FrameLayout(activity);
      float radius = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 30f, activity.getResources().getDisplayMetrics());
      wrapper.setOutlineProvider(new ViewOutlineProvider() {
        @Override public void getOutline(View view, android.graphics.Outline outline) {
          int w = view.getWidth();
          int h = view.getHeight();
          if (w <= 0 || h <= 0) return;
          int r = Math.round(Math.min(radius, Math.min(w, h) / 2f));
          // A convex-path outline can't clip before API 30 (the tablet ignored it),
          // so use a round rect pushed past the top/left edges: only the
          // bottom-right corner — the panel's outer corner — stays rounded; the
          // bottom-left meets the tool rail and must stay square.
          outline.setRoundRect(-r, -r, w, h, r);
        }
      });
      wrapper.setClipToOutline(true);
      wrapper.addView(webView, new FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
      root.addView(wrapper);
      installBackHandler();
    }
    setFrame(x, y, width, height);
    requestedVisible = true;
    wrapper.setVisibility(View.VISIBLE);
    updateBackHandler();
  }

  public void setFrame(int x, int y, int width, int height) {
    if (wrapper == null) return;
    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(Math.max(1, width), Math.max(1, height));
    params.leftMargin = Math.max(0, x);
    params.topMargin = Math.max(0, y);
    wrapper.setLayoutParams(params);
  }

  public void load(String url) {
    if (!isSafeWebUrl(url)) throw new IllegalArgumentException("Only HTTP(S) URLs are allowed");
    ensureMounted();
    webView.loadUrl(url);
  }

  public void show() { requestedVisible = true; if (wrapper != null) wrapper.setVisibility(View.VISIBLE); updateBackHandler(); }
  public void hide() { requestedVisible = false; if (wrapper != null) wrapper.setVisibility(View.GONE); updateBackHandler(); }
  public void pause() { if (wrapper != null) wrapper.setVisibility(View.GONE); updateBackHandler(); }
  public void resume() { if (requestedVisible && wrapper != null) wrapper.setVisibility(View.VISIBLE); updateBackHandler(); }
  public void back() { if (webView != null && webView.canGoBack()) webView.goBack(); else { hide(); events.emit("back-at-root", currentUrl(), null, null); } }
  public void forward() { if (webView != null && webView.canGoForward()) webView.goForward(); }
  public void reload() { if (webView != null) webView.reload(); }
  public void stop() { if (webView != null) webView.stopLoading(); }

  public void openExternal(String url) {
    if (!isSafeWebUrl(url)) return;
    try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
  }

  public void destroy() {
    requestedVisible = false;
    if (backCallback != null) backCallback.remove();
    backCallback = null;
    if (webView == null) return;
    webView.stopLoading();
    webView.setWebChromeClient(null);
    webView.setWebViewClient(null);
    if (wrapper != null) {
      ViewGroup parent = (ViewGroup) wrapper.getParent();
      if (parent != null) parent.removeView(wrapper);
    }
    webView.destroy();
    webView = null;
    wrapper = null;
  }

  private void ensureMounted() { if (webView == null) throw new IllegalStateException("Browser is not mounted"); }
  private String currentUrl() { return webView == null ? "" : webView.getUrl(); }
  public boolean canGoBack() { return webView != null && webView.canGoBack(); }
  public boolean canGoForward() { return webView != null && webView.canGoForward(); }
  private void state() { events.emit("state", currentUrl(), webView == null ? null : webView.getTitle(), null); }
  private void updateBackHandler() { if (backCallback != null) backCallback.setEnabled(requestedVisible && wrapper != null && wrapper.getVisibility() == View.VISIBLE); }

  private void installBackHandler() {
    if (!(activity instanceof OnBackPressedDispatcherOwner)) return;
    backCallback = new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { back(); } };
    ((OnBackPressedDispatcherOwner) activity).getOnBackPressedDispatcher().addCallback(backCallback);
  }

  private boolean route(WebView view, Uri uri) {
    String scheme = uri.getScheme();
    if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) return false;
    if ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
      try { activity.startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
    }
    return true;
  }

  private final class Client extends WebViewClient {
    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return route(view, request.getUrl()); }
    @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return route(view, Uri.parse(url)); }
    @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) { events.emit("load-start", url, null, null); state(); }
    @Override public void onPageFinished(WebView view, String url) { events.emit("load-end", url, view.getTitle(), null); state(); CookieManager.getInstance().flush(); }
    @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
      if (request.isForMainFrame()) events.emit("error", request.getUrl().toString(), null, error.getDescription().toString());
    }
    @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); events.emit("error", error.getUrl(), null, "SSL-Fehler"); }
  }

  private final class Chrome extends WebChromeClient {
    @Override public void onReceivedTitle(WebView view, String title) { events.emit("title", view.getUrl(), title, null); state(); }
    @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, android.os.Message resultMsg) { return false; }
  }

  // ponytail: a plain rounded square, not a thumbnail of the actual dragged
  // image — decoding the image synchronously on long-press would delay drag
  // start. Upgrade path: decode a small thumbnail bitmap once HitTestResult
  // gives us the URL, if the plain square ever feels wrong in practice.
  private static final class ImageDragShadow extends View.DragShadowBuilder {
    private static final int SIZE_DP = 72;
    private final int sizePx;

    ImageDragShadow(View view) {
      super(view);
      sizePx = Math.round(SIZE_DP * view.getResources().getDisplayMetrics().density);
    }

    @Override
    public void onProvideShadowMetrics(android.graphics.Point outShadowSize, android.graphics.Point outShadowTouchPoint) {
      outShadowSize.set(sizePx, sizePx);
      outShadowTouchPoint.set(sizePx / 2, sizePx / 2);
    }

    @Override
    public void onDrawShadow(android.graphics.Canvas canvas) {
      android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
      paint.setColor(Color.argb(200, 62, 123, 216));
      float radius = sizePx * 0.18f;
      canvas.drawRoundRect(new android.graphics.RectF(0, 0, sizePx, sizePx), radius, radius, paint);
    }
  }
}
