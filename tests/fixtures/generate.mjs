// Builds the sample PDFs used for manual and browser testing:  node tests/fixtures/generate.mjs
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const dir = new URL('.', import.meta.url);
const out = (name, bytes) => writeFileSync(new URL(name, dir), bytes);

async function report(changed) {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Quarterly Report', { x: 72, y: 760, size: 24, font: bold });
  ['This report summarises results for the third quarter. Sales grew', 'steadily and costs stayed within the agreed budget.'].forEach((t, i) => p1.drawText(t, { x: 72, y: 720 - i * 14, size: 11, font: reg }));
  p1.drawText('Ringkasan: prestasi suku ketiga adalah baik.', { x: 72, y: 680, size: 11, font: reg });
  p1.drawText('Figures', { x: 72, y: 640, size: 16, font: bold });
  p1.drawText(changed ? 'Total revenue: RM 128,500' : 'Total revenue: RM 120,000', { x: 72, y: 620, size: 11, font: reg });
  p1.drawText('Prepared by the finance team.', { x: 72, y: 600, size: 11, font: reg });
  const p2 = doc.addPage([595, 842]);
  p2.drawText('Next steps', { x: 72, y: 760, size: 16, font: bold });
  p2.drawText('Review the budget in January.', { x: 72, y: 740, size: 11, font: reg });
  if (changed) p2.drawText('Hire two more staff.', { x: 72, y: 726, size: 11, font: reg });
  return doc.save();
}

async function form() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const f = doc.getForm();
  const label = (t, y) => page.drawText(t, { x: 72, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
  label('Full name', 745); f.createTextField('Full name').addToPage(page, { x: 200, y: 740, width: 250, height: 20 });
  label('I agree to the terms', 705); f.createCheckBox('Agree').addToPage(page, { x: 200, y: 700, width: 16, height: 16 });
  label('State', 665); const st = f.createDropdown('State'); st.addOptions(['Selangor', 'Johor', 'Penang']); st.disableEditing(); st.addToPage(page, { x: 200, y: 660, width: 150, height: 20 });
  label('Size', 625); const sz = f.createRadioGroup('Size'); sz.addOptionToPage('S', page, { x: 200, y: 620, width: 16, height: 16 }); sz.addOptionToPage('L', page, { x: 240, y: 620, width: 16, height: 16 });
  label('Postcode', 585); const pc = f.createTextField('Postcode'); pc.setMaxLength(5); pc.addToPage(page, { x: 200, y: 580, width: 80, height: 20 });
  return doc.save();
}

async function scanned() {
  const c = createCanvas(1240, 1754); // A4 at 150 dpi
  const x = c.getContext('2d');
  x.fillStyle = '#f7f5ef'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#1a1a1a'; x.font = 'bold 56px sans-serif'; x.fillText('Delivery Note', 120, 200);
  x.font = '36px sans-serif';
  ['Order number: 2026-4471', 'Customer: Kedai Buku Ilmu', 'Items delivered: 12 boxes', 'Received in good condition.'].forEach((t, i) => x.fillText(t, 120, 320 + i * 70));
  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(c.toBuffer('image/jpeg', 85));
  doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save();
}

out('report.pdf', await report(false));
out('report-changed.pdf', await report(true));
out('form.pdf', await form());
out('scanned.pdf', await scanned());
console.log('fixtures written');
