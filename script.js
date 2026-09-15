'use strict';

/* ============================================================
   Мини-ГрандСмета — логика расчётов
   ============================================================ */

const LS = {
  works: 'mgs_works',
  coeffs: 'mgs_coeffs',
  rows: 'mgs_rows',
  settings: 'mgs_settings',
  nextRowId: 'mgs_next_rowid'
};

const STORAGE_ORDER = [
  'Сборник 1. Земляные работы',
  'Сборник 6. Бетонные и железобетонные конструкции монолитные',
  'Сборник 7. Бетонные и железобетонные конструкции сборные',
  'Сборник 8. Конструкции из кирпича и блоков',
  'Сборник 11. Полы',
  'Сборник 12. Кровли',
  'Сборник 15. Отделочные работы',
];

const state = {
  works: [],
  coeffs: [],
  rows: [],
  settings: { deadline: 10, people: 15, shift: 8 }
};

/* ---------- helpers ---------- */

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

function fmt(n, max) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: max == null ? 2 : max });
}

function money(n) {
  return fmt(n, 2) + ' ₽';
}

function manual(v) {
  return v !== '' && v != null && v !== undefined;
}

function getUnitDivisor(unit) {
  const m = String(unit == null ? '' : unit).match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

/* ---------- storage ---------- */

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function persist() {
  lsSet(LS.works, state.works);
  lsSet(LS.coeffs, state.coeffs);
  lsSet(LS.rows, state.rows);
  lsSet(LS.settings, state.settings);
  lsSet(LS.nextRowId, state.nextRowId);
}

/* ---------- data loading ---------- */

async function fetchJson(url) {
  const resp = await fetch(url, { cache: 'no-cache' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

function embedWorks() {
  return [
    { id: 1, code: '01-01-018-01', name: "Разработка грунта в котлованах объемом до 500 м3 с погрузкой в автомобили-самосвалы экскаваторами, ковш 0,65 м3, группа грунтов 1", unit: "1000 м³", norm: 472.500, basePrice: 1918.350, category: "Сборник 1. Земляные работы" },
    { id: 2, code: '01-01-033-01', name: "Засыпка траншей и котлованов бульдозерами мощностью 59 кВт (80 л.с.), группа грунтов 1", unit: "1000 м³", norm: 80.160, basePrice: 410.940, category: "Сборник 1. Земляные работы" },
    { id: 3, code: '01-01-036-01', name: "Планировка площадей бульдозерами мощностью 59 кВт (80 л.с.)", unit: "1000 м²", norm: 4.060, basePrice: 20.810, category: "Сборник 1. Земляные работы" },
    { id: 4, code: '01-02-001-02', name: "Уплотнение грунта прицепными катками на пневмоколесном ходу 25 т, толщина слоя 30 см", unit: "1000 м³", norm: 189.990, basePrice: 1160.980, category: "Сборник 1. Земляные работы" },
    { id: 5, code: '06-01-001-01', name: "Устройство бетонной подготовки", unit: "100 м³", norm: 135.000, basePrice: 3528.330, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 6, code: '06-01-001-02', name: "Устройство бетонных фундаментов общего назначения объемом до 3 м3", unit: "100 м³", norm: 441.000, basePrice: 10321.940, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 7, code: '06-19-001-01', name: "Устройство железобетонных колонн до 4 м высотой, периметром до 2 м", unit: "100 м³", norm: 1319.000, basePrice: 24571.930, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 8, code: '06-19-002-01', name: "Устройство железобетонных стен высотой до 6 м, толщиной 150 мм", unit: "100 м³", norm: 1694.700, basePrice: 26771.490, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 9, code: '06-19-003-01', name: "Устройство железобетонных балок для перекрытий пролетом до 6 м, высотой до 500 мм", unit: "100 м³", norm: 1627.000, basePrice: 23621.100, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 10, code: '06-19-004-01', name: "Устройство железобетонных перекрытий и покрытий высотой до 6 м", unit: "100 м³", norm: 833.600, basePrice: 13298.300, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 11, code: '06-19-005-01', name: "Устройство железобетонных лестничных маршей прямоугольных", unit: "100 м³", norm: 2412.600, basePrice: 29682.600, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 12, code: '06-16-001-01', name: "Монтаж крупнощитовой опалубки стен", unit: "10 м²", norm: 16.610, basePrice: 672.230, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 13, code: '06-16-006-01', name: "Установка каркасов и сеток в стенах и перекрытиях, масса элемента до 20 кг", unit: "т", norm: 32.820, basePrice: 370.430, category: "Сборник 6. Бетонные и железобетонные конструкции монолитные" },
    { id: 14, code: '07-01-001-01', name: "Укладка фундаментов и фундаментных балок массой до 0,5 т", unit: "100 шт.", norm: 65.200, basePrice: 2955.170, category: "Сборник 7. Бетонные и железобетонные конструкции сборные" },
    { id: 15, code: '07-05-001-03', name: "Установка блоков стен подвалов массой до 1,5 т", unit: "100 шт.", norm: 93.700, basePrice: 6366.310, category: "Сборник 7. Бетонные и железобетонные конструкции сборные" },
    { id: 16, code: '07-01-020-01', name: "Укладка в многоэтажных зданиях ригелей перекрытий и покрытий, балок (прямоугольных, длиной до 6 м)", unit: "100 шт.", norm: 1080.000, basePrice: 34453.540, category: "Сборник 7. Бетонные и железобетонные конструкции сборные" },
    { id: 17, code: '07-01-029-02', name: "Укладка плит перекрытий и покрытий многоэтажных зданий, пролетных, масса элементов до 5 т", unit: "100 шт.", norm: 288.000, basePrice: 11035.780, category: "Сборник 7. Бетонные и железобетонные конструкции сборные" },
    { id: 18, code: '07-01-035-01', name: "Установка панелей наружных стен многоэтажных зданий, рядовых, длиной до 6 м", unit: "100 шт.", norm: 566.000, basePrice: 19285.600, category: "Сборник 7. Бетонные и железобетонные конструкции сборные" },
    { id: 19, code: '07-01-047-01', name: "Установка лестничных маршей и площадок (на стену)", unit: "100 шт.", norm: 175.000, basePrice: 6745.490, category: "Сборник 7. Бетонные и железобетонные конструкции сборные" },
    { id: 20, code: '07-01-037-01', name: "Герметизация швов стеновых панелей цементным раствором", unit: "100 м", norm: 23.700, basePrice: 1197.160, category: "Сборник 7. Бетонные и железобетонные конструкции сборные" },
    { id: 21, code: '08-01-003-02', name: "Гидроизоляция стен, фундаментов: горизонтальная оклеечная в один слой", unit: "100 м²", norm: 14.300, basePrice: 253.530, category: "Сборник 8. Конструкции из кирпича и блоков" },
    { id: 22, code: '08-01-003-04', name: "Гидроизоляция стен, фундаментов: боковая цементная с жидким стеклом", unit: "100 м²", norm: 88.800, basePrice: 978.740, category: "Сборник 8. Конструкции из кирпича и блоков" },
    { id: 23, code: '08-02-001-01', name: "Кладка стен из кирпича простых при высоте этажа до 4 м", unit: "м³", norm: 4.540, basePrice: 73.890, category: "Сборник 8. Конструкции из кирпича и блоков" },
    { id: 24, code: '08-02-002-03', name: "Кладка перегородок из кирпича армированных в 1/2 кирпича при высоте этажа до 4 м", unit: "100 м²", norm: 143.000, basePrice: 2406.410, category: "Сборник 8. Конструкции из кирпича и блоков" },
    { id: 25, code: '08-02-008-01', name: "Кладка наружных стен из камней керамических кладочных простых при высоте этажа до 4 м", unit: "м³", norm: 3.850, basePrice: 63.880, category: "Сборник 8. Конструкции из кирпича и блоков" },
    { id: 26, code: '08-03-004-01', name: "Кладка стен из газобетонных блоков на клее без облицовки, толщина 400 мм", unit: "м³", norm: 3.650, basePrice: 50.560, category: "Сборник 8. Конструкции из кирпича и блоков" },
    { id: 27, code: '08-04-001-05', name: "Установка перегородок из гипсовых и легкобетонных плит в 1 слой", unit: "100 м²", norm: 92.000, basePrice: 1556.200, category: "Сборник 8. Конструкции из кирпича и блоков" },
    { id: 28, code: '11-01-011-01', name: "Устройство стяжек цементных толщиной 20 мм", unit: "100 м²", norm: 35.600, basePrice: 334.810, category: "Сборник 11. Полы" },
    { id: 29, code: '11-01-027-03', name: "Устройство покрытий на цементном растворе из керамических плиток для полов одноцветных", unit: "100 м²", norm: 106.000, basePrice: 8860.990, category: "Сборник 11. Полы" },
    { id: 30, code: '11-01-036-01', name: "Устройство покрытий из линолеума на клее", unit: "100 м²", norm: 38.200, basePrice: 362.150, category: "Сборник 11. Полы" },
    { id: 31, code: '11-01-047-01', name: "Устройство покрытий из плит керамогранитных 40 x 40 см", unit: "100 м²", norm: 310.420, basePrice: 2823.230, category: "Сборник 11. Полы" },
    { id: 32, code: '12-01-002-01', name: "Устройство кровель плоских из рулонных материалов с защитным слоем из гравия на битумной мастике", unit: "100 м²", norm: 26.300, basePrice: 5075.860, category: "Сборник 12. Кровли" },
    { id: 33, code: '12-01-013-01', name: "Утепление покрытий плитами из пенопласта полистирольного на битумной мастике, в один слой", unit: "100 м²", norm: 18.600, basePrice: 1159.960, category: "Сборник 12. Кровли" },
    { id: 34, code: '12-01-015-01', name: "Устройство пароизоляции оклеечной в один слой", unit: "100 м²", norm: 15.500, basePrice: 1758.590, category: "Сборник 12. Кровли" },
    { id: 35, code: '12-01-017-01', name: "Устройство выравнивающих стяжек цементно-песчаных толщиной 15 мм", unit: "100 м²", norm: 24.300, basePrice: 436.550, category: "Сборник 12. Кровли" },
    { id: 36, code: '12-01-020-01', name: "Устройство кровель различных типов из металлочерепицы", unit: "100 м²", norm: 173.870, basePrice: 13139.400, category: "Сборник 12. Кровли" },
    { id: 37, code: '15-02-016-01', name: "Штукатурка поверхностей цементно-известковым или цементным раствором по камню и бетону (стен)", unit: "100 м²", norm: 65.000, basePrice: 1540.700, category: "Сборник 15. Отделочные работы" },
    { id: 38, code: '15-04-005-03', name: "Окраска поливинилацетатными водоэмульсионными составами по штукатурке стен", unit: "100 м²", norm: 39.000, basePrice: 640.620, category: "Сборник 15. Отделочные работы" },
    { id: 39, code: '15-04-007-01', name: "Окраска водно-дисперсионными акриловыми составами внутри помещения по штукатурке стен", unit: "100 м²", norm: 43.560, basePrice: 1033.680, category: "Сборник 15. Отделочные работы" },
    { id: 40, code: '15-06-001-01', name: "Оклейка обоями простыми и средней плотности", unit: "100 м²", norm: 30.300, basePrice: 390.370, category: "Сборник 15. Отделочные работы" },
    { id: 41, code: '15-04-025-01', name: "Улучшенная окраска масляными составами стен", unit: "100 м²", norm: 53.200, basePrice: 898.410, category: "Сборник 15. Отделочные работы" },
  ];
}

function embedCoeffs() {
  return [
    { id: 'h1', name: 'Высота до 5 м (1–2 этаж)', value: 1, group: 'Высота' },
    { id: 'h2', name: 'Высота 5–15 м (3–5 этаж)', value: 1.2, group: 'Высота' },
    { id: 'h3', name: 'Высота свыше 15 м (6–9 этаж)', value: 1.3, group: 'Высота' },
    { id: 's1', name: 'Стеснённые условия', value: 1.2, group: 'Стеснённость' },
    { id: 'w1', name: 'Зимнее удорожание (отриц. температура)', value: 1.1, group: 'Зима' }
  ];
}

async function initData() {
  let works = lsGet(LS.works, null);
  let coeffs = lsGet(LS.coeffs, null);

  if (!works) {
    try { works = await fetchJson('data/works.json'); } catch (e) { works = embedWorks(); }
  }
  if (!coeffs) {
    try { coeffs = await fetchJson('data/coefficients.json'); } catch (e) { coeffs = embedCoeffs(); }
  }

  state.works = works || [];
  state.coeffs = coeffs || [];
  state.rows = lsGet(LS.rows, []);
  state.nextRowId = lsGet(LS.nextRowId, 1);
  const saved = lsGet(LS.settings, null);
  if (saved) state.settings = Object.assign(state.settings, saved);

  syncSettingsInputs();
  persist();
}

/* ---------- lookups ---------- */

function findWork(id) {
  return state.works.find(w => w.id == id);
}

function findRow(id) {
  return state.rows.find(r => r.id == id);
}

function findCoeff(id) {
  return state.coeffs.find(c => c.id == id);
}

function categoryOrder() {
  const names = state.works.map(w => w.category);
  const uniq = [];
  names.forEach(n => { if (n && uniq.indexOf(n) === -1) uniq.push(n); });
  uniq.sort((a, b) => {
    const ia = STORAGE_ORDER.indexOf(a);
    const ib = STORAGE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return uniq;
}

/* ---------- calculations ---------- */

function getRowCoeff(row) {
  if (manual(row.customCoeff)) return num(row.customCoeff);
  if (row.coeffId) {
    const c = findCoeff(row.coeffId);
    if (c) return num(c.value);
  }
  return 1;
}

function computeRow(row) {
  const w = findWork(row.workId);
  const vol = num(row.volume);
  if (!w) return { vol, divisor: 1, norm: 0, price: 0, coeff: getRowCoeff(row), hours: 0, cost: 0, unit: '', code: '', name: '' };
  const divisor = getUnitDivisor(w.unit);
  const norm = manual(row.manualNorm) ? num(row.manualNorm) : num(w.norm);
  const price = manual(row.manualPrice) ? num(row.manualPrice) : num(w.basePrice);
  const coeff = getRowCoeff(row);
  const hours = (vol / divisor) * norm * coeff;
  const cost = vol * price * coeff;
  return { vol, divisor, norm, price, coeff, hours, cost, unit: w.unit, code: w.code, name: w.name };
}

function totalHours() {
  return state.rows.reduce((s, r) => s + computeRow(r).hours, 0);
}

function totalCost() {
  return state.rows.reduce((s, r) => s + computeRow(r).cost, 0);
}

function hoursByCategory() {
  const map = {};
  state.rows.forEach(r => {
    const w = findWork(r.workId);
    const c = w ? w.category : 'Без категории';
    if (!map[c]) map[c] = 0;
    map[c] += computeRow(r).hours;
  });
  return map;
}

/* ---------- estimate table ---------- */

function renderEstimate() {
  const tb = document.getElementById('estimate-body');
  tb.innerHTML = '';

  const t = totalHours();
  const tc = totalCost();

  let idx = 0;
  categoryOrder().forEach(cat => {
    const catRows = state.rows.filter(r => {
      const w = findWork(r.workId);
      return w && w.category === cat;
    });
    if (catRows.length === 0) return;

    const header = document.createElement('tr');
    header.className = 'row-total group-row';
    header.dataset.category = cat;
    let catHours = 0, catCost = 0;
    catRows.forEach(r => {
      const c = computeRow(r);
      catHours += c.hours;
      catCost += c.cost;
    });
    header.innerHTML =
      '<td class="center">–</td>' +
      '<td></td>' +
      '<td><strong>' + escapeHtml(cat) + '</strong> <span class="sub" style="color:#666">раздел</span></td>' +
      '<td></td><td></td><td></td><td></td>' +
      '<td class="num"><strong>' + fmt(catHours) + '</strong></td>' +
      '<td></td>' +
      '<td class="num"><strong>' + money(catCost) + '</strong></td>' +
      '<td></td>';
    tb.appendChild(header);

    catRows.forEach(r => {
      idx++;
      const c = computeRow(r);
      const tr = document.createElement('tr');
      tr.dataset.rid = r.id;
      if (c.coeff > 1) tr.className = 'coeff-active';

      let coeffOptions = state.coeffs.map(co =>
        '<option value="' + co.id + '"' + (r.coeffId === co.id && !manual(r.customCoeff) ? ' selected' : '') + '>' +
        escapeHtml(co.name) + ' (×' + fmt(co.value, 2) + ')</option>'
      ).join('');
      coeffOptions += '<option value="@custom"' + (manual(r.customCoeff) ? ' selected' : '') + '>Свой…</option>';

      const customCell = manual(r.customCoeff)
        ? '<input type="number" step="0.05" class="custom-coeff" value="' + num(r.customCoeff) + '" min="0">'
        : '';

      tr.innerHTML =
        '<td class="center">' + idx + '</td>' +
        '<td class="code-cell">' + escapeHtml(c.code) + '</td>' +
        '<td class="name-cell" title="' + escapeHtml(c.name) + ' · ' + escapeHtml(c.code) + '">' + escapeHtml(c.name) + '</td>' +
        '<td>' + escapeHtml(c.unit) + '</td>' +
        '<td class="num"><input type="number" class="volume" min="0" step="0.01" value="' + (manual(r.volume) ? num(r.volume) : 1) + '"></td>' +
        '<td>' +
          '<span class="norm-val">' + fmt(c.norm, 2) + '</span>' +
          '<input type="number" class="norm-input" min="0" placeholder="ручн." step="0.01" value="' + (manual(r.manualNorm) ? num(r.manualNorm) : '') + '">' +
        '</td>' +
        '<td><select class="coeff-select">' + coeffOptions + '</select>' + customCell + '</td>' +
        '<td class="num cell-hours">' + fmt(c.hours) + '</td>' +
        '<td>' +
          '<span class="price-val">' + fmt(c.price, 2) + '</span>' +
          '<input type="number" class="price-input" min="0" placeholder="ручн." step="0.01" value="' + (manual(r.manualPrice) ? num(r.manualPrice) : '') + '">' +
        '</td>' +
        '<td class="num cell-cost">' + money(c.cost) + '</td>' +
        '<td><button class="btn btn-danger row-del" title="Удалить">×</button></td>';

      tb.appendChild(tr);
    });
  });

  document.getElementById('empty-hint').style.display = state.rows.length ? 'none' : 'block';
  renderTotals(t, tc);
  renderCalc();
  renderProgress();
}

function refreshEstimatesUI() {
  const tb = document.getElementById('estimate-body');
  tb.querySelectorAll('tr[data-rid]').forEach(tr => {
    const r = findRow(+tr.dataset.rid);
    if (!r) return;
    const c = computeRow(r);
    tr.querySelector('.cell-hours').textContent = fmt(c.hours);
    tr.querySelector('.cell-cost').textContent = money(c.cost);
    tr.querySelector('.norm-val').textContent = fmt(c.norm, 2);
    tr.querySelector('.price-val').textContent = fmt(c.price, 2);
    tr.classList.toggle('coeff-active', c.coeff > 1);
  });

  categoryOrder().forEach(cat => {
    const header = tb.querySelector('tr.group-row[data-category="' + CSS.escape(cat) + '"]');
    if (!header) return;
    const rows = state.rows.filter(r => {
      const w = findWork(r.workId);
      return w && w.category === cat;
    });
    let h = 0, co = 0;
    rows.forEach(r => {
      const c = computeRow(r);
      h += c.hours;
      co += c.cost;
    });
    header.children[7].innerHTML = '<strong>' + fmt(h) + '</strong>';
    header.children[9].innerHTML = '<strong>' + money(co) + '</strong>';
  });

  renderTotals();
  renderCalc();
  renderProgress();
  persist();
}

/* ---------- totals / calc / progress ---------- */

function renderTotals(th, tc) {
  document.getElementById('total-cost').textContent = money(num(tc != null ? tc : totalCost()));
  document.getElementById('total-hours').textContent = fmt(num(th != null ? th : totalHours()), 2) + ' чел.-ч';
}

function renderCalc() {
  const s = state.settings;
  const t = totalHours();
  const shift = num(s.shift) || 8;
  const d = num(s.deadline) || 0;
  const p = num(s.people) || 0;

  document.getElementById('result-people').textContent =
    t > 0 && d > 0 ? Math.ceil(t / (d * shift)) : '—';
  document.getElementById('result-deadline').textContent =
    t > 0 && p > 0 ? Math.ceil(t / (p * shift)) : '—';
}

function syncSettingsInputs() {
  document.getElementById('input-deadline').value = state.settings.deadline;
  document.getElementById('input-people').value = state.settings.people;
  document.getElementById('input-shift').value = state.settings.shift;
}

function renderProgress() {
  const map = hoursByCategory();
  const t = totalHours();
  const overall = document.getElementById('progress-overall-fill');
  const overallVal = document.getElementById('progress-overall-value');
  const list = document.getElementById('progress-list');

  if (t > 0) {
    overall.style.width = '100%';
    overallVal.textContent = '100%';
  } else {
    overall.style.width = '0%';
    overallVal.textContent = '0%';
  }

  list.innerHTML = '';
  Object.keys(map).forEach(cat => {
    const h = map[cat];
    const pct = t > 0 ? Math.round((h / t) * 1000) / 10 : 0;
    const div = document.createElement('div');
    div.className = 'progress-item';
    div.innerHTML =
      '<span class="p-name" title="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</span>' +
      '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="progress-value">' + fmt(h, 1) + ' ч · ' + pct + '%</span>';
    list.appendChild(div);
  });
}

/* ---------- estimate row actions ---------- */

function addRowToEstimate(workId) {
  state.rows.push({
    id: state.nextRowId++,
    workId: workId,
    volume: 1,
    manualNorm: '',
    manualPrice: '',
    coeffId: null,
    customCoeff: ''
  });
  persist();
  renderEstimate();
}

function removeRowFromEstimate(id) {
  state.rows = state.rows.filter(r => r.id != id);
  persist();
  renderEstimate();
}

function handleEstimateInput(e) {
  const tr = e.target.closest('tr[data-rid]');
  if (!tr) return;
  const rid = +tr.dataset.rid;
  const row = findRow(rid);
  if (!row) return;

  if (e.target.classList.contains('volume')) {
    row.volume = e.target.value;
  } else if (e.target.classList.contains('norm-input')) {
    row.manualNorm = e.target.value;
  } else if (e.target.classList.contains('price-input')) {
    row.manualPrice = e.target.value;
  } else if (e.target.classList.contains('custom-coeff')) {
    row.customCoeff = e.target.value;
  } else if (e.target.classList.contains('coeff-select')) {
    const v = e.target.value;
    row.customCoeff = '';
    row.coeffId = v === '@custom' ? null : v;
  } else if (e.target.classList.contains('row-del')) {
    removeRowFromEstimate(rid);
    return;
  }
  refreshEstimatesUI();
}

/* ---------- directory (справочник работ) ---------- */

let dirFilter = '';

function renderDirectory() {
  const tb = document.getElementById('directory-body');
  tb.innerHTML = '';
  const q = dirFilter.trim().toLowerCase();

  state.works.forEach(w => {
    const hay = (w.code + ' ' + w.name + ' ' + w.category).toLowerCase();
    if (q && hay.indexOf(q) === -1) return;

    const tr = document.createElement('tr');
    tr.dataset.wid = w.id;
    tr.innerHTML =
      '<td><input data-f="code" class="dir-field" value="' + escapeHtml(w.code) + '"></td>' +
      '<td><input data-f="name" class="dir-field" value="' + escapeHtml(w.name) + '"></td>' +
      '<td><input data-f="unit" class="dir-field" value="' + escapeHtml(w.unit) + '"></td>' +
      '<td><input data-f="norm" type="number" step="0.01" min="0" class="dir-field" value="' + num(w.norm) + '"></td>' +
      '<td><input data-f="basePrice" type="number" step="0.01" min="0" class="dir-field" value="' + num(w.basePrice) + '"></td>' +
      '<td><input list="category-list" data-f="category" class="dir-field" value="' + escapeHtml(w.category) + '"></td>' +
      '<td><button class="btn btn-danger dir-del">×</button></td>';
    tb.appendChild(tr);
  });

  ensureDatalist();
}

function handleDirectoryInput(e) {
  const tr = e.target.closest('tr[data-wid]');
  if (!tr) return;
  const w = state.works.find(x => x.id == tr.dataset.wid);
  if (!w) return;

  if (e.target.classList.contains('dir-del')) {
    if (!confirm('Удалить работу «' + w.name + '»? Она будет убрана и из сметы.')) return;
    state.works = state.works.filter(x => x.id != w.id);
    state.rows = state.rows.filter(r => r.workId != w.id);
    persist();
    renderDirectory();
    renderEstimate();
    return;
  }

  if (e.target.classList.contains('dir-field')) {
    w[e.target.dataset.f] = e.target.value;
    persist();
    refreshEstimatesUI();
  }
}

function ensureDatalist() {
  let dl = document.getElementById('category-list');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'category-list';
    document.body.appendChild(dl);
  }
  const existing = new Set(state.works.map(w => w.category).filter(Boolean));
  STORAGE_ORDER.forEach(c => existing.add(c));
  dl.innerHTML = Array.from(existing).map(c => '<option value="' + escapeHtml(c) + '"></option>').join('');
}

/* ---------- pick modal ---------- */

let pickCategory = 'all';
let pickSearch = '';

function renderPick() {
  const tb = document.getElementById('pick-body');
  tb.innerHTML = '';
  const q = pickSearch.trim().toLowerCase();

  state.works.forEach(w => {
    const hay = (w.code + ' ' + w.name).toLowerCase();
    if (q && hay.indexOf(q) === -1) return;
    if (pickCategory !== 'all' && w.category !== pickCategory) return;

    const tr = document.createElement('tr');
    tr.dataset.wid = w.id;
    tr.title = 'Клик — добавить в смету (категория: ' + escapeHtml(w.category) + ')';
    tr.innerHTML =
      '<td>' + escapeHtml(w.code) + '</td>' +
      '<td>' + escapeHtml(w.name) + '</td>' +
      '<td>' + escapeHtml(w.unit) + '</td>' +
      '<td class="num">' + fmt(w.norm, 2) + '</td>' +
      '<td class="num">' + fmt(w.basePrice, 2) + ' ₽</td>';
    tb.appendChild(tr);
  });
}

function renderPickCategories() {
  const sel = document.getElementById('pick-category');
  const list = new Set(state.works.map(w => w.category));
  sel.innerHTML = '<option value="all">Все категории</option>' +
    Array.from(list).map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
  sel.value = pickCategory;
}

/* ---------- coefficients ---------- */

function renderCoeffs() {
  const tb = document.getElementById('coeff-body');
  tb.innerHTML = '';
  state.coeffs.forEach(c => {
    const tr = document.createElement('tr');
    tr.dataset.cid = c.id;
    tr.innerHTML =
      '<td><input data-f="name" class="coeff-field" value="' + escapeHtml(c.name) + '"></td>' +
      '<td><input data-f="value" type="number" step="0.05" min="0" class="coeff-field" value="' + num(c.value) + '"></td>' +
      '<td><input data-f="group" class="coeff-field" value="' + escapeHtml(c.group || '') + '"></td>' +
      '<td><button class="btn btn-danger coeff-del">×</button></td>';
    tb.appendChild(tr);
  });
}

function handleCoeffInput(e) {
  const tr = e.target.closest('tr[data-cid]');
  if (!tr) return;
  const c = state.coeffs.find(x => x.id == tr.dataset.cid);
  if (!c) return;

  if (e.target.classList.contains('coeff-del')) {
    if (!confirm('Удалить коэффициент?')) return;
    state.coeffs = state.coeffs.filter(x => x.id != c.id);
    state.rows.forEach(r => {
      if (r.coeffId === c.id) r.coeffId = null;
    });
    persist();
    renderCoeffs();
    renderEstimate();
    return;
  }

  if (e.target.classList.contains('coeff-field')) {
    c[e.target.dataset.f] = e.target.value;
    persist();
    refreshEstimatesUI();
  }
}

/* ---------- export ---------- */

function buildExportMatrix() {
  const out = [];
  out.push(['МИНИ-ГРАНДСМЕТА', 'Локальная смета на 9-этажное здание']);
  out.push(['Дата', new Date().toLocaleDateString('ru-RU')]);
  out.push([]);
  out.push(['№', 'Шифр', 'Наименование работ', 'Ед. изм.', 'Объём', 'Норма (чел.-ч)', 'Коэфф.', 'Итого чел.-ч', 'Цена (₽)', 'Стоимость (₽)']);

  let idx = 0;
  categoryOrder().forEach(cat => {
    const catRows = state.rows.filter(r => {
      const w = findWork(r.workId);
      return w && w.category === cat;
    });
    if (!catRows.length) return;

    let h = 0, co = 0;
    catRows.forEach(r => {
      const c = computeRow(r);
      h += c.hours;
      co += c.cost;
      idx++;
      out.push([idx, c.code, c.name, c.unit, c.vol, c.norm, c.coeff, c.hours, c.price, c.cost]);
    });
    out.push(['', '', 'ИТОГО ПО РАЗДЕЛУ: ' + cat, '', '', '', '', h, '', co]);
  });
  out.push([]);
  out.push(['', '', 'ВСЕГО', '', '', '', '', totalHours(), '', totalCost()]);
  return out;
}

function exportCsv() {
  const rows = buildExportMatrix();
  const csv = '\uFEFF' + rows.map(r => r.map(c => {
    const s = String(c == null ? '' : c);
    return '"' + s.replace(/"/g, '""') + '"';
  }).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'smeta.csv');
}

function exportXlsx() {
  if (typeof XLSX === 'undefined') {
    alert('Библиотека для Excel не загрузилась. Проверьте интернет и перезагрузите страницу.');
    return;
  }
  const data = buildExportMatrix().map(r => r.slice());
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 4 }, { wch: 13 }, { wch: 46 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Смета');
  XLSX.writeFile(wb, 'smeta.xlsx');
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 100);
}

function saveProject() {
  const project = {
    app: 'mini-grandsmeta',
    version: 1,
    savedAt: new Date().toISOString(),
    works: state.works,
    coeffs: state.coeffs,
    rows: state.rows,
    settings: state.settings
  };
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'project-grandsmeta.json');
}

function loadProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(reader.result);
      if (p.app !== 'mini-grandsmeta') throw new Error('Не тот файл');
      if (Array.isArray(p.works)) state.works = p.works;
      if (Array.isArray(p.coeffs)) state.coeffs = p.coeffs;
      if (Array.isArray(p.rows)) state.rows = p.rows;
      if (p.settings) state.settings = Object.assign(state.settings, p.settings);
      syncSettingsInputs();
      persist();
      renderEstimate();
      renderDirectory();
      renderCoeffs();
      alert('Проект загружен.');
    } catch (e) {
      alert('Не удалось загрузить файл: ' + e.message);
    }
  };
  reader.readAsText(file);
}

/* ---------- print ---------- */

function printSheet() {
  const title = document.querySelector('.ass-print-head');
  if (!title) return;
  title.textContent = 'Локальная смета на 9-этажное здание — ' + new Date().toLocaleDateString('ru-RU');
  window.print();
}

/* ---------- events ---------- */

function bindEvents() {
  document.getElementById('btn-add-work').addEventListener('click', () => {
    pickCategory = 'all';
    pickSearch = '';
    renderPickCategories();
    renderPick();
    document.getElementById('pick-search').value = '';
    showModal('modal-pick');
  });

  document.getElementById('btn-open-directory').addEventListener('click', () => {
    dirFilter = '';
    document.getElementById('dir-search').value = '';
    renderDirectory();
    showModal('modal-directory');
  });

  document.getElementById('btn-add-coeff').addEventListener('click', () => {
    renderCoeffs();
    showModal('modal-coeff');
  });

  document.getElementById('btn-save-project').addEventListener('click', saveProject);

  document.getElementById('btn-export-xlsx').addEventListener('click', exportXlsx);
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-print').addEventListener('click', printSheet);

  document.getElementById('btn-load-project').addEventListener('click', () => {
    document.getElementById('file-load-project').click();
  });
  document.getElementById('file-load-project').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadProject(f);
    e.target.value = '';
  });

  document.getElementById('estimate-body').addEventListener('input', handleEstimateInput);
  document.getElementById('estimate-body').addEventListener('change', handleEstimateInput);
  document.getElementById('estimate-body').addEventListener('click', handleEstimateInput);

  document.getElementById('dir-search').addEventListener('input', (e) => {
    dirFilter = e.target.value;
    renderDirectory();
  });
  document.getElementById('directory-body').addEventListener('input', handleDirectoryInput);
  document.getElementById('directory-body').addEventListener('change', handleDirectoryInput);
  document.getElementById('directory-body').addEventListener('click', handleDirectoryInput);

  document.getElementById('btn-dir-add').addEventListener('click', () => {
    state.works.push({
      id: Date.now(),
      code: '00-00-000-00',
      name: 'Новая работа',
      unit: '100 шт',
      norm: 0,
      basePrice: 0,
      category: STORAGE_ORDER[0]
    });
    persist();
    renderDirectory();
  });

  document.getElementById('pick-search').addEventListener('input', (e) => {
    pickSearch = e.target.value;
    renderPick();
  });
  document.getElementById('pick-category').addEventListener('change', (e) => {
    pickCategory = e.target.value;
    renderPick();
  });
  document.getElementById('pick-body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-wid]');
    if (!tr) return;
    addRowToEstimate(+tr.dataset.wid);
    hideModal('modal-pick');
  });

  document.getElementById('coeff-body').addEventListener('input', handleCoeffInput);
  document.getElementById('coeff-body').addEventListener('change', handleCoeffInput);
  document.getElementById('coeff-body').addEventListener('click', handleCoeffInput);

  document.getElementById('btn-coeff-add').addEventListener('click', () => {
    state.coeffs.push({ id: uid(), name: 'Новый коэффициент', value: 1, group: 'Свои' });
    persist();
    renderCoeffs();
  });

  document.querySelectorAll('.modal-close, .btn-close').forEach(el => {
    el.addEventListener('click', () => {
      hideModal(el.dataset.close);
    });
  });
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('mousedown', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  const deadline = document.getElementById('input-deadline');
  const people = document.getElementById('input-people');
  const shift = document.getElementById('input-shift');
  const saveSettings = () => {
    state.settings.deadline = deadline.value;
    state.settings.people = people.value;
    state.settings.shift = shift.value;
    persist();
    renderCalc();
  };
  deadline.addEventListener('input', saveSettings);
  people.addEventListener('input', saveSettings);
  shift.addEventListener('input', saveSettings);

  const printHead = document.createElement('div');
  printHead.className = 'ass-print-head';
  printHead.textContent = 'Локальная смета на 9-этажное здание';
  const tableCard = document.querySelector('.table-card');
  tableCard.insertBefore(printHead, tableCard.firstChild);
}

/* ---------- boot ---------- */

(async function boot() {
  await initData();
  bindEvents();
  renderEstimate();
})();