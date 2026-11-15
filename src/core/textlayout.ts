/**
 * Turns positioned text pieces (as pdf.js reports them) into lines, paragraphs and simple headings.
 * Pure functions: no pdf.js or browser code here, so the logic is unit-tested directly.
 *
 * Limits (documented, not hidden): multi-column pages are read row by row across columns,
 * tables become plain lines, and fonts/colours/images are not kept.
 */

export interface TextPiece {
  str: string;
  /** Baseline position in display space, top-left origin, in points. */
  x: number;
  y: number;
  /** Advance width and font height, in points. */
  w: number;
  h: number;
}

export interface PageText {
  width: number;
  height: number;
  pieces: TextPiece[];
}

export interface Paragraph {
  text: string;
  /** Typical font size of the paragraph, in points. */
  size: number;
  heading?: 1 | 2;
}

export interface Layout {
  pages: { paragraphs: Paragraph[] }[];
  /** Pages with no extractable text (likely scanned images), 0-based. */
  emptyPages: number[];
}

interface Line {
  text: string;
  y: number;
  x: number;
  size: number;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Group pieces into visual lines, left to right, top to bottom. */
export function toLines(pieces: TextPiece[]): Line[] {
  const items = pieces.filter((p) => p.str.length > 0 && p.h > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextPiece[][] = [];
  for (const it of items) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= Math.max(r[0].h, it.h) * 0.45);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x);
      let text = '';
      let end = -Infinity;
      for (const p of row) {
        const gap = p.x - end;
        if (text && gap > p.h * 0.12 && !text.endsWith(' ') && !p.str.startsWith(' ')) text += ' ';
        text += p.str;
        end = Math.max(end, p.x + p.w);
      }
      return { text: text.replace(/\s+/g, ' ').trim(), y: median(row.map((p) => p.y)), x: row[0].x, size: median(row.map((p) => p.h)) };
    })
    .filter((l) => l.text)
    .sort((a, b) => a.y - b.y);
}

/** Group lines into paragraphs using vertical gaps and size changes; mark larger short lines as headings. */
export function toParagraphs(lines: Line[], bodySize: number): Paragraph[] {
  // Normal line spacing = the tightest spacing between consecutive lines of similar size
  // (a median is skewed by paragraph gaps on short pages).
  const gaps = lines
    .slice(1)
    .map((l, i) => ({ g: l.y - lines[i].y, same: Math.abs(l.size - lines[i].size) <= Math.max(l.size, lines[i].size) * 0.18, size: l.size }))
    .filter((x) => x.same && x.g > x.size * 0.8);
  const lineGap = gaps.length ? Math.min(...gaps.map((x) => x.g)) : bodySize * 1.2;
  const paras: { lines: Line[] }[] = [];
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    const startNew =
      !prev ||
      line.y - prev.y > lineGap * 1.45 ||
      Math.abs(line.size - prev.size) > Math.max(prev.size, line.size) * 0.18;
    if (startNew) paras.push({ lines: [line] });
    else paras[paras.length - 1].lines.push(line);
  });
  return paras.map(({ lines: ls }) => {
    let text = '';
    for (const l of ls) {
      if (!text) text = l.text;
      else if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(l.text)) text = text.slice(0, -1) + l.text; // re-join hyphenated words
      else text += ' ' + l.text;
    }
    const size = median(ls.map((l) => l.size));
    const p: Paragraph = { text, size };
    if (bodySize > 0 && ls.length <= 2 && text.length <= 200) {
      if (size >= bodySize * 1.7) p.heading = 1;
      else if (size >= bodySize * 1.25) p.heading = 2;
    }
    return p;
  });
}

export function buildLayout(pages: PageText[]): Layout {
  const allSizes = pages.flatMap((p) => p.pieces.filter((x) => x.str.trim()).map((x) => x.h));
  const bodySize = median(allSizes);
  const emptyPages: number[] = [];
  const out = pages.map((p, i) => {
    const lines = toLines(p.pieces);
    if (!lines.length) emptyPages.push(i);
    return { paragraphs: toParagraphs(lines, bodySize) };
  });
  return { pages: out, emptyPages };
}

/** Plain text: paragraphs separated by blank lines, pages separated by a marker line. */
export function layoutToText(layout: Layout, pageMarkers = true): string {
  return layout.pages
    .map((p, i) => {
      const body = p.paragraphs.map((x) => x.text).join('\n\n');
      return pageMarkers ? `--- Page ${i + 1} ---\n\n${body}` : body;
    })
    .join('\n\n')
    .trim() + '\n';
}

/** Plain lines of each page, for comparing documents. */
export function pageLines(page: PageText): string[] {
  return toLines(page.pieces).map((l) => l.text);
}
