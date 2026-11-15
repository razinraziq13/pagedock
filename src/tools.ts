export type Category = 'Organize' | 'Convert' | 'Edit & Forms' | 'Scan & Text' | 'Compare';

export interface ToolInfo {
  id: string;
  name: string;
  benefit: string;
  input: string;
  category: Category;
  /** Only tools that have passed end-to-end tests are released to the dashboard. */
  released: boolean;
}

// The 17 planned tools. Unreleased tools are tracked here but never shown. See TOOL_STATUS.md.
export const TOOLS: ToolInfo[] = [
  { id: 'merge', name: 'Merge PDF', benefit: 'Combine several PDFs into one, in the order you choose.', input: '2 or more PDFs', category: 'Organize', released: true },
  { id: 'split', name: 'Split PDF', benefit: 'Extract pages or ranges into new PDFs.', input: '1 PDF', category: 'Organize', released: true },
  { id: 'organize', name: 'Organize PDF', benefit: 'Reorder, remove and rotate pages.', input: '1 PDF', category: 'Organize', released: true },
  { id: 'rotate', name: 'Rotate PDF', benefit: 'Turn pages 90, 180 or 270 degrees.', input: '1 PDF', category: 'Organize', released: true },
  { id: 'images-to-pdf', name: 'Images to PDF', benefit: 'Turn JPG and PNG images into a PDF.', input: 'JPG / PNG', category: 'Convert', released: false },
  { id: 'pdf-to-images', name: 'PDF to Images', benefit: 'Save pages as JPG or PNG.', input: '1 PDF', category: 'Convert', released: false },
  { id: 'watermark', name: 'Watermark PDF', benefit: 'Stamp text or an image across pages.', input: '1 PDF', category: 'Edit & Forms', released: false },
  { id: 'page-numbers', name: 'Page Numbers', benefit: 'Add page numbers where you want them.', input: '1 PDF', category: 'Edit & Forms', released: false },
  { id: 'crop', name: 'Crop PDF', benefit: 'Trim page edges.', input: '1 PDF', category: 'Edit & Forms', released: false },
  { id: 'annotate', name: 'Annotate PDF', benefit: 'Add text, shapes, highlights and drawings.', input: '1 PDF', category: 'Edit & Forms', released: false },
  { id: 'sign', name: 'Visual Sign PDF', benefit: 'Place a drawn or typed signature.', input: '1 PDF', category: 'Edit & Forms', released: false },
  { id: 'forms', name: 'Fill PDF Forms', benefit: 'Fill in form fields and save.', input: '1 PDF form', category: 'Edit & Forms', released: false },
  { id: 'scan', name: 'Scan to PDF', benefit: 'Turn phone photos into a PDF.', input: 'Camera / photos', category: 'Scan & Text', released: false },
  { id: 'pdf-to-text', name: 'PDF to Text', benefit: 'Copy out the text of a PDF.', input: '1 PDF', category: 'Scan & Text', released: false },
  { id: 'compare', name: 'Compare PDFs', benefit: 'See two PDFs side by side with text changes.', input: '2 PDFs', category: 'Compare', released: false },
  { id: 'ocr', name: 'OCR PDF to Text', benefit: 'Read text from scanned pages.', input: 'Scanned PDF', category: 'Scan & Text', released: false },
  { id: 'pdf-to-word', name: 'PDF to Word', benefit: 'Editable text in a .docx file.', input: '1 PDF', category: 'Convert', released: false },
];

export const CATEGORIES: ('All' | Category)[] = ['All', 'Organize', 'Convert', 'Edit & Forms', 'Scan & Text', 'Compare'];
