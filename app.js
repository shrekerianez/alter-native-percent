(() => {
  'use strict';

  const STORAGE = {
    state: 'alternative-percent-state-v1',
    history: 'alternative-percent-history-v1'
  };

  const MODES = {
    subtract: {
      resultLabel: 'После вычета',
      amountLabel: 'Сумма',
      amountHint: 'Сумма до удержания процента',
      deltaSign: '−'
    },
    add: {
      resultLabel: 'После добавления',
      amountLabel: 'Сумма',
      amountHint: 'Сумма до начисления процента',
      deltaSign: '+'
    },
    reverse: {
      resultLabel: 'Сумма до вычета',
      amountLabel: 'После вычета',
      amountHint: 'Сумма, оставшаяся после удержания',
      deltaSign: '+'
    }
  };

  const els = {
    mode: document.getElementById('modeSelect'),
    amount: document.getElementById('amountInput'),
    percent: document.getElementById('percentInput'),
    amountLabel: document.getElementById('amountLabel'),
    amountHint: document.getElementById('amountHint'),
    resultLabel: document.getElementById('resultLabel'),
    resultBadge: document.getElementById('resultBadge'),
    resultValue: document.getElementById('resultValue'),
    resultCaption: document.getElementById('resultCaption'),
    copy: document.getElementById('copyButton'),
    save: document.getElementById('saveButton'),
    reset: document.getElementById('resetButton'),
    historyButton: document.getElementById('historyButton'),
    historyDialog: document.getElementById('historyDialog'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    clearHistory: document.getElementById('clearHistoryButton'),
    closeHistory: document.getElementById('closeHistoryButton'),
    toast: document.getElementById('toast'),
    quickPercent: [...document.querySelectorAll('[data-percent]')]
  };

  let state = {
    mode: 'subtract',
    amount: '',
    percent: '15'
  };

  let history = [];
  let currentCalculation = null;
  let toastTimer = null;

  const numberFormatter = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  function formatMoney(value) {
    if (!Number.isFinite(value)) return '0 ₽';
    const normalized = Math.abs(value) < 0.005 ? 0 : value;
    return `${numberFormatter.format(normalized)} ₽`;
  }

  function formatPercent(value) {
    return `${numberFormatter.format(value)}%`;
  }

  function parseNumber(raw) {
    if (typeof raw !== 'string') return NaN;

    const normalized = raw
      .trim()
      .replace(/[\s\u00a0\u202f]/g, '')
      .replace(',', '.')
      .replace(/[^0-9.]/g, '');

    if (!normalized) return NaN;

    const [whole, ...fraction] = normalized.split('.');
    return Number(fraction.length ? `${whole}.${fraction.join('')}` : whole);
  }

  function cleanInput(raw) {
    const normalized = String(raw)
      .replace(/[\s\u00a0\u202f]/g, '')
      .replace(/,/g, '.')
      .replace(/[^0-9.]/g, '');

    const dot = normalized.indexOf('.');
    if (dot === -1) return normalized.slice(0, 15);

    const whole = normalized.slice(0, dot).slice(0, 15);
    const decimal = normalized.slice(dot + 1).replace(/\./g, '').slice(0, 4);
    return `${whole}.${decimal}`;
  }

  function editable(value) {
    return String(value).replace('.', ',');
  }

  function prettyEditable(value) {
    const parsed = parseNumber(String(value));
    return Number.isFinite(parsed) ? numberFormatter.format(parsed) : editable(value);
  }

  function calculate() {
    const amount = parseNumber(state.amount);
    const percent = parseNumber(state.percent);

    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(percent) || percent < 0) {
      return { valid: false, reason: 'Укажите сумму и процент' };
    }

    if (state.mode === 'reverse' && percent >= 100) {
      return { valid: false, reason: 'Для обратного расчёта процент должен быть меньше 100' };
    }

    if (state.mode === 'subtract' && percent > 100) {
      return { valid: false, reason: 'Для вычитания процент должен быть не больше 100' };
    }

    if (percent > 10000) {
      return { valid: false, reason: 'Слишком большой процент' };
    }

    let result;
    let delta;

    if (state.mode === 'subtract') {
      delta = amount * (percent / 100);
      result = amount - delta;
    } else if (state.mode === 'add') {
      delta = amount * (percent / 100);
      result = amount + delta;
    } else {
      result = amount / (1 - percent / 100);
      delta = result - amount;
    }

    return {
      valid: true,
      amount,
      percent,
      result,
      delta,
      mode: state.mode
    };
  }

  function expressionFor(calc) {
    const amount = formatMoney(calc.amount);
    const result = formatMoney(calc.result);
    const percent = formatPercent(calc.percent);

    if (calc.mode === 'subtract') return `${amount} − ${percent} = ${result}`;
    if (calc.mode === 'add') return `${amount} + ${percent} = ${result}`;
    return `${amount} после ${percent} → ${result} до вычета`;
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE.state, JSON.stringify(state));
    } catch (_) {
      // The calculator remains functional if storage is unavailable.
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.state) || 'null');
      if (saved && MODES[saved.mode]) {
        state = {
          mode: saved.mode,
          amount: typeof saved.amount === 'string' ? saved.amount : '',
          percent: typeof saved.percent === 'string' ? saved.percent : '15'
        };
      }
    } catch (_) {
      // Ignore malformed local data.
    }

    els.mode.value = state.mode;
    els.amount.value = editable(state.amount);
    els.percent.value = editable(state.percent);
  }

  function persistHistory() {
    try {
      localStorage.setItem(STORAGE.history, JSON.stringify(history));
    } catch (_) {
      // History is optional convenience data.
    }
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
      history = Array.isArray(saved) ? saved.slice(0, 12) : [];
    } catch (_) {
      history = [];
    }
    renderHistory();
  }

  function render() {
    const mode = MODES[state.mode];
    const calc = calculate();

    els.mode.value = state.mode;
    els.amountLabel.textContent = mode.amountLabel;
    els.amountHint.textContent = mode.amountHint;
    els.resultLabel.textContent = mode.resultLabel;

    const selectedPercent = parseNumber(state.percent);
    els.quickPercent.forEach((button) => {
      button.classList.toggle('is-selected', Number(button.dataset.percent) === selectedPercent);
      button.setAttribute('aria-pressed', String(Number(button.dataset.percent) === selectedPercent));
    });

    if (!calc.valid) {
      currentCalculation = null;
      els.resultValue.textContent = '0 ₽';
      els.resultBadge.textContent = `${mode.deltaSign} 0 ₽`;
      els.resultCaption.textContent = calc.reason;
      els.copy.disabled = true;
      els.save.disabled = true;
      els.percent.setAttribute('aria-invalid', String(calc.reason.includes('процент') && Boolean(state.percent)));
      persistState();
      return;
    }

    currentCalculation = calc;
    els.resultValue.textContent = formatMoney(calc.result);
    els.resultBadge.textContent = `${mode.deltaSign} ${formatMoney(calc.delta)}`;
    els.resultCaption.textContent = expressionFor(calc);
    els.copy.disabled = false;
    els.save.disabled = false;
    els.percent.setAttribute('aria-invalid', 'false');
    persistState();
  }

  function renderHistory() {
    els.historyList.replaceChildren();
    const empty = history.length === 0;
    els.historyEmpty.hidden = !empty;
    els.historyList.hidden = empty;
    els.clearHistory.disabled = empty;

    history.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-item';
      button.dataset.index = String(index);

      const copy = document.createElement('span');
      copy.className = 'history-copy';

      const expression = document.createElement('span');
      expression.className = 'history-expression';
      expression.textContent = item.expression;

      const result = document.createElement('span');
      result.className = 'history-result';
      result.textContent = formatMoney(item.result);

      const chevron = document.createElement('span');
      chevron.className = 'history-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›';

      copy.append(expression, result);
      button.append(copy, chevron);
      button.setAttribute('aria-label', `Открыть расчёт: ${item.expression}`);
      els.historyList.append(button);
    });
  }

  function saveCurrent() {
    if (!currentCalculation) return;

    const item = {
      mode: currentCalculation.mode,
      amount: currentCalculation.amount,
      percent: currentCalculation.percent,
      result: currentCalculation.result,
      expression: expressionFor(currentCalculation),
      createdAt: Date.now()
    };

    history = history.filter((old) => !(
      old.mode === item.mode &&
      old.amount === item.amount &&
      old.percent === item.percent
    ));

    history.unshift(item);
    history = history.slice(0, 12);
    persistHistory();
    renderHistory();
    showToast('Расчёт сохранён');
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, 1600);
  }

  async function copyResult() {
    if (!currentCalculation) return;

    const text = formatMoney(currentCalculation.result);

    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    showToast('Результат скопирован');
  }

  function resetCalculator() {
    state = { mode: 'subtract', amount: '', percent: '15' };
    els.mode.value = state.mode;
    els.amount.value = '';
    els.percent.value = '15';
    render();
    els.amount.focus({ preventScroll: true });
    showToast('Расчёт сброшен');
  }

  function openHistory() {
    renderHistory();
    if (typeof els.historyDialog.showModal === 'function') {
      els.historyDialog.showModal();
    } else {
      els.historyDialog.setAttribute('open', '');
    }
  }

  function closeHistory() {
    if (typeof els.historyDialog.close === 'function' && els.historyDialog.open) {
      els.historyDialog.close();
    } else {
      els.historyDialog.removeAttribute('open');
    }
  }

  function loadHistoryItem(index) {
    const item = history[index];
    if (!item || !MODES[item.mode]) return;

    state = {
      mode: item.mode,
      amount: String(item.amount),
      percent: String(item.percent)
    };

    els.amount.value = prettyEditable(state.amount);
    els.percent.value = prettyEditable(state.percent);
    closeHistory();
    render();

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    showToast('Расчёт открыт');
  }

  function updateViewport() {
    const viewport = window.visualViewport;
    if (!viewport) {
      document.documentElement.style.setProperty('--viewport-height', '100dvh');
      document.documentElement.style.setProperty('--keyboard-offset', '0px');
      return;
    }

    const keyboardOffset = Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop
    );

    document.documentElement.style.setProperty('--viewport-height', `${viewport.height}px`);
    document.documentElement.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);
  }

  function setInputState(input, key, value) {
    const cleaned = cleanInput(value);
    state[key] = cleaned;
    input.value = editable(cleaned);
    render();
  }

  els.mode.addEventListener('change', () => {
    if (!MODES[els.mode.value]) return;
    state.mode = els.mode.value;
    render();
  });

  els.amount.addEventListener('input', (event) => {
    setInputState(els.amount, 'amount', event.target.value);
  });

  els.percent.addEventListener('input', (event) => {
    setInputState(els.percent, 'percent', event.target.value);
  });

  els.amount.addEventListener('focus', () => {
    els.amount.value = editable(state.amount);
  });

  els.percent.addEventListener('focus', () => {
    els.percent.value = editable(state.percent);
  });

  els.amount.addEventListener('blur', () => {
    if (state.amount) els.amount.value = prettyEditable(state.amount);
  });

  els.percent.addEventListener('blur', () => {
    if (state.percent) els.percent.value = prettyEditable(state.percent);
  });

  els.amount.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      els.percent.focus();
    }
  });

  els.percent.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') els.percent.blur();
  });

  els.quickPercent.forEach((button) => {
    button.addEventListener('click', () => {
      state.percent = button.dataset.percent;
      els.percent.value = prettyEditable(state.percent);
      render();
    });
  });

  els.copy.addEventListener('click', copyResult);
  els.save.addEventListener('click', saveCurrent);
  els.reset.addEventListener('click', resetCalculator);
  els.historyButton.addEventListener('click', openHistory);
  els.closeHistory.addEventListener('click', closeHistory);

  els.clearHistory.addEventListener('click', () => {
    history = [];
    persistHistory();
    renderHistory();
    showToast('История очищена');
  });

  els.historyList.addEventListener('click', (event) => {
    const button = event.target.closest('.history-item');
    if (button) loadHistoryItem(Number(button.dataset.index));
  });

  els.historyDialog.addEventListener('click', (event) => {
    if (event.target === els.historyDialog) closeHistory();
  });

  loadState();
  loadHistory();
  render();

  if (state.amount) els.amount.value = prettyEditable(state.amount);
  if (state.percent) els.percent.value = prettyEditable(state.percent);

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  document.documentElement.toggleAttribute('data-standalone', standalone);

  updateViewport();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', updateViewport, { passive: true });
  }
  window.addEventListener('resize', updateViewport, { passive: true });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Offline support is progressive and must never block calculations.
      });
    });
  }
})();
