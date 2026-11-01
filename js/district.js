'use strict';
/* v1.7.0 – two fully separate districts. Each has its own IndexedDB database, its own localStorage keys
   (Google token, backup mirror), its own backup folder, its own Google account and its own team folder.
   Surat keeps the ORIGINAL database name, so Sir's existing data simply is the Surat district (nothing is moved). */
const DISTRICTS = {
  surat: { key: 'surat', en: 'Surat', gu: 'સુરત', admin: 'sp.pne.sur@gmail.com', db: 'batti-mobile', ls: '', bkDir: 'InspectionApp/backups', syncFile: 'inspection-app-sync.json' },
  valsad: { key: 'valsad', en: 'Valsad', gu: 'વલસાડ', admin: 'sp.pne.val@gmail.com', db: 'batti-mobile-valsad', ls: 'valsad:', bkDir: 'InspectionApp/backups-valsad', syncFile: 'inspection-app-sync-valsad.json' }
};
const DIST = (() => {
  const get = () => { try { return localStorage.getItem('district') || 'surat'; } catch (e) { return 'surat'; } };
  let cur = DISTRICTS[get()] ? get() : 'surat';
  return {
    get key() { return cur; }, get info() { return DISTRICTS[cur]; },
    ls: k => DISTRICTS[cur].ls + k,                       // per-district localStorage key
    locked: () => { try { return localStorage.getItem('district.locked') || ''; } catch (e) { return ''; } },   // officer phone: joined one district
    lock(k) { localStorage.setItem('district.locked', k); },
    canSwitch(k) { const l = DIST.locked(); return !l || l === k; },
    switchTo(k) { if (!DISTRICTS[k]) throw new Error('Unknown district'); if (!DIST.canSwitch(k)) throw new Error('This phone has joined ' + DISTRICTS[DIST.locked()].en + ' district only.'); localStorage.setItem('district', k); cur = k; },
    _set(k) { cur = k; }   // tests
  };
})();
if (typeof module !== 'undefined') module.exports = { DIST, DISTRICTS };
