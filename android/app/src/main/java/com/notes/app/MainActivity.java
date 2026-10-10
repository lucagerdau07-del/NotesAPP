package com.notes.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.notes.app.browser.SidebarBrowserPlugin;
import com.notes.app.ink.DigitalInkPlugin;
import com.notes.app.iserv.IServFilesPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SidebarBrowserPlugin.class);
    registerPlugin(DigitalInkPlugin.class);
    registerPlugin(IServFilesPlugin.class);
    super.onCreate(savedInstanceState);
    // The pages are drawn in fixed units (34px ruling, px line heights). The
    // system font size would scale every px font and line height in the
    // WebView (110% -> 37.4px lines on a 34px ruling), so text drifts off the lines.
    getBridge().getWebView().getSettings().setTextZoom(100);
  }
}
