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
      amountHint: 'Сумма до удержания процента'
    },
    add: {
      resultLabel: 'После добавления',
      amountLabel: 'Сумма',
      amountHint: 'Сумма до начисления процента'
    },
    reverse: {
      resultLabel: 'Сумма до вычета',
      amountLabel: 'После вычета',
      amountHint: 'Сумма, которая осталась после удержания'
    }
  };

  const els = {
    amount: document.getElementById('amountInput'),
    percent: document.getElementById('percentInput'),
    amountLabel: document.getElementById('amountLabel'),
    amountHint: document.getElementById('amountHint'),
    percentHint: document.getElementById('percentHint'),
    resultLabel: document.getElementById('resultLabel'),
    resultBadge: document.getElementById('resultBadge'),
    resultValue: document.getElementById('resultValue'),
    resultCaption: document.getElementById('resultCaption'),
    copy: document.getElementById('copyButton'),
    save: document.getElementById('saveButton'),
    reset: document.getElementById('resetButton'),
    historySection: document.getElementById('historySection'),
    historyList: document.getElementById('historyList'),
    clearHistory: document.getElementById('clearHistoryButton'),
    toast: document.getElementById('toast'),
    segments: [...document.querySelectorAll('.segment')],
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
    const rounded = Math.abs(value) < 0.005 ? 0 : value;
    return `${numberFormatter.format(rounded)} ₽`;
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

    const [whole, ...fractionParts] = normalized.split('.');
    const joined = fractionParts.length ? `${whole}.${fractionParts.join('')}` : whole;
    return Number(joined);
  }

  function cleanInput(raw) {
    const normalized = String(raw)
      .replace(/[\s\u00a0\u202f]/g, '')
      .replace(/,/g, '.')
      .replace(/[^0-9.]/g, '');
    const firstDot = normalized.indexOf('.');

    if (firstDot === -1) return normalized.slice(0, 15);

    const whole = normalized.slice(0, firstDot).slice(0, 15);
    const decimals = normalized.slice(firstDot + 1).replace(/\./g, '').slice(0, 4);
    return `${whole}.${decimals}`;
  }

  function displayEditable(value) {
    return String(value).replace('.', ',');
  }

  function calculate() {
    const amount = parseNumber(state.amount);
    const percent = parseNumber(state.percent);

    const baseValid = Number.isFinite(amount) && amount >= 0 && Number.isFinite(percent) && percent >= 0;
    if (!baseValid) return { valid: false, reason: 'Укажите сумму и процент' };

    if (state.mode === 'reverse' && percent >= 100) {
      return { valid: false, reason: 'Для обратного расчёта процент должен быть меньше 100' };
    }

    if (state.mode === 'subtract' && percent > 100) {
      return { valid: false, reason: 'Для вычитания укажите процент не больше 100' };
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

    return { valid: true, amount, percent, result, delta, mode: state.mode };
  }

  function expressionFor(calc) {
    const amount = formatMoney(calc.amount);
    const result = formatMoney(calc.result);
    const percent = formatPercent(calc.percent);

    if (calc.mode === 'subtract') return `${amount} − ${percent} = ${result}`;
    if (calc.mode === 'add') return `${amount} + ${percent} = ${result}`;
    return `После ${percent}: ${amount} → до вычета ${result}`;
  }

  function render() {
    const mode = MODES[state.mode];
    const calc = calculate();

    els.amountLabel.textContent = mode.amountLabel;
    els.amountHint.textContent = mode.amountHint;
    els.resultLabel.textContent = mode.resultLabel;

    els.segments.forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });

    const selectedPercent = parseNumber(state.percent);
    els.quickPercent.forEach((button) => {
      button.classList.toggle('is-selected', Number(button.dataset.percent) === selectedPercent);
    });

    if (!calc.valid) {
      currentCalculation = null;
      els.resultValue.textContent = '0 ₽';
      els.resultBadge.textContent = state.mode === 'add' ? '+ 0 ₽' : state.mode === 'reverse' ? '+ 0 ₽' : '− 0 ₽';
      els.resultCaption.textContent = calc.reason;
      els.copy.disabled = true;
      els.save.disabled = true;
      els.percent.setAttribute('aria-invalid', calc.reason.includes('процент') && state.percent ? 'true' : 'false');
      persistState();
      return;
    }

    currentCalculation = calc;
    els.resultValue.textContent = formatMoney(calc.result);
    els.resultBadge.textContent = `${calc.mode === 'subtract' ? '−' : '+'} ${formatMoney(calc.delta)}`;
    els.resultCaption.textContent = expressionFor(calc);
    els.copy.disabled = false;
    els.save.disabled = false;
    els.percent.setAttribute('aria-invalid', 'false');
    persistState();
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE.state, JSON.stringify(state));
    } catch (_) {
      // Local storage is optional; the calculator itself still works.
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

    els.amount.value = displayEditable(state.amount);
    els.percent.value = displayEditable(state.percent);
  }

  function persistHistory() {
    try {
      localStorage.setItem(STORAGE.history, JSON.stringify(history));
    } catch (_) {
      // History is a convenience feature only.
    }
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
      history = Array.isArray(saved) ? saved.slice(0, 8) : [];
    } catch (_) {
      history = [];
    }
    renderHistory();
  }

  function renderHistory() {
    els.historyList.replaceChildren();
    els.historySection.hidden = history.length === 0;

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
    history = history.slice(0, 8);
    persistHistory();
    renderHistory();
    showToast('Расчёт сохранён');
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 1800);
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

  function setMode(mode) {
    if (!MODES[mode]) return;
    state.mode = mode;
    render();
  }

  function resetCalculator() {
    state = { mode: 'subtract', amount: '', percent: '15' };
    els.amount.value = '';
    els.percent.value = '15';
    render();
    els.amount.focus({ preventScroll: true });
    showToast('Расчёт сброшен');
  }

  function loadHistoryItem(index) {
    const item = history[index];
    if (!item || !MODES[item.mode]) return;

    state = {
      mode: item.mode,
      amount: String(item.amount),
      percent: String(item.percent)
    };
    els.amount.value = displayEditable(state.amount);
    els.percent.value = displayEditable(state.percent);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Расчёт открыт');
  }

  function updateViewport() {
    const viewport = window.visualViewport;
    if (!viewport) return;

    document.documentElement.style.setProperty('--viewport-height', `${viewport.height}px`);
    const keyboardOpen = viewport.height < window.innerHeight - 120;
    document.body.classList.toggle('keyboard-open', keyboardOpen);
  }

  els.amount.addEventListener('input', (event) => {
    const cleaned = cleanInput(event.target.value);
    state.amount = cleaned;
    if (event.target.value !== displayEditable(cleaned)) event.target.value = displayEditable(cleaned);
    render();
  });

  els.percent.addEventListener('input', (event) => {
    const cleaned = cleanInput(event.target.value);
    state.percent = cleaned;
    if (event.target.value !== displayEditable(cleaned)) event.target.value = displayEditable(cleaned);
    render();
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

  els.segments.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  els.quickPercent.forEach((button) => {
    button.addEventListener('click', () => {
      state.percent = button.dataset.percent;
      els.percent.value = state.percent;
      render();
    });
  });

  els.copy.addEventListener('click', copyResult);
  els.save.addEventListener('click', saveCurrent);
  els.reset.addEventListener('click', resetCalculator);

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

  loadState();
  loadHistory();
  render();
  updateViewport();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewport);
    window.visualViewport.addEventListener('scroll', updateViewport);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Offline support is progressive; never block the calculator if registration fails.
      });
    });
  }
})();
