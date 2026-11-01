'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const GU_DIG = '૦૧૨૩૪૫૬૭૮૯';
const guNum = v => String(v ?? '').replace(/[0-9]/g, d => GU_DIG[d]);
const GU_MONTHS = ['જાન્યુઆરી','ફેબ્રુઆરી','માર્ચ','એપ્રિલ','મે','જૂન','જુલાઈ','ઓગસ્ટ','સપ્ટેમ્બર','ઓક્ટોબર','નવેમ્બર','ડિસેમ્બર'];
const EN_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const EN_MON3 = EN_MONTHS.map(m => m.slice(0,3));
const GU_WDAYS = ['રવિ','સોમ','મંગળ','બુધ','ગુરુ','શુક્ર','શનિ'];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const todayStr = () => ymd(new Date());
const ymOf = s => s.slice(0, 7);
const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m = 1..12
const dmy = s => s ? `${s.slice(8,10)}-${s.slice(5,7)}-${s.slice(0,4)}` : '';
const addMonths = (ym, n) => { let [y,m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad(m)}`; };
const monthLabelGu = ym => { const [y,m] = ym.split('-').map(Number); return `${GU_MONTHS[m-1]}-${y}`; };
const monthLabelEn = ym => { const [y,m] = ym.split('-').map(Number); return `${EN_MONTHS[m-1]} ${y}`; };
const normCode = c => String(c ?? '').replace(/[\s.\-–_]/g, '').toUpperCase();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const excelSerial = s => { const d = parseYmd(s); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); };
const fromExcelSerial = n => { const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; };
function fyStartYm(ym) { const [y,m] = ym.split('-').map(Number); return `${m >= 4 ? y : y-1}-04`; }
function haversineKm(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function toast(msg, ms = 2400) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
const loaded = {};
/* iPhone / iPad (also iPadOS that reports as Mac). On iOS the share sheet (Save to Files / WhatsApp) is the reliable way to get a file out; a plain download link can trap a home-screen app. */
const IS_IOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function loadScript(src) { return loaded[src] ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
function blobToBase64(blob) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); }); }
function readFile(file, as = 'text') { return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; as === 'text' ? fr.readAsText(file) : as === 'dataurl' ? fr.readAsDataURL(file) : fr.readAsArrayBuffer(file); }); }
function pickFile(accept) { return new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => ok(i.files[0] || null); i.click(); }); }
/* Save / share a generated file. Works in mobile browsers (download or share sheet) and in the Android app (Capacitor). */
async function saveFile(blob, name) {
  const Cap = window.Capacitor;
  if (Cap && Cap.isNativePlatform && Cap.isNativePlatform()) {
    const { Filesystem, Share } = Cap.Plugins;
    const data = await blobToBase64(blob);
    const res = await Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
    try { await Share.share({ title: name, url: res.uri, dialogTitle: 'Save or send ' + name }); } catch (e) { /* user closed */ }
    try { await Filesystem.writeFile({ path: 'Inspection App/' + name, data, directory: 'DOCUMENTS', recursive: true }); toast('Saved to Documents/Inspection App/' + name); } catch (e) {}
    return;
  }
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && (/Android|iPhone|iPad/i.test(navigator.userAgent) && window.__preferShare || IS_IOS())) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(IS_IOS() ? 'Opened ' + name + ' – use Share › Save to Files' : 'Saved: ' + name);
}
