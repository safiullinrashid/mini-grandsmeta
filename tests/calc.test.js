'use strict';

/* Проверка расчётов: node tests/calc.test.js */

const fs = require('fs');
const path = require('path');
const MGS = require('../calc.js');

const root = path.join(__dirname, '..');
const works = JSON.parse(fs.readFileSync(path.join(root, 'data', 'works.json'), 'utf8'));
const rates = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rates.json'), 'utf8'));
const coeffs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'coefficients.json'), 'utf8'));

let fails = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log('OK   ' + name);
  } else {
    fails += 1;
    console.log('FAIL ' + name + (detail === undefined ? '' : ' — ' + detail));
  }
}

function close(a, b, eps) {
  return Math.abs(a - b) <= (eps == null ? 1e-6 : eps);
}

check('39 работ в справочнике', works.length === 39, works.length);
check('9 сборников', new Set(works.map(function (w) { return w.category; })).size === 9);

const excavator = MGS.findWork(works, '01-01-018-02');
const excavatorSmall = MGS.computeRow(excavator, { volume: 10 }, rates, coeffs, rates.machines);
check('механизированная работа: чел.-ч = 0', excavatorSmall.laborHours === 0, excavatorSmall.laborHours);
check('маш.-ч на единицу = оплата машиниста / 11', close(MGS.machineHoursPerUnit(excavator, {}, rates), 614.25 / 11), MGS.machineHoursPerUnit(excavator, {}, rates));
check('объём 10 м³ даёт маш.-ч меньше 4', excavatorSmall.machineHours < 4, excavatorSmall.machineHours);
check('аренда: минимум 4 маш.-ч', excavatorSmall.billedMachineHours === 4, excavatorSmall.billedMachineHours);
check('аренда = 4 × 2800', excavatorSmall.rentalCost === 11200, excavatorSmall.rentalCost);
check('маш.-ч растут от объёма, а не равны м³', close(MGS.computeRow(excavator, { volume: 1000 }, rates, coeffs, rates.machines).machineHours, excavatorSmall.machineHours * 100), '');

const concrete = MGS.findWork(works, '06-01-001-01');
const c = MGS.computeRow(concrete, { volume: 8 }, rates, coeffs, rates.machines);
check('чел.-ч = 0,08 × 135', close(c.laborHours, 10.8), c.laborHours);
check('зарплата рабочего = чел.-ч × 450', close(c.workerPay, 4860), c.workerPay);
check('зарплата машиниста = маш.-ч × 700', close(c.machinistPayroll, c.machineHours * 700), c.machinistPayroll);
check('прораб = 15 % от ФОТ', close(c.foremanPay, (c.workerPay + c.machinistPayroll) * 0.15), c.foremanPay);
check('взносы = 30,2 % от ФОТ', close(c.insurance, c.payroll * 0.302), c.insurance);
check('прямые затраты с индексами 45/14/9', close(c.direct, 1053 * 0.08 * 45 + 1566.06 * 0.08 * 14 + 909.27 * 0.08 * 9), c.direct);
check('НР = 10 % прямых', close(c.nr, c.direct * 0.1), c.nr);
check('СП = 5 % прямых', close(c.sp, c.direct * 0.05), c.sp);
check('итого = прямые + НР + СП', close(c.total, c.direct + c.nr + c.sp), c.total);

check('коэффициент из справочника', MGS.resolveCoeff({ coeffId: 'kns2' }, coeffs) === 1.2);
check('свой коэффициент перекрывает справочник', MGS.resolveCoeff({ coeffId: 'kns2', customCoeff: '1.5' }, coeffs) === 1.5);
check('ручная норма перекрывает ФЕР', close(MGS.computeRow(concrete, { volume: 8, manualNorm: '100' }, rates, coeffs, rates.machines).laborHours, 8), '');
check('ручные маш.-ч перекрывают расчёт', close(MGS.computeRow(concrete, { volume: 8, manualMachineNorm: '2' }, rates, coeffs, rates.machines).machineHours, 0.16), '');

const byPeople = MGS.computeSchedule(160, { mode: 'people', people: 8, shift: 8, deadline: 30 });
check('срок = 160 / (8 × 8) = 3 дня', byPeople.days === 3, byPeople.days);
const byDeadline = MGS.computeSchedule(160, { mode: 'deadline', people: 8, shift: 8, deadline: 5 });
check('численность = 160 / (5 × 8) = 4 чел.', byDeadline.people === 4, byDeadline.people);

if (fails) {
  console.log('\nFAILED: ' + fails);
  process.exit(1);
}
console.log('\nALL TESTS PASSED');
