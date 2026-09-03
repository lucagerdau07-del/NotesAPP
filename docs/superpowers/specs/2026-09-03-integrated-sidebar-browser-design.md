# Integrierter Seitenleisten-Browser

**Datum:** 3. September 2026  
**Status:** Zur Freigabe  
**Zielplattform:** Android-Tablet-App; Desktop-Web als eingeschränkter Fallback

## Ziel

Die Notiz-App erhält einen eigenen Browser, der sich wie der bestehende
KI-Assistent aus der linken Werkzeugleiste öffnet. Browser und Assistent teilen
sich ein einziges, schmales Hochformat-Panel. Der Browser zeigt auf Android
echte Webseiten in einem nativen WebView, bietet einen bearbeitbaren
Schnellzugriff und öffnet Links aus Dokumenten standardmäßig innerhalb der App.

## Abgrenzung

Enthalten sind Navigation, Adress- und Google-Suche, Shortcuts, ein lokaler
30-Tage-Verlauf, interner Linkaufruf, Vollbild und das Öffnen im externen
Standardbrowser. Ein eigener Downloadmanager, mehrere Browser-Tabs,
Inkognito-Modus, Synchronisation zwischen Geräten, Werbeblocker und
Passwortverwaltung sind nicht Teil dieser Ausbaustufe.

Handschriftliche oder rein als Pixel vorliegende URLs werden nicht automatisch
erkannt. Unterstützt werden ausdrücklich als Link gespeicherte Notizobjekte,
Links in gerendertem Markdown und URL-Annotationen importierter PDFs.

## Gewählte Architektur

### Gemeinsame React-Seitenleiste

`Editor` verwaltet künftig statt `isChatOpen` einen Panelzustand mit den Modi
`closed`, `agent` und `browser`. Die vorhandene `editor-sidebar` bleibt das
gemeinsame Glas-Control und wächst bei beiden offenen Modi von 72 px auf etwa
400–430 px. Die 72-px-Werkzeugspalte bleibt stets sichtbar. Ein bestehender
Agent-Button und ein neuer Globus-Button wählen den Inhalt des rechten
Panelbereichs aus. Ein Wechsel zerstört weder die Agent-Unterhaltung noch den
Browserzustand.

Der Browserinhalt liegt in einer neuen React-Komponente `BrowserPanel`. Sie
zeichnet Kopfzeile, Startseite, Shortcuts, Verlauf, Lade- und Fehlerzustände.
Die Toolbar enthält Home, Zurück, Vor, Adressfeld, Neu laden,
„Schnellzugriff hinzufügen“, „Extern öffnen“, Vollbild und Schließen. Der
Plus-Button übernimmt URL und Seitentitel der aktuellen Seite und öffnet einen
kleinen Dialog, in dem beide Werte vor dem Speichern geändert werden können.

### Android-WebView

Ein lokales Capacitor-Plugin stellt eine native Android-`WebView` als Kind der
bestehenden Activity bereit. React übergibt Position und Größe des sichtbaren
Browser-Viewports in Gerätekoordinaten. Das Plugin kann den WebView anzeigen,
verschieben, ausblenden und entfernen; es bietet außerdem `load`, `back`,
`forward`, `reload`, `stop` und Statusabfragen.

Native Ereignisse melden URL, Titel, Ladebeginn, Ladeende, Navigierbarkeit und
Fehler zurück an React. Navigationen mit `http` oder `https` bleiben im eigenen
WebView. Andere Schemes wie `mailto:` oder `tel:` werden kontrolliert an Android
übergeben. Neue Fenster und `target="_blank"` werden im selben internen WebView
geladen. SSL-Fehler werden abgebrochen und niemals ignoriert.

Der WebView wird beim ersten Öffnen des Browsers für die laufende
Editor-Sitzung erzeugt. Beim Wechsel zum Agenten, beim Schließen des Panels und
wenn die App in den Hintergrund geht, wird er ausgeblendet; erst beim Verlassen
des Editors wird er entfernt. So bleiben aktuelle URL und Navigationssession
beim Umschalten erhalten. Cookies, Website-Speicher und Logins verwaltet
Androids WebView-Datenspeicher dauerhaft.

### Desktop-Web-Fallback

Außerhalb der nativen Android-Laufzeit verwendet `BrowserPanel` ein `iframe`
mit derselben Toolbar und Startseite. Blockiert eine Website die Einbettung,
zeigt die App eine verständliche Fehler-/Hinweiskarte mit „Extern öffnen“.
Dieser Fallback ist bewusst nicht als gleichwertig zu Android deklariert.

## Navigation und URL-Auflösung

Die URL-Eingabe wird zentral durch `resolveBrowserInput` verarbeitet:

