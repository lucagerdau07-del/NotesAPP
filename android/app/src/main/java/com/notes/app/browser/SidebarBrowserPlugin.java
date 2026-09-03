package com.notes.app.browser;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SidebarBrowser")
public class SidebarBrowserPlugin extends Plugin {
  private SidebarBrowserView host;

  private SidebarBrowserView host() {
    if (host == null) host = new SidebarBrowserView(getActivity(), this::emit);
    return host;
  }

  private void emit(String type, String url, String title, String message) {
    JSObject data = new JSObject();
    data.put("type", type);
    if (url != null) data.put("url", url);
    if (title != null) data.put("title", title);
    if (message != null) data.put("message", message);
    if (host != null && "state".equals(type)) {
      data.put("canGoBack", host.canGoBack());
      data.put("canGoForward", host.canGoForward());
    }
    notifyListeners("browserEvent", data);
  }

  private void ui(PluginCall call, Runnable action) {
    getActivity().runOnUiThread(() -> {
      try { action.run(); call.resolve(); }
      catch (Exception error) { call.reject(error.getMessage(), error); }
    });
  }

  @PluginMethod public void mount(PluginCall call) { ui(call, () -> host().mount(integer(call, "x"), integer(call, "y"), integer(call, "width"), integer(call, "height"))); }
  @PluginMethod public void setFrame(PluginCall call) { ui(call, () -> host().setFrame(integer(call, "x"), integer(call, "y"), integer(call, "width"), integer(call, "height"))); }
  @PluginMethod public void show(PluginCall call) { ui(call, () -> host().show()); }
  @PluginMethod public void hide(PluginCall call) { ui(call, () -> { if (host != null) host.hide(); }); }
  @PluginMethod public void destroy(PluginCall call) { ui(call, () -> { if (host != null) host.destroy(); host = null; }); }
  @PluginMethod public void load(PluginCall call) { String url = call.getString("url"); ui(call, () -> host().load(url)); }
  @PluginMethod public void back(PluginCall call) { ui(call, () -> host().back()); }
  @PluginMethod public void forward(PluginCall call) { ui(call, () -> host().forward()); }
  @PluginMethod public void reload(PluginCall call) { ui(call, () -> host().reload()); }
  @PluginMethod public void stop(PluginCall call) { ui(call, () -> host().stop()); }
  @PluginMethod public void openExternal(PluginCall call) { String url = call.getString("url"); ui(call, () -> host().openExternal(url)); }

  private int integer(PluginCall call, String key) {
    Integer value = call.getInt(key);
    if (value == null) throw new IllegalArgumentException("Missing " + key);
    return value;
  }

  @Override protected void handleOnPause() { if (host != null) getActivity().runOnUiThread(() -> host.pause()); }
  @Override protected void handleOnResume() { if (host != null) getActivity().runOnUiThread(() -> host.resume()); }
  @Override protected void handleOnDestroy() { if (host != null) { host.destroy(); host = null; } }
}
