'use strict';
/* v1.7.4 In-app inspection form (template) editor.
   Saved forms live in IndexedDB 'templates' {code, fields, version, prev:[{at,version,fields}]} – included in Drive sync and JSON backups.
   Past inspections keep their own section/label/value copies, so editing a form never changes old reports. */
const TE = {
  TYPES: [['yesno', 'Yes / No'], ['text', 'Text (one line)'], ['textarea', 'Text (long)'], ['number', 'Number'], ['date', 'Date'], ['dropdown', 'Dropdown (choose one)'], ['checkbox', 'Tick box'], ['photo', 'Photo']],
  MAXPREV: 5,
  clone: o => JSON.parse(JSON.stringify(o)),
  defaults(code) { return DEFAULT_TEMPLATES[code] || DEFAULT_TEMPLATES[code.replace(/\d+$/, '1')] || (code === 'MA12' ? DEFAULT_TEMPLATES.MA1 : null) || []; },
  async load(code) { const s = await DB.get('templates', code); return { rec: s || null, fields: TE.clone(s?.fields || TE.defaults(code)) }; },
  /** turn the old 'dropdown with Yes/No only' into yesno for the editor's type list (rendering is the same) */
  typeOf(f) { if (f.type === 'dropdown' && Array.isArray(f.options) && f.options.length && f.options.every(o => /^(yes|no|not applicable)$/i.test(o))) return 'yesno'; return TE.TYPES.some(t => t[0] === f.type) ? f.type : 'text'; },
  norm: s => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9\u0a80-\u0aff]+/g, ' ').replace(/\b(the|of|or|not|whether|is|are|any|if|then|a|an|and|for|to|in|by|done)\b/g, ' ').replace(/\s+/g, ' ').trim(),
  /** groups of indexes whose labels are equal or near-identical */
  duplicates(fields) {
    const n = fields.map(f => TE.norm(f.label)), tok = n.map(s => new Set(s.split(' ').filter(Boolean))), raw = fields.map(f => String(f.label || '').trim().toLowerCase());
    const sim = (a, b) => { if (!a.size || !b.size) return 0; let c = 0; a.forEach(x => b.has(x) && c++); return c / (a.size + b.size - c); };
    const parent = fields.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++)
      if (raw[i] === raw[j] || (n[i] && n[i] === n[j]) || (Math.min(tok[i].size, tok[j].size) >= 2 && sim(tok[i], tok[j]) >= 0.75)) parent[find(j)] = find(i);
    const g = {}; fields.forEach((_, i) => (g[find(i)] ||= []).push(i));
    return Object.values(g).filter(x => x.length > 1);
  },
  sections(fields, extra = []) { const s = []; fields.forEach(f => { const k = f.section || 'Details'; if (!s.includes(k)) s.push(k); }); extra.forEach(k => !s.includes(k) && s.push(k)); return s; },
  async save(code, fields, rec) {
    const prev = rec?.fields ? [{ at: new Date().toISOString(), version: rec.version || 1, fields: rec.fields }, ...(rec.prev || [])].slice(0, TE.MAXPREV)
      : [{ at: new Date().toISOString(), version: 0, fields: TE.clone(TE.defaults(code)), note: 'built-in' }];
    const out = { code, fields: fields.map(({ section, label, type, options, required }) => ({ section: section || 'Details', label: String(label).trim(), type, options: options || [], required: !!required })), version: (rec?.version || 1) + 1, editedAt: new Date().toISOString(), prev };
    await DB.put('templates', out); return out;
  },
  /** small JPEG data-URL for a photo question */
  photoData(file) { return new Promise((ok, no) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { const m = 800, s = Math.min(1, m / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.7)); }; im.onerror = () => no(new Error('Not an image')); im.src = u; }); },

  /* ---------- editor screen: #tpledit/CODE ---------- */
  async route(code) {
    code = normCode(code || ''); if (!code) return go('#templates');
    setTop('Edit form ' + code, 'ફોર્મ સુધારો', true);
    const { rec } = await TE.load(code); let st = TE._st && TE._st.code === code ? TE._st : null;
    if (!st) st = TE._st = { code, rec, fields: (await TE.load(code)).fields.map(f => ({ ...f, type: TE.typeOf(f) })), open: -1, dup: null, extraSecs: [], dirty: false };
    TE.render(st);
  },
  render(st) {
    const F = st.fields, secs = TE.sections(F, st.extraSecs), dupIdx = new Map(); (st.dup || []).forEach((g, gi) => g.forEach(i => dupIdx.set(i, gi + 1)));
    const typeLab = t => (TE.TYPES.find(x => x[0] === t) || [, t])[1];
    const qHtml = (f, i) => {
      const d = dupIdx.get(i), op = st.open === i;
      return `<div class="te-q${d ? ' dup' : ''}" data-i="${i}">
        <div class="te-row"><div class="te-lab" data-act="open">${d ? `<span class="pill bad">Repeat ${d}</span> ` : ''}${esc(f.label || '(no text)')}<div class="muted">${esc(typeLab(f.type))}${f.required ? ' · required' : ''}${(f.type === 'dropdown' || f.type === 'checkbox') && f.options?.length ? ' · ' + f.options.length + ' options' : ''}</div></div>
        <div class="te-btns"><button class="btn sec sm" data-act="up" aria-label="Move up">▲</button><button class="btn sec sm" data-act="down" aria-label="Move down">▼</button><button class="btn sec sm" data-act="open" aria-label="Edit">✏️</button><button class="btn danger sm" data-act="del" aria-label="Delete">✕</button></div></div>
        ${op ? `<div class="te-ed"><label>Question text</label><textarea data-k="label" rows="2">${esc(f.label)}</textarea>
          <label>Answer type</label><select data-k="type">${TE.TYPES.map(([v, l]) => `<option value="${v}" ${v === f.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${f.type === 'dropdown' || f.type === 'checkbox' ? `<label>Options – one per line${f.type === 'checkbox' ? ' (leave empty for a single tick)' : ''}</label><textarea data-k="options" rows="4">${esc((f.options || []).join('\n'))}</textarea>` : ''}
          <label>Section (move to)</label><select data-k="section">${secs.map(s => `<option ${s === (f.section || 'Details') ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
          <label class="te-chk"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}> Required</label>
          <button class="btn block" data-act="close">Done</button></div>` : ''}</div>`;
    };
    const body = secs.map((s, si) => { const idx = F.map((f, i) => (f.section || 'Details') === s ? i : -1).filter(i => i >= 0);
      return `<div class="card te-sec" data-s="${si}"><div class="te-sh"><h3>${esc(s)} <small>· ${idx.length}</small></h3>
        <div class="te-btns"><button class="btn sec sm" data-sact="up" aria-label="Section up">▲</button><button class="btn sec sm" data-sact="down" aria-label="Section down">▼</button><button class="btn sec sm" data-sact="ren" aria-label="Rename section">✏️</button><button class="btn danger sm" data-sact="del" aria-label="Delete section">✕</button></div></div>
        ${idx.map(i => qHtml(F[i], i)).join('') || '<div class="muted">No questions yet.</div>'}
        <button class="btn sec block" data-sact="addq">+ Add question here</button></div>`; }).join('');
    view().innerHTML = `<div class="card"><div class="muted">${F.length} questions in ${secs.length} sections · ${st.rec ? 'your edited form v' + (st.rec.version || 1) : 'built-in form'}${st.dirty ? ' · <b style="color:var(--acc)">unsaved changes</b>' : ''}. Old inspections are not changed.</div>
        <div class="te-top"><button class="btn" id="teSave">💾 Save</button><button class="btn sec" id="teCancel">Cancel</button><button class="btn sec" id="teDup">🔍 Find duplicates</button><button class="btn sec" id="teAddS">+ Section</button></div>
        ${st.dup ? `<div class="${st.dup.length ? 'warnbox' : 'muted'}" style="margin-top:8px">${st.dup.length ? `${st.dup.length} group(s) of repeated questions, marked <b>Repeat 1, 2…</b> below. Delete the extra ones with ✕.` : 'No repeated questions found.'} <button class="btn sec sm" id="teDupOff">Hide</button></div>` : ''}</div>
      ${body}
      <div class="card"><div class="btns"><button class="btn" id="teSave2">💾 Save</button><button class="btn sec" id="teCancel2">Cancel</button></div>
        <button class="btn danger block" id="teReset" style="margin-top:8px">Reset to built-in form</button>
        ${st.rec?.prev?.length ? `<button class="btn sec block" id="teUndo" style="margin-top:8px">↶ Restore previous saved version (${new Date(st.rec.prev[0].at).toLocaleString('en-IN')})</button>` : ''}</div>`;
    const re = () => { if (st.dup) st.dup = TE.duplicates(F); TE.render(st); }, dirty = () => { st.dirty = true; };
    const sameSecIdx = i => F.map((f, j) => (f.section || 'Details') === (F[i].section || 'Details') ? j : -1).filter(j => j >= 0);
    $$('.te-q').forEach(q => { const i = +q.dataset.i;
      q.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { const a = b.dataset.act;
        if (a === 'open') st.open = st.open === i ? -1 : i;
        else if (a === 'close') st.open = -1;
        else if (a === 'del') { if (!confirm('Delete this question?\n\n' + F[i].label)) return; F.splice(i, 1); st.open = -1; dirty(); }
        else { const ix = sameSecIdx(i), p = ix.indexOf(i), t = ix[a === 'up' ? p - 1 : p + 1]; if (t === undefined) return; [F[i], F[t]] = [F[t], F[i]]; if (st.open === i) st.open = t; dirty(); }
        re(); });
      q.querySelectorAll('[data-k]').forEach(el => el.onchange = () => { const k = el.dataset.k, f = F[i];
        if (k === 'label') f.label = el.value.trim();
        else if (k === 'options') f.options = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        else if (k === 'required') f.required = el.checked;
        else if (k === 'type') { f.type = el.value; if (f.type === 'yesno') f.options = ['Yes', 'No', 'Not Applicable']; else if (f.type !== 'dropdown' && f.type !== 'checkbox') f.options = []; }
        else if (k === 'section') { const [g] = F.splice(i, 1); g.section = el.value; let at = -1; F.forEach((x, j) => { if ((x.section || 'Details') === el.value) at = j; }); F.splice(at + 1, 0, g); st.open = at + 1; }
        dirty(); if (k !== 'label') re(); }); });
    $$('.te-sec').forEach(c => { const s = secs[+c.dataset.s];
      c.querySelectorAll('[data-sact]').forEach(b => b.onclick = () => { const a = b.dataset.sact, inS = f => (f.section || 'Details') === s;
        if (a === 'addq') { let at = -1; F.forEach((x, j) => inS(x) && (at = j)); const q = { section: s, label: 'New question', type: 'yesno', options: ['Yes', 'No', 'Not Applicable'], required: false }; at < 0 ? F.push(q) : F.splice(at + 1, 0, q); st.open = at < 0 ? F.length - 1 : at + 1; st.extraSecs = st.extraSecs.filter(x => x !== s); }
        else if (a === 'ren') { const n = (prompt('New section name', s) || '').trim(); if (!n || n === s) return; F.forEach(f => inS(f) && (f.section = n)); st.extraSecs = st.extraSecs.map(x => x === s ? n : x); }
        else if (a === 'del') { const k = F.filter(inS).length; if (!confirm(`Delete section "${s}"${k ? ` and its ${k} question(s)` : ''}?`)) return; for (let j = F.length - 1; j >= 0; j--) inS(F[j]) && F.splice(j, 1); st.extraSecs = st.extraSecs.filter(x => x !== s); st.open = -1; }
        else { const order = TE.sections(F, st.extraSecs), p = order.indexOf(s), t = a === 'up' ? p - 1 : p + 1; if (t < 0 || t >= order.length) return; [order[p], order[t]] = [order[t], order[p]];
          const moved = order.flatMap(x => F.filter(f => (f.section || 'Details') === x)); F.splice(0, F.length, ...moved); st.extraSecs = order.filter(x => !F.some(f => (f.section || 'Details') === x)); st.open = -1; }
        dirty(); re(); }); });
    const save = async () => { const bad = F.findIndex(f => !String(f.label || '').trim()); if (bad >= 0) { st.open = bad; re(); return alert('A question has no text. Please type it or delete it.'); }
      st.rec = await TE.save(st.code, F, st.rec); TE._st = null; toast('Form saved – v' + st.rec.version); go('#templates'); };
    const cancel = () => { if (st.dirty && !confirm('Discard your changes?')) return; TE._st = null; go('#templates'); };
    $('#teSave').onclick = $('#teSave2').onclick = save; $('#teCancel').onclick = $('#teCancel2').onclick = cancel;
    $('#teDup').onclick = () => { st.dup = TE.duplicates(F); TE.render(st); if (st.dup.length) document.querySelector('.te-q.dup')?.scrollIntoView({ block: 'center' }); };
    $('#teDupOff') && ($('#teDupOff').onclick = () => { st.dup = null; TE.render(st); });
    $('#teAddS').onclick = () => { const n = (prompt('Name of the new section') || '').trim(); if (!n) return; if (TE.sections(F, st.extraSecs).includes(n)) return alert('That section already exists'); st.extraSecs.push(n); TE.render(st); window.scrollTo(0, document.body.scrollHeight); };
    $('#teReset').onclick = async () => { if (!confirm(`Reset the ${st.code} form to the built-in version? Your current form is kept as a backup ("Restore previous").`)) return;
      st.rec = await TE.save(st.code, TE.clone(TE.defaults(st.code)), st.rec); TE._st = null; toast('Reset to built-in form'); TE.route(st.code); };
    $('#teUndo') && ($('#teUndo').onclick = async () => { const p = st.rec.prev[0]; if (!confirm('Replace the current form with the previous saved version?')) return;
      const cur = { code: st.code, fields: p.fields, version: (st.rec.version || 1) + 1, editedAt: new Date().toISOString(), prev: [{ at: new Date().toISOString(), version: st.rec.version, fields: st.rec.fields }, ...st.rec.prev.slice(1)].slice(0, TE.MAXPREV) };
      await DB.put('templates', cur); TE._st = null; toast('Previous version restored'); TE.route(st.code); });
  }
};
