package com.notes.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.notes.app.browser.SidebarBrowserPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SidebarBrowserPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
