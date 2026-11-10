(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MGS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATEGORY_ORDER = [
    'Сборник 1. Земляные работы',
    'Сборник 6. Бетонные и железобетонные конструкции монолитные',
    'Сборник 7. Бетонные и железобетонные конструкции сборные',
    'Сборник 8. Конструкции из кирпича и блоков',
    'Сборник 11. Полы',
    'Сборник 12. Кровли',
    'Сборник 15. Отделочные работы',
    'Сборник 16. Трубопроводы внутренние',
    'Сборник 23. Канализация — наружные сети'
  ];

  function num(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  function manual(v) {
    return v !== '' && v != null && v !== undefined;
  }

  function getUnitDivisor(unit) {
    const m = String(unit == null ? '' : unit).match(/^\s*(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }

  function findWork(works, workId) {
    return (works || []).find(function (w) {
      return String(w.id) === String(workId) || String(w.code) === String(workId);
    }) || null;
  }

  function findCoeff(coeffs, id) {
    return (coeffs || []).find(function (c) { return String(c.id) === String(id); }) || null;
  }

  function resolveCoeff(row, coeffs) {
    if (manual(row.customCoeff)) return num(row.customCoeff);
    if (row.coeffId) {
      const c = findCoeff(coeffs, row.coeffId);
      if (c) return num(c.value);
    }
    return 1;
  }

  /**
   * Машино-часы на единицу работы.
   *
   * В ФЕР оплата труда машиниста (machinistPay) указана в рублях на единицу
   * измерения. При базовой ставке машиниста 11 ₽/чел.-ч (2001 г.) количество
   * машино-часов = machinistPay / 11. Это именно маш.-ч, а не объём в м³.
   */
  function machineHoursPerUnit(work, row, rates) {
    if (manual(row.manualMachineNorm)) return num(row.manualMachineNorm);
    if (manual(work.machineNorm)) return num(work.machineNorm);
    const baseRate = num(rates.baseMachinistRate) || 11;
    if (num(work.machinistPay) > 0) return num(work.machinistPay) / baseRate;
    return 0;
  }

  function computeRow(work, row, rates, coeffs, machines) {
    const empty = {
      vol: 0, qty: 0, divisor: 1, norm: 0, machineNorm: 0, coeff: 1,
      laborHours: 0, machineHours: 0, billedMachineHours: 0,
      baseDirect: 0, baseLabor: 0, baseMachine: 0, baseMachinist: 0, baseMaterial: 0,
      laborCost: 0, machineCost: 0, materialCost: 0, rentalCost: 0,
      direct: 0, nr: 0, sp: 0, total: 0,
      workerPay: 0, machinistPayroll: 0, foremanPay: 0, payroll: 0, insurance: 0,
      machine: null, machineName: '', useRental: !!(rates && rates.useRentalInTotal)
    };
    if (!work) return empty;

    const vol = num(row.volume);
    const divisor = num(work.divisor) > 0 ? num(work.divisor) : getUnitDivisor(work.unit);
    const qty = vol / divisor;
    const coeff = resolveCoeff(row, coeffs);
    const norm = manual(row.manualNorm) ? num(row.manualNorm) : num(work.norm);
    const laborHours = qty * norm * coeff;
    const machineNorm = machineHoursPerUnit(work, row, rates);
    const machineHours = qty * machineNorm * coeff;
    const minHours = num(rates.minMachineHours) || 4;

    const machine = work.machineId
      ? (machines || []).find(function (m) { return String(m.id) === String(work.machineId); }) || null
      : null;
    // Аренда считается в машино-часах. Если техника закреплена за работой,
    // действует минимальный заказ — 4 маш.-ч (а не 4 м³).
    const billedMachineHours = machine ? Math.max(machineHours, minHours) : 0;
    const rentalCost = machine ? billedMachineHours * num(machine.rate) : 0;

    const baseDirect = qty * num(work.basePrice) * coeff;
    const baseLabor = qty * num(work.laborPay) * coeff;
    const baseMachine = qty * num(work.machinePay) * coeff;
    const baseMachinist = qty * num(work.machinistPay) * coeff;
    const baseMaterial = qty * num(work.materialPay) * coeff;

    const idx = (rates && rates.indices) || {};
    const laborIndex = num(idx.labor) || 1;
    const machineIndex = num(idx.machines) || 1;
    const materialIndex = num(idx.materials) || 1;
    const laborCost = baseLabor * laborIndex;
    const machineCost = baseMachine * machineIndex;
    const materialCost = baseMaterial * materialIndex;
    const useRental = !!(rates && rates.useRentalInTotal);
    const machinePart = useRental && machine ? rentalCost : machineCost;

    const direct = laborCost + machinePart + materialCost;
    const nr = direct * num(rates.nrPercent) / 100;
    const sp = direct * num(rates.spPercent) / 100;
    const total = direct + nr + sp;

    const workerPay = laborHours * num(rates.workerRate);
    const machinistPayroll = machineHours * num(rates.machinistRate);
    const foremanPay = (workerPay + machinistPayroll) * num(rates.foremanPercent) / 100;
    const payroll = workerPay + machinistPayroll + foremanPay;
    const insurance = payroll * num(rates.insurancePercent) / 100;

    return {
      vol: vol, qty: qty, divisor: divisor, norm: norm, machineNorm: machineNorm, coeff: coeff,
      laborHours: laborHours, machineHours: machineHours, billedMachineHours: billedMachineHours,
      baseDirect: baseDirect, baseLabor: baseLabor, baseMachine: baseMachine,
      baseMachinist: baseMachinist, baseMaterial: baseMaterial,
      laborCost: laborCost, machineCost: machineCost, materialCost: materialCost,
      rentalCost: rentalCost, direct: direct, nr: nr, sp: sp, total: total,
      workerPay: workerPay, machinistPayroll: machinistPayroll, foremanPay: foremanPay,
      payroll: payroll, insurance: insurance,
      machine: machine, machineName: machine ? machine.name : '', useRental: useRental
    };
  }

  function computeTotals(works, rows, rates, coeffs) {
    const machines = (rates && rates.machines) || [];
    const list = [];
    const byCategory = {};
    const totals = {
      cost: 0, direct: 0, nr: 0, sp: 0, payroll: 0, insurance: 0,
      laborHours: 0, machineHours: 0, billedMachineHours: 0, rental: 0,
      workerPay: 0, machinistPayroll: 0, foremanPay: 0,
      baseDirect: 0, baseLabor: 0, baseMachine: 0, baseMaterial: 0,
      workerRate: num(rates.workerRate), machinistRate: num(rates.machinistRate),
      foremanPercent: num(rates.foremanPercent)
    };

    (rows || []).forEach(function (row) {
      const work = findWork(works, row.workId);
      if (!work) return;
      const calc = computeRow(work, row, rates, coeffs, machines);
      list.push({ row: row, work: work, calc: calc });
      totals.cost += calc.total;
      totals.direct += calc.direct;
      totals.nr += calc.nr;
      totals.sp += calc.sp;
      totals.payroll += calc.payroll;
      totals.insurance += calc.insurance;
      totals.laborHours += calc.laborHours;
      totals.machineHours += calc.machineHours;
      totals.billedMachineHours += calc.billedMachineHours;
      totals.rental += calc.rentalCost;
      totals.workerPay += calc.workerPay;
      totals.machinistPayroll += calc.machinistPayroll;
      totals.foremanPay += calc.foremanPay;
      totals.baseDirect += calc.baseDirect;
      totals.baseLabor += calc.baseLabor;
      totals.baseMachine += calc.baseMachine;
      totals.baseMaterial += calc.baseMaterial;

      const cat = work.category || 'Без раздела';
      if (!byCategory[cat]) {
        byCategory[cat] = {
          category: cat, count: 0, cost: 0, payroll: 0, laborHours: 0,
          machineHours: 0, rental: 0
        };
      }
      const g = byCategory[cat];
      g.count += 1;
      g.cost += calc.total;
      g.payroll += calc.payroll;
      g.laborHours += calc.laborHours;
      g.machineHours += calc.machineHours;
      g.rental += calc.rentalCost;
    });

    totals.byCategory = byCategory;
    totals.rows = list;
    return totals;
  }

  function orderedCategories(byCategory) {
    const names = Object.keys(byCategory || {});
    names.sort(function (a, b) {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return names;
  }

  function computeSchedule(laborHours, settings) {
    const s = settings || {};
    const hours = num(laborHours);
    const shift = num(s.shift) || 8;
    const people = num(s.people) || 0;
    const deadline = num(s.deadline) || 0;
    const mode = s.mode === 'deadline' ? 'deadline' : 'people';
    if (hours <= 0) {
      return { mode: mode, ok: false, result: null, days: null, people: null, shift: shift };
    }
    if (mode === 'people') {
      if (people <= 0) return { mode: mode, ok: false, result: null, days: null, people: people, shift: shift };
      const days = Math.ceil(hours / (people * shift));
      return { mode: mode, ok: true, result: days, days: days, people: people, shift: shift };
    }
    if (deadline <= 0) return { mode: mode, ok: false, result: null, days: deadline, people: null, shift: shift };
    const required = Math.ceil(hours / (deadline * shift));
    return { mode: mode, ok: true, result: required, days: deadline, people: required, shift: shift };
  }

  return {
    CATEGORY_ORDER: CATEGORY_ORDER,
    num: num,
    manual: manual,
    getUnitDivisor: getUnitDivisor,
    findWork: findWork,
    findCoeff: findCoeff,
    resolveCoeff: resolveCoeff,
    machineHoursPerUnit: machineHoursPerUnit,
    computeRow: computeRow,
    computeTotals: computeTotals,
    orderedCategories: orderedCategories,
    computeSchedule: computeSchedule
  };
});