1. Vollständige `http://`- und `https://`-URLs werden unverändert geöffnet.
2. Eine erkennbare Domain wie `wikipedia.org` erhält `https://`.
3. Jede andere Eingabe wird mit URL-Encoding als
   `https://www.google.com/search?q=…` geöffnet.
4. Unsichere oder nicht unterstützte Schemes werden nicht in den WebView
   geladen.

Die Startseite zeigt die Umschaltung „Schnellzugriff“ / „Verlauf durchsuchen“.
Zurück auf Home blendet den nativen WebView aus, ohne seine Sitzung zu
verwerfen. Vollbild erweitert dasselbe Browserpanel innerhalb der App; ein
eindeutiger Button stellt das angedockte Hochformat wieder her.

## Shortcuts und Verlauf

Ein kleines, versionsfähiges Browser-Repository kapselt `localStorage` und
verwaltet zwei getrennte Datenmengen:

- `shortcuts`: `id`, `title`, `url`, optionales automatisch erzeugtes
  Domain-Favicon sowie `createdAt` und `position`. Shortcuts bleiben erhalten,
  bis sie bearbeitet oder gelöscht werden.
- `history`: `id`, `title`, `url`, `visitedAt`. Einträge werden bei
  erfolgreicher Hauptnavigation geschrieben. Aufeinanderfolgende identische
  Ziele dürfen zusammengeführt werden.

Beim Laden des Repositories und nach jedem neuen Verlaufseintrag werden alle
Einträge mit `visitedAt < jetzt - 30 × 24 Stunden` gelöscht; ein exakt 30 Tage
alter Eintrag bleibt bis zur nächsten Überschreitung erhalten. Die Verlaufsansicht kann
nach Titel und URL filtern, einzelne Ziele erneut öffnen und den gesamten
Verlauf nach Bestätigung sofort löschen. Das Löschen des Verlaufs verändert
weder Cookies noch Logins; diese Trennung wird in der UI kenntlich gemacht.

Shortcuts können hinzugefügt, umbenannt, mit einer anderen URL versehen,
sortiert und gelöscht werden. Die Startseite bleibt auch ohne Netz verfügbar.
Favicon-Fehler fallen auf ein neutrales Domain-Symbol zurück und verhindern
niemals das Speichern.

## Links aus Dokumenten

Eine zentrale Funktion `openAppLink(url)` öffnet sichere HTTP(S)-Links im
gemeinsamen Browserpanel. Sie wird über React-Kontext oder einen schmalen
Callback bis zu den Linkquellen gereicht:

- Linkobjekte auf Notizseiten werden im Auswahlmodus weiterhin bearbeitet; im
  normalen Lesemodus öffnet ein Klick den internen Browser.
- Markdown-Links im Agentenpanel verwenden keinen neuen Browsertab mehr,
  sondern `openAppLink`.
- Für importierte PDFs wird zusätzlich zum Canvas eine schlanke
  PDF.js-Annotationsschicht für Link-Annotationen gerendert. Nur deren
  anklickbare Flächen werden übernommen; die bestehende PDF- und Ink-Darstellung
  bleibt unverändert.

Im Browserkopf ist „Extern öffnen“ für die aktuelle HTTP(S)-URL immer
erreichbar. Kann ein Ziel intern nicht geladen werden, bietet die Fehleransicht
dieselbe Aktion besonders sichtbar an.

## Fehlerbehandlung und Sicherheit

- Freie Texteingaben werden als Google-Suche behandelt. Nur syntaktisch
  fehlerhafte URLs mit einem ausdrücklich angegebenen oder gesperrten Scheme
  werden mit einer lokalen, nicht-blockierenden Meldung abgelehnt.
- Offline-, DNS-, Timeout- und HTTP-Ladefehler zeigen URL, kurze Erklärung,
  „Erneut versuchen“ und „Extern öffnen“.
- Das Android-Plugin ignoriert keine Zertifikatsfehler und erlaubt keine
  beliebigen JavaScript-zu-Native-Brücken für Seiteninhalte.
- Nur die App steuert den nativen WebView. Webseiten erhalten keinen direkten
  Zugriff auf Capacitor-Plugins oder den Notizspeicher.
- `javascript:`, `file:`, `content:` und andere nicht freigegebene URLs werden
  nicht als normale Browsernavigation akzeptiert.
- Der Android-Zurück-Button navigiert zuerst im internen Browserverlauf. Ist
  dort kein Zurück möglich, kehrt er zur Schnellzugriff-Seite zurück; erst dann
  greift die normale App-Navigation.

## Oberfläche und Responsivität

