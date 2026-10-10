// Built-in vocabulary for the keyboard's word suggestions. Order is the rank:
// earlier words win when several start with what was typed. Nouns keep their
// capital letter (that is the form the suggestion inserts). Personal words
// (glossary, your own notes) are layered on top in wordSuggest.js.
const SECTIONS = [
  // Function words and the most common verb forms.
  `der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat
  dass sie nach wird bei einer um am sind noch wie einem über einen so zum war haben nur oder aber vor zur bis
  mehr durch man sein wurde sei ich wir ihr du was wer wo wann warum wenn weil dann denn doch schon immer sehr
  viel viele wenig alle alles jede jeder jedes kein keine keinen kann können muss müssen soll sollen will
  wollen darf dürfen gibt geben macht machen wurden worden geworden hatte hatten waren wäre würde könnte sollte
  müsste mehrere andere anderen anderer anderes beide beiden einige manche einzelne dieser diese dieses diesem
  diesen jene jener welche welcher welches seine seiner seinem seinen seines ihre ihrer ihrem ihren ihres
  unsere unser meine mein deine dein hier dort da nun jetzt heute gestern morgen oft manchmal meist meistens
  selten nie niemals zuerst danach davor dabei dafür dagegen dadurch daher deshalb deswegen darum dazu darauf
  daraus darin davon damit daran darüber darunter zusammen allein gemeinsam getrennt wieder wieso wozu wodurch
  womit sondern jedoch allerdings trotzdem außerdem ebenfalls ebenso genauso sowie sowohl weder entweder
  obwohl während bevor nachdem sobald falls indem ob ja nein nichts etwas jemand niemand ganz fast etwa
  ungefähr sogar erst schon bereits noch nun gerade besonders vor allem zwischen unter gegen ohne seit ab
  außer entlang hinter neben innerhalb außerhalb bezüglich gemäß mich dich ihn uns euch ihnen mir dir ihm
  gewesen gehabt gekonnt gemusst gewollt sind seien wäre wären hätte hätten wird werden wurde wurden
  geht gehen ging gegangen kommt kommen kam gekommen sieht sehen sah gesehen gab gegeben nimmt nehmen nahm
  genommen findet finden fand gefunden steht stehen stand liegt liegen lag bleibt bleiben blieb geblieben
  bringt bringen brachte gebracht zeigt zeigen zeigte gezeigt sagt sagen sagte gesagt lässt lassen ließ
  weiß wissen wusste denkt denken dachte glaubt glauben meint meinen gilt gelten galt dient dienen nutzt
  nutzen verwendet verwenden benutzt benutzen braucht brauchen tut tun tat getan heißt heißen bedeutet
  bedeuten besteht bestehen entsteht entstehen bildet bilden führt führen folgt folgen ergibt ergeben
  erhält erhalten enthält enthalten gehört gehören liegt befindet befinden wirkt wirken handelt handeln`,

  // Chemistry.
  `Reaktion Reaktionen Reaktionsgleichung Reaktionsgleichungen Reaktionsgeschwindigkeit Reaktionsenergie
  Reaktionsprodukt Reaktionstyp pH Mol Atom Atome Atomkern Atomhülle Atommasse Atommodell Atombau Atombindung
  Element Elemente Elektron Elektronen Elektronenpaar Elektronenkonfiguration Elektronegativität
  Elektronenhülle Elektrolyse Elektrolyt Elektrode Elektronenübergang Elektronenpaarbindung Proton
  Protonen Protonenübertragung Neutron Neutronen Molekül Moleküle Molekülformel Molekülgitter Masse
  Molare Molmasse Stoffmenge Stoffmengenkonzentration Stoff Stoffe Stoffgemisch Reinstoff Gemisch
  Gemische Verbindung Verbindungen Lösung Lösungen Lösungsmittel Löslichkeit Konzentration Volumen
  Dichte Druck Temperatur Wärme Energie Enthalpie Entropie Gleichgewicht Gleichgewichtskonstante
  Massenwirkungsgesetz Säure Säuren Base Basen Lauge Laugen Salz Salze Salzsäure Schwefelsäure
  Salpetersäure Phosphorsäure Essigsäure Kohlensäure Zitronensäure Milchsäure Natronlauge Kalilauge
  Ammoniak Ammonium Hydroxid Hydroxidionen Oxoniumionen Hydroniumionen Wasserstoffionen Neutralisation
  Titration Indikator Puffer Protolyse Oxidation Reduktion Redoxreaktion Redoxreaktionen Redoxgleichung
  Oxidationszahl Oxidationszahlen Oxidationsmittel Reduktionsmittel Ionen Ion Kation Kationen Anion
  Anionen Ionenbindung Ionengitter Ionenverbindung Kristall Kristallgitter Gitterenergie Metall Metalle
  Metallbindung Metallgitter Nichtmetall Nichtmetalle Halbmetall Edelgas Edelgase Edelgaskonfiguration
  Alkalimetall Alkalimetalle Erdalkalimetalle Halogene Hauptgruppe Nebengruppe Periode Perioden Gruppe
  Periodensystem Ordnungszahl Massenzahl Isotop Isotope Kern Schale Schalen Valenzelektronen
  Außenelektronen Orbital Orbitale Bindung Bindungen Einfachbindung Doppelbindung Dreifachbindung
  Bindungsenergie Bindungslänge Polarität polar unpolar Dipol Dipolmoment Wasserstoffbrückenbindung
  Wasserstoffbrücken Aggregatzustand Aggregatzustände fest flüssig gasförmig Schmelzpunkt Siedepunkt
  Schmelzen Sieden Verdampfen Kondensieren Erstarren Sublimieren Destillation Filtration Extraktion
  Chromatographie Kristallisation Sedimentation Katalysator Katalysatoren Katalyse Enzym Enzyme
  Aktivierungsenergie exotherm endotherm Edukt Edukte Produkt Produkte Galvanische Zelle Anode Kathode
  Spannung Stromstärke Batterie Akkumulator Brennstoffzelle Korrosion Rost Organische Kohlenwasserstoffe
  Kohlenwasserstoff Alkane Alkene Alkine Alkohole Alkanole Aldehyde Alkanale Ketone Alkanone
  Carbonsäuren Ester Ether Amine Amide Aromaten Benzol Methan Ethan Propan Butan Pentan Hexan Heptan
  Octan Ethen Ethin Methanol Ethanol Propanol Butanol Glycerin Glucose Fructose Saccharose Stärke
  Cellulose Fette Fettsäuren Proteine Eiweiße Aminosäuren Peptidbindung Polymer Polymere Monomer
  Monomere Kunststoff Kunststoffe Polymerisation Polykondensation Polyaddition Verbrennung Addition
  Substitution Eliminierung Kondensation Hydrolyse Veresterung Funktionelle Hydroxygruppe Carboxygruppe
  Carbonylgruppe Aminogruppe Isomer Isomere Isomerie Nomenklatur Homologe Reihe gesättigt ungesättigt
  Wasserstoff Helium Lithium Beryllium Bor Kohlenstoff Stickstoff Sauerstoff Fluor Neon Natrium
  Magnesium Aluminium Silicium Phosphor Schwefel Chlor Argon Kalium Calcium Eisen Kupfer Zink Silber
  Gold Quecksilber Blei Zinn Nickel Mangan Chrom Brom Iod Kohlenstoffdioxid Kohlenstoffmonoxid
  Schwefeldioxid Stickstoffdioxid Natriumchlorid Calciumcarbonat Kalk Kalkwasser Wasserstoffperoxid
  Nachweis Experiment Experimente Versuch Versuche Versuchsaufbau Durchführung Beobachtung Auswertung
  Ergebnis Ergebnisse Schlussfolgerung Fehlerbetrachtung Hypothese Messung Messwerte Protokoll
  Sicherheit Schutzbrille Abzug Brenner Reagenzglas Becherglas Erlenmeyerkolben Pipette Bürette
  Messzylinder Waage Thermometer Formel Formeln Summenformel Strukturformel Verhältnisformel
  Valenzstrichformel Gleichung Gleichungen abgeben aufnehmen übertragen reagieren reagiert reagierte
  lösen löst gelöst verdünnen verdünnt neutralisieren oxidiert reduziert entstehen freigesetzt
  Stoffeigenschaften Trennverfahren Katalytisch Elektronenabgabe Elektronenaufnahme Ionenladung
  Ladungszahl Atomradius Ionisierungsenergie Elektronenaffinität Gitterstruktur Wertigkeit Bindigkeit
  Oktettregel Edelgasregel Lewis Formelschreibweise Reaktionsschema Reaktionsmechanismus`,

  // Physics, maths, biology.
  `Kraft Kräfte Geschwindigkeit Beschleunigung Bewegung Weg Zeit Arbeit Leistung Impuls Gewicht
  Schwerkraft Gravitation Reibung Auftrieb Licht Schall Welle Wellen Frequenz Wellenlänge Amplitude Strom
  Widerstand Ladung Feld Magnetfeld elektrisch magnetisch Newton Joule Watt Volt Ampere Ohm Hertz
  Kilogramm Meter Sekunde Kelvin Celsius Physik Mechanik Optik Akustik Thermodynamik Radioaktivität
  Funktion Funktionen Ableitung Integral Stammfunktion Steigung Extremstelle Hochpunkt Tiefpunkt
  Wendepunkt Nullstelle Nullstellen Definitionsmenge Wertemenge Graph Koordinatensystem Vektor Vektoren
  Matrix Gerade Geraden Ebene Kreis Dreieck Viereck Winkel Fläche Umfang Wahrscheinlichkeit Stochastik
  Mittelwert Varianz Standardabweichung Binomialverteilung Normalverteilung Folge Grenzwert Logarithmus
  Exponentialfunktion Potenz Wurzel Quadrat Bruch Primzahl Term Variable Beweis Satz Gleichungssystem
  Lösungsmenge Parabel Scheitelpunkt Sinus Kosinus Tangens Zufall Ereignis Mathematik Analysis Geometrie
  Algebra Zelle Zellen Zellkern Zellmembran Chloroplast Mitochondrium Gen Gene Chromosom Vererbung
  Evolution Selektion Mutation Ökosystem Photosynthese Atmung Stoffwechsel Hormon Nervensystem Organ
  Gewebe Bakterien Viren Immunsystem Antikörper Biologie Lebewesen Pflanze Pflanzen Tier Tiere`,

  // PGW, philosophy, art.
  `Politik Gesellschaft Wirtschaft Staat Regierung Bundestag Bundesrat Bundesregierung Bundeskanzler
  Parlament Demokratie Wahl Wahlen Partei Parteien Grundgesetz Verfassung Bürger Markt Angebot Nachfrage
  Preis Preise Inflation Arbeitslosigkeit Steuer Steuern Unternehmen Haushalt Konsum Produktion Kapital
  Einkommen Eigentum Europäische Union Globalisierung Klima Nachhaltigkeit Medien Meinung Freiheit
  Gerechtigkeit Gleichheit Menschenrechte Philosophie Erkenntnis Wahrheit Wissen Ethik Moral Vernunft
  Verstand Bewusstsein Sinn Gott Existenz Vorurteil Argument These Antithese Synthese Aufklärung Kant
  Platon Aristoteles Sokrates Nietzsche Descartes Hegel Kategorischer Imperativ Utilitarismus Kunst
  Künstler Bild Bilder Gemälde Zeichnung Skizze Farbe Farben Komposition Perspektive Schatten Kontrast
  Linie Skulptur Epoche Expressionismus Impressionismus Romantik Barock Renaissance Moderne`,

  // General school vocabulary.
  `Beispiel Beispiele Grund Gründe Ursache Ursachen Wirkung Wirkungen Folge Folgen Problem Probleme Frage
  Fragen Antwort Antworten Aufgabe Aufgaben Thema Themen Text Texte Abschnitt Kapitel Seite Seiten
  Zusammenfassung Einleitung Hauptteil Schluss Definition Merkmal Merkmale Eigenschaft Eigenschaften
  Unterschied Unterschiede Gemeinsamkeit Gemeinsamkeiten Vergleich Bedeutung Zusammenhang Entwicklung
  Geschichte Zukunft Vergangenheit Gegenwart Jahr Jahre Monat Monate Woche Wochen Tag Tage Stunde Stunden
  Minute Minuten Mensch Menschen Kind Kinder Frau Frauen Mann Männer Leute Person Personen Familie Freund
  Freunde Schule Lehrer Lehrerin Schüler Klasse Unterricht Hausaufgabe Hausaufgaben Klausur Prüfung Note
  Noten Ziel Ziele Methode Methoden Verfahren Modell Modelle Theorie Theorien Regel Regeln Prinzip
  Prinzipien Gesetz Gesetze Wert Werte Zahl Zahlen Menge Anzahl Teil Teile Ganze Art Arten Form Formen
  Material Stelle Stellen Ort Raum Räume Land Länder Stadt Städte Welt Erde Natur Umwelt Leben Körper
  Wasser Luft Feuer Situation Möglichkeit Möglichkeiten Voraussetzung Bedingung Bedingungen Annahme
  Behauptung Begründung Erklärung Beschreibung Darstellung Überblick Übersicht Tabelle Diagramm Abbildung
  Skizze Vorteil Vorteile Nachteil Nachteile Risiko Chance Chancen Verlauf Anfang Ende Mitte Richtung
  Bereich Bereiche Ebene Stufe Phase Schritt Schritte Prozess Prozesse System Systeme Struktur Aufbau
  Funktion Merkmal Ursprung Herkunft Ergebnis Zweck Nutzen Anwendung Anwendungen Bedarf Umgang Einfluss
  Kontrolle Erfahrung Erfahrungen Beobachtungen Untersuchung Untersuchungen Forschung Wissenschaft
  Wissenschaftler Information Informationen Quelle Quellen Literatur Buch Bücher Artikel Internet
  wichtig wichtige wichtigsten einfach einfache schwer schwierig leicht groß große großen kleine kleinen
  klein lang lange kurz hoch hohe niedrig stark starke schwach schnell langsam gut gute besser beste
  schlecht neu neue neuen alt alte alten erste ersten zweite zweiten dritte letzte letzten verschieden
  verschiedene verschiedenen unterschiedlich unterschiedliche gleich gleiche ähnlich möglich unmöglich
  notwendig nötig richtig falsch wahr wirklich tatsächlich eigentlich natürlich normal üblich typisch
  besonders allgemein speziell konkret abstrakt positiv negativ häufig selten ständig dauerhaft
  vorübergehend direkt indirekt sichtbar unsichtbar bekannt unbekannt genau ungenau ausreichend
  zunächst schließlich folglich dementsprechend beispielsweise insbesondere hauptsächlich überwiegend
  teilweise vollständig gleichzeitig nacheinander miteinander voneinander untereinander
  beschreibt beschreiben erklärt erklären begründet begründen diskutiert diskutieren analysiert
  analysieren interpretiert interpretieren bewertet bewerten vergleicht vergleichen berechnet berechnen
  bestimmt bestimmen misst messen beobachtet beobachten untersucht untersuchen verändert verändern
  erhöht erhöhen verringert verringern steigt sinkt nimmt zu ab wächst fällt entwickelt entwickeln
  verläuft verlaufen ergibt sich zeigt sich stellt dar stellen dar beträgt betragen unterscheidet
  unterscheiden entspricht entsprechen hängt ab abhängig unabhängig verbunden verursacht verursachen
  bewirkt bewirken ermöglicht ermöglichen verhindert verhindern benötigt benötigen erfordert erfordern
  schreiben schreibt schrieb geschrieben lesen liest las gelesen lernen lernt lernte gelernt
  verstehen versteht verstand verstanden arbeiten arbeitet arbeitete gearbeitet üben übt geübt
  wiederholen wiederholt merken merkt gemerkt notieren notiert aufschreiben zusammenfassen fasst zusammen
  Überschrift Stichpunkte Stichwort Stichwörter Notizen Notiz Merksatz Merkzettel Lernzettel Lernplan
  Termin Termine Abgabe Abgabetermin Referat Präsentation Hausarbeit Facharbeit Test Tests Aufgabenblatt
  Arbeitsblatt Lösungen Musterlösung Korrektur Fehler Verbesserung Hinweis Hinweise Tipp Tipps`,

  // English.
  `the of and to in is you that it he was for on are as with his they at be this from have or by one had not
  but what all were when we there can an your which their said if do will each about how up out them then
  she many some so these would other into has more her two like him see time could no make than first
  been its who now people my made over did down only way find use may water long little very after words
  called just where most know get through back much before go good new write our used me man too any day
  same right look think also around another came come work three word must because does part even place
  well such here take why help put different away again off went old number great tell men say small every
  found still between name should home big give air line set own under read last never us left end along
  while might next sound below saw something thought both few those always looked show large often
  together asked house world going want school important until form food keep children feet land side
  without once animal life enough took sometimes four head above kind began almost live page got earth
  need far hand high year mother light country father let night picture being study second soon story
  since white ever paper hard near sentence better best across during today however sure knew try told
  young sun thing whole hear example heard several change answer room sea against top turned learn point
  city play toward five using himself usually chemistry reaction energy acid solution element electron`,

  // Spanish.
  `de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí
  porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno
  les ni contra otros ese eso ante ellos esto antes algunos qué unos yo otro otras otra él tanto esa estos
  mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas
  español española casa tiempo año día vida hombre mujer niño niña escuela profesor clase libro agua
  ciudad país mundo trabajo gente parte lugar momento forma historia problema pregunta respuesta ejemplo`,
];

export const WORD_LIST = SECTIONS.join(" ").replace(/\s+/g, " ").trim();
