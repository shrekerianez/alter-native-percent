(() => {
  'use strict';

  const APP_VERSION = window.APP_VERSION || '27.9';
  const DEFAULT_PRESETS = [5, 6, 15, 20];
  const MAX_HISTORY = 30;

  const STORAGE = {
    state: 'alternative-percent-state-v1',
    history: 'alternative-percent-history-v1',
    presets: 'alternative-percent-presets-v1'
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
    resultCopy: document.getElementById('resultCopyButton'),
    copy: document.getElementById('copyButton'),
    share: document.getElementById('shareButton'),
    save: document.getElementById('saveButton'),
    reset: document.getElementById('resetButton'),
    historyButton: document.getElementById('historyButton'),
    historyDialog: document.getElementById('historyDialog'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    clearHistory: document.getElementById('clearHistoryButton'),
    closeHistory: document.getElementById('closeHistoryButton'),
    presetDialog: document.getElementById('presetDialog'),
    presetInput: document.getElementById('presetInput'),
    cancelPreset: document.getElementById('cancelPresetButton'),
    savePreset: document.getElementById('savePresetButton'),
    updateBanner: document.getElementById('updateBanner'),
    updateButton: document.getElementById('updateButton'),
    appVersion: document.getElementById('appVersion'),
    toast: document.getElementById('toast'),
    quickPercent: [...document.querySelectorAll('[data-preset-index]')]
  };

  let state = { mode: 'subtract', amount: '', percent: '15' };
  let presets = [...DEFAULT_PRESETS];
  let history = [];
  let currentCalculation = null;
  let toastTimer = null;
  let editingPresetIndex = -1;
  let presetPress = null;
  let suppressPresetClick = false;
  let swipe = null;
  let swRegistration = null;
  let reloadingForUpdate = false;

  const numberFormatter = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  function formatMoney(value) {
    if (!Number.isFinite(value)) return '0 ₽';
    const normalized = Math.abs(value) < 0.005 ? 0 : value;
    return `${numberFormatter.format(normalized)} ₽`;
  }

  function formatPercent(value) {
    return `${numberFormatter.format(value)}%`;
  }

  function formatDate(value) {
    if (!Number.isFinite(Number(value))) return '';
    try { return dateFormatter.format(new Date(Number(value))); } catch (_) { return ''; }
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

  const editable = (value) => String(value).replace('.', ',');

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
    if (percent > 10000) return { valid: false, reason: 'Слишком большой процент' };

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
    return `${amount} после ${percent} → ${result} до вычета`;
  }

  function persist(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
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
    } catch (_) {}
    els.mode.value = state.mode;
    els.amount.value = editable(state.amount);
    els.percent.value = editable(state.percent);
  }

  function loadPresets() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.presets) || 'null');
      if (Array.isArray(saved) && saved.length === 4 && saved.every((v) => Number.isFinite(Number(v)))) {
        presets = saved.map(Number);
      }
    } catch (_) {}
    renderPresets();
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');
      history = Array.isArray(saved) ? saved.slice(0, MAX_HISTORY) : [];
    } catch (_) { history = []; }
    renderHistory();
  }

  function renderPresets() {
    els.quickPercent.forEach((button) => {
      const index = Number(button.dataset.presetIndex);
      const value = presets[index] ?? DEFAULT_PRESETS[index];
      button.dataset.percent = String(value);
      button.textContent = formatPercent(value);
      button.setAttribute('aria-label', `${formatPercent(value)}. Удерживайте, чтобы изменить`);
    });
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
      const selected = Number(button.dataset.percent) === selectedPercent;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    if (!calc.valid) {
      currentCalculation = null;
      els.resultValue.textContent = '0 ₽';
      els.resultBadge.textContent = `${mode.deltaSign} 0 ₽`;
      els.resultCaption.textContent = calc.reason;
      els.copy.disabled = true;
      els.share.disabled = true;
      els.save.disabled = true;
      els.resultCopy.disabled = true;
      els.percent.setAttribute('aria-invalid', String(calc.reason.includes('процент') && Boolean(state.percent)));
      persist(STORAGE.state, state);
      return;
    }

    currentCalculation = calc;
    els.resultValue.textContent = formatMoney(calc.result);
    els.resultBadge.textContent = `${mode.deltaSign} ${formatMoney(calc.delta)}`;
    els.resultCaption.textContent = expressionFor(calc);
    els.copy.disabled = false;
    els.share.disabled = false;
    els.save.disabled = false;
    els.resultCopy.disabled = false;
    els.resultCopy.setAttribute('aria-label', `Скопировать результат ${formatMoney(calc.result)}`);
    els.percent.setAttribute('aria-invalid', 'false');
    persist(STORAGE.state, state);
  }

  function historySvgCopy() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3Zm2 0h5a2 2 0 0 1 2 2v5h2V5h-9v2Zm5 2H5v10h10V9Z"/></svg>';
  }

  function renderHistory() {
    els.historyList.replaceChildren();
    const empty = history.length === 0;
    els.historyEmpty.hidden = !empty;
    els.historyList.hidden = empty;
    els.clearHistory.disabled = empty;

    history.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.dataset.index = String(index);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'history-delete';
      deleteButton.textContent = 'Удалить';
      deleteButton.setAttribute('aria-label', 'Удалить расчёт');

      const surface = document.createElement('div');
      surface.className = 'history-surface';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'history-item';

      const copy = document.createElement('span');
      copy.className = 'history-copy';

      const time = document.createElement('span');
      time.className = 'history-time';
      time.textContent = formatDate(item.createdAt);

      const expression = document.createElement('span');
      expression.className = 'history-expression';
      expression.textContent = item.expression || '';

      const result = document.createElement('span');
      result.className = 'history-result';
      result.textContent = formatMoney(Number(item.result));

      const chevron = document.createElement('span');
      chevron.className = 'history-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›';

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'history-copy-action';
      copyButton.innerHTML = historySvgCopy();
      copyButton.setAttribute('aria-label', 'Скопировать результат');

      copy.append(time, expression, result);
      openButton.append(copy, chevron);
      openButton.setAttribute('aria-label', `Открыть расчёт: ${item.expression || formatMoney(Number(item.result))}`);
      surface.append(openButton, copyButton);
      row.append(deleteButton, surface);
      els.historyList.append(row);
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
    history = history.filter((old) => !(old.mode === item.mode && old.amount === item.amount && old.percent === item.percent));
    history.unshift(item);
    history = history.slice(0, MAX_HISTORY);
    persist(STORAGE.history, history);
    renderHistory();
    showToast('Расчёт сохранён');
  }

  function deleteHistory(index) {
    if (!history[index]) return;
    history.splice(index, 1);
    persist(STORAGE.history, history);
    renderHistory();
    showToast('Расчёт удалён');
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 1600);
  }

  async function copyText(text, toastMessage = 'Скопировано') {
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
    showToast(toastMessage);
  }

  function copyResult() {
    if (!currentCalculation) return;
    return copyText(formatMoney(currentCalculation.result), 'Результат скопирован');
  }

  async function shareCurrent() {
    if (!currentCalculation) return;
    const text = expressionFor(currentCalculation);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'AlterNative — Проценты', text });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    await copyText(text, 'Расчёт скопирован');
  }

  function resetCalculator() {
    state = { mode: state.mode, amount: '', percent: state.percent || '15' };
    els.amount.value = '';
    els.percent.value = prettyEditable(state.percent);
    render();
    els.amount.focus({ preventScroll: true });
    showToast('Сумма сброшена');
  }

  function openHistory() {
    renderHistory();
    if (typeof els.historyDialog.showModal === 'function') els.historyDialog.showModal();
    else els.historyDialog.setAttribute('open', '');
  }

  function closeHistory() {
    if (typeof els.historyDialog.close === 'function' && els.historyDialog.open) els.historyDialog.close();
    else els.historyDialog.removeAttribute('open');
  }

  function loadHistoryItem(index) {
    const item = history[index];
    if (!item || !MODES[item.mode]) return;
    state = { mode: item.mode, amount: String(item.amount), percent: String(item.percent) };
    els.amount.value = prettyEditable(state.amount);
    els.percent.value = prettyEditable(state.percent);
    closeHistory();
    render();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    showToast('Расчёт открыт');
  }

  function openPresetEditor(index) {
    editingPresetIndex = index;
    els.presetInput.value = editable(String(presets[index]));
    if (typeof els.presetDialog.showModal === 'function') els.presetDialog.showModal();
    else els.presetDialog.setAttribute('open', '');
    window.setTimeout(() => {
      els.presetInput.focus({ preventScroll: true });
      els.presetInput.select();
    }, 60);
  }

  function closePresetEditor() {
    if (typeof els.presetDialog.close === 'function' && els.presetDialog.open) els.presetDialog.close();
    else els.presetDialog.removeAttribute('open');
    editingPresetIndex = -1;
  }

  function savePresetValue() {
    const cleaned = cleanInput(els.presetInput.value);
    const value = parseNumber(cleaned);
    if (!Number.isFinite(value) || value < 0 || value > 10000 || editingPresetIndex < 0) {
      showToast('Введите корректный процент');
      return;
    }
    presets[editingPresetIndex] = value;
    persist(STORAGE.presets, presets);
    renderPresets();
    state.percent = String(value);
    els.percent.value = prettyEditable(state.percent);
    closePresetEditor();
    render();
    showToast('Быстрый процент сохранён');
  }

  function setInputState(input, key, value) {
    const cleaned = cleanInput(value);
    state[key] = cleaned;
    input.value = editable(cleaned);
    render();
  }

  function setupPresetGestures() {
    els.quickPercent.forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const index = Number(button.dataset.presetIndex);
        presetPress = {
          button,
          index,
          x: event.clientX,
          y: event.clientY,
          timer: window.setTimeout(() => {
            suppressPresetClick = true;
            openPresetEditor(index);
          }, 520)
        };
      });

      button.addEventListener('pointermove', (event) => {
        if (!presetPress || presetPress.button !== button) return;
        if (Math.hypot(event.clientX - presetPress.x, event.clientY - presetPress.y) > 10) {
          window.clearTimeout(presetPress.timer);
          presetPress = null;
        }
      });

      const cancelPress = () => {
        if (!presetPress || presetPress.button !== button) return;
        window.clearTimeout(presetPress.timer);
        presetPress = null;
      };
      button.addEventListener('pointerup', cancelPress);
      button.addEventListener('pointercancel', cancelPress);

      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        suppressPresetClick = true;
        openPresetEditor(Number(button.dataset.presetIndex));
      });

      button.addEventListener('click', (event) => {
        if (suppressPresetClick) {
          event.preventDefault();
          suppressPresetClick = false;
          return;
        }
        state.percent = button.dataset.percent;
        els.percent.value = prettyEditable(state.percent);
        render();
      });
    });
  }

  function setupHistoryGestures() {
    els.historyList.addEventListener('pointerdown', (event) => {
      const surface = event.target.closest('.history-surface');
      if (!surface) return;
      const row = surface.closest('.history-row');
      swipe = { row, surface, x: event.clientX, y: event.clientY, dx: 0, active: true };
      try { surface.setPointerCapture(event.pointerId); } catch (_) {}
    });

    els.historyList.addEventListener('pointermove', (event) => {
      if (!swipe || !swipe.active) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      if (Math.abs(dy) > Math.abs(dx) + 12) {
        swipe.active = false;
        swipe.surface.style.transform = '';
        return;
      }
      swipe.dx = Math.max(-82, Math.min(0, dx));
      swipe.surface.style.transition = 'none';
      swipe.surface.style.transform = `translateX(${swipe.dx}px)`;
    });

    const finishSwipe = () => {
      if (!swipe) return;
      swipe.surface.style.transition = '';
      swipe.surface.style.transform = '';
      swipe.row.classList.toggle('is-revealed', swipe.active && swipe.dx < -34);
      swipe = null;
    };
    els.historyList.addEventListener('pointerup', finishSwipe);
    els.historyList.addEventListener('pointercancel', finishSwipe);

    els.historyList.addEventListener('click', (event) => {
      const row = event.target.closest('.history-row');
      if (!row) return;
      const index = Number(row.dataset.index);

      if (event.target.closest('.history-delete')) {
        deleteHistory(index);
        return;
      }
      if (event.target.closest('.history-copy-action')) {
        const item = history[index];
        if (item) copyText(formatMoney(Number(item.result)), 'Результат скопирован');
        return;
      }
      if (event.target.closest('.history-item')) {
        if (row.classList.contains('is-revealed')) {
          row.classList.remove('is-revealed');
          return;
        }
        loadHistoryItem(index);
      }
    });
  }

  function setupKeyboard() {
    const root = document.documentElement;
    const body = document.body;
    const viewport = window.visualViewport;
    const numericInputs = new Set([els.amount, els.percent, els.presetInput]);
    let keyboardOpen = false;
    let scrollTimer = 0;

    const activeNumericInput = () => numericInputs.has(document.activeElement);

    function keyboardIsVisible() {
      if (!activeNumericInput() || !viewport) return false;
      const reduction = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      return reduction > 120 || viewport.height < window.innerHeight * 0.82;
    }

    function revealActiveInput() {
      if (!activeNumericInput()) return;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const target = document.activeElement.closest('.input-row, .preset-editor');
        if (target) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      }, 90);
    }

    function syncKeyboard() {
      const open = keyboardIsVisible();
      if (open !== keyboardOpen) {
        keyboardOpen = open;
        body.classList.toggle('keyboard-open', open);
        root.toggleAttribute('data-keyboard-open', open);
      }
      if (open) revealActiveInput();
    }

    document.addEventListener('focusin', (event) => {
      if (!numericInputs.has(event.target)) return;
      window.setTimeout(syncKeyboard, 60);
      window.setTimeout(syncKeyboard, 180);
    });
    document.addEventListener('focusout', (event) => {
      if (!numericInputs.has(event.target)) return;
      window.setTimeout(syncKeyboard, 180);
      window.setTimeout(syncKeyboard, 360);
    });
    if (viewport) {
      viewport.addEventListener('resize', syncKeyboard, { passive: true });
      viewport.addEventListener('scroll', syncKeyboard, { passive: true });
    }
    window.addEventListener('resize', syncKeyboard, { passive: true });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') root.setAttribute('data-input-modality', 'keyboard');
    }, true);
    const pointerMode = () => root.setAttribute('data-input-modality', 'pointer');
    document.addEventListener('pointerdown', pointerMode, true);
    document.addEventListener('touchstart', pointerMode, { capture: true, passive: true });
  }

  function showUpdate() {
    els.updateBanner.hidden = false;
  }

  async function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js');
      if (swRegistration.waiting) showUpdate();

      swRegistration.addEventListener('updatefound', () => {
        const worker = swRegistration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      });

      await swRegistration.update();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && swRegistration) swRegistration.update().catch(() => {});
      });
      window.setInterval(() => swRegistration && swRegistration.update().catch(() => {}), 60 * 60 * 1000);
    } catch (_) {}
  }

  function applyUpdate() {
    if (swRegistration && swRegistration.waiting) {
      els.updateButton.disabled = true;
      els.updateButton.textContent = 'Обновляю…';
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else if (swRegistration) {
      swRegistration.update().catch(() => {});
    }
  }

  els.mode.addEventListener('change', () => {
    if (!MODES[els.mode.value]) return;
    state.mode = els.mode.value;
    render();
  });
  els.amount.addEventListener('input', (event) => setInputState(els.amount, 'amount', event.target.value));
  els.percent.addEventListener('input', (event) => setInputState(els.percent, 'percent', event.target.value));

  els.amount.addEventListener('focus', () => { els.amount.value = editable(state.amount); });
  els.percent.addEventListener('focus', () => { els.percent.value = editable(state.percent); });
  els.amount.addEventListener('blur', () => { if (state.amount) els.amount.value = prettyEditable(state.amount); });
  els.percent.addEventListener('blur', () => { if (state.percent) els.percent.value = prettyEditable(state.percent); });

  els.amount.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); els.percent.focus(); }
  });
  els.percent.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') els.percent.blur();
  });

  els.copy.addEventListener('click', copyResult);
  els.resultCopy.addEventListener('click', copyResult);
  els.share.addEventListener('click', shareCurrent);
  els.save.addEventListener('click', saveCurrent);
  els.reset.addEventListener('click', resetCalculator);
  els.historyButton.addEventListener('click', openHistory);
  els.closeHistory.addEventListener('click', closeHistory);
  els.updateButton.addEventListener('click', applyUpdate);

  els.clearHistory.addEventListener('click', () => {
    history = [];
    persist(STORAGE.history, history);
    renderHistory();
    showToast('История очищена');
  });

  els.historyDialog.addEventListener('click', (event) => {
    if (event.target === els.historyDialog) closeHistory();
  });
  els.historyDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeHistory();
  });

  els.cancelPreset.addEventListener('click', closePresetEditor);
  els.savePreset.addEventListener('click', savePresetValue);
  els.presetInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); savePresetValue(); }
  });
  els.presetDialog.addEventListener('click', (event) => {
    if (event.target === els.presetDialog) closePresetEditor();
  });
  els.presetDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePresetEditor();
  });

  els.appVersion.textContent = `AlterNative · версия ${APP_VERSION}`;
  els.appVersion.setAttribute('aria-label', `Версия приложения ${APP_VERSION}`);

  loadState();
  loadPresets();
  loadHistory();
  render();
  if (state.amount) els.amount.value = prettyEditable(state.amount);
  if (state.percent) els.percent.value = prettyEditable(state.percent);

  setupPresetGestures();
  setupHistoryGestures();
  setupKeyboard();

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  document.documentElement.toggleAttribute('data-standalone', standalone);
  document.documentElement.classList.remove('app-loading');
  document.documentElement.classList.add('app-ready');

  window.addEventListener('load', setupServiceWorker, { once: true });
})();
