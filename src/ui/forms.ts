import { fillForm, readForm, type FormField } from '../core/edit';
import { announce, h } from './dom';
import { errorPanel, resultPanel, singlePdfPicker, toolHeader, withBusy, type LoadedPdf } from './common';

export function renderForms(root: HTMLElement) {
  let pdf: LoadedPdf | null = null;
  let fields: FormField[] = [];
  const controls = new Map<string, () => string | boolean | string[]>();

  const body = h('div', {});
  const result = h('div', { class: 'result' });

  function control(f: FormField, i: number): HTMLElement {
    const id = `ff-${i}`;
    const label = h('label', { for: id, class: 'field-label' }, f.name, f.readOnly ? h('span', { class: 'muted' }, ' (read-only)') : null);
    if (f.kind === 'text') {
      const el = f.multiline
        ? h('textarea', { id, class: 'text-input', rows: '3', disabled: f.readOnly, maxlength: f.maxLength ? String(f.maxLength) : undefined })
        : h('input', { type: 'text', id, class: 'text-input', disabled: f.readOnly, maxlength: f.maxLength ? String(f.maxLength) : undefined });
      el.value = String(f.value ?? '');
      controls.set(f.name, () => el.value);
      return h('div', { class: 'field' }, label, el, f.maxLength ? h('span', { class: 'hint' }, `Up to ${f.maxLength} characters`) : null);
    }
    if (f.kind === 'checkbox') {
      const el = h('input', { type: 'checkbox', id, disabled: f.readOnly });
      el.checked = Boolean(f.value);
      controls.set(f.name, () => el.checked);
      return h('div', { class: 'field check' }, el, label);
    }
    if (f.kind === 'dropdown' || f.kind === 'radio') {
      const el = h('select', { id, class: 'text-input', disabled: f.readOnly }, h('option', { value: '' }, '— None —'), ...f.options.map((o) => h('option', { value: o }, o)));
      el.value = String(f.value ?? '');
      controls.set(f.name, () => el.value);
      return h('div', { class: 'field' }, label, el);
    }
    if (f.kind === 'list') {
      const el = h('select', { id, class: 'text-input', multiple: true, disabled: f.readOnly, size: String(Math.min(6, f.options.length)) }, ...f.options.map((o) => h('option', { value: o }, o)));
      const sel = new Set(f.value as string[]);
      Array.from(el.options).forEach((o) => { o.selected = sel.has(o.value); });
      controls.set(f.name, () => Array.from(el.selectedOptions).map((o) => o.value));
      return h('div', { class: 'field' }, label, el);
    }
    return h('div', { class: 'field' }, h('span', { class: 'field-label' }, f.name), h('span', { class: 'hint' }, f.note ?? 'This field type is not supported.'));
  }

  async function load(p: LoadedPdf) {
    body.replaceChildren(h('p', { class: 'hint' }, 'Reading form…'));
    result.replaceChildren();
    controls.clear();
    try {
      const info = await readForm(p);
      fields = info.fields;
      if (info.xfa === 'xfa-only') {
        body.replaceChildren(h('p', { class: 'error', role: 'alert' }, 'This is a dynamic XFA form (made with Adobe LiveCycle). These forms only work in Adobe Acrobat or Reader, so PageDock cannot fill them. Tip: use Annotate PDF to type on top of the page instead.'));
        return;
      }
      if (fields.length === 0) {
        body.replaceChildren(h('p', { class: 'hint warn' }, 'This PDF has no fillable form fields. To write on it anyway, use ', h('a', { href: '#/annotate' }, 'Annotate PDF'), ' and add text.'));
        return;
      }
      const flatten = h('input', { type: 'checkbox', id: 'ff-flatten' });
      const runBtn = h('button', { type: 'button', class: 'btn primary big' }, 'Save filled PDF');
      runBtn.addEventListener('click', () =>
        withBusy(runBtn, 'Saving…', async () => {
          try {
            const values: Record<string, string | boolean | string[]> = {};
            for (const f of fields) if (!f.readOnly && controls.has(f.name)) values[f.name] = controls.get(f.name)!();
            const out = await fillForm(p, values, flatten.checked);
            result.replaceChildren(resultPanel('Your filled PDF is ready', `${Object.keys(values).length} field${Object.keys(values).length === 1 ? '' : 's'}`, out, `${p.name.replace(/\.pdf$/i, '')}-filled.pdf`, 'application/pdf',
              flatten.checked ? 'The answers are now part of the page and can no longer be edited as form fields.' : 'The fields stay editable in other PDF apps.'));
            announce('Filled PDF is ready to download.');
          } catch (e) {
            result.replaceChildren(errorPanel(e, 'Saving the form failed.'));
          }
        }),
      );
      const unsupported = fields.filter((f) => f.kind === 'unsupported').length;
      body.replaceChildren(...([
        h('p', { class: 'hint' }, `${fields.length} field${fields.length === 1 ? '' : 's'} found.${unsupported ? ` ${unsupported} cannot be filled here (signature or button fields).` : ''}`),
        info.xfa === 'hybrid' ? h('p', { class: 'hint warn' }, 'This form also contains Adobe XFA data, which will be removed. The standard fields below will still work.') : null,
        h('form', { class: 'form-fields', onSubmit: (e: Event) => e.preventDefault() }, ...fields.map(control)),
        h('div', { class: 'field check' }, flatten, h('label', { for: 'ff-flatten' }, 'Flatten (make the answers part of the page, no longer editable)')),
        runBtn,
      ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => x !== null));
    } catch (e) {
      body.replaceChildren(errorPanel(e, 'Reading the form failed.'));
    }
  }

  root.append(h('section', { class: 'tool' },
    ...toolHeader('Fill PDF Forms', 'Fill in text boxes, tick boxes and drop-down lists, then save.'),
    singlePdfPicker('ff-file', (p) => { pdf = p; load(p); }, () => { pdf = null; body.replaceChildren(); result.replaceChildren(); }),
    body, result,
  ));
  void pdf;
}
