'use strict';

/* ============================================================
   Мини-ГрандСмета — типовая КНС
   Состояние, сохранение, интерфейс и экспорт.
   Расчёты вынесены в calc.js (window.MGS).
   ============================================================ */

const LS = {
  works: 'mgs_v3_works',
  rates: 'mgs_v3_rates',
  coeffs: 'mgs_v3_coeffs',
  meta: 'mgs_v3_meta',
  rows: 'mgs_v3_rows',
  settings: 'mgs_v3_settings',
  nextId: 'mgs_v3_nextid'
};

const EMB = window.MGS_DATA || { works: [], rates: {}, coefficients: [], meta: {} };
const MGS = window.MGS;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function num(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function fmt(n, digits) {
  const d = digits == null ? 2 : digits;
  return num(n).toLocaleString('ru-RU', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function money(n, digits) {
  return fmt(n, digits == null ? 0 : digits) + ' ₽';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function lsHas(key) {
  try {
    return localStorage.getItem(key) != null;
  } catch (e) {
    return false;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Не удалось сохранить', key, e);
  }
}

function prettyUnit(unit) {
  return String(unit == null ? '' : unit)
    .replace(/м\s*2/g, 'м²')
    .replace(/м\s*3/g, 'м³')
    .replace(/\s+/g, ' ')
    .trim();
}

function defaultSettings() {
  return { mode: 'people', people: 8, shift: 8, deadline: 30 };
}

/* ---------- стартовый набор работ типовой КНС ---------- */

const SEED = [
  ['01-01-036-01', 200],
  ['01-01-018-02', 250],
  ['01-01-030-01', 60],
  ['01-01-033-01', 120],
  ['01-02-001-02', 120],
  ['06-01-001-01', 8],
  ['06-01-001-02', 24],
  ['06-19-002-01', 60],
  ['06-19-004-01', 30],
  ['07-05-001-03', 20],
  ['08-01-003-02', 120],
  ['08-02-002-03', 60],
  ['11-01-011-01', 36],
  ['11-01-027-03', 20],
  ['12-01-002-01', 40],
  ['15-02-016-01', 180],
  ['15-04-007-01', 180],
  ['16-02-002-06', 80],
  ['16-04-002-05', 60],
  ['16-05-001-05', 4],
  ['16-07-005-02', 140],
  ['23-01-001-01', 6],
  ['23-01-007-02', 100],
  ['23-03-001-03', 6],
  ['23-04-011-01', 2]
];

function buildSeedRows() {
  let id = 1;
  return SEED.map(function (pair) {
    return {
      id: id++,
      workId: pair[0],
      volume: pair[1],
      coeffId: '',
      customCoeff: '',
      manualNorm: '',
      manualMachineNorm: ''
    };
  });
}

/* ---------- состояние ---------- */

const state = {
  works: lsHas(LS.works) ? lsGet(LS.works, []) : clone(EMB.works || []),
  rates: lsHas(LS.rates) ? lsGet(LS.rates, {}) : clone(EMB.rates || {}),
  coeffs: lsHas(LS.coeffs) ? lsGet(LS.coeffs, []) : clone(EMB.coefficients || []),
  meta: lsHas(LS.meta) ? lsGet(LS.meta, {}) : clone(EMB.meta || {}),
  rows: lsHas(LS.rows) ? lsGet(LS.rows, []) : buildSeedRows(),
  settings: lsHas(LS.settings) ? lsGet(LS.settings, defaultSettings()) : defaultSettings()
};

state.settings = Object.assign(defaultSettings(), state.settings || {});
state.rates = state.rates || {};
state.rates.indices = Object.assign({ labor: 1, machines: 1, materials: 1 }, state.rates.indices || {});

let rowSeq = lsGet(LS.nextId, null);
if (!rowSeq) {
  rowSeq = state.rows.reduce(function (max, r) { return Math.max(max, num(r.id)); }, 0) + 1;
}

let resourceSnapshot = null;
let rowEditId = null;

function persist() {
  lsSet(LS.works, state.works);
  lsSet(LS.rates, state.rates);
  lsSet(LS.coeffs, state.coeffs);
  lsSet(LS.meta, state.meta);
  lsSet(LS.rows, state.rows);
  lsSet(LS.settings, state.settings);
  lsSet(LS.nextId, rowSeq);
}

/* ---------- DOM ---------- */

function el(id) {
  return document.getElementById(id);
}

function showToast(text) {
  const box = el('toast');
  if (!box) return;
  box.textContent = text;
  box.classList.add('toast-visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () {
    box.classList.remove('toast-visible');
  }, 2600);
}

/* ---------- модальные окна ---------- */

function openModal(id) {
  const modal = el(id);
  if (!modal) return;
  modal.classList.add('modal-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-lock');
}

function closeModal(id) {
  const modal = el(id);
  if (!modal) return;
  modal.classList.remove('modal-open');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal.modal-open')) {
    document.body.classList.remove('modal-lock');
  }
  if (id === 'modal-resources' && resourceSnapshot) {
    restoreResourceSnapshot();
  }
}

function restoreResourceSnapshot() {
  if (!resourceSnapshot) return;
  state.rates = resourceSnapshot.rates;
  state.works = resourceSnapshot.works;
  state.coeffs = resourceSnapshot.coeffs;
  resourceSnapshot = null;
  renderAll();
}

document.addEventListener('click', function (e) {
  const closer = e.target.closest('[data-close]');
  if (closer) {
    closeModal(closer.getAttribute('data-close'));
    return;
  }
  const backdrop = e.target.closest('.modal-backdrop');
  if (backdrop && backdrop.parentElement) {
    closeModal(backdrop.parentElement.id);
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const open = document.querySelector('.modal.modal-open');
    if (open) closeModal(open.id);
  }
});

/* ============================================================
   РАСЧЁТ И РЕНДЕР
   ============================================================ */

function currentTotals() {
  return MGS.computeTotals(state.works, state.rows, state.rates, state.coeffs);
}

function renderAll() {
  const totals = currentTotals();
  renderMeta();
  renderSummary(totals);
  renderRoles(totals);
  renderSchedule(totals);
  renderEstimate(totals);
  renderBreakdown(totals);
}

function renderMeta() {
  const node = el('meta-updated');
  if (!node) return;
  const date = state.meta && state.meta.updatedAt ? state.meta.updatedAt : '—';
  node.textContent = 'данные от ' + formatDate(date);
}

function formatDate(value) {
  if (!value) return '—';
  const parts = String(value).split('-');
  if (parts.length === 3) return parts[2] + '.' + parts[1] + '.' + parts[0];
  return value;
}

function renderSummary(totals) {
  const shift = num(state.settings.shift) || 8;
  const shifts = shift > 0 ? totals.laborHours / shift : 0;

  el('sum-cost').textContent = money(totals.cost);
  el('sum-cost-hint').textContent =
    'Прямые ' + money(totals.direct) + ' · НР ' + money(totals.nr) + ' · СП ' + money(totals.sp);

  el('sum-payroll').textContent = money(totals.payroll);
  el('sum-labor').textContent = fmt(totals.laborHours, 1) + ' чел.-ч';
  el('sum-labor-hint').textContent = fmt(shifts, 1) + ' смен по ' + fmt(shift, 1) + ' ч';

  el('sum-machine').textContent = fmt(totals.machineHours, 1) + ' маш.-ч';
  el('sum-machine-hint').textContent =
    'к оплате ' + fmt(totals.billedMachineHours, 1) + ' маш.-ч · аренда ' + money(totals.rental);
}

function renderRoles(totals) {
  const r = state.rates;
  el('role-worker').textContent = money(totals.workerPay);
  el('role-worker-detail').textContent =
    fmt(totals.laborHours, 1) + ' чел.-ч × ' + fmt(r.workerRate, 0) + ' ₽';

  el('role-machinist').textContent = money(totals.machinistPayroll);
  el('role-machinist-detail').textContent =
    fmt(totals.machineHours, 1) + ' маш.-ч × ' + fmt(r.machinistRate, 0) + ' ₽';

  el('role-foreman').textContent = money(totals.foremanPay);
  el('role-foreman-detail').textContent =
    fmt(r.foremanPercent, 1) + ' % от ФОТ рабочих и машинистов';

  el('role-insurance').textContent = money(totals.insurance);
  el('role-insurance-detail').textContent =
    fmt(r.insurancePercent, 1) + ' % от ФОТ';

  el('role-total').textContent = money(totals.payroll + totals.insurance);
}

function renderSchedule(totals) {
  const s = state.settings;
  const shift = num(s.shift) || 8;
  const hours = totals.laborHours;
  const isPeople = s.mode !== 'deadline';

  const peopleInput = el('sched-people');
  const deadlineInput = el('sched-deadline');
  const peopleField = el('field-people');
  const deadlineField = el('field-deadline');

  peopleInput.disabled = !isPeople;
  deadlineInput.disabled = isPeople;
  peopleField.classList.toggle('field-disabled', !isPeople);
  deadlineField.classList.toggle('field-disabled', isPeople);

  peopleInput.value = s.people;
  deadlineInput.value = s.deadline;
  el('sched-shift').value = shift;

  let days = 0;
  let required = 0;
  if (hours > 0) {
    if (isPeople) {
      const people = Math.max(1, Math.round(num(s.people)));
      days = Math.ceil(hours / (people * shift));
      required = people;
    } else {
      const deadline = Math.max(1, Math.round(num(s.deadline)));
      days = deadline;
      required = Math.ceil(hours / (deadline * shift));
    }
  }

  el('sched-result-label').textContent = isPeople ? 'Срок выполнения' : 'Заданный срок';
  el('sched-days').textContent = hours > 0 ? days + ' раб. дн.' : '—';
  el('sched-required').textContent = hours > 0 ? required + ' чел.' : '—';
  el('sched-calendar').textContent = hours > 0 ? Math.ceil(days * 1.4) + ' календ. дн.' : '—';

  const radios = document.querySelectorAll('input[name="sched-mode"]');
  radios.forEach(function (radio) {
    radio.checked = radio.value === s.mode;
  });

  if (hours <= 0) {
    el('sched-note').textContent = 'Добавьте работы с объёмами — трудозатраты появятся автоматически.';
  } else if (isPeople) {
    el('sched-note').textContent =
      'Срок = ' + fmt(hours, 1) + ' чел.-ч ÷ (' + required + ' чел. × ' + fmt(shift, 1) +
      ' ч) = ' + days + ' раб. дн. Календарный срок учитывает выходные (× 1,4).';
  } else {
    el('sched-note').textContent =
      'Численность = ' + fmt(hours, 1) + ' чел.-ч ÷ (' + days + ' дн. × ' + fmt(shift, 1) +
      ' ч) = ' + required + ' чел. Календарный срок учитывает выходные (× 1,4).';
  }
}

function coeffOptions(row) {
  let html = '<option value="">1,00</option>';
  state.coeffs.forEach(function (c) {
    html += '<option value="' + esc(c.id) + '"' + (String(row.coeffId) === String(c.id) ? ' selected' : '') + '>' +
      esc(c.name) + ' (' + fmt(c.value, 2) + ')</option>';
  });
  if (row.customCoeff !== '' && row.customCoeff != null) {
    html += '<option value="__custom" selected>свой: ' + fmt(row.customCoeff, 2) + '</option>';
  }
  return html;
}

function renderEstimate(totals) {
  const body = el('estimate-body');
  const empty = el('estimate-empty');
  const totalsBox = el('estimate-totals');
  const table = el('estimate-table');
  if (!body) return;

  if (!totals.rows.length) {
    body.innerHTML = '';
    table.hidden = true;
    empty.hidden = false;
    totalsBox.hidden = true;
    return;
  }

  table.hidden = false;
  empty.hidden = true;
  totalsBox.hidden = false;

  const groups = {};
  totals.rows.forEach(function (item) {
    const cat = item.work.category || 'Без раздела';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  const cats = MGS.orderedCategories(groups);
  let html = '';
  let n = 0;

  cats.forEach(function (cat) {
    const items = groups[cat];
    const catCost = items.reduce(function (sum, item) { return sum + item.calc.total; }, 0);
    const catPayroll = items.reduce(function (sum, item) { return sum + item.calc.payroll; }, 0);
    html += '<tr class="cat-row"><td colspan="10">' + esc(cat) + '</td>' +
      '<td class="col-cost">' + money(catCost) + '</td>' +
      '<td class="col-cost">' + money(catPayroll) + '</td><td></td></tr>';

    items.forEach(function (item) {
      n += 1;
      const row = item.row;
      const work = item.work;
      const calc = item.calc;
      const normMark = MGS.manual(row.manualNorm) ? ' <span class="manual-mark" title="Введено вручную">ручн.</span>' : '';
      const machineNote = calc.machineName
        ? '<span class="row-machine">Техника: ' + esc(calc.machineName) + '</span>'
        : '';
      const editionNote = work.edition
        ? '<span class="row-edition">' + esc(work.edition) + '</span>'
        : '';

      html += '<tr data-row-id="' + esc(row.id) + '">' +
        '<td class="col-num">' + n + '</td>' +
        '<td class="col-code">' + esc(work.code) + '</td>' +
        '<td class="col-name"><span class="work-name">' + esc(work.name) + '</span>' +
          machineNote + editionNote + '</td>' +
        '<td class="col-unit">' + esc(prettyUnit(work.unit)) + '</td>' +
        '<td class="col-vol"><input class="cell-input" type="number" min="0" step="any" ' +
          'data-field="volume" value="' + esc(row.volume == null ? 0 : row.volume) + '" ' +
          'aria-label="Объём"></td>' +
        '<td class="col-norm">' + fmt(calc.norm, 2) + normMark + '</td>' +
        '<td class="col-coeff"><select class="cell-select" data-field="coeffId" aria-label="Коэффициент">' +
          coeffOptions(row) + '</select></td>' +
        '<td class="col-hours">' + fmt(calc.laborHours, 1) + '</td>' +
        '<td class="col-mhours">' + fmt(calc.machineHours, 2) + '</td>' +
        '<td class="col-mhours">' + (calc.machine ? fmt(calc.billedMachineHours, 1) : '—') + '</td>' +
        '<td class="col-cost">' + money(calc.total, 2) + '</td>' +
        '<td class="col-cost">' + money(calc.payroll, 2) + '</td>' +
        '<td class="col-actions">' +
          '<button class="icon-btn row-edit" title="Изменить строку" aria-label="Изменить строку">✎</button>' +
          '<button class="icon-btn icon-btn-danger row-del" title="Удалить строку" aria-label="Удалить строку">✕</button>' +
        '</td>' +
      '</tr>';
    });
  });

  body.innerHTML = html;

  el('tot-direct').textContent = money(totals.direct, 2);
  el('tot-nr').textContent = money(totals.nr, 2);
  el('tot-sp').textContent = money(totals.sp, 2);
  el('tot-rental').textContent = money(totals.rental, 2);
  el('tot-cost').textContent = money(totals.cost, 2);
}

function renderBreakdown(totals) {
  const body = el('breakdown-body');
  if (!body) return;
  const cats = MGS.orderedCategories(totals.byCategory || {});
  if (!cats.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted-cell">Пока нет данных — добавьте работы в смету.</td></tr>';
    return;
  }
  let html = '';
  cats.forEach(function (cat) {
    const g = totals.byCategory[cat];
    html += '<tr>' +
      '<td class="breakdown-name">' + esc(cat) + '</td>' +
      '<td>' + g.count + '</td>' +
      '<td class="col-cost">' + money(g.cost, 2) + '</td>' +
      '<td class="col-cost">' + money(g.payroll, 2) + '</td>' +
      '<td>' + fmt(g.laborHours, 1) + '</td>' +
      '<td>' + fmt(g.machineHours, 1) + '</td>' +
      '<td class="col-cost">' + money(g.rental, 2) + '</td>' +
    '</tr>';
  });
  body.innerHTML = html;
}

/* ============================================================
   СТРОКИ СМЕТЫ
   ============================================================ */

function findRow(id) {
  return state.rows.find(function (r) { return String(r.id) === String(id); }) || null;
}

function addWorkRow(workId, volume) {
  const work = MGS.findWork(state.works, workId);
  if (!work) return;
  const row = {
    id: rowSeq++,
    workId: work.id,
    volume: num(volume),
    coeffId: '',
    customCoeff: '',
    manualNorm: '',
    manualMachineNorm: ''
  };
  state.rows.push(row);
  persist();
  renderAll();
  showToast('Добавлено: ' + work.code + ' — ' + work.name);
  return row;
}

function bindEstimateEvents() {
  const body = el('estimate-body');
  if (!body) return;

  body.addEventListener('change', function (e) {
    const target = e.target;
    const tr = target.closest('tr[data-row-id]');
    if (!tr) return;
    const row = findRow(tr.getAttribute('data-row-id'));
    if (!row) return;
    const field = target.getAttribute('data-field');

    if (field === 'volume') {
      row.volume = num(target.value);
    } else if (field === 'coeffId') {
      const value = target.value;
      if (value === '__custom') return;
      row.coeffId = value;
      row.customCoeff = '';
    } else {
      return;
    }
    persist();
    renderAll();
  });

  body.addEventListener('click', function (e) {
    const edit = e.target.closest('.row-edit');
    const del = e.target.closest('.row-del');
    const tr = e.target.closest('tr[data-row-id]');
    if (!tr) return;
    const id = tr.getAttribute('data-row-id');

    if (edit) {
      openRowModal(id);
    } else if (del) {
      const row = findRow(id);
      if (!row) return;
      if (!confirm('Удалить строку из сметы?')) return;
      state.rows = state.rows.filter(function (r) { return String(r.id) !== String(id); });
      persist();
      renderAll();
      showToast('Строка удалена');
    }
  });
}

/* ---------- карточка строки ---------- */

function openRowModal(id) {
  const row = findRow(id);
  if (!row) return;
  const work = MGS.findWork(state.works, row.workId);
  if (!work) return;
  rowEditId = row.id;

  el('row-work-name').textContent = work.code + ' — ' + work.name;
  el('row-unit').textContent = prettyUnit(work.unit);
  el('row-volume').value = row.volume == null ? 0 : row.volume;
  el('row-norm').value = row.manualNorm == null ? '' : row.manualNorm;
  el('row-mnorm').value = row.manualMachineNorm == null ? '' : row.manualMachineNorm;
  el('row-custom-coeff').value = row.customCoeff == null ? '' : row.customCoeff;
  el('row-coeff').innerHTML = coeffOptions(row);
  updateRowPreview();
  openModal('modal-row');
  el('row-volume').focus();
}

function tempRowFromModal() {
  return {
    volume: num(el('row-volume').value),
    coeffId: el('row-coeff').value === '__custom' ? '' : el('row-coeff').value,
    customCoeff: num(el('row-custom-coeff').value) > 0 ? el('row-custom-coeff').value : '',
    manualNorm: el('row-norm').value,
    manualMachineNorm: el('row-mnorm').value
  };
}

function updateRowPreview() {
  const row = findRow(rowEditId);
  if (!row) return;
  const work = MGS.findWork(state.works, row.workId);
  if (!work) return;
  const calc = MGS.computeRow(work, tempRowFromModal(), state.rates, state.coeffs, state.rates.machines || []);
  el('row-preview').innerHTML =
    '<div><span>Чел.-ч</span><strong>' + fmt(calc.laborHours, 2) + '</strong></div>' +
    '<div><span>Маш.-ч</span><strong>' + fmt(calc.machineHours, 2) + '</strong></div>' +
    '<div><span>Стоимость ФЕР</span><strong>' + money(calc.total, 2) + '</strong></div>' +
    '<div><span>ФОТ</span><strong>' + money(calc.payroll, 2) + '</strong></div>';
}

function bindRowModal() {
  ['row-volume', 'row-norm', 'row-mnorm', 'row-custom-coeff', 'row-coeff'].forEach(function (id) {
    const node = el(id);
    if (!node) return;
    node.addEventListener('input', updateRowPreview);
    node.addEventListener('change', updateRowPreview);
  });

  el('btn-row-save').addEventListener('click', function () {
    const row = findRow(rowEditId);
    if (!row) return;
    const data = tempRowFromModal();
    row.volume = data.volume;
    row.coeffId = data.coeffId;
    row.customCoeff = data.customCoeff;
    row.manualNorm = data.manualNorm;
    row.manualMachineNorm = data.manualMachineNorm;
    persist();
    closeModal('modal-row');
    renderAll();
    showToast('Строка обновлена');
  });

  el('btn-row-delete').addEventListener('click', function () {
    const row = findRow(rowEditId);
    if (!row) return;
    if (!confirm('Удалить строку из сметы?')) return;
    state.rows = state.rows.filter(function (r) { return String(r.id) !== String(row.id); });
    persist();
    closeModal('modal-row');
    renderAll();
    showToast('Строка удалена');
  });
}

/* ============================================================
   ДОБАВЛЕНИЕ РАБОТ / СПРАВОЧНИК
   ============================================================ */

function fillCategorySelect(select) {
  if (!select) return;
  const cats = MGS.orderedCategories(categoryCounts());
  let html = '<option value="">Все сборники</option>';
  cats.forEach(function (cat) {
    html += '<option value="' + esc(cat) + '">' + esc(cat) + '</option>';
  });
  select.innerHTML = html;
}

function categoryCounts() {
  const map = {};
  state.works.forEach(function (w) {
    const cat = w.category || 'Без раздела';
    map[cat] = (map[cat] || 0) + 1;
  });
  return map;
}

function filterWorks(query, category) {
  const q = String(query || '').toLowerCase().trim();
  return state.works.filter(function (w) {
    if (category && (w.category || 'Без раздела') !== category) return false;
    if (!q) return true;
    return (w.code + ' ' + w.name + ' ' + w.category).toLowerCase().indexOf(q) !== -1;
  });
}

function renderAddList() {
  const body = el('add-body');
  if (!body) return;
  const list = filterWorks(el('add-search').value, el('add-category').value);
  if (!list.length) {
    body.innerHTML = '';
    el('add-empty').hidden = false;
    return;
  }
  el('add-empty').hidden = true;
  body.innerHTML = list.map(function (w) {
    return '<tr>' +
      '<td class="col-code">' + esc(w.code) + '</td>' +
      '<td class="col-name">' + esc(w.name) +
        '<span class="row-edition">' + esc(w.category) + '</span></td>' +
      '<td class="col-unit">' + esc(prettyUnit(w.unit)) + '</td>' +
      '<td>' + fmt(w.norm, 2) + '</td>' +
      '<td class="col-cost">' + money(w.basePrice, 2) + '</td>' +
      '<td><button class="btn btn-small add-work" data-work-id="' + esc(w.id) + '">+ В смету</button></td>' +
    '</tr>';
  }).join('');
}

function renderDirectory() {
  const body = el('dir-body');
  if (!body) return;
  const list = filterWorks(el('dir-search').value, el('dir-category').value);
  el('dir-count').textContent = list.length + ' работ';
  if (!list.length) {
    body.innerHTML = '';
    el('dir-empty').hidden = false;
    return;
  }
  el('dir-empty').hidden = true;
  body.innerHTML = list.map(function (w) {
    return '<tr>' +
      '<td class="col-code">' + esc(w.code) + '</td>' +
      '<td class="col-name">' + esc(w.name) +
        '<span class="row-edition">' + esc(w.category) + ' · ' + esc(w.edition || '') + '</span></td>' +
      '<td class="col-unit">' + esc(prettyUnit(w.unit)) + '</td>' +
      '<td>' + fmt(w.norm, 2) + '</td>' +
      '<td class="col-cost">' + money(w.basePrice, 2) + '</td>' +
      '<td class="col-cost">' + money(w.laborPay, 2) + '</td>' +
      '<td><button class="btn btn-small dir-add" data-work-id="' + esc(w.id) + '">+ В смету</button></td>' +
    '</tr>';
  }).join('');
}

function bindAddModal() {
  el('btn-add-work').addEventListener('click', function () {
    fillCategorySelect(el('add-category'));
    el('add-search').value = '';
    el('add-category').value = '';
    el('add-volume').value = '';
    renderAddList();
    openModal('modal-add');
    el('add-search').focus();
  });
  el('btn-empty-add').addEventListener('click', function () {
    el('btn-add-work').click();
  });
  el('add-search').addEventListener('input', renderAddList);
  el('add-category').addEventListener('change', renderAddList);

  el('add-body').addEventListener('click', function (e) {
    const btn = e.target.closest('.add-work');
    if (!btn) return;
    const volume = num(el('add-volume').value);
    addWorkRow(btn.getAttribute('data-work-id'), volume);
    closeModal('modal-add');
  });
}

function bindDirectory() {
  el('btn-directory').addEventListener('click', function () {
    fillCategorySelect(el('dir-category'));
    el('dir-search').value = '';
    el('dir-category').value = '';
    el('dir-volume').value = '';
    renderDirectory();
    openModal('modal-directory');
    el('dir-search').focus();
  });
  el('dir-search').addEventListener('input', renderDirectory);
  el('dir-category').addEventListener('change', renderDirectory);

  el('dir-body').addEventListener('click', function (e) {
    const btn = e.target.closest('.dir-add');
    if (!btn) return;
    addWorkRow(btn.getAttribute('data-work-id'), num(el('dir-volume').value));
    closeModal('modal-directory');
  });
}

/* ============================================================
   ЦЕНЫ И РЕСУРСЫ
   ============================================================ */

function fillRatesForm() {
  const r = state.rates;
  const idx = r.indices || {};
  el('rate-worker').value = r.workerRate;
  el('rate-machinist').value = r.machinistRate;
  el('rate-foreman').value = r.foremanPercent;
  el('rate-insurance').value = r.insurancePercent;
  el('rate-base-machinist').value = r.baseMachinistRate;
  el('rate-min-hours').value = r.minMachineHours;
  el('rate-shift').value = r.shiftHours;
  el('rate-nr').value = r.nrPercent;
  el('rate-sp').value = r.spPercent;
  el('idx-labor').value = idx.labor;
  el('idx-machines').value = idx.machines;
  el('idx-materials').value = idx.materials;
  el('rate-use-rental').checked = !!r.useRentalInTotal;
}

function readRatesForm() {
  const r = state.rates;
  r.workerRate = num(el('rate-worker').value);
  r.machinistRate = num(el('rate-machinist').value);
  r.foremanPercent = num(el('rate-foreman').value);
  r.insurancePercent = num(el('rate-insurance').value);
  r.baseMachinistRate = Math.max(0.1, num(el('rate-base-machinist').value));
  r.minMachineHours = num(el('rate-min-hours').value);
  r.shiftHours = Math.max(1, num(el('rate-shift').value));
  r.nrPercent = num(el('rate-nr').value);
  r.spPercent = num(el('rate-sp').value);
  r.indices = {
    labor: num(el('idx-labor').value) || 1,
    machines: num(el('idx-machines').value) || 1,
    materials: num(el('idx-materials').value) || 1
  };
  r.useRentalInTotal = el('rate-use-rental').checked;
  state.settings.shift = r.shiftHours;
  el('sched-shift').value = r.shiftHours;
}

function renderPrices() {
  const body = el('prices-body');
  if (!body) return;
  const list = filterWorks(el('prices-search').value, el('prices-category').value);
  body.innerHTML = list.map(function (w) {
    return '<tr data-work-id="' + esc(w.id) + '">' +
      '<td class="col-code">' + esc(w.code) + '</td>' +
      '<td class="col-name">' + esc(w.name) + '</td>' +
      '<td class="col-unit">' + esc(prettyUnit(w.unit)) + '</td>' +
      priceInput(w, 'basePrice', 2) +
      priceInput(w, 'laborPay', 2) +
      priceInput(w, 'machinePay', 2) +
      priceInput(w, 'machinistPay', 2) +
      priceInput(w, 'materialPay', 2) +
      priceInput(w, 'norm', 3) +
    '</tr>';
  }).join('');
}

function priceInput(work, field, step) {
  return '<td><input class="cell-input price-input" type="number" min="0" step="' + step + '" ' +
    'data-work-id="' + esc(work.id) + '" data-work-field="' + field + '" ' +
    'value="' + esc(work[field] == null ? 0 : work[field]) + '"></td>';
}

function renderMachines() {
  const body = el('machines-body');
  if (!body) return;
  const machines = state.rates.machines || [];
  if (!machines.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted-cell">Техника не добавлена.</td></tr>';
    return;
  }
  body.innerHTML = machines.map(function (m) {
    return '<tr data-machine-id="' + esc(m.id) + '">' +
      '<td><input class="cell-input text-input" data-machine-field="name" value="' + esc(m.name) + '"></td>' +
      '<td><input class="cell-input" type="number" min="0" step="1" data-machine-field="rate" value="' + esc(m.rate) + '"></td>' +
      '<td><input class="cell-input" type="number" min="0" step="1" data-machine-field="operatorRate" value="' + esc(m.operatorRate) + '"></td>' +
      '<td><input class="cell-input text-input" data-machine-field="note" value="' + esc(m.note || '') + '"></td>' +
      '<td><button class="icon-btn icon-btn-danger machine-del" data-machine-id="' + esc(m.id) + '" title="Удалить">✕</button></td>' +
    '</tr>';
  }).join('');
}

function renderCoeffs() {
  const body = el('coeffs-body');
  if (!body) return;
  if (!state.coeffs.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted-cell">Коэффициенты не добавлены.</td></tr>';
    return;
  }
  body.innerHTML = state.coeffs.map(function (c) {
    return '<tr data-coeff-id="' + esc(c.id) + '">' +
      '<td><input class="cell-input text-input" data-coeff-field="name" value="' + esc(c.name) + '"></td>' +
      '<td><input class="cell-input text-input" data-coeff-field="group" value="' + esc(c.group || '') + '"></td>' +
      '<td><input class="cell-input" type="number" min="0" step="0.01" data-coeff-field="value" value="' + esc(c.value) + '"></td>' +
      '<td><button class="icon-btn icon-btn-danger coeff-del" data-coeff-id="' + esc(c.id) + '" title="Удалить">✕</button></td>' +
    '</tr>';
  }).join('');
}

function bindResources() {
  el('btn-resources').addEventListener('click', function () {
    resourceSnapshot = {
      rates: clone(state.rates),
      works: clone(state.works),
      coeffs: clone(state.coeffs)
    };
    fillRatesForm();
    fillCategorySelect(el('prices-category'));
    el('prices-search').value = '';
    el('prices-category').value = '';
    renderPrices();
    renderMachines();
    renderCoeffs();
    switchTab('rates');
    openModal('modal-resources');
  });

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  el('prices-search').addEventListener('input', renderPrices);
  el('prices-category').addEventListener('change', renderPrices);

  el('prices-body').addEventListener('change', function (e) {
    const input = e.target.closest('[data-work-field]');
    if (!input) return;
    const work = MGS.findWork(state.works, input.getAttribute('data-work-id'));
    if (!work) return;
    const field = input.getAttribute('data-work-field');
    work[field] = num(input.value);
    if (field === 'basePrice') {
      // Прямые затраты в ФЕР = оплата труда + машины + материалы.
      // При ручной правке цены не пересчитываем остальные графы автоматически.
    }
  });

  el('machines-body').addEventListener('change', function (e) {
    const input = e.target.closest('[data-machine-field]');
    if (!input) return;
    const tr = input.closest('[data-machine-id]');
    if (!tr) return;
    const machine = (state.rates.machines || []).find(function (m) {
      return String(m.id) === tr.getAttribute('data-machine-id');
    });
    if (!machine) return;
    const field = input.getAttribute('data-machine-field');
    machine[field] = field === 'name' || field === 'note' ? input.value : num(input.value);
  });

  el('machines-body').addEventListener('click', function (e) {
    const btn = e.target.closest('.machine-del');
    if (!btn) return;
    const id = btn.getAttribute('data-machine-id');
    state.rates.machines = (state.rates.machines || []).filter(function (m) {
      return String(m.id) !== String(id);
    });
    renderMachines();
  });

  el('btn-add-machine').addEventListener('click', function () {
    if (!state.rates.machines) state.rates.machines = [];
    state.rates.machines.push({
      id: 'm' + Date.now(),
      name: 'Новая техника',
      rate: 0,
      operatorRate: 0,
      note: ''
    });
    renderMachines();
  });

  el('coeffs-body').addEventListener('change', function (e) {
    const input = e.target.closest('[data-coeff-field]');
    if (!input) return;
    const tr = input.closest('[data-coeff-id]');
    if (!tr) return;
    const coeff = state.coeffs.find(function (c) {
      return String(c.id) === tr.getAttribute('data-coeff-id');
    });
    if (!coeff) return;
    const field = input.getAttribute('data-coeff-field');
    coeff[field] = field === 'value' ? num(input.value) : input.value;
  });

  el('coeffs-body').addEventListener('click', function (e) {
    const btn = e.target.closest('.coeff-del');
    if (!btn) return;
    const id = btn.getAttribute('data-coeff-id');
    state.coeffs = state.coeffs.filter(function (c) { return String(c.id) !== String(id); });
    renderCoeffs();
  });

  el('btn-add-coeff').addEventListener('click', function () {
    state.coeffs.push({
      id: 'c' + Date.now(),
      name: 'Новый коэффициент',
      group: 'Прочее',
      value: 1
    });
    renderCoeffs();
  });

  el('btn-reset-resources').addEventListener('click', function () {
    if (!confirm('Сбросить ставки, расценки, технику и коэффициенты к исходным? Строки сметы сохранятся.')) return;
    state.rates = clone(EMB.rates || {});
    state.works = clone(EMB.works || []);
    state.coeffs = clone(EMB.coefficients || []);
    state.settings.shift = num(state.rates.shiftHours) || state.settings.shift || 8;
    fillRatesForm();
    renderPrices();
    renderMachines();
    renderCoeffs();
    showToast('Ресурсы сброшены (не забудьте сохранить)');
  });

  el('btn-save-resources').addEventListener('click', function () {
    readRatesForm();
    resourceSnapshot = null;
    persist();
    closeModal('modal-resources');
    renderAll();
    showToast('Цены и ресурсы сохранены');
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === name);
  });
  document.querySelectorAll('.tab-panel').forEach(function (panel) {
    panel.classList.toggle('active', panel.getAttribute('data-panel') === name);
  });
}

/* ============================================================
   ОБНОВЛЕНИЕ ДАННЫХ
   ============================================================ */

function renderDataModal() {
  el('data-updated').textContent = formatDate(state.meta.updatedAt);
  el('data-works-count').textContent = state.works.length;
  const sources = state.meta.sources || [];
  el('data-sources-count').textContent = sources.length;
  el('data-sources').innerHTML = sources.map(function (s) {
    return '<li>' +
      '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.collection) + ' ↗</a>' +
      '<span class="source-edition">' + esc(s.edition || '') + '</span>' +
    '</li>';
  }).join('');
}

function bindDataModal() {
  el('btn-refresh').addEventListener('click', function () {
    renderDataModal();
    el('data-message').textContent = '';
    openModal('modal-data');
  });

  el('btn-fetch-data').addEventListener('click', fetchDataFiles);

  el('btn-import-data').addEventListener('click', function () {
    el('import-file').click();
  });

  el('import-file').addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        applyImportedData(data);
        el('data-message').textContent = 'Импорт выполнен.';
        renderDataModal();
        showToast('Данные импортированы');
      } catch (err) {
        el('data-message').textContent = 'Ошибка чтения JSON: ' + err.message;
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });
}

async function fetchDataFiles() {
  const message = el('data-message');
  message.textContent = 'Загружаю…';
  const bust = '?v=' + Date.now();
  try {
    const responses = await Promise.all([
      fetch('data/works.json' + bust, { cache: 'no-store' }),
      fetch('data/rates.json' + bust, { cache: 'no-store' }),
      fetch('data/coefficients.json' + bust, { cache: 'no-store' }),
      fetch('data/meta.json' + bust, { cache: 'no-store' })
    ]);
    if (responses.some(function (r) { return !r.ok; })) {
      throw new Error('файлы не найдены (HTTP ' + responses.map(function (r) { return r.status; }).join(', ') + ')');
    }
    const data = await Promise.all(responses.map(function (r) { return r.json(); }));
    if (!Array.isArray(data[0]) || !data[0].length) throw new Error('works.json пуст или повреждён');

    state.works = data[0];
    state.rates = data[1];
    state.coeffs = data[2];
    state.meta = data[3];
    state.rates.indices = Object.assign({ labor: 1, machines: 1, materials: 1 }, state.rates.indices || {});
    state.settings.shift = num(state.rates.shiftHours) || state.settings.shift || 8;
    persist();
    renderAll();
    renderDataModal();
    message.textContent = 'Данные обновлены: ' + state.works.length + ' работ.';
    showToast('Данные обновлены из data/*.json');
  } catch (err) {
    const reason = location.protocol === 'file:'
      ? 'при открытии через file:// браузер блокирует чтение JSON'
      : err.message;
    message.textContent = 'Не удалось обновить: ' + reason + '. Используйте импорт JSON.';
  }
}

function applyImportedData(data) {
  if (Array.isArray(data)) {
    state.works = data;
    persist();
    renderAll();
    return;
  }
  if (!data || typeof data !== 'object') throw new Error('ожидался объект или массив');

  if (Array.isArray(data.works) && data.works.length) state.works = data.works;
  if (data.rates && typeof data.rates === 'object') {
    state.rates = data.rates;
    state.rates.indices = Object.assign({ labor: 1, machines: 1, materials: 1 }, state.rates.indices || {});
  }
  if (Array.isArray(data.coefficients)) state.coeffs = data.coefficients;
  else if (Array.isArray(data.coeffs)) state.coeffs = data.coeffs;
  if (data.meta && typeof data.meta === 'object') state.meta = data.meta;
  if (Array.isArray(data.rows)) state.rows = data.rows;
  if (data.settings && typeof data.settings === 'object') {
    state.settings = Object.assign(defaultSettings(), data.settings);
  }
  rowSeq = state.rows.reduce(function (max, r) { return Math.max(max, num(r.id)); }, 0) + 1;
  persist();
  renderAll();
}

/* ============================================================
   ЭКСПОРТ / ИМПОРТ ПРОЕКТА
   ============================================================ */

function estimateAoa() {
  const totals = currentTotals();
  const aoa = [
    ['Мини-ГрандСмета — смета типовой КНС'],
    ['Данные от', formatDate(state.meta.updatedAt)],
    [],
    ['№', 'Шифр', 'Наименование работ', 'Ед. изм.', 'Объём', 'Норма чел.-ч/ед.', 'Коэф.',
      'Чел.-ч', 'Маш.-ч', 'Маш.-ч к оплате', 'Стоимость ФЕР, ₽', 'ФОТ, ₽']
  ];

  let n = 0;
  const groups = {};
  totals.rows.forEach(function (item) {
    const cat = item.work.category || 'Без раздела';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  MGS.orderedCategories(groups).forEach(function (cat) {
    aoa.push([cat]);
    groups[cat].forEach(function (item) {
      n += 1;
      const c = item.calc;
      aoa.push([
        n, item.work.code, item.work.name, prettyUnit(item.work.unit), num(item.row.volume),
        c.norm, c.coeff, c.laborHours, c.machineHours,
        c.machine ? c.billedMachineHours : '', c.total, c.payroll
      ]);
    });
  });

  aoa.push([]);
  aoa.push(['Прямые затраты', totals.direct]);
  aoa.push(['Накладные расходы (НР)', totals.nr]);
  aoa.push(['Сметная прибыль (СП)', totals.sp]);
  aoa.push(['Аренда техники (справочно)', totals.rental]);
  aoa.push(['ИТОГО по смете', totals.cost]);
  return { aoa: aoa, totals: totals };
}

function exportXlsx() {
  if (typeof XLSX === 'undefined') {
    alert('Библиотека Excel не загрузилась. Проверьте интернет или используйте CSV.');
    return;
  }
  const built = estimateAoa();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(built.aoa);
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 70 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Смета');

  const t = built.totals;
  const salary = [
    ['Зарплаты по ролям'],
    ['Роль', 'Часы', 'Ставка, ₽', 'Сумма, ₽'],
    ['Рабочий', t.laborHours, num(state.rates.workerRate), t.workerPay],
    ['Машинист', t.machineHours, num(state.rates.machinistRate), t.machinistPayroll],
    ['Прораб', '', num(state.rates.foremanPercent) + ' %', t.foremanPay],
    ['Страховые взносы', '', num(state.rates.insurancePercent) + ' %', t.insurance],
    ['Итого ФОТ', '', '', t.payroll],
    ['Итого ФОТ с взносами', '', '', t.payroll + t.insurance]
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(salary);
  ws2['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Зарплаты');

  const ref = [
    ['Справочник работ ФЕР'],
    ['Шифр', 'Наименование', 'Ед. изм.', 'Прямые, ₽', 'Оплата труда, ₽', 'Машины, ₽',
      'Машинист, ₽', 'Материалы, ₽', 'Норма чел.-ч', 'Сборник', 'Редакция', 'Источник']
  ];
  state.works.forEach(function (w) {
    ref.push([w.code, w.name, prettyUnit(w.unit), w.basePrice, w.laborPay, w.machinePay,
      w.machinistPay, w.materialPay, w.norm, w.category, w.edition, w.source]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(ref);
  ws3['!cols'] = [{ wch: 14 }, { wch: 70 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 40 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Справочник ФЕР');

  XLSX.writeFile(wb, 'smeta-kns.xlsx');
  showToast('Excel-файл сформирован');
}

function exportCsv() {
  const built = estimateAoa();
  const csv = built.aoa.map(function (row) {
    return row.map(function (cell) {
      if (cell == null) return '';
      const s = String(cell);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';');
  }).join('\r\n');
  downloadBlob('\ufeff' + csv, 'smeta-kns.csv', 'text/csv;charset=utf-8');
  showToast('CSV-файл сформирован');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type: type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function saveProject() {
  const data = {
    version: 3,
    savedAt: new Date().toISOString(),
    works: state.works,
    rates: state.rates,
    coefficients: state.coeffs,
    meta: state.meta,
    rows: state.rows,
    settings: state.settings
  };
  downloadBlob(JSON.stringify(data, null, 2), 'smeta-kns-project.json', 'application/json');
  showToast('Проект сохранён в JSON');
}

function loadProjectFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const data = JSON.parse(reader.result);
      applyImportedData(data);
      showToast('Проект загружен');
    } catch (err) {
      alert('Не удалось загрузить проект: ' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
}

function bindExport() {
  el('btn-export-xlsx').addEventListener('click', exportXlsx);
  el('btn-export-csv').addEventListener('click', exportCsv);
  el('btn-save-json').addEventListener('click', saveProject);
  el('btn-load-json').addEventListener('click', function () {
    el('load-json-file').click();
  });
  el('load-json-file').addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (file) loadProjectFile(file);
    e.target.value = '';
  });
  el('btn-print').addEventListener('click', function () {
    window.print();
  });
  el('btn-clear').addEventListener('click', function () {
    if (!state.rows.length) return;
    if (!confirm('Очистить смету? Справочник, ставки и ресурсы останутся.')) return;
    state.rows = [];
    persist();
    renderAll();
    showToast('Смета очищена');
  });
}

/* ============================================================
   СРОК И ЧИСЛЕННОСТЬ
   ============================================================ */

function bindSchedule() {
  document.querySelectorAll('input[name="sched-mode"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      state.settings.mode = radio.value;
      persist();
      renderSchedule(currentTotals());
    });
  });

  el('sched-people').addEventListener('change', function (e) {
    state.settings.people = Math.max(1, Math.round(num(e.target.value)));
    persist();
    renderSchedule(currentTotals());
  });

  el('sched-shift').addEventListener('change', function (e) {
    const shift = Math.max(1, num(e.target.value));
    state.settings.shift = shift;
    state.rates.shiftHours = shift;
    persist();
    renderAll();
  });

  el('sched-deadline').addEventListener('change', function (e) {
    state.settings.deadline = Math.max(1, Math.round(num(e.target.value)));
    persist();
    renderSchedule(currentTotals());
  });
}

/* ============================================================
   СТАРТ
   ============================================================ */

function init() {
  if (!MGS) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Ошибка: не загрузился calc.js. Обновите страницу.</p>';
    return;
  }
  bindEstimateEvents();
  bindAddModal();
  bindDirectory();
  bindResources();
  bindRowModal();
  bindDataModal();
  bindExport();
  bindSchedule();
  renderAll();
  renderDataModal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
