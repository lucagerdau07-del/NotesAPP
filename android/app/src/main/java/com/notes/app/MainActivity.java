package com.notes.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.notes.app.browser.SidebarBrowserPlugin;
import com.notes.app.ink.DigitalInkPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SidebarBrowserPlugin.class);
    registerPlugin(DigitalInkPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
