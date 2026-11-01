'use strict';
/* v1.7.2 Diary photos: camera capture, burned-in date/time (IST) + GPS stamp, stored on this phone (IndexedDB 'photos'),
   printed as attachment pages after the diary. Photos stay local: not in Drive sync or JSON backups. */
const PH = {
  MAX_BYTES: 3 * 1024 * 1024, START_LONG: 2560, MIN_LONG: 900,
  istStamp(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second} IST`;
  },
  getLocation(timeout = 15000) {
    return new Promise(ok => {
      if (!navigator.geolocation) return ok(null);
      let done = false; const fin = v => { if (!done) { done = true; ok(v); } };
      setTimeout(() => fin(null), timeout + 1000);
      navigator.geolocation.getCurrentPosition(p => fin({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }), () => fin(null), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
    });
  },
  /* Address is optional: tried only when online, 5 s limit; any failure = coordinates only. */
  async reverseGeocode(loc) {
    if (!loc || !navigator.onLine) return '';
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000);
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=en&lat=${loc.lat}&lon=${loc.lon}`, { signal: c.signal, headers: { Accept: 'application/json' } });
      clearTimeout(t); if (!r.ok) return '';
      const j = await r.json(); return String(j.display_name || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 5).join(', ');
    } catch { return ''; }
  },
  stampLines(when, loc, addr) {
    const L = [PH.istStamp(when)];
    if (loc) { L.push(`Lat ${loc.lat.toFixed(6)}, Long ${loc.lon.toFixed(6)} (±${Math.round(loc.acc)} m)`); if (addr) L.push(addr); }
    else L.push('Location unavailable');
    return L;
  },
  wrap(g, text, maxW) { const out = []; let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; },
  /* Draw image + stamp band at the given long-side size. */
  render(img, lines, longSide) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.min(1, longSide / Math.max(iw, ih));
    const w = Math.round(iw * k), h = Math.round(ih * k), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const fs = Math.max(16, Math.round(Math.min(w, h) / 26)), pad = Math.round(fs * 0.6);
    g.font = `bold ${fs}px sans-serif`; g.textBaseline = 'top';
    const all = lines.flatMap(l => PH.wrap(g, l, w - pad * 2)), lh = Math.round(fs * 1.25), bh = all.length * lh + pad * 2;
    g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, h - bh, w, bh);
    g.lineWidth = Math.max(2, fs / 8); g.strokeStyle = '#000'; g.fillStyle = '#ffeb3b';
    all.forEach((l, i) => { const y = h - bh + pad + i * lh; g.strokeText(l, pad, y); g.fillText(l, pad, y); g.fillStyle = '#fff'; });
    return cv;
  },
  toBlob: (cv, q) => new Promise(ok => cv.toBlob(ok, 'image/jpeg', q)),
  /* Stamp, then reduce JPEG quality, then dimensions, until <= 3 MB. */
  async stampAndCompress(img, lines) {
    let side = Math.min(PH.START_LONG, Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)), blob, cv;
    for (;;) {
      cv = PH.render(img, lines, side);
      for (const q of [0.9, 0.82, 0.74, 0.66, 0.58]) { blob = await PH.toBlob(cv, q); if (blob.size <= PH.MAX_BYTES) return { blob, w: cv.width, h: cv.height, q }; }
      if (side <= PH.MIN_LONG) { blob = await PH.toBlob(cv, 0.5); return { blob, w: cv.width, h: cv.height, q: 0.5 }; }
      side = Math.max(PH.MIN_LONG, Math.round(side * 0.8));
    }
  },
  loadImg(file) { return new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('Could not read the photo')); im.src = u; }); },
  async capture(date) {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment');
    const locP = PH.getLocation();            // ask for location while the camera is open
    const file = await new Promise(ok => { input.onchange = () => ok(input.files[0] || null); input.click(); });
    if (!file) return null;
    toast('Stamping photo…', 6000);
    const when = new Date(file.lastModified && Math.abs(Date.now() - file.lastModified) < 10 * 60000 ? file.lastModified : Date.now());
    const loc = await locP, addr = await PH.reverseGeocode(loc), lines = PH.stampLines(when, loc, addr);
    const img = await PH.loadImg(file), out = await PH.stampAndCompress(img, lines);
    const rec = { id: 'ph-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, takenAt: when.toISOString(), stamp: lines.join(' | '), loc, addr, blob: out.blob, w: out.w, h: out.h, size: out.blob.size };
    await DB.put('photos', rec); return rec;
  },
  async forDate(date) { return (await DB.all('photos')).filter(p => p.date === date).sort((a, b) => a.takenAt.localeCompare(b.takenAt)); },
  async inRange(from, to) { return (await DB.all('photos')).filter(p => p.date >= from && p.date <= to).sort((a, b) => (a.date + a.takenAt).localeCompare(b.date + b.takenAt)); },
  url(p) { return p._u ||= URL.createObjectURL(p.blob); },
  /* Attachment pages: 2 photos per A4 page with captions. Empty array when there are no photos. */
  pages(photos, title) {
    const out = [];
    for (let i = 0; i < photos.length; i += 2) {
      const two = photos.slice(i, i + 2);
      out.push(`<div class="pg phpg"><div class="ttl">${esc(title || 'Attachment – Photographs')}</div>${two.map((p, j) => `<figure class="phfig"><img src="${PH.url(p)}"><figcaption><b>Photo ${i + j + 1}</b> (${dmy(p.date)}): ${esc(p.stamp)}</figcaption></figure>`).join('')}</div>`);
    }
    return out;
  }
};
