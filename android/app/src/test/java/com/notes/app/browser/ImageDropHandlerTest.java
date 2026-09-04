package com.notes.app.browser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ImageDropHandlerTest {
  @Test
  public void recognizesDataUrls() {
    assertTrue(ImageDropHandler.isDataUrl("data:image/png;base64,AAAA"));
    assertTrue(ImageDropHandler.isDataUrl("DATA:image/png;base64,AAAA"));
    assertFalse(ImageDropHandler.isDataUrl("https://example.com/a.png"));
    assertFalse(ImageDropHandler.isDataUrl(null));
  }

  @Test
  public void convertsPhysicalPixelsToCssPixelsUsingDensity() {
    assertEquals(150.0, ImageDropHandler.toCssPixels(300f, 2f), 0.0001);
    assertEquals(300.0, ImageDropHandler.toCssPixels(300f, 1f), 0.0001);
  }

  @Test
  public void treatsAZeroOrNegativeDensityAsOne() {
    assertEquals(100.0, ImageDropHandler.toCssPixels(100f, 0f), 0.0001);
    assertEquals(100.0, ImageDropHandler.toCssPixels(100f, -1f), 0.0001);
  }
}
