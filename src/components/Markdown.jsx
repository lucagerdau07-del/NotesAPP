import React from "react";

// A small block/inline Markdown renderer. It exists instead of a dependency
// because chat answers only ever use a handful of constructs, and because
// rendering to React elements (never dangerouslySetInnerHTML) means model
// output can't inject markup.
// ponytail: no nested lists, no reference links, no images. Reach for a real
// parser if answers ever need them.

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;

export function renderInline(text, keyPrefix = "i") {
  return String(text)
    .split(INLINE)
    .filter((part) => part !== "" && part !== undefined)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part))
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      if (/^~~[^~]+~~$/.test(part)) return <del key={key}>{part.slice(2, -2)}</del>;
      if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part))
        return <em key={key}>{part.slice(1, -1)}</em>;
      if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>;
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const href = link[2];
        // Only http(s): a javascript: URL from model output must never become
        // a clickable link.
        return /^https?:\/\//i.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>
        ) : (
          <span key={key}>{link[1]}</span>
        );
      }
      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
}

function CodeBlock({ code, language }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    globalThis.navigator?.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span>{language || "Code"}</span>
        <button type="button" onClick={copy}>
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function tableRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

export default function Markdown({ text }) {
  const lines = String(text ?? "").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <CodeBlock key={blocks.length} code={code.join("\n")} language={fence[1]} />,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const Tag = `h${Math.min(4, heading[1].length + 2)}`;
      blocks.push(
        <Tag key={blocks.length} className="md-heading">
          {renderInline(heading[2], `h${index}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (index < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^(\s*)([-*+]|\d+\.)\s+/, ""));
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length} className="md-list">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `l${index}-${itemIndex}`)}</li>
          ))}
        </List>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={blocks.length} className="md-quote">
          {renderInline(quote.join(" "), `q${index}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1] || "")) {
      const header = tableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        rows.push(tableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={blocks.length} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex}>{renderInline(cell, `th${cellIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell, `td${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={blocks.length} className="md-rule" />);
      index += 1;
      continue;
    }

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^(#{1,4}\s|```|\s*>|\s*([-*+]|\d+\.)\s)/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={blocks.length} className="md-p">
        {renderInline(paragraph.join(" "), `p${index}`)}
      </p>,
    );
  }

  return <div className="md">{blocks}</div>;
}
