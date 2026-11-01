'use strict';
/* Built-in Government of Gujarat holiday list (works offline).
   Source: General Administration Department notification No. GS/22/2025/JSR/2025/509/GH,
   Sachivalaya, Gandhinagar, 27-11-2025 – Gujarat Government Gazette Extraordinary No. 160, Part IV-A, 27-11-2025.
   Part I = public holidays for State Government offices, Part II = optional holidays (any two may be availed).
   type: 'public' (office closed), 'sunday' (festival not notified because it falls on a Sunday – shown as the Sunday's name),
         'optional' (NOT a holiday unless you mark it as taken). */
const BUILTIN_HOLIDAYS = {
  2026: {
    source: 'GAD Notification No. GS/22/2025/JSR/2025/509/GH dated 27-11-2025 (Gujarat Govt. Gazette Extra. No. 160, Part IV-A)',
    list: [
      ['2026-01-14', 'public', 'મકરસંક્રાંતિ', 'Makar Sankranti'],
      ['2026-01-26', 'public', 'પ્રજાસત્તાક દિન', 'Republic Day'],
      ['2026-03-04', 'public', 'હોળી બીજો દિવસ (ધુળેટી)', 'Holi 2nd Day – Dhuleti'],
      ['2026-03-19', 'public', 'ચેટીચાંદ', 'Chetichand'],
      ['2026-03-21', 'public', 'રમજાન ઈદ (ઈદ-ઉલ-ફિત્ર)', 'Ramjan-Eid (Eid-Ul-Fitra)'],
      ['2026-03-26', 'public', 'શ્રી રામ નવમી', 'Shree Ram Navmi'],
      ['2026-03-31', 'public', 'મહાવીર જન્મ કલ્યાણક', 'Mahavir Janma Kalyanak'],
      ['2026-04-03', 'public', 'ગુડ ફ્રાઈડે', 'Good Friday'],
      ['2026-04-14', 'public', 'ડૉ. બાબાસાહેબ આંબેડકરનો જન્મદિન', "Dr. Baba Saheb Ambedkar's Birthday"],
      ['2026-05-27', 'public', 'ઈદ-ઉલ-અદહા (બકરી ઈદ)', 'Eid-Ul-Adha (Bakri-Eid)'],
      ['2026-06-26', 'public', 'મહોરમ (આશૂરા)', 'Muharram (Ashoora)'],
      ['2026-08-15', 'public', 'સ્વાતંત્ર્ય દિન / પારસી નૂતન વર્ષ', 'Independence Day / Parsi New Year Day – Pateti (Shahenshahi)'],
      ['2026-08-26', 'public', 'ઈદ-એ-મિલાદુન્નબી', "Eid-e-Meeladunnabi (Prophet Mohammad's Birthday)"],
      ['2026-08-28', 'public', 'રક્ષાબંધન', 'Raksha Bandhan'],
      ['2026-09-04', 'public', 'જન્માષ્ટમી', 'Janmashtami (Shravan Vad-8)'],
      ['2026-09-15', 'public', 'સંવત્સરી (ચતુર્થી પક્ષ)', 'Samvatsari (Chaturthi Paksha)'],
      ['2026-10-02', 'public', 'મહાત્મા ગાંધીનો જન્મદિન', "Mahatma Gandhi's Birthday"],
      ['2026-10-20', 'public', 'દશેરા (વિજયા દશમી)', 'Dusshera (Vijaya Dashmi)'],
      ['2026-10-31', 'public', 'સરદાર વલ્લભભાઈ પટેલનો જન્મદિન', "Sardar Vallabhbhai Patel's Birthday"],
      ['2026-11-10', 'public', 'નૂતન વર્ષ (બેસતું વર્ષ)', 'Vikram Samvat New Year Day'],
      ['2026-11-11', 'public', 'ભાઈબીજ', 'Bhai Bij'],
      ['2026-11-24', 'public', 'ગુરુ નાનક જયંતી', "Guru Nanak's Birthday"],
      ['2026-12-25', 'public', 'નાતાલ', 'Christmas'],
      ['2026-02-15', 'sunday', 'મહા શિવરાત્રી', 'Maha Shivratri (on Sunday)'],
      ['2026-04-19', 'sunday', 'ભગવાન શ્રી પરશુરામ જયંતી', 'Bhagvan Shree Parshuram Jayanti (on Sunday)'],
      ['2026-11-08', 'sunday', 'દિવાળી', 'Diwali (on Sunday)'],
      ['2026-01-01', 'optional', 'ખ્રિસ્તી નૂતન વર્ષ', 'Christian New Year Day'],
      ['2026-01-15', 'optional', 'વાસી ઉત્તરાયણ', 'Vassi Uttarayan'],
      ['2026-01-31', 'optional', 'વિશ્વકર્મા જયંતી', 'Vishvakarma Jayanti'],
      ['2026-02-04', 'optional', 'શબ-એ-બારાત / ધણી માતંગ દેવ જયંતી', 'Shab-e-Barat / Birthday of Dhani Matang Dev'],
      ['2026-03-03', 'optional', 'હોળી', 'Holi'],
      ['2026-03-11', 'optional', 'શહાદત-એ-હજરત અલી', 'Shahadat-e-Hazarat Ali'],
      ['2026-03-19', 'optional', 'ગુડી પડવો', 'Gudi Padvo'],
      ['2026-03-21', 'optional', 'જમશેદી નવરોઝ', 'Jamshedi Navroz'],
      ['2026-04-01', 'optional', 'હાટકેશ્વર જયંતી', 'Hatkeshvar Jayanti'],
      ['2026-04-02', 'optional', 'પેસાહ (યહૂદી) / હનુમાન જયંતી', 'Pesah 1st Day (Yahudi) / Hanuman Jayanti'],
      ['2026-04-13', 'optional', 'મહાપ્રભુજીનો પ્રાકટ્યોત્સવ (વલ્લભાચાર્ય જયંતી)', "Maha Prabhuji's Praktyotsava (Vallabhacharya Jayanti)"],
      ['2026-04-21', 'optional', 'શ્રી આદ્ય જગદ્ગુરુ શંકરાચાર્ય જયંતી', 'Shree Adhya Jagadguru Shankaracharya Jayanti'],
      ['2026-04-22', 'optional', 'જરથોસ્તનો દિશો (પારસી કદમી)', 'Zarthost-no-Disho (Parsi Kadami)'],
      ['2026-05-01', 'optional', 'બુદ્ધ પૂર્ણિમા', 'Budhha Purnima'],
      ['2026-05-22', 'optional', 'શાવુઓથ (યહૂદી) / જરથોસ્તનો દિશો (પારસી શહેનશાહી)', 'Shavuoth (Yahudi) / Zarthost-no-Disho (Parsi Shahenshahi)'],
      ['2026-06-18', 'optional', 'ગુરુ અર્જુનદેવનો શહીદ દિન', "Guru Arjundev's Martyrdom Day"],
      ['2026-06-25', 'optional', 'નવમો મોહરમ', '9th Muharram'],
      ['2026-07-13', 'optional', 'ગાથા ગહમ્બર (પારસી કદમી)', 'Gatha Gahamber (Gatha-III) (Parsi Kadmi)'],
      ['2026-07-15', 'optional', 'પારસી નૂતન વર્ષ પૂર્વેનો દિવસ (પારસી કદમી)', 'Parsi New Year Day Eve (Gatha-V) (Parsi Kadmi)'],
      ['2026-07-16', 'optional', 'રથયાત્રા (અષાઢી બીજ) / પારસી નૂતન વર્ષ (કદમી)', 'Rathayatra (Ashadhi Bij) / Parsi New Year Day (Parsi Kadmi)'],
      ['2026-07-21', 'optional', 'ખોરદાદ સાલ (પારસી કદમી)', 'Khordad Sal (Parsi Kadmi)'],
      ['2026-07-23', 'optional', 'તિશા-બ-અવ (યહૂદી)', 'Tisha-be-aav (Yahudi)'],
      ['2026-08-12', 'optional', 'ગાથા ગહમ્બર (પારસી શહેનશાહી) / શહાદત-એ-ઈમામ હસન', 'Gatha Gahamber (Parsi Shahenshahi) / Shahadat-e-Imam Hasan'],
      ['2026-08-14', 'optional', 'પારસી નૂતન વર્ષ પૂર્વેનો દિવસ (પારસી શહેનશાહી)', 'Parsi New Year Day Eve (Gatha-V) (Parsi Shahenshahi)'],
      ['2026-08-20', 'optional', 'ખોરદાદ સાલ (પારસી શહેનશાહી)', 'Khordad Sal (Parsi Shahenshahi)'],
      ['2026-08-26', 'optional', 'ઓણમ', 'Onam'],
      ['2026-08-31', 'optional', 'ઈદ-એ-મૌલુદ', 'Id-e-Maulud'],
      ['2026-09-05', 'optional', 'નંદ ઉત્સવ', 'Nand Utsav (Shravan Vad-9)'],
      ['2026-09-08', 'optional', 'પર્યુષણ પ્રારંભ (ચતુર્થી પક્ષ)', 'Shravan Vad-12 – Paryushan 1st Day (Chaturthi Paksha)'],
      ['2026-09-09', 'optional', 'પર્યુષણ પ્રારંભ (પંચમી પક્ષ)', 'Shravan Vad-13 – Paryushan 1st Day (Panchami Paksha)'],
      ['2026-09-14', 'optional', 'ગણેશ ચતુર્થી', 'Ganesh Chaturthi'],
      ['2026-09-16', 'optional', 'સંવત્સરી (પંચમી પક્ષ)', 'Samvatsari (Panchami Paksha)'],
      ['2026-09-21', 'optional', 'યોમ કિપ્પુર (યહૂદી)', 'Yom Kippur (Yahudi)'],
      ['2026-11-07', 'optional', 'ધનતેરસ', 'Dhan Terash'],
      ['2026-11-24', 'optional', 'દેવ દિવાળી', 'Dev-Diwali']
    ]
  }
};
const HOL = {
  /* year -> {source, list:[{date,type,gu,en}]}; an imported list for a year replaces the built-in one for that year */
  async lists() {
    const out = {};
    for (const [y, v] of Object.entries(BUILTIN_HOLIDAYS)) out[y] = { source: v.source, builtin: true, list: v.list.map(([date, type, gu, en]) => ({ date, type, gu, en })) };
    const imp = await DB.getSetting('holidayLists', {});
    for (const [y, v] of Object.entries(imp)) out[y] = { ...v, builtin: false };
    return out;
  },
  /* date -> merged info used by the diary: {public:{gu,en}, sunday:{..}, optional:[..]} */
  async map() {
    const m = {};
    for (const v of Object.values(await this.lists())) for (const h of v.list) {
      const e = (m[h.date] ||= { optional: [] });
      if (h.type === 'optional') e.optional.push(h); else if (!e[h.type]) e[h.type] = h; else e[h.type] = { ...e[h.type], gu: e[h.type].gu + ' / ' + h.gu, en: e[h.type].en + ' / ' + h.en };
    }
    return m;
  },
  /* CSV: date,type,name_gu,name_en  (type = public | optional | sunday; date YYYY-MM-DD or DD-MM-YYYY)
     JSON: {year, source, holidays:[{date,type,gu,en}]}  or  [{date,type,gu,en}, …] */
  parse(text, name = '') {
    let rows = [], source = '';
    const normDate = s => { s = String(s || '').trim(); let m; if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`; if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`; return ''; };
    const normType = t => /opt|મરજ/i.test(t || '') ? 'optional' : /sun/i.test(t || '') ? 'sunday' : 'public';
    if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) {
      const j = JSON.parse(text); source = j.source || ''; rows = (Array.isArray(j) ? j : j.holidays || j.list || []).map(h => ({ date: normDate(h.date), type: normType(h.type), gu: h.gu || h.name_gu || h.name || '', en: h.en || h.name_en || '' }));
    } else {
      const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
      const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
      lines.forEach(l => { if (/^#\s*source\s*:/i.test(l)) { source = l.replace(/^#\s*source\s*:/i, '').trim(); return; } const c = split(l); const d = normDate(c[0]); if (d) rows.push({ date: d, type: normType(c[1]), gu: c[2] || c[3] || '', en: c[3] || '' }); });
    }
    rows = rows.filter(r => r.date && (r.gu || r.en));
    if (!rows.length) throw new Error('No holidays found. Expected columns: date, type (public/optional), name in Gujarati, name in English.');
    const byYear = {}; rows.forEach(r => (byYear[r.date.slice(0, 4)] ||= []).push(r));
    return { source, byYear };
  },
  async importFile(text, name) {
    const { source, byYear } = this.parse(text, name), imp = await DB.getSetting('holidayLists', {});
    for (const [y, list] of Object.entries(byYear)) imp[y] = { source: source || ('Imported from ' + name + ' on ' + todayStr()), list: list.sort((a, b) => a.date.localeCompare(b.date)) };
    await DB.setSetting('holidayLists', imp);
    return Object.fromEntries(Object.entries(byYear).map(([y, l]) => [y, l.length]));
  },
  async resetYear(y) { const imp = await DB.getSetting('holidayLists', {}); delete imp[y]; await DB.setSetting('holidayLists', imp); },
  csvFor(year, data) { return '\uFEFF# source: ' + (data.source || '') + '\ndate,type,name_gu,name_en\n' + data.list.map(h => [h.date, h.type, h.gu, h.en].map(s => /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s).join(',')).join('\n') + '\n'; }
};
