'use strict';
/* Keywords / કીવર્ડ્સ (v1.6.0) – Sir's own quick-input words for the diary and the inspection forms.
   Store 'keywords' (keyPath id). Record: { id, text, cat, scope, kind, order }
     cat   : 'work' (diary work type) | 'remark' (diary note / remarks) | 'insp' (inspection form)
     scope : '' = everywhere in that category | 'T:MA1' = only for this licence type | 'F:<field label>' = only in this field
     kind  : for 'work' only – office / tour / holiday / leave (colour + tour-day count in the diary)
   Synced to Drive like every other record (_u/_d stamps + tombstones); included in backups.
   Built-in chips are seeded with FIXED ids (seed-…) so two phones never create duplicates.            */
const KW_CATS = {
  work: { en: 'Diary work type', gu: 'ડાયરી – કામગીરી' },
  remark: { en: 'Diary remarks / note', gu: 'ડાયરી – નોંધ' },
  insp: { en: 'Inspection form', gu: 'તપાસણી ફોર્મ' }
};
const KW_SEED_REMARK = ['હીયરીંગ', 'વિ.સી. મીટીંગ', 'સંકલન બેઠક', 'ખાનગી તપાસ', 'પરીક્ષા સુપરવિઝન', 'દારૂનાશ', 'Office work', 'Court work'];
const KW_SEED_INSP = [
  ['કોઈ ક્ષતિ જણાઈ નથી', ''], ['No violation found', ''], ['Registers maintained properly / રજીસ્ટર નિયમિત નિભાવેલ છે', ''],
  ['Stock found as per register / સ્ટોક રજીસ્ટર મુજબ જણાયો', ''], ['Licence displayed / પરવાનો પ્રદર્શિત છે', ''],
  ['Not Applicable', ''], ['Satisfactory / સંતોષકારક', ''], ['Instructed to comply / સૂચના આપેલ છે', ''],
  ['Pass book verified', 'T:FL2'], ['Permit holders register verified', 'T:FL2'], ['Denaturing done in presence of staff', 'T:MA1'], ['Spirit account verified', 'T:MA2']
];
const KWL = {   // pure helpers (unit-tested in node)
  seeds() {
    const out = [];
    WORK_PRESETS.forEach(([w, k], i) => out.push({ id: 'seed-work-' + i, text: w, cat: 'work', scope: '', kind: k, order: i }));
    KW_SEED_REMARK.forEach((w, i) => out.push({ id: 'seed-remark-' + i, text: w, cat: 'remark', scope: '', order: i }));
    KW_SEED_INSP.forEach(([w, s], i) => out.push({ id: 'seed-insp-' + i, text: w, cat: 'insp', scope: s, order: i }));
    return out;
  },
  norm: s => String(s || '').replace(/\s+/g, ' ').trim(),
  sort: a => a.slice().sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || String(x.text).localeCompare(String(y.text))),
  /** keywords for a place: cat + optional licence code + field label. Field-specific first, then type, then general. */
  pick(all, cat, { code = '', field = '' } = {}) {
    const rank = k => k.scope === '' ? 2 : k.scope === 'T:' + code ? 1 : k.scope === 'F:' + field ? 0 : -1;
    return KWL.sort(all.filter(k => k.cat === cat && rank(k) >= 0)).sort((a, b) => rank(a) - rank(b));
  },
  /** autocomplete: keywords matching the word(s) being typed, best first */
  suggest(list, typed) {
    const q = KWL.norm(String(typed || '').split(/[,\n.+;]/).pop()).toLowerCase(); if (!q) return list;
    const s = list.map(k => { const t = k.text.toLowerCase(); return [t.startsWith(q) ? 0 : t.includes(q) ? 1 : 9, k]; }).filter(x => x[0] < 9);
    return s.sort((a, b) => a[0] - b[0]).map(x => x[1]);
  },
  /** insert kw at the cursor (start..end) with a sensible separator; returns {value, caret} */
  insert(value, kw, start = null, end = null, sep = ', ') {
    value = String(value || ''); if (start == null) start = end = value.length;
    let before = value.slice(0, start), after = value.slice(end ?? start);
    const typed = /[^\s,.+;\n]+$/.exec(before);   // a partly typed word that is the start of kw -> complete it
    if (typed && kw.toLowerCase().startsWith(typed[0].toLowerCase()) && typed[0].length < kw.length) before = before.slice(0, -typed[0].length);
    const tb = before.replace(/\s+$/, '');
    const pre = !tb ? '' : /[,.+;\n]$/.test(tb) ? tb + (sep.trim() === '+' ? '' : ' ') : tb + sep;
    const post = after && !/^[\s,.+;\n]/.test(after) ? sep + after : after;
    return { value: pre + kw + post, caret: (pre + kw).length };
  },
  makeId: () => 'kw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
};
const KW = {
  _cache: null,
  async all() { if (!KW._cache) KW._cache = await DB.all('keywords'); return KW._cache; },
  invalidate() { KW._cache = null; },
  /** first start: add built-in chips (fixed ids, base timestamp so any edit / delete on another phone wins) */
  async seed() {
    if (await DB.getSetting('bk.kwSeeded', false)) return 0;
    const have = new Set((await DB.all('keywords')).map(k => k.id));
    const add = KWL.seeds().filter(k => !have.has(k.id)).map(k => ({ ...k, _u: '2000-01-01T00:00:00.000Z', _d: '' }));
    const raw = (typeof SY !== 'undefined' && SY.raw) || DB;
    if (add.length) await raw.putMany('keywords', add);
    await raw.put('settings', { key: 'bk.kwSeeded', value: true }); KW.invalidate(); return add.length;
  },
  async save(k) { k.text = KWL.norm(k.text); if (!k.text) throw new Error('Keyword is empty / કીવર્ડ ખાલી છે'); if (!k.id) k.id = KWL.makeId();
    if (k.order == null) k.order = Math.max(-1, ...(await KW.all()).filter(x => x.cat === k.cat).map(x => x.order ?? 0)) + 1;
    await DB.put('keywords', k); KW.invalidate(); return k; },
  async remove(id) { await DB.del('keywords', id); KW.invalidate(); },
  async move(id, dir) {
    const all = await KW.all(), k = all.find(x => x.id === id); if (!k) return;
    const list = KWL.sort(all.filter(x => x.cat === k.cat)); list.forEach((x, i) => x.order = i);
    const i = list.indexOf(k), j = i + dir; if (j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    await DB.putMany('keywords', [list[i], list[j]]); KW.invalidate();
  },
  async list(cat, opt) { return KWL.pick(await KW.all(), cat, opt); },
  chipHtml: (list, extra = '') => list.map(k => `<button type="button" class="chip kw" data-kw="${esc(k.text)}" data-kk="${esc(k.kind || '')}">${esc(k.text)}</button>`).join('') + extra,
  /** Attach a keyword bar to an input/textarea. opt: {cat, code, field, sep, always, onPick(kw,el)} */
  async attach(el, opt) {
    if (!el || el.dataset.kwOn) return; el.dataset.kwOn = '1';
    const bar = document.createElement('div'); bar.className = 'chips kwbar gu' + (opt.always ? '' : ' hidden'); el.insertAdjacentElement('afterend', bar);
    let caret = null;
    const draw = async () => {
      const base = await KW.list(opt.cat, { code: opt.code?.() || '', field: opt.field || '' });
      const sug = KWL.suggest(base, el.value.slice(0, el.selectionStart ?? el.value.length));
      const list = (sug.length ? sug : base).slice(0, opt.max || 24);
      bar.innerHTML = KW.chipHtml(list, `<button type="button" class="chip kwadd" title="Save as keyword">＋ save</button><button type="button" class="chip kwman" title="Manage keywords">⚙</button>`);
      $$('.chip.kw', bar).forEach(b => { b.onpointerdown = e => e.preventDefault(); b.onclick = () => {
        if (opt.onPick && opt.onPick(b.dataset.kw, el, b.dataset.kk) === false) return;
        const s = caret ? caret[0] : el.value.length, e2 = caret ? caret[1] : s;
        const r = KWL.insert(el.value, b.dataset.kw, s, e2, opt.sep || ', ');
        el.value = r.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); try { el.setSelectionRange(r.caret, r.caret); } catch (x) {} caret = [r.caret, r.caret]; }; });
      $('.kwadd', bar).onpointerdown = e => e.preventDefault();
      $('.kwadd', bar).onclick = () => KW.addSheet(opt, (el.value.slice(caret?.[0] ?? 0, caret?.[1] ?? 0) || el.value), draw);
      $('.kwman', bar).onclick = () => go('#keywords/' + opt.cat);
    };
    const keep = () => { caret = [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length]; };
    el.addEventListener('focus', () => { $$('.kwbar').forEach(b => b !== bar && !b.dataset.always && b.classList.add('hidden')); bar.classList.remove('hidden'); keep(); draw(); });
    el.addEventListener('input', () => { keep(); draw(); }); el.addEventListener('keyup', keep); el.addEventListener('click', keep);
    if (opt.always) { bar.dataset.always = '1'; draw(); }
    return bar;
  },
  /** sheet to save typed text as a new keyword (choose where it should appear) */
  addSheet(opt, text, after) {
    const code = opt.code?.() || '', field = opt.field || '';
    openSheet(`<h3>Save keyword / કીવર્ડ સાચવો</h3><label>Text</label><textarea id="kwT" class="gu" rows="2">${esc(KWL.norm(text))}</textarea>
      ${opt.cat === 'insp' ? `<label>Show it in / ક્યાં બતાવવું</label><select id="kwS"><option value="">All inspection fields / બધા ફોર્મ</option>${code ? `<option value="T:${esc(code)}">Only ${esc(code)} forms</option>` : ''}${field ? `<option value="F:${esc(field)}">Only field “${esc(field)}”</option>` : ''}</select>` : ''}
      ${opt.cat === 'work' ? `<label>Type of day</label><select id="kwK">${Object.entries(DAY_KINDS).map(([k, v]) => `<option value="${k}">${v.en} / ${v.gu}</option>`).join('')}</select>` : ''}
      <div class="btns"><button class="btn" id="kwOk">Save</button><button class="btn sec" id="kwNo">Cancel</button></div>`, c => {
      $('#kwNo', c).onclick = closeSheet;
      $('#kwOk', c).onclick = async () => { try { await KW.save({ text: $('#kwT', c).value, cat: opt.cat, scope: $('#kwS', c)?.value || '', kind: $('#kwK', c)?.value }); closeSheet(); toast('Keyword saved / સાચવ્યો'); after && after(); } catch (e) { alert(e.message); } };
    });
  }
};
const KW_ROUTES = {
  async keywords(cat) {
    cat = KW_CATS[cat] ? cat : 'work';
    setTop('Keywords / કીવર્ડ્સ', 'તમારા પોતાના શબ્દો', true);
    const all = await KW.all(), list = KWL.sort(all.filter(k => k.cat === cat));
    const codes = [...new Set([...ABSTRACT_ROWS.flatMap(r => r.codes), ...Object.keys(DEFAULT_TEMPLATES || {})])].sort();
    const scopeLbl = s => !s ? '' : s.startsWith('T:') ? `<span class="pill">${esc(s.slice(2))} only</span>` : `<span class="pill">field: ${esc(s.slice(2))}</span>`;
    view().innerHTML = `<div class="card"><div class="seg" id="kwcat">${Object.entries(KW_CATS).map(([k, v]) => `<button data-c="${k}" class="${k === cat ? 'on' : ''}">${v.en}<br><small class="gu">${v.gu}</small></button>`).join('')}</div>
      <div class="muted" style="margin-top:8px">Tap a keyword chip while typing in the ${cat === 'insp' ? 'inspection form' : 'diary'} to insert it. Use ▲▼ to change the order of the chips.</div></div>
      <div class="card"><h3>Add new / નવો ઉમેરો</h3><textarea id="nT" class="gu" rows="2" placeholder="Gujarati or English text / ગુજરાતી કે અંગ્રેજી"></textarea>
      ${cat === 'work' ? `<label>Type of day</label><select id="nK">${Object.entries(DAY_KINDS).map(([k, v]) => `<option value="${k}">${v.en} / ${v.gu}</option>`).join('')}</select>` : ''}
      ${cat === 'insp' ? `<label>Show it in</label><select id="nS"><option value="">All inspection fields / બધા ફોર્મ</option>${codes.map(c => `<option value="T:${c}">Only ${c} forms</option>`).join('')}<option value="F">Only one field (type its name)…</option></select><input id="nF" class="hidden" placeholder="Field name exactly as in the form, e.g. Remarks of Inspecting Officer" style="margin-top:6px">` : ''}
      <button class="btn block" id="nAdd">＋ Add keyword</button></div>
      <div class="card"><h3>${esc(KW_CATS[cat].en)} <small>(${list.length})</small></h3>${list.length ? `<ul class="list kwlist">${list.map((k, i) => `<li><div class="main"><div class="t gu">${esc(k.text)}</div><div class="s">${k.kind ? esc(DAY_KINDS[k.kind]?.en || k.kind) + ' ' : ''}${scopeLbl(k.scope)}</div></div>
        <button class="icon-btn sm" data-up="${esc(k.id)}" ${i ? '' : 'disabled'} aria-label="Up">▲</button><button class="icon-btn sm" data-dn="${esc(k.id)}" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Down">▼</button><button class="icon-btn sm" data-ed="${esc(k.id)}" aria-label="Edit">✎</button><button class="icon-btn sm" data-rm="${esc(k.id)}" aria-label="Delete">🗑</button></li>`).join('')}</ul>` : '<div class="muted">No keywords yet.</div>'}</div>`;
    $$('#kwcat button').forEach(b => b.onclick = () => go('#keywords/' + b.dataset.c));
    $('#nS') && ($('#nS').onchange = () => $('#nF').classList.toggle('hidden', $('#nS').value !== 'F'));
    $('#nAdd').onclick = async () => { try { let scope = $('#nS')?.value || ''; if (scope === 'F') { const f = KWL.norm($('#nF').value); if (!f) return alert('Type the field name'); scope = 'F:' + f; }
      await KW.save({ text: $('#nT').value, cat, scope, kind: $('#nK')?.value }); toast('Added / ઉમેર્યો'); KW_ROUTES.keywords(cat); } catch (e) { alert(e.message); } };
    $$('[data-up]').forEach(b => b.onclick = async () => { await KW.move(b.dataset.up, -1); KW_ROUTES.keywords(cat); });
    $$('[data-dn]').forEach(b => b.onclick = async () => { await KW.move(b.dataset.dn, 1); KW_ROUTES.keywords(cat); });
    $$('[data-rm]').forEach(b => b.onclick = async () => { const k = list.find(x => x.id === b.dataset.rm); if (!confirm(`Delete “${k.text}”?\nકાઢી નાખવું છે?`)) return; await KW.remove(k.id); KW_ROUTES.keywords(cat); });
    $$('[data-ed]').forEach(b => b.onclick = () => { const k = list.find(x => x.id === b.dataset.ed);
      openSheet(`<h3>Edit keyword / ફેરફાર</h3><textarea id="eT" class="gu" rows="3">${esc(k.text)}</textarea>
        ${cat === 'work' ? `<label>Type of day</label><select id="eK">${Object.entries(DAY_KINDS).map(([x, v]) => `<option value="${x}" ${k.kind === x ? 'selected' : ''}>${v.en} / ${v.gu}</option>`).join('')}</select>` : ''}
        ${cat === 'insp' ? `<label>Show it in (blank = all; T:MA1 = one licence type; F:field name = one field)</label><input id="eS" value="${esc(k.scope || '')}">` : ''}
        <div class="btns"><button class="btn" id="eOk">Save</button><button class="btn sec" id="eNo">Cancel</button></div>`, c => {
        $('#eNo', c).onclick = closeSheet;
        $('#eOk', c).onclick = async () => { try { await KW.save({ ...k, text: $('#eT', c).value, kind: $('#eK', c)?.value ?? k.kind, scope: $('#eS', c) ? KWL.norm($('#eS', c).value) : k.scope }); closeSheet(); KW_ROUTES.keywords(cat); } catch (e) { alert(e.message); } };
      }); });
  }
};
if (typeof module !== 'undefined') module.exports = { KWL, KW, KW_CATS };
