// The built-in component palette. Each entry is a recipe in the same format
// the agent writes with define_component, so nothing here is privileged: the
// model can read one with read_component, copy it, change a proportion and
// save the result under its own name.
//
// Coordinates inside a recipe are local — (0,0) is the component's own top
// left, and insert_component places it on the page. Colours are role names
// from noteStyle.js unless a recipe deliberately wants a fixed hex.

export const COMPONENT_LIBRARY = [
  {
    id: "zeitstrahl",
    title: "Zeitstrahl",
    tags: ["geschichte", "struktur"],
    description:
      "Waagerechte Zeitachse mit Markierungen. items: Liste aus {label, sub} — label über der Achse (Jahr), sub darunter (Ereignis).",
    params: {
      width: { default: 640, min: 300, max: 1200 },
      // Below 2 there is no axis to speak of; past 8 the step() spacing over
      // a typical width starts crowding the two-line labels into each other.
      items: { default: [], minItems: 2, maxItems: 8 },
      role: { default: "accent" },
    },
    body: [
      { type: "stroke", points: [[0, 46], ["width", 46]], role: "role", width: 2.6 },
      { type: "stroke", points: [["width - 14", 40], ["width", 46], ["width - 14", 52]], role: "role", width: 2.6 },
      {
        repeat: "len(items)",
        as: "i",
        body: [
          { let: { cx: "step(i, len(items), 10, width - 30)" }, body: [
            { type: "stroke", points: [["cx", 38], ["cx", 54]], role: "role", width: 2.2 },
            { type: "text", text: "{items[i].label}", x: "cx - 45", y: 8, width: 90, size: 15, bold: true, align: "center", role: "role" },
            { type: "text", text: "{items[i].sub}", x: "cx - 60", y: 62, width: 120, size: 14, align: "center", role: "muted" },
          ] },
        ],
      },
    ],
  },
  {
    id: "ablauf",
    title: "Ablauf in Schritten",
    tags: ["struktur", "prozess"],
    description:
      "Nummerierte Schritte untereinander, durch Pfeile verbunden. steps: Liste aus Texten.",
    params: {
      width: { default: 420, min: 200, max: 700 },
      // Past 8 steps the vertical chain runs past a typical page height.
      steps: { default: [], minItems: 1, maxItems: 8 },
      role: { default: "subheading" },
      gap: { default: 26, min: 10, max: 60 },
    },
    body: [
      {
        repeat: "len(steps)",
        as: "i",
        body: [
          { let: { top: "i * (54 + gap)" }, body: [
            { type: "ellipse", x: 0, y: "top", width: 34, height: 34, role: "role", strokeWidth: 2 },
            { type: "text", text: "{i + 1}", x: 0, y: "top + 7", width: 34, size: 16, bold: true, align: "center", role: "role" },
            { type: "text", text: "{steps[i]}", x: 48, y: "top + 4", width: "width - 48", size: 17, role: "body" },
            {
              when: "i < len(steps) - 1",
              body: [
                { type: "stroke", points: [[17, "top + 38"], [17, "top + 52 + gap"]], role: "role", width: 2 },
                { type: "stroke", points: [[12, "top + 46 + gap"], [17, "top + 54 + gap"], [22, "top + 46 + gap"]], role: "role", width: 2 },
              ],
            },
          ] },
        ],
      },
    ],
  },
  {
    id: "vergleich",
    title: "Gegenüberstellung",
    tags: ["struktur"],
    description:
      "Zwei Spalten mit Überschriften und einer Trennlinie, für Pro/Contra oder Vorher/Nachher. left/right: Überschriften, leftItems/rightItems: Listen aus Texten.",
    params: {
      width: { default: 640, min: 320, max: 1000 },
      left: { default: "Dafür" },
      right: { default: "Dagegen" },
      leftItems: { default: [], maxItems: 8 },
      rightItems: { default: [], maxItems: 8 },
      leftRole: { default: "support" },
      rightRole: { default: "signal" },
    },
    body: [
      { let: { col: "width / 2 - 18" }, body: [
        { type: "text", text: "{left}", x: 0, y: 0, width: "col", size: 19, bold: true, role: "leftRole" },
        { type: "text", text: "{right}", x: "width / 2 + 18", y: 0, width: "col", size: 19, bold: true, role: "rightRole" },
        { type: "stroke", points: [[0, 28], ["col", 28]], role: "leftRole", width: 2.4 },
        { type: "stroke", points: [["width / 2 + 18", 28], ["width", 28]], role: "rightRole", width: 2.4 },
        {
          type: "stroke",
          points: [["width / 2", 0], ["width / 2", "40 + max(len(leftItems), len(rightItems)) * 30"]],
          role: "muted",
          width: 1.6,
        },
        {
          repeat: "len(leftItems)",
          as: "i",
          body: [
            { type: "text", text: "– {leftItems[i]}", x: 0, y: "44 + i * 30", width: "col", size: 16, role: "body" },
          ],
        },
        {
          repeat: "len(rightItems)",
          as: "i",
          body: [
            { type: "text", text: "– {rightItems[i]}", x: "width / 2 + 18", y: "44 + i * 30", width: "col", size: 16, role: "body" },
          ],
        },
      ] },
    ],
  },
  {
    id: "klammer",
    title: "Geschweifte Klammer",
    tags: ["struktur", "annotation"],
    description:
      "Klammer, die mehrere Zeilen zusammenfasst, mit einer Beschriftung rechts daneben. items: Liste aus Texten, label: Text rechts.",
    params: {
      // Fewer than 2 lines is not a grouping — underline the one line instead.
      items: { default: [], minItems: 2, maxItems: 6 },
      label: { default: "" },
      role: { default: "accent" },
      rowHeight: { default: 30, min: 20, max: 60 },
      width: { default: 300, min: 160, max: 700 },
    },
    body: [
      {
        repeat: "len(items)",
        as: "i",
        body: [{ type: "text", text: "{items[i]}", x: 0, y: "i * rowHeight", width: "width - 80", size: 16, role: "body" }],
      },
      // A sampled curve rather than straight segments. The exponent gives the
      // sides a soft bow and leaves a point at the middle, which is what makes
      // it read as a brace instead of a parenthesis.
      {
        let: { span: "max(rowHeight, len(items) * rowHeight)", spine: "width - 66", bulge: 22 },
        body: [
          {
            repeat: 18,
            as: "s",
            body: [
              {
                let: { t: "s / 18", tNext: "(s + 1) / 18" },
                body: [
                  {
                    type: "stroke",
                    hand: false,
                    width: 2.6,
                    role: "role",
                    points: [
                      ["spine + bulge * pow(1 - abs(2 * t - 1), 0.55)", "span * t"],
                      ["spine + bulge * pow(1 - abs(2 * tNext - 1), 0.55)", "span * tNext"],
                    ],
                  },
                ],
              },
            ],
          },
          { type: "text", text: "{label}", x: "spine + bulge + 12", y: "span / 2 - 12", width: 140, size: 16, bold: true, role: "role" },
        ],
      },
    ],
  },
  {
    id: "koordinatensystem",
    title: "Koordinatensystem",
    tags: ["mathe", "physik"],
    description:
      "Achsenkreuz mit Pfeilspitzen und Achsenbeschriftung. points: optionale Liste aus {x, y} in Achseneinheiten (0..1), die als Kurve verbunden wird.",
    params: {
      width: { default: 320, min: 160, max: 700 },
      height: { default: 220, min: 100, max: 500 },
      xLabel: { default: "x" },
      yLabel: { default: "y" },
      // Each point costs one stroke segment; past ~30 the curve gets no
      // visibly smoother, just slower to place.
      points: { default: [], maxItems: 30 },
      role: { default: "body" },
      curveRole: { default: "accent" },
    },
    body: [
      { type: "stroke", points: [[0, "height"], ["width", "height"]], role: "role", width: 2.2 },
      { type: "stroke", points: [[0, "height"], [0, 0]], role: "role", width: 2.2 },
      { type: "stroke", points: [["width - 12", "height - 5"], ["width", "height"], ["width - 12", "height + 5"]], role: "role", width: 2.2 },
      { type: "stroke", points: [[-5, 12], [0, 0], [5, 12]], role: "role", width: 2.2 },
      { type: "text", text: "{xLabel}", x: "width - 18", y: "height + 10", width: 40, size: 15, italic: true, role: "role" },
      { type: "text", text: "{yLabel}", x: 10, y: -6, width: 40, size: 15, italic: true, role: "role" },
      {
        repeat: "max(0, len(points) - 1)",
        as: "i",
        body: [
          {
            type: "stroke",
            width: 2.6,
            role: "curveRole",
            points: [
              ["points[i].x * width", "height - points[i].y * height"],
              ["points[i + 1].x * width", "height - points[i + 1].y * height"],
            ],
          },
        ],
      },
    ],
  },
  {
    id: "glockenkurve",
    title: "Normalverteilung",
    tags: ["mathe", "statistik"],
    description:
      "Gaußsche Glockenkurve über einer Achse, mit Mittelwertlinie und optionalen Markierungen bei Standardabweichungen. sigmas: wie viele Abweichungen links und rechts markiert werden.",
    params: {
      width: { default: 360, min: 200, max: 700 },
      height: { default: 150, min: 80, max: 350 },
      // Marks beyond ±3σ sit under the axis line and are not worth drawing.
      sigmas: { default: 2, min: 1, max: 3 },
      meanLabel: { default: "μ" },
      role: { default: "body" },
      curveRole: { default: "accent" },
    },
    body: [
      { type: "stroke", points: [[0, "height"], ["width", "height"]], role: "role", width: 2.2 },
      {
        repeat: 40,
        as: "s",
        body: [
          {
            let: { t: "s / 40", tNext: "(s + 1) / 40" },
            body: [
              {
                type: "stroke",
                width: 2.6,
                role: "curveRole",
                points: [
                  ["t * width", "height - height * exp(-pow((t - 0.5) * 6, 2) / 2)"],
                  ["tNext * width", "height - height * exp(-pow((tNext - 0.5) * 6, 2) / 2)"],
                ],
              },
            ],
          },
        ],
      },
      { type: "stroke", points: [["width / 2", "height"], ["width / 2", 6]], role: "muted", width: 1.8 },
      { type: "text", text: "{meanLabel}", x: "width / 2 - 20", y: "height + 8", width: 40, size: 15, align: "center", role: "role" },
      {
        repeat: "sigmas * 2",
        as: "i",
        body: [
          {
            let: { offset: "(i < sigmas ? -(sigmas - i) : (i - sigmas + 1))" },
            body: [
              { type: "stroke", points: [["width / 2 + offset * width / 6", "height - 6"], ["width / 2 + offset * width / 6", "height + 6"]], role: "muted", width: 1.6 },
              { type: "text", text: "{offset > 0 ? \"+\" : \"\"}{offset}σ", x: "width / 2 + offset * width / 6 - 20", y: "height + 8", width: 40, size: 13, align: "center", role: "muted" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "kolben",
    title: "Erlenmeyerkolben",
    tags: ["chemie"],
    description:
      "Handgezeichneter Erlenmeyerkolben mit optionaler Füllstandslinie und Beschriftung. fill: 0 bis 1.",
    params: {
      width: { default: 110, min: 60, max: 260 },
      height: { default: 140, min: 80, max: 320 },
      label: { default: "" },
      fill: { default: 0.35, min: 0, max: 1 },
      role: { default: "body" },
      liquidRole: { default: "accent" },
    },
    body: [
      {
        type: "stroke",
        width: 2.4,
        role: "role",
        points: [
          ["width * 0.34", 0],
          ["width * 0.34", "height * 0.28"],
          [0, "height"],
          ["width", "height"],
          ["width * 0.66", "height * 0.28"],
          ["width * 0.66", 0],
        ],
      },
      { type: "stroke", points: [["width * 0.3", 0], ["width * 0.7", 0]], role: "role", width: 2.4 },
      {
        when: "fill > 0",
        body: [
          {
            // The body tapers from full width at the bottom to the neck, so
            // the liquid line has to be as wide as the flask is at its level.
            let: {
              level: "height - height * 0.72 * clamp(fill, 0, 1)",
              taper: "(level - height * 0.28) / (height * 0.72)",
              inset: "width * 0.34 * (1 - taper)",
            },
            body: [
              {
                type: "stroke",
                width: 2.2,
                role: "liquidRole",
                points: [["inset", "level"], ["width - inset", "level"]],
              },
            ],
          },
        ],
      },
      { type: "text", text: "{label}", x: 0, y: "height + 8", width: "width", size: 14, align: "center", role: "role" },
    ],
  },
  {
    id: "reaktionspfeil",
    title: "Reaktionspfeil",
    tags: ["chemie"],
    description:
      "Waagerechter Reaktionspfeil mit Beschriftung darüber (Reagenz) und darunter (Bedingung).",
    params: {
      width: { default: 150, min: 60, max: 400 },
      above: { default: "" },
      below: { default: "" },
      role: { default: "body" },
    },
    body: [
      { type: "text", text: "{above}", x: 0, y: -22, width: "width", size: 14, align: "center", role: "accent" },
      { type: "stroke", points: [[0, 0], ["width", 0]], role: "role", width: 2.4 },
      { type: "stroke", points: [["width - 12", -5], ["width", 0], ["width - 12", 5]], role: "role", width: 2.4 },
      { type: "text", text: "{below}", x: 0, y: 8, width: "width", size: 14, align: "center", role: "muted" },
    ],
  },
  {
    id: "kreislauf",
    title: "Kreislauf",
    tags: ["biologie", "struktur"],
    description:
      "Stationen im Kreis, mit Pfeilen im Uhrzeigersinn verbunden. items: Liste aus Texten.",
    params: {
      radius: { default: 110, min: 60, max: 220 },
      // Below 2 there is no cycle; past 8 the arc-and-arrowhead per station
      // has no room left between labels.
      items: { default: [], minItems: 2, maxItems: 8 },
      role: { default: "support" },
    },
    body: [
      {
        repeat: "len(items)",
        as: "i",
        body: [
          {
            let: {
              count: "max(1, len(items))",
              angle: "-PI / 2 + TAU * i / count",
              // The arc stops short of the next station so the arrowhead does
              // not run into its label.
              from: "angle + TAU / count * 0.22",
              to: "angle + TAU / count * 0.78",
              ring: "radius * 0.74",
            },
            body: [
              {
                type: "text",
                text: "{items[i]}",
                x: "radius + cos(angle) * radius - 60",
                y: "radius + sin(angle) * radius - 10",
                width: 120,
                size: 15,
                align: "center",
                bold: true,
                role: "body",
              },
              {
                repeat: 7,
                as: "s",
                body: [
                  {
                    let: {
                      a1: "lerp(from, to, s / 7)",
                      a2: "lerp(from, to, (s + 1) / 7)",
                    },
                    body: [
                      {
                        type: "stroke",
                        width: 2.2,
                        role: "role",
                        points: [
                          ["radius + cos(a1) * ring", "radius + sin(a1) * ring"],
                          ["radius + cos(a2) * ring", "radius + sin(a2) * ring"],
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                // Arrowhead along the tangent at the end of the arc.
                let: {
                  tipX: "radius + cos(to) * ring",
                  tipY: "radius + sin(to) * ring",
                  dirX: "-sin(to)",
                  dirY: "cos(to)",
                },
                body: [
                  {
                    type: "stroke",
                    width: 2.2,
                    role: "role",
                    points: [
                      ["tipX - dirX * 12 - cos(to) * 5", "tipY - dirY * 12 - sin(to) * 5"],
                      ["tipX", "tipY"],
                      ["tipX - dirX * 12 + cos(to) * 5", "tipY - dirY * 12 + sin(to) * 5"],
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "atom",
    title: "Atommodell",
    tags: ["physik", "chemie"],
    description: "Kern mit Elektronenschalen. shells: Anzahl der Schalen, label: Elementsymbol.",
    params: {
      radius: { default: 90, min: 50, max: 160 },
      // The shell spacing formula divides the radius by the count, so past 5
      // rings collapse into each other rather than staying legible.
      shells: { default: 2, min: 1, max: 5 },
      label: { default: "" },
      role: { default: "body" },
      shellRole: { default: "accent" },
    },
    body: [
      // Outline, not a filled disc: the element symbol sits inside it, and on
      // a filled nucleus a body-coloured symbol is invisible.
      { type: "ellipse", x: "radius - 19", y: "radius - 19", width: 38, height: 38, role: "role", strokeWidth: 2.2 },
      { type: "text", text: "{label}", x: "radius - 40", y: "radius - 10", width: 80, size: 16, bold: true, align: "center", role: "body" },
      {
        repeat: "shells",
        as: "s",
        body: [
          {
            let: {
              r: "28 + (s + 1) * ((radius - 28) / max(1, shells))",
              // Two electrons per shell, rotated shell by shell so they do not
              // all line up on the same side.
              spin: "s * 0.9",
            },
            body: [
              { type: "ellipse", x: "radius - r", y: "radius - r * 0.62", width: "r * 2", height: "r * 1.24", role: "shellRole", strokeWidth: 1.8 },
              {
                repeat: 2,
                as: "e",
                body: [
                  {
                    let: { a: "spin + PI * e" },
                    body: [
                      {
                        type: "ellipse",
                        x: "radius + cos(a) * r - 5",
                        y: "radius + sin(a) * r * 0.62 - 5",
                        width: 10,
                        height: 10,
                        role: "shellRole",
                        fill: "shellRole",
                        strokeWidth: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "randnotiz",
    title: "Randnotiz mit Zeiger",
    tags: ["annotation"],
    description:
      "Handschriftliche Notiz am Rand, mit einem Pfeil zur Stelle, auf die sie sich bezieht. toX/toY: Ziel relativ zur Notiz.",
    params: {
      text: { default: "" },
      width: { default: 180 },
      toX: { default: 220 },
      toY: { default: 40 },
      role: { default: "signal" },
    },
    body: [
      { type: "text", text: "{text}", x: 0, y: 0, width: "width", size: 17, font: "hand", role: "role" },
      {
        type: "stroke",
        width: 2,
        role: "role",
        points: [["width - 10", 14], ["width + (toX - width) * 0.5", "14 + (toY - 14) * 0.2"], ["toX", "toY"]],
      },
      { type: "stroke", points: [["toX - 12", "toY - 6"], ["toX", "toY"], ["toX - 7", "toY + 9"]], role: "role", width: 2 },
    ],
  },
  {
    id: "nummernkreis",
    title: "Eingekreiste Nummer",
    tags: ["annotation"],
    description: "Eingekreiste Zahl, wie sie am Rand für Reihenfolgen verwendet wird.",
    params: {
      number: { default: 1, min: 1, max: 99 },
      size: { default: 34, min: 20, max: 80 },
      role: { default: "signal" },
    },
    body: [
      { type: "ellipse", x: 0, y: 0, width: "size", height: "size", role: "role", strokeWidth: 2.2 },
      { type: "text", text: "{number}", x: 0, y: "size * 0.2", width: "size", size: "size * 0.5", bold: true, align: "center", role: "role" },
    ],
  },
];

export const COMPONENT_BY_ID = new Map(COMPONENT_LIBRARY.map((entry) => [entry.id, entry]));
