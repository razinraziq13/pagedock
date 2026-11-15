import { describe, it, expect, beforeAll } from 'vitest';
import { DOMParser as XDOMParser, XMLSerializer as XSerializer } from '@xmldom/xmldom';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel, ImageRun } from 'docx';
import { unzipSync, strFromU8 } from 'fflate';
import { WordDoc } from '../src/core/docxedit';
import { makePng } from './helpers';

beforeAll(() => {
  // The browser has these built in; tests use xmldom, a standards-based XML DOM.
  (globalThis as any).DOMParser = XDOMParser;
  (globalThis as any).XMLSerializer = XSerializer;
});

async function sample(): Promise<Uint8Array> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Quarterly report')] }),
        new Paragraph({ children: [new TextRun('Sales were '), new TextRun({ text: 'very strong', bold: true }), new TextRun(' this quarter.')] }),
        new Paragraph({ children: [new TextRun('Name'), new TextRun({ text: '\tValue' })] }),
        new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Cell A')] }), new TableCell({ children: [new Paragraph('Cell B')] })] })] }),
        new Paragraph({ children: [new ImageRun({ type: 'png', data: makePng(4, 4), transformation: { width: 20, height: 20 } })] }),
      ],
    }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

const xmlOf = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['word/document.xml']);

describe('WordDoc', () => {
  it('lists paragraphs with their text, tables and headings', async () => {
    const w = WordDoc.open(await sample());
    const ps = w.paragraphs();
    expect(ps.map((p) => p.text)).toEqual(['Quarterly report', 'Sales were very strong this quarter.', 'Name\tValue', 'Cell A', 'Cell B', '']);
    expect(ps[0].heading).toBe(true);
    expect(ps[3].inTable).toBe(true);
    expect(ps[1].format.bold).toBe(false); // only part is bold
  });

  it('changes only the edited words, keeping the formatting of the rest', async () => {
    const w = WordDoc.open(await sample());
    w.setText(1, 'Sales were very strong in the third quarter.');
    const again = WordDoc.open(w.save());
    expect(again.text(1)).toBe('Sales were very strong in the third quarter.');
    const xml = xmlOf(w.save());
    // The bold run still holds exactly "very strong".
    expect(xml).toMatch(/<w:b\/>[\s\S]*?<w:t[^>]*>very strong<\/w:t>/);
  });

  it('edits inside a bold run stay bold, and tabs and new lines become Word tabs and breaks', async () => {
    const w = WordDoc.open(await sample());
    w.setText(1, 'Sales were very, very strong this quarter.');
    expect(xmlOf(w.save())).toMatch(/<w:t[^>]*>very, very strong<\/w:t>/);
    w.setText(2, 'Name\tTotal\nNext line');
    const again = WordDoc.open(w.save());
    expect(again.text(2)).toBe('Name\tTotal\nNext line');
    expect(xmlOf(w.save())).toContain('<w:br/>');
  });

  it('can clear and refill a paragraph, and fill an empty one', async () => {
    const w = WordDoc.open(await sample());
    w.setText(0, '');
    expect(w.text(0)).toBe('');
    w.setText(0, 'Annual report');
    w.setText(5, 'Caption under the picture');
    const again = WordDoc.open(w.save());
    expect(again.text(0)).toBe('Annual report');
    expect(again.text(5)).toBe('Caption under the picture');
    expect(xmlOf(w.save())).toContain('<w:drawing>'); // the picture is still there
    expect(Object.keys(unzipSync(w.save())).some((n) => n.startsWith('word/media/'))).toBe(true);
  });

  it('applies bold, italic, underline, size and alignment in Word order', async () => {
    const w = WordDoc.open(await sample());
    w.setFormat(1, { bold: true, italic: true, underline: true, size: 16, align: 'center' });
    const f = WordDoc.open(w.save()).format(1);
    expect(f).toEqual({ bold: true, italic: true, underline: true, align: 'center', size: 16 });
    const xml = xmlOf(w.save());
    const rpr = /<w:rPr>(.*?)<\/w:rPr>/.exec(xml.slice(xml.indexOf('Sales') - 400))![1];
    const order = ['<w:b', '<w:i', '<w:sz', '<w:u'].map((t) => rpr.indexOf(t));
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    w.setFormat(1, { bold: false });
    expect(WordDoc.open(w.save()).format(1).bold).toBe(false);
  });

  it('adds and removes paragraphs, but protects table cells', async () => {
    const w = WordDoc.open(await sample());
    const i = w.insertAfter(1);
    w.setText(i, 'A new paragraph');
    expect(WordDoc.open(w.save()).paragraphs().map((p) => p.text).slice(1, 3)).toEqual(['Sales were very strong this quarter.', 'A new paragraph']);
    w.remove(i);
    expect(w.count).toBe(6);
    expect(w.canRemove(3)).toBe(false); // the only paragraph in a table cell
    expect(() => w.remove(3)).toThrow(/table cell/);
  });

  it('marks paragraphs for the preview without changing the saved file', async () => {
    const w = WordDoc.open(await sample());
    expect(xmlOf(w.previewBytes())).toContain('w:name="pdk_1"');
    expect(xmlOf(w.save())).not.toContain('pdk_');
  });

  it('rejects files that are not .docx', () => {
    expect(() => WordDoc.open(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toThrow(/old Word file/);
    expect(() => WordDoc.open(new TextEncoder().encode('%PDF-1.7'))).toThrow(/not a Word/);
  });
});
