# Design Specification: Bild-Hintergrund entfernen (Client-Side AI)

## 1. Übersicht & Ziel
In der Notizen-App können Nutzer Bilder aus dem integrierten Seitenleisten-Browser (oder per Paste/Import) in ihre Notizen einfügen. Um Bilder nahtlos in handschriftliche Notizen, Mindmaps und Skizzen einzubinden, soll es möglich sein, den Hintergrund von Bildern direkt in der App per Knopfdruck freizustellen. Die Verarbeitung erfolgt zu 100 % lokal auf dem Endgerät (client-seitig), ohne externe Server-Aufrufe, Abonnements oder API-Keys.

## 2. Architektur & Technologie
- **KI-Bibliothek:** `@imgly/background-removal`
  - Führt U2Net/ISNet Segmentierungsmodelle lokal im Browser/WebView aus (WebAssembly / WebGPU via ONNX Runtime).
  - Modellgewichte werden beim ersten Aufruf automatisch bezogen und persistent im Browser-Cache gespeichert; danach funktioniert die Freistellung komplett offline.
- **Service-Modul (`src/ink/imageBackground.js`):**
  - Kapselt den Aufruf von `removeBackground()`.
  - Nimmt eine Data-URL oder einen Blob entgegen und gibt eine transparente PNG-Data-URL (`data:image/png;base64,...`) zurück.
  - Verwaltet Ladezustände und Fehlerbehandlung isoliert.
- **Datenmodell (`pageObjects`):**
  - Für Objekte vom Typ `image`:
    - `src`: Aktuelle transparente PNG-Data-URL (oder Original-Data-URL).
    - `originalSrc`: Sichert das Originalbild vor der ersten Freistellung, um ein verlustfreies Wiederherstellen (Undo/Toggle) zu ermöglichen.

## 3. UI & Benutzerinteraktion
- **Toolbar-Aktion in `PageObjectLayer.jsx`:**
  - Wenn ein Objekt vom Typ `image` selektiert ist (`isSelected`), wird in der Schwebetoolbar ein zusätzlicher Button eingebunden:
    - Normalzustand: `Wand2` (Zauberstab-Icon) mit Tooltip *„Hintergrund entfernen“*.
    - Bei bereits freigestelltem Bild (wenn `originalSrc` vorhanden ist): `Undo2` / `RotateCcw` oder Zauberstab-Aktivstatus mit Tooltip *„Original wiederherstellen“*.
  - Während der Hintergrund entfernt wird:
    - Der Button zeigt einen animierten Spinner (`Loader2`).
    - Der Button ist während der Berechnung deaktiviert, um Mehrfachklicks zu verhindern.
    - Das Bild selbst erhält eine dezente Übergangs-/Ladeanimation (z. B. `opacity: 0.7`).

## 4. Datenfluss & Event-Handling
1. Nutzer tippt auf ein Bild im Notizenblatt -> Bild wird selektiert, Toolbar erscheint.
2. Nutzer tippt auf den Zauberstab-Button.
3. `PageObjectLayer` ruft `onRemoveBackground(object)` auf.
4. `DocumentView` setzt den Verarbeitungsstatus für die Objekt-ID und ruft `removeImageBackground(object.src)` auf.
5. Bei Erfolg:
   - `inkController.updateObject(objectId, { src: transparentDataUrl, originalSrc: object.originalSrc || object.src })` wird ausgeführt.
   - Der Schritt wird normal in die Undo/Redo-Historie eingetragen.
6. Bei Klick auf *„Original wiederherstellen“*:
   - `inkController.updateObject(objectId, { src: object.originalSrc, originalSrc: null })`.
7. Bei Fehler:
   - Der Verarbeitungsstatus wird zurückgesetzt.
   - Ein Fehlertoast/Hinweis wird eingeblendet; das Originalbild bleibt unberührt.

## 5. Fehlerbehandlung & Performance
- Vor der Übergabe an das KI-Modell wird das Bild bei Bedarf auf eine für Mobilgeräte performante Maximalgröße herunterskaliert (z. B. max. 1024px Kantenlänge), um Speicher und Rechenzeit zu schonen.
- Speicherüberläufe oder Formatfehler werden mit `try/catch` abgefangen.

## 6. Test- & Verifikationsplan
- **Unit-Tests (`tests/ink/imageBackground.test.js`):**
  - Prüfung der Konvertierung von Blobs/Data-URLs zu transparenten PNG-Data-URLs.
  - Prüfung der Wiederherstellungslogik (`originalSrc`).
- **Komponententests (`tests/components/PageObjectLayer.test.jsx`):**
  - Prüfung, ob der Zauberstab-Button nur für `type === "image"` erscheint.
  - Prüfung des Ladezustands und Klick-Handlers.
- **Manuelle Verifikation:**
  - Bild aus dem Browser-Panel in das Notizblatt ziehen.
  - Auf das Bild tippen und den Zauberstab betätigen.
  - Verifizieren, dass der Hintergrund transparent wird.
  - Verifizieren, dass das Wiederherstellen des Originals funktioniert.
