package com.notes.app.ink;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.Ink;
import org.json.JSONException;
import org.json.JSONObject;

// Wraps Google ML Kit Digital Ink Recognition for the hold-to-link gesture
// (see src/ink/linkRecognizer.js): free, on-device, reads the stroke's raw
// points directly instead of an image, and is trained on handwriting rather
// than print like a typical OCR engine.
@CapacitorPlugin(name = "DigitalInk")
public class DigitalInkPlugin extends Plugin {

  // English covers the ASCII letters/digits/punctuation a handwritten URL is
  // made of - a German model buys nothing for that character set.
  // ponytail: single fixed model, no language switching. Add one when a
  // feature actually needs non-Latin handwriting recognized.
  private static final String LANGUAGE_TAG = "en";

  @PluginMethod
  public void recognize(PluginCall call) {
    JSArray pointsArray = call.getArray("points");
    if (pointsArray == null || pointsArray.length() == 0) {
      call.reject("Missing points");
      return;
    }

    Ink.Stroke.Builder strokeBuilder = Ink.Stroke.builder();
    try {
      for (int i = 0; i < pointsArray.length(); i++) {
        JSONObject point = pointsArray.getJSONObject(i);
        float x = (float) point.getDouble("x");
        float y = (float) point.getDouble("y");
        // The JS stroke carries no per-point timestamp - a steady synthetic
        // cadence is enough signal for the recognizer's stroke-dynamics model.
        strokeBuilder.addPoint(Ink.Point.create(x, y, i * 10L));
      }
    } catch (JSONException error) {
      call.reject("Bad point data", error);
      return;
    }
    Ink ink = Ink.builder().addStroke(strokeBuilder.build()).build();

    DigitalInkRecognitionModelIdentifier identifier;
    try {
      identifier = DigitalInkRecognitionModelIdentifier.fromLanguageTag(LANGUAGE_TAG);
    } catch (Exception error) {
      call.reject("No recognition model for " + LANGUAGE_TAG, error);
      return;
    }
    DigitalInkRecognitionModel model = DigitalInkRecognitionModel.builder(identifier).build();
    RemoteModelManager modelManager = RemoteModelManager.getInstance();

    modelManager
        .isModelDownloaded(model)
        .continueWithTask(task -> {
          boolean downloaded = Boolean.TRUE.equals(task.getResult());
          return downloaded ? Tasks.forResult(null) : modelManager.download(model, new DownloadConditions.Builder().build());
        })
        .addOnSuccessListener(
            unused ->
                DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(model).build())
                    .recognize(ink)
                    .addOnSuccessListener(result -> {
                      JSObject data = new JSObject();
                      data.put("text", result.getCandidates().isEmpty() ? null : result.getCandidates().get(0).getText());
                      call.resolve(data);
                    })
                    .addOnFailureListener(error -> call.reject("Recognition failed", error)))
        .addOnFailureListener(error -> call.reject("Model download failed", error));
  }
}
