(() => {
  'use strict';

  const STORAGE = 'alternative-casio-state-v1';
  const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 10, useGrouping: true });
  const $ = (id) => document.getElementById(id);
  const symbol = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const defaults = () => ({
    entry: '0', accumulator: null, pending: null, fresh: false,
    memory: 0, history: [], presets: [
      { id: 'default-5', name: 'Налог', rate: 5, fixed: true },
      { id: 'default-6', name: 'УСН', rate: 6, fixed: true },
      { id: 'default-10', name: 'Процент', rate: 10, fixed: true },
      { id: 'default-15', name: 'Скидка', rate: 15, fixed: true },
      { id: 'default-20', name: 'НДС', rate: 20, fixed: true }
    ],
    saved: [], lastOp: null, lastOperand: null, lastPercentRaw: null
  });

  let state = defaults();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (stored && typeof stored === 'object') {
      const safe = defaults();
      state = Object.assign(safe, stored);
      if (!Array.isArray(state.history)) state.history = [];
      if (!Array.isArray(state.presets)) state.presets = safe.presets;
      if (!Array.isArray(state.saved)) state.saved = [];
      if (typeof state.memory !== 'number' || !Number.isFinite(state.memory)) state.memory = 0;
      if (typeof state.entry !== 'string') state.entry = '0';
      if (!['+', '-', '*', '/', null].includes(state.pending)) { state.pending = null; state.accumulator = null; }
      state.history = state.history.slice(0, 50);
      state.presets = state.presets.slice(0, 24);
      state.saved = state.saved.slice(0, 6);
    }
  } catch (_) { state = defaults(); }

  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (_) { /* Private browsing: still works */ }
  }
  function current() {
    const n = Number(state.entry);
    return Number.isFinite(n) ? n : NaN;
  }
  function numberText(n) {
    if (!Number.isFinite(n)) return 'Ошибка';
    if (n === 0) return '0';
    if (Math.abs(n) >= 1e12 || (Math.abs(n) < 1e-7 && n !== 0)) return n.toExponential(5).replace('.', ',');
    return fmt.format(n);
  }
  function entryText() {
    if (state.entry === 'Ошибка') return 'Ошибка';
    if (state.entry === '-0') return '−0';
    let value = numberText(current());
    if (state.entry.endsWith('.') && !value.includes('e')) value += ',';
    return value;
  }
  function normalize(n) {
    if (!Number.isFinite(n)) return null;
    return Number(n.toPrecision(12)).toString();
  }
  function fail(message = 'Невозможно вычислить') {
    state.entry = 'Ошибка';
    state.accumulator = null;
    state.pending = null;
    state.lastOp = null;
    state.lastOperand = null;
    state.lastPercentRaw = null;
    state.fresh = true;
    showToast(message);
  }
  function operate(a, b, op) {
    switch(op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }
  function setNumber(n, fresh = true) {
    const value = normalize(n);
    if (value === null) { fail(); return false; }
    state.entry = value;
    state.fresh = fresh;
    return true;
  }
  function addHistory(expression, result) {
    state.history.unshift({ expression, result, id: String(Date.now()) + '-' + String(Math.random()).slice(2, 7) });
    state.history = state.history.slice(0, 50);
  }
  function digits(value) {
    if (state.entry === 'Ошибка') clearAll();
    if (state.fresh) {
      state.entry = value;
      state.fresh = false;
    } else {
      const nonSign = state.entry.replace('-', '').replace('.', '');
      if (nonSign.length >= 12) return;
      if (state.entry === '0') state.entry = value;
      else if (state.entry === '-0') state.entry = '-' + value;
      else state.entry += value;
    }
    state.lastPercentRaw = null;
  }
  function decimal() {
    if (state.entry === 'Ошибка') clearAll();
    if (state.fresh) { state.entry = '0.'; state.fresh = false; }
    else if (!state.entry.includes('.') && !state.entry.includes('e')) state.entry += '.';
    state.lastPercentRaw = null;
  }
  function toggleSign() {
    if (state.entry === 'Ошибка') return;
    if (state.entry.startsWith('-')) state.entry = state.entry.slice(1);
    else if (state.entry !== '0') state.entry = '-' + state.entry;
    state.fresh = false;
  }
  function clearEntry() {
    state.entry = '0'; state.fresh = false; state.lastPercentRaw = null;
  }
  function clearAll() {
    state.entry = '0';
    state.accumulator = null; state.pending = null; state.fresh = false;
    state.lastOp = null; state.lastOperand = null; state.lastPercentRaw = null;
  }
  function chooseOperator(op) {
    if (state.entry === 'Ошибка') return;
    if (state.pending !== null && !state.fresh) {
      const a = state.accumulator;
      const b = current();
      const result = operate(a, b, state.pending);
      if (!setNumber(result)) return;
      addHistory(numberText(a) + ' ' + symbol[state.pending] + ' ' + (state.lastPercentRaw || numberText(b)), result);
    }
    state.accumulator = current();
    state.pending = op;
    state.fresh = true;
    state.lastOp = null;
    state.lastPercentRaw = null;
  }
  function percent() {
    if (state.entry === 'Ошибка') return;
    const raw = current();
    let result = raw / 100;
    if (state.pending !== null && (state.pending === '+' || state.pending === '-')) {
      result = state.accumulator * raw / 100;
    }
    state.lastPercentRaw = numberText(raw) + '%';
    if (state.pending === null) addHistory(numberText(raw) + '%', result);
    setNumber(result, false);
  }
  function equals() {
    if (state.entry === 'Ошибка') return;
    if (state.pending !== null && state.accumulator !== null) {
      const a = state.accumulator, op = state.pending;
      const b = current();
      const result = operate(a, b, op);
      if (!setNumber(result)) return;
      addHistory(numberText(a) + ' ' + symbol[op] + ' ' + (state.lastPercentRaw || numberText(b)), result);
      state.lastOp = op;
      state.lastOperand = b;
      state.accumulator = null;
      state.pending = null;
      state.lastPercentRaw = null;
    } else if (state.lastOp !== null && state.lastOperand !== null) {
      const a = current(), b = state.lastOperand;
      const result = operate(a, b, state.lastOp);
      if (!setNumber(result)) return;
      addHistory(numberText(a) + ' ' + symbol[state.lastOp] + ' ' + numberText(b), result);
    }
  }
  function memoryAction(type) {
    if (type === 'mc') { state.memory = 0; return; }
    if (type === 'mr') { setNumber(state.memory); state.lastPercentRaw = null; return; }
    if (state.entry === 'Ошибка') return;
    const sign = type === 'mplus' ? 1 : -1;
    const newValue = state.memory + sign * current();
    if (Number.isFinite(newValue)) state.memory = Number(newValue.toPrecision(12));
  }
  function usePreset(rate) {
    if (state.entry === 'Ошибка') clearAll();
    setNumber(rate, false);
    percent();
    showToast('Применено ' + numberText(rate) + '%');
  }
  function applyHistory(value) {
    setNumber(value, true);
    state.pending = null; state.accumulator = null;
    state.lastOp = null; state.lastOperand = null;
    state.lastPercentRaw = null;
    closeDialogs();
  }

  let toastTimer;
  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 2100);
  }
  function makeHistoryItem(item) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'history-item';
    const left = document.createElement('span'); left.className = 'history-expression'; left.textContent = item.expression;
    const right = document.createElement('strong'); right.className = 'history-number'; right.textContent = '= ' + numberText(item.result);
    button.append(left, right);
    button.addEventListener('click', () => { applyHistory(item.result); refresh(); });
    return button;
  }
  function renderHistory() {
    for (const id of ['historyList', 'historyListMobile']) {
      const host = $(id); host.replaceChildren();
      if (!state.history.length) {
        const p = document.createElement('p'); p.className = 'empty-state';
        p.textContent = 'Здесь появятся результаты вычислений.';
        host.append(p);
      } else state.history.forEach(item => host.append(makeHistoryItem(item)));
    }
  }
  function renderPresets() {
    const host = $('presetList'); host.replaceChildren();
    for (const preset of state.presets) {
      const line = document.createElement('div'); line.className = 'preset-row';
      const b = document.createElement('button'); b.className = 'preset-button'; b.type = 'button';
      const title = document.createElement('span'); title.textContent = preset.name;
      const rate = document.createElement('strong'); rate.textContent = numberText(preset.rate) + '%';
      b.append(title, rate);
      b.addEventListener('click', () => { usePreset(Number(preset.rate)); refresh(); });
      line.append(b);
      if (!preset.fixed) {
        const remove = document.createElement('button'); remove.className = 'remove-row'; remove.type = 'button';
        remove.textContent = '×'; remove.setAttribute('aria-label', 'Удалить ' + preset.name);
        remove.addEventListener('click', () => { state.presets = state.presets.filter(p => p.id !== preset.id); refresh(); });
        line.append(remove);
      }
      host.append(line);
    }
  }
  function renderSaved() {
    const host = $('valuesList'); host.replaceChildren();
    if (!state.saved.length) {
      const p = document.createElement('p'); p.className = 'empty-state';
      p.textContent = 'Сохраните текущее число кнопкой ＋.'; host.append(p);
    }
    for (let i = 0; i < state.saved.length; i++) {
      const item = state.saved[i];
      const line = document.createElement('div'); line.className = 'value-row';
      const b = document.createElement('button'); b.className = 'value-button'; b.type = 'button';
      const tag = document.createElement('span'); tag.className = 'value-tag'; tag.textContent = 'M' + (i + 1);
      const value = document.createElement('strong'); value.textContent = numberText(item);
      b.append(tag, value);
      b.addEventListener('click', () => { applyHistory(item); refresh(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-row';
      remove.textContent = '×'; remove.setAttribute('aria-label', 'Удалить число ' + numberText(item));
      remove.addEventListener('click', () => { state.saved.splice(i, 1); refresh(); });
      line.append(b, remove); host.append(line);
    }
  }
  function parseInput(text) {
    const normalized = String(text).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return NaN;
    return Number(normalized);
  }
  function reverseValue() {
    const amount = parseInput($('reverseAmount').value);
    const rate = parseInput($('reverseRate').value);
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate >= 100 || rate < 0) return null;
    const value = amount / (1 - rate / 100);
    return Number.isFinite(value) ? Number(value.toPrecision(12)) : null;
  }
  function renderReverse() {
    const value = reverseValue();
    $('reverseOutput').textContent = value === null ? '—' : numberText(value);
    $('reverseApply').disabled = value === null;
  }
  function refresh() {
    $('display').textContent = entryText();
    $('display').classList.toggle('small', entryText().length > 11);
    $('lcdOperation').textContent = state.pending !== null
      ? numberText(state.accumulator) + ' ' + symbol[state.pending] + ' …'
      : (state.entry === 'Ошибка' ? 'Проверьте операцию' : '12-разрядный калькулятор');
    $('memoryIndicator').classList.toggle('active', state.memory !== 0);
    renderHistory(); renderPresets(); renderSaved(); renderReverse(); persist();
  }
  function dispatch(action, value) {
    switch (action) {
      case 'digit': digits(value); break;
      case 'decimal': decimal(); break;
      case 'sign': toggleSign(); break;
      case 'ac': clearAll(); break;
      case 'ce': clearEntry(); break;
      case 'operator': chooseOperator(value); break;
      case 'percent': percent(); break;
      case 'equals': equals(); break;
      case 'mc': case 'mr': case 'mplus': case 'mminus': memoryAction(action); break;
    }
    refresh();
  }
  function closeDialogs() {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }
  document.querySelector('.keypad').addEventListener('click', ev => {
    const target = ev.target.closest('button[data-action]');
    if (target) dispatch(target.dataset.action, target.dataset.value);
  });
  document.querySelector('.memory-keys').addEventListener('click', ev => {
    const target = ev.target.closest('button[data-action]');
    if (target) dispatch(target.dataset.action, target.dataset.value);
  });
  window.addEventListener('keydown', ev => {
    if (document.querySelector('dialog[open]') || ev.target.closest('input,textarea,select')) return;
    const k = ev.key;
    if (/^[0-9]$/.test(k)) dispatch('digit', k);
    else if (k === '.' || k === ',') dispatch('decimal');
    else if (['+', '-', '*', '/'].includes(k)) { ev.preventDefault(); dispatch('operator', k); }
    else if (k === '%' ) dispatch('percent');
    else if (k === 'Enter' || k === '=') { ev.preventDefault(); dispatch('equals'); }
    else if (k === 'Escape') dispatch('ac');
    else if (k === 'Backspace') {
      if (state.fresh || state.entry === 'Ошибка') clearEntry();
      else state.entry = state.entry.length > 1 ? state.entry.slice(0, -1) : '0';
      refresh();
    } else return;
    const target = document.querySelector('[data-action="' + (
      /^[0-9]$/.test(k) ? 'digit' : k === '.' || k === ',' ? 'decimal' :
      k === '%' ? 'percent' : k === '=' || k === 'Enter' ? 'equals' : ''
    ) + '"][data-value="' + k + '"]');
    if (target) { target.classList.add('pressed'); setTimeout(() => target.classList.remove('pressed'), 85); }
  });
  $('historyToggle').addEventListener('click', () => $('historyDialog').showModal());
  $('presetAdd').addEventListener('click', () => $('presetDialog').showModal());
  document.querySelectorAll('[data-close-dialog]').forEach(button =>
    button.addEventListener('click', closeDialogs)
  );
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  });
  function clearHistory() {
    state.history = []; refresh(); showToast('История очищена');
  }
  $('historyClear').addEventListener('click', clearHistory);
  $('historyClearMobile').addEventListener('click', clearHistory);
  $('valueSave').addEventListener('click', () => {
    if (state.entry === 'Ошибка') return;
    state.saved.unshift(current()); state.saved = state.saved.slice(0, 6);
    refresh(); showToast('Число сохранено');
  });
  $('presetForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('presetName').value.trim();
    const rate = parseInput($('presetRate').value);
    if (!name || !Number.isFinite(rate) || rate < 0 || rate > 100000) {
      showToast('Проверьте название и процент'); return;
    }
    state.presets.push({ id: String(Date.now()) + Math.random(), name: name.slice(0, 32), rate });
    $('presetForm').reset(); $('presetDialog').close(); refresh(); showToast('Процент сохранён');
  });
  ['reverseAmount', 'reverseRate'].forEach(id => $(id).addEventListener('input', renderReverse));
  $('reverseApply').addEventListener('click', () => {
    const value = reverseValue();
    if (value === null) return;
    const amount = parseInput($('reverseAmount').value);
    const rate = parseInput($('reverseRate').value);
    addHistory(numberText(amount) + ' ÷ (1 − ' + numberText(rate) + '%)', value);
    applyHistory(value); refresh(); showToast('Перенесено в калькулятор');
  });
  $('copyResult').addEventListener('click', async () => {
    if (state.entry === 'Ошибка') return;
    const text = state.entry;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Результат скопирован');
    } catch (_) {
      showToast('Не удалось скопировать');
    }
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    }, { once: true });
  }
  refresh();
})();
