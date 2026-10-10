package com.notes.app.browser;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SidebarBrowserPluginTest {
  @Test
  public void acceptsOnlyHttpAndHttpsLoads() {
    assertTrue(SidebarBrowserView.isSafeWebUrl("https://example.com"));
    assertTrue(SidebarBrowserView.isSafeWebUrl("http://example.com"));
    assertFalse(SidebarBrowserView.isSafeWebUrl("javascript:alert(1)"));
    assertFalse(SidebarBrowserView.isSafeWebUrl("file:///etc/passwd"));
    assertFalse(SidebarBrowserView.isSafeWebUrl("content://documents/1"));
  }
}
