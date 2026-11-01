'use strict';
/* Fixed structure of the official monthly diary (taken from the office's own Diary-*.xlsx / Sept-2025 PDF). */
const CATS = { imp: 'અગત્યના પરવાના', main: 'મુખ્ય પરવાના', minor: 'માઇનોર પરવાના', gen: 'સામાન્ય પરવાના' };
const CAT_XL_ROW = { imp: 93, main: 99, minor: 117, gen: 124 };
const ABSTRACT_ROWS = [
  ['1','એફ.એલ.-૧','દર માસે','imp',['FL1'],94], ['2','એફ.એલ.-૨','દર માસે','imp',['FL2'],95], ['3','એમ-૧','દર માસે','imp',['M1'],96],
  ['4','ડીસ્ટીલરી','દર માસે','imp',['DISTL','DISTILLERY'],97], ['5','ડી.એસ.-૧','દર માસે','imp',['DS1'],98],
  ['6','ડી.એસ.- ૫','દર માસે','main',['DS5'],100], ['7','ડી.એસ.- ૬','દર માસે','main',['DS6'],101], ['8','ડી.એસ.- ૭','દર બે માસે','main',['DS7'],102],
  ['9','ડી.એસ.પી.- ૧','દર માસે','main',['DSP1'],103], ['10','ડી.એસ.પી.- ૪','દર બે માસે','main',['DSP4'],104], ['11','આર.એસ.- ૧/૨','દર ચાર માસે','main',['RS1','RS2','RS'],105],
  ['12','આર.એસ.- ૬','દર માસે','main',['RS6'],106], ['13','ડી.ડી.-૧','દર માસે','main',['DD1'],107], ['14','એમ.એફ.- ૧','દર છ માસે','main',['MF1'],108],
  ['15','એન.-૩','દર ત્રણ માસે','main',['N3'],109], ['16','એન.-૪','દર ત્રણ માસે','main',['N4'],110], ['17','એસ.એમ.પી.- ૧','દર ત્રણ માસે','main',['SMP1'],111],
  ['18','એ.સી.-૧','દર બે માસે','main',['AC1'],112], ['19','એમ.એ.-૨','દર બે માસે','main',['MA2','MA12'],113], ['20','આર.જી.-૧','દર બે માસે','main',['RG1'],114],
  ['21','એસ.એ.- ૧/૨','દર બે માસે','main',['SA1','SA2'],115], ['૨૧એ','ફૉર્મ બી','-\u00a0','main',['FORMB'],116],
  ['22','ડી.ડી.-૨','દર છ માસે','minor',['DD2'],118], ['23','એમ.-૨','દર છ માસે','minor',['M2'],119], ['24','એમ.એફ.-૨','દર છ માસે','minor',['MF2'],120],
  ['25','એ.સી.-૨','દર છ માસે','minor',['AC2'],121], ['26','એમ.એ.-૧','દર ત્રણ માસે','minor',['MA1','MA12'],122],
  ['27','ડી.એસ.પી.-૩','વર્ષે એક વખત','gen',['DSP3'],125], ['28','ડી.એસ.-૨,૩,૪','વર્ષે એક વખત','gen',['DS2','DS3','DS4'],126], ['29','એસ.એમ.પી.-૨','વર્ષે એક વખત','gen',['SMP2'],127],
  ['30','ઓ.પી.-૨એ','-','gen',['OP2A'],128], ['31','બી-૨એ','-','gen',['B2A'],129], ['32','એસ. ડબ્લ્યુ.-૧','-','gen',['SW1'],130]
].map(([sr,label,std,cat,codes,xlRow]) => ({ key: 'r' + xlRow, sr, label, std, cat, codes, xlRow }));
const STD_MONTHS = { 'દર માસે': 1, 'દર બે માસે': 2, 'દર ત્રણ માસે': 3, 'દર ચાર માસે': 4, 'દર છ માસે': 6, 'વર્ષે એક વખત': 12 };
const DAY_KINDS = {
  office: { en: 'Office', gu: 'કચેરી', cls: 'office' },
  tour: { en: 'Tour / travel', gu: 'પ્રવાસ', cls: 'tour' },
  holiday: { en: 'Holiday', gu: 'જાહેર રજા', cls: 'holiday' },
  leave: { en: 'Leave / other', gu: 'રજા', cls: 'leave' }
};
/* Work phrases exactly as they appear in the office diaries; kind decides colour + travel-day count. */
const WORK_PRESETS = [
  ['કચેરી ખાતે કામગીરી','office'], ['કચેરી+હીયરીંગ','office'], ['કચેરી+HP','office'], ['કચેરી+HP+વિ.સી. મીટીંગ','office'],
  ['કચેરી+ તપાસણી','tour'], ['ખાનગી તપાસ+કચેરી','office'], ['કચેરી+સંકલન બેઠક','tour'], ['ગાંધીનગર ખાતે','tour'],
  ['ગાંધીનગર ખાતે-પરીક્ષા સુપરવિઝન','tour'], ['દારૂનાશની કામગીરી માટે','tour'], ['જાહેર રજા','holiday'], ['રજા','leave']
];
const PLACE_PRESETS = ['GNR','Sachin GIDC','Pandesara','Hazira','Palsana','Ambika','Kikvad','Bardoli','Olpad','Kamrej'];
const DEFAULT_PROFILE = {
  officerNameGu: '(નામ)', designationGu: 'અધિક્ષક', deptGu: 'નશાબંધી અને આબકારી', placeGu: 'સુરત',
  officeTitleGu: 'નશાબંધી અને આબકારી અધિક્ષકની કચેરી', officerNameEn: '', phone: '',
  refPrefix: 'કપવ/૧-૨/{YEAR}/', toLines: ['પ્રતિ ', 'મે. નિયામકશ્રી, નશાબંધી અને આબકારી ', 'નશાબંધી ભવન, સેક્ટર ૧૦બી, ', 'ગાંધીનગર-૩૮૨૦૧૦'],
  fromCode: 'SRT', vehicleCode: 'G', vehicles: [], officeLat: 21.1702, officeLng: 72.8311, roadFactor: 1.3,
  holidaySat: [2, 4], publicHolidays: [], showRouteCols: false, showExtraSummary: false, letterhead: '', areaKm: {},
  waNumber: '+91 78610 37371', remindMorning: '08:00', remindEvening: '19:00', remindersOn: true,
  useGovtHolidays: true, holidayNameInDiary: true, optionalTaken: []
};
const SUMMARY_ROWS = [
  { key: 'working', sr: '1', label: 'માસ દરમ્યાન કામકાજના દિવસો', xlRow: 77 },
  { key: 'travel', sr: '2', label: 'માસ દરમ્યાન કરેલ પ્રવાસના દિવસો', xlRow: 78 },
  { key: 'inspected', sr: '3', label: 'માસ દરમ્યાન તપાસેલ પરવાના', xlRow: 79, noStd: true },
  { key: 'defects', sr: '', label: 'શોધેલ ક્ષતિઓ', xlRow: 80 },
  { key: 'subOffices', sr: '5', label: 'માસ દરમ્યાન તપાસેલ તાબાની કચેરીની સંખ્યા', xlRow: 81, extra: true },
  { key: 'publicity', sr: '6', label: 'પ્રચારની કામેગીરી', xlRow: 82, extra: true }
];