Das Panel übernimmt die dunkle, kompakte Freenotes-Anmutung aus den beiden
Referenzbildern, aber verwendet die vorhandenen Glas-, Farb- und
Typografie-Tokens der App. Die Toolbar bleibt einzeilig und touchfreundlich.
Auf üblichen Tablets ist das angedockte Panel hochformatig und etwa 400–430 px
breit. Bei zu schmalem App-Fenster öffnet es sich als nahezu vollflächiges
Overlay, während die Werkzeugleiste und eine eindeutige Schließen-Aktion
erreichbar bleiben.

Shortcuts erscheinen als klare Icon-Kacheln mit maximal zwei Textzeilen. Die
Startseite scrollt unabhängig vom Dokument. Der native WebView beginnt erst
unterhalb der Browsertoolbar und darf weder die Werkzeugleiste noch Dialoge
überdecken. Position und Größe werden bei Rotation, Resize, Vollbildwechsel und
Bildschirmtastatur neu synchronisiert.

## Voraussichtliche Codegrenzen

- `src/App.jsx`: gemeinsamer Panelmodus, Link-Öffner und Lebenszyklus.
- `src/components/BrowserPanel.jsx`: Browsertoolbar, Home, Shortcuts, Verlauf,
  Dialoge und Web-Fallback.
- `src/browser/browserInput.js`: reine URL-/Suchauflösung und Scheme-Prüfung.
- `src/browser/browserRepository.js`: versionierte Shortcuts und 30-Tage-Verlauf.
- `src/browser/browserBridge.js`: einheitliche Schnittstelle für Android und
  Desktop-Fallback.
- `src/components/Markdown.jsx`, `PageObjectLayer.jsx`, `PdfPageCanvas.jsx`:
  Weiterleitung anklickbarer Links und PDF-Annotationsschicht.
- `src/styles/main.css`: gemeinsames Agent-/Browserpanel und responsive
  Zustände.
- `android/app/src/main/java/com/notes/app/`: Capacitor-Plugin und nativer
  WebView-Host; Registrierung in `MainActivity`.

Die genauen Dateinamen der nativen Klassen können bei der Umsetzung an die
Capacitor-8-Konventionen angepasst werden, ohne die Schnittstelle zu ändern.

## Teststrategie

### Automatisierte JavaScript-Tests

- URL-Auflösung: vollständige URLs, Domains, Leerzeichen, Google-Suchen,
  verbotene Schemes.
- Repository: Shortcut-CRUD, Sortierung, Migration, defekte Daten und exakt
  definierte 30-Tage-Grenze mit kontrollierter Uhr.
- `BrowserPanel`: Home/Seite, Navigationsbuttons, Plus-Dialog, Verlaufssuche,
  Löschen, externes Öffnen, Fehlerzustand und Moduswechsel.
- `App`: Agent und Browser verwenden dasselbe Panel, behalten jeweils ihren
  Zustand und Dokumentlinks öffnen priorisiert intern.
- Dokumente: Linkobjekte, Markdown-Links und PDF-Linkannotationen rufen den
  zentralen Linköffner auf.

### Android-Tests

- Plugin-Erstellung und Lebenszyklus ohne WebView-Leaks.
- WebView-Position bei Panelöffnung, Rotation, Tastatur und Vollbild.
- Zurück/Vor/Reload, Titel-/URL-Ereignisse, externe Schemes und SSL-Abbruch.
- Links mit neuem Fenster bleiben im internen WebView.

### Visuelle und manuelle Abnahme

Geprüft werden geschlossene Leiste, Agentmodus, Browser-Startseite,
Webseitenansicht, Shortcut-Dialog, Verlauf, Lade-/Fehlerzustand, Vollbild sowie
der Wechsel Agent ↔ Browser. Die Prüfungen erfolgen in einem Tabletformat, in
einem schmaleren Stressformat und mit geöffneter Bildschirmtastatur. Auf einem
Android-Gerät werden außerdem Login, Google-Suche, ein PDF-Link, ein
Notiz-Link, externer Browser und die Löschung eines mehr als 30 Tage alten
Verlaufseintrags nachvollzogen.

## Erfolgskriterien

Die Erweiterung gilt als erfolgreich, wenn eine Suchphrase direkt Google im
internen Android-Browser öffnet, normale Webseiten einschließlich Loginseiten
im angedockten oder vollflächigen WebView bedienbar sind, Shortcuts dauerhaft
verwaltet werden können, kein sichtbarer Verlauf älter als 30 Tage bleibt und
anklickbare Dokumentlinks standardmäßig intern öffnen. Agent und Browser müssen
sich dasselbe Seitenleistenfenster teilen, ohne ihren jeweiligen Zustand beim
Umschalten zu verlieren. Jede intern geöffnete HTTP(S)-Seite muss außerdem mit
einem einzigen sichtbaren Button im externen Android-Browser geöffnet werden
können.
