/* Offline app shell. pf42 r9 final: includes cleanup of foreign ULNs on already-deleted company inspections. */
const VERSION = 'inspection-app-v1.8.0-pf42';
const CORE = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/util.js', 'js/district.js', 'js/db.js', 'js/defaults.js', 'js/holidays.js', 'js/logic.js', 'js/exports.js', 'js/photos.js', 'js/importers.js', 'js/prefill.js', 'js/visits.js', 'js/config.js', 'js/backup.js', 'js/sync.js', 'js/keywords.js', 'js/dash.js', 'js/team.js', 'js/tpledit.js', 'js/distclean.js', 'js/portalmerge.js', 'js/xdist.js', 'js/taarij.js', 'js/notice.js', 'js/perf.js', 'js/dlist.js', 'oauth.html', 'js/app.js',
  'vendor/jszip.min.js', 'vendor/xlsx.core.min.js', 'vendor/docx.umd.js', 'vendor/html2canvas.min.js', 'vendor/jspdf.umd.min.js',
  'assets/diary-template.xlsx', 'assets/form-templates.json', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (new URL(e.request.url).pathname.endsWith('/oauth.html')) return;
  if (new URL(e.request.url).pathname.endsWith('/portal-figures.json') || new URL(e.request.url).pathname.endsWith('/portal-history.json') || new URL(e.request.url).pathname.endsWith('/portal-days.json')) return;   // v1.7.1 always live (app caches last value itself)   // always live (sign-in reply)
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })));
});
