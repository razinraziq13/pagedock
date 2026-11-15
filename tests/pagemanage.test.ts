import { describe, it, expect } from 'vitest';
import { extractPages, formatPageList, groupsFromCuts, splitAtCuts } from '../src/core/pages';
import { makePdf, readPageTexts } from './helpers';

describe('page list helpers', () => {
  it('formats page lists compactly', () => {
    expect(formatPageList([0, 1, 2, 4, 7, 6])).toBe('1-3, 5, 7-8');
    expect(formatPageList([3])).toBe('4');
    expect(formatPageList([])).toBe('');
  });
  it('groups pages by cut points', () => {
    expect(groupsFromCuts(5, [2])).toEqual([[0, 1, 2], [3, 4]]);
    expect(groupsFromCuts(5, [0, 3, 3])).toEqual([[0], [1, 2, 3], [4]]);
    expect(groupsFromCuts(5, [])).toEqual([[0, 1, 2, 3, 4]]);
    expect(groupsFromCuts(5, [4, -1, 9])).toEqual([[0, 1, 2, 3, 4]]); // cuts after the last page or outside are ignored
  });
});

describe('extractPages', () => {
  it('puts the selected pages into one PDF in document order', async () => {
    const out = await extractPages({ name: 'doc.pdf', bytes: await makePdf('P', 8) }, [4, 0, 2, 1, 7]);
    expect(out.name).toBe('doc-pages-1-3_5_8.pdf');
    expect(await readPageTexts(out.bytes)).toEqual(['P-1', 'P-2', 'P-3', 'P-5', 'P-8']);
  });
  it('refuses an empty or invalid selection', async () => {
    const src = { name: 'doc.pdf', bytes: await makePdf('P', 3) };
    await expect(extractPages(src, [])).rejects.toThrow(/at least one page/);
    await expect(extractPages(src, [5])).rejects.toThrow(/Page 6 does not exist/);
  });
});

describe('splitAtCuts', () => {
  it('makes one PDF per part with every page exactly once', async () => {
    const outs = await splitAtCuts({ name: 'doc.pdf', bytes: await makePdf('P', 6) }, [1, 4]);
    expect(outs.map((o) => o.name)).toEqual(['doc-part1-p1-2.pdf', 'doc-part2-p3-5.pdf', 'doc-part3-p6.pdf']);
    expect(await Promise.all(outs.map((o) => readPageTexts(o.bytes)))).toEqual([['P-1', 'P-2'], ['P-3', 'P-4', 'P-5'], ['P-6']]);
  });
  it('needs at least one cut', async () => {
    await expect(splitAtCuts({ name: 'doc.pdf', bytes: await makePdf('P', 3) }, [])).rejects.toThrow(/at least one place/);
  });
});
