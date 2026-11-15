import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { Layout } from './textlayout';

/**
 * Build a real .docx with editable paragraphs (no page images). Headings found by size become Word headings,
 * and each PDF page starts on a new Word page.
 */
export async function layoutToDocx(layout: Layout, title: string): Promise<Uint8Array> {
  const children: Paragraph[] = [];
  layout.pages.forEach((page, pi) => {
    page.paragraphs.forEach((p, i) => {
      const heading = p.heading === 1 ? HeadingLevel.HEADING_1 : p.heading === 2 ? HeadingLevel.HEADING_2 : undefined;
      children.push(
        new Paragraph({
          heading,
          pageBreakBefore: pi > 0 && i === 0,
          spacing: { after: 160 },
          children: [new TextRun({ text: stripControl(p.text) })],
        }),
      );
    });
    if (page.paragraphs.length === 0) children.push(new Paragraph({ pageBreakBefore: pi > 0, children: [] }));
  });
  const doc = new Document({
    creator: 'PageDock Free',
    title: stripControl(title).slice(0, 200),
    description: 'Converted from PDF by PageDock Free. Editable text; formatting may differ from the original.',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

/** XML cannot hold most control characters; drop them so the .docx is always valid. */
function stripControl(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
}
