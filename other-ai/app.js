/**
 * AlterNative «Калькулятор процентов»
 * WebKit First Architecture • iOS 27 Ready • Zero Dependencies
 */

(() => {
  'use strict';

  const STORAGE_KEY_STATE = 'alternative_percent_state_v1';
  const STORAGE_KEY_HISTORY_FALLBACK = 'alternative_percent_history_v1';
  const DB_NAME = 'AlterNativePercentDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'calculations';

  const CURRENCIES = ['₽', '$', '€', '₸', 'BYN'];

  // Состояние приложения по умолчанию
  const state = {
    mode: 'subtract',       // 'subtract' | 'add' | 'reverse' | 'compare'
    activeField: 'amount',  // 'amount' | 'percent'
    amountRaw: '100000',
    percentRaw: '15',
    currencyIndex: 0,
    overwriteOnNextInput: true,
    lastCalculation: null
  };

  // Кэш DOM-элементов
  const dom = {
    currencyBtn: document.getElementById('btn-currency'),
    currencySymbol: document.getElementById('currency-symbol'),
    modeTabs: document.querySelectorAll('.mode-tab'),
    segmentIndicator: document.getElementById('segment-indicator'),
    fieldAmount: document.getElementById('field-amount'),
    fieldPercent: document.getElementById('field-percent'),
    labelAmount: document.getElementById('label-amount'),
    labelPercent: document.getElementById('label-percent'),
    displayAmount: document.getElementById('display-amount'),
    displayPercent: document.getElementById('display-percent'),
    unitAmount: document.getElementById('unit-amount'),
    unitPercent: document.getElementById('unit-percent'),
    presetsBar: document.getElementById('presets-bar'),
    presetChips: document.querySelectorAll('.preset-chip'),
    labelResult: document.getElementById('label-result'),
    displayResult: document.getElementById('display-result'),
    breakdownKey1: document.getElementById('breakdown-key-1'),
    breakdownVal1: document.getElementById('breakdown-val-1'),
    breakdownKey2: document.getElementById('breakdown-key-2'),
    breakdownVal2: document.getElementById('breakdown-val-2'),
    btnChainResult: document.getElementById('btn-chain-result'),
    btnSaveCalc: document.getElementById('btn-save-calc'),
    btnCopyCalc: document.getElementById('btn-copy-calc'),
    btnShareCalc: document.getElementById('btn-share-calc'),
    numKeys: document.querySelectorAll('.num-key'),
    btnOpenHistory: document.getElementById('btn-open-history'),
    btnCloseHistory: document.getElementById('btn-close-history'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    historySheet: document.getElementById('history-sheet'),
    historyList: document.getElementById('history-list'),
    historyCount: document.getElementById('history-count'),
    toastContainer: document.getElementById('toast-container'),
    updateBanner: document.getElementById('update-banner'),
    btnApplyUpdate: document.getElementById('btn-apply-update')
  };

  /* ========================================================================
     1. WebKit Нативная тактильная отдача (iOS Taptic Engine)
     ======================================================================== */
  // На iOS 26.5+ программный .click() больше не создаёт отклик.
  // На iPhone ниже добавляются реальные касаемые switch-контролы поверх кнопок.
  // На других устройствах используем стандартный Vibration API, если он доступен.
  function triggerHaptic() {
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
    } catch (_) {}
  }

  function enableNativeTouchFeedback() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return;

    // Оверлеи ставим только на неподвижные элементы.
    // На горизонтальных пресетах и прокручиваемом журнале switch мешал бы свайпам.
    const targets = document.querySelectorAll(
      '.num-key, .mode-tab, .glass-pill-btn, .chain-btn, .card-actions .action-btn'
    );

    targets.forEach((button) => {
      if (button.disabled || !button.parentNode) return;

      const hitbox = document.createElement('span');
      hitbox.className = 'native-haptic-hitbox';
      if (button.classList.contains('zero-key')) hitbox.classList.add('wide-key');
      button.parentNode.insertBefore(hitbox, button);
      hitbox.appendChild(button);

      const switchInput = document.createElement('input');
      switchInput.type = 'checkbox';
      switchInput.setAttribute('switch', '');
      switchInput.className = 'native-haptic-overlay';
      switchInput.setAttribute('aria-label',
        button.getAttribute('aria-label') || button.textContent.trim().replace(/\s+/g, ' ')
      );
      // Реальный touch попадает на native switch. Его change активирует исходную кнопку.
      switchInput.addEventListener('change', () => {
        hitbox.classList.add('haptic-pressed');
        button.click();
        window.setTimeout(() => hitbox.classList.remove('haptic-pressed'), 105);
      });
      hitbox.appendChild(switchInput);
      button.tabIndex = -1;
    });
  }

  /* ========================================================================
     2. Точная финансовая математика и форматирование
     ======================================================================== */
  // Вводимых знаков после запятой не более двух.
  // Денежная арифметика в целых копейках (BigInt), округление половин вверх.
  const toMinorUnits = (raw) => {
    const value = String(raw || '0').replace(',', '.');
    if (!/^\d{1,11}(?:\.\d{0,2})?$/.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  };

  function divideRounded(numerator, denominator) {
    if (denominator <= 0n) throw new RangeError('Деление на ноль');
    return numerator >= 0n
      ? (numerator + denominator / 2n) / denominator
      : -((-numerator + denominator / 2n) / denominator);
  }

  function roundMoney(num) {
    if (!Number.isFinite(num)) return 0;
    return Number(num.toFixed(2));
  }

  function parseRaw(rawStr) {
    if (!rawStr || rawStr === '-') return 0;
    const normalized = String(rawStr).replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const numberFormatter = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  function formatNumber(num) {
    if (!Number.isFinite(num)) return '—';
    return numberFormatter.format(roundMoney(num));
  }

  function formatRawInputDisplay(rawStr) {
    if (!rawStr) return '0';
    const parts = String(rawStr).split('.');
    const intPart = parseInt(parts[0] || '0', 10);
    const formattedInt = Number.isFinite(intPart)
      ? intPart.toLocaleString('ru-RU')
      : '0';
    if (parts.length > 1) {
      return `${formattedInt},${parts[1]}`;
    }
    return formattedInt;
  }

  function getCurrency() {
    return CURRENCIES[state.currencyIndex] || '₽';
  }

  /* ========================================================================
     3. Ядро расчётов по 4 сценариям
     ======================================================================== */
  function compute() {
    const amount = parseRaw(state.amountRaw);
    const percent = parseRaw(state.percentRaw);
    const amountCents = toMinorUnits(state.amountRaw);
    const percentHundredths = toMinorUnits(state.percentRaw);
    const cur = getCurrency();

    let resultValue = 0;
    let deltaValue = 0;
    let isError = false;
    let errorMessage = '';
    let formulaText = '';
    let summaryText = '';
    let resultCents = 0n;
    let deltaCents = 0n;

    if (amountCents === null || percentHundredths === null) {
      isError = true;
      errorMessage = 'Некорректное число';
      formulaText = 'Проверьте введённые значения';
    } else if (state.mode === 'reverse' && percentHundredths >= 10000n) {
      isError = true;
      errorMessage = 'Удержание ≥ 100% невозможно';
      formulaText = 'Процент должен быть меньше 100';
    } else if (state.mode === 'compare' && percentHundredths === 0n) {
      isError = true;
      errorMessage = 'База сравнения равна 0';
      formulaText = 'Введите вторую сумму больше 0';
    } else {
      switch (state.mode) {
        case 'subtract':
          deltaCents = divideRounded(amountCents * percentHundredths, 10000n);
          resultCents = amountCents - deltaCents;
          formulaText = `${formatNumber(amount)} − ${formatNumber(percent)}%`;
          break;
        case 'add':
          deltaCents = divideRounded(amountCents * percentHundredths, 10000n);
          resultCents = amountCents + deltaCents;
          formulaText = `${formatNumber(amount)} + ${formatNumber(percent)}%`;
          break;
        case 'reverse':
          resultCents = divideRounded(amountCents * 10000n, 10000n - percentHundredths);
          deltaCents = resultCents - amountCents;
          formulaText = `${formatNumber(amount)} ÷ (1 − ${formatNumber(percent / 100)})`;
          break;
        case 'compare':
          // resultCents хранит сотые доли процента.
          resultCents = divideRounded(amountCents * 10000n, percentHundredths);
          deltaCents = amountCents - percentHundredths;
          formulaText = `(${formatNumber(amount)} ÷ ${formatNumber(percent)}) × 100%`;
          break;
        default:
          isError = true;
          errorMessage = 'Неизвестный режим';
      }

      if (!isError && (!Number.isSafeInteger(Number(resultCents)) ||
          !Number.isSafeInteger(Number(deltaCents)))) {
        isError = true;
        errorMessage = 'Слишком большая сумма';
        formulaText = 'Уменьшите вводимые значения';
      }
    }

    if (!isError) {
      resultValue = Number(resultCents) / 100;
      deltaValue = Number(deltaCents) / 100;
      if (state.mode === 'subtract') {
        summaryText = `${formatNumber(amount)} ${cur} − ${formatNumber(percent)}% = ${formatNumber(resultValue)} ${cur} (вычет: ${formatNumber(deltaValue)} ${cur})`;
      } else if (state.mode === 'add') {
        summaryText = `${formatNumber(amount)} ${cur} + ${formatNumber(percent)}% = ${formatNumber(resultValue)} ${cur} (наценка: +${formatNumber(deltaValue)} ${cur})`;
      } else if (state.mode === 'reverse') {
        summaryText = `После вычета ${formatNumber(percent)}% осталось ${formatNumber(amount)} ${cur} → Исходная сумма: ${formatNumber(resultValue)} ${cur} (удержано: ${formatNumber(deltaValue)} ${cur})`;
      } else {
        summaryText = `${formatNumber(amount)} ${cur} от ${formatNumber(percent)} ${cur} составляет ${formatNumber(resultValue)}% (разница: ${deltaValue >= 0 ? '+' : ''}${formatNumber(deltaValue)} ${cur})`;
      }
    }

    state.lastCalculation = {
      mode: state.mode, amount, percent, resultValue, deltaValue,
      currency: cur, isError, errorMessage, formulaText, summaryText,
      timestamp: Date.now()
    };

    renderUI();
    persistState();
  }

  /* ========================================================================
     4. Обновление интерфейса (Render UI)
     ======================================================================== */
  function renderUI() {
    const cur = getCurrency();
    const calc = state.lastCalculation;

    dom.currencySymbol.textContent = cur;
    dom.unitAmount.textContent = cur;
    dom.unitPercent.textContent = state.mode === 'compare' ? cur : '%';
    dom.presetsBar.hidden = state.mode === 'compare';
    dom.fieldAmount.setAttribute('aria-label', state.mode === 'compare' ? 'Первая сумма' : 'Поле ввода суммы');
    dom.fieldPercent.setAttribute('aria-label', state.mode === 'compare' ? 'Вторая сумма' : 'Поле ввода процента');
    dom.btnChainResult.disabled = calc.isError || state.mode === 'compare';
    dom.btnSaveCalc.disabled = calc.isError;
    dom.btnCopyCalc.disabled = calc.isError;
    dom.btnShareCalc.disabled = calc.isError;
    document.querySelectorAll('.step-key').forEach((key) => {
      key.disabled = state.mode === 'compare';
    });
    document.querySelectorAll('.native-haptic-hitbox').forEach((box) => {
      const button = box.querySelector('button');
      const overlay = box.querySelector('.native-haptic-overlay');
      if (button && overlay) overlay.disabled = button.disabled;
    });

    // Подсветка активного поля ввода
    dom.fieldAmount.classList.toggle('active', state.activeField === 'amount');
    dom.fieldPercent.classList.toggle('active', state.activeField === 'percent');

    // Отображение вводимых значений
    dom.displayAmount.textContent = formatRawInputDisplay(state.amountRaw);
    dom.displayPercent.textContent = formatRawInputDisplay(state.percentRaw);

    // Подписи полей в зависимости от выбранного режима
    const modeConfig = {
      subtract: {
        idx: 0,
        labelA: 'Исходная сумма',
        labelB: 'Процент вычета',
        labelRes: 'Остаток после вычета',
        key1: 'Сумма вычета / скидки:',
        prefix1: '−'
      },
      add: {
        idx: 1,
        labelA: 'Исходная сумма',
        labelB: 'Процент наценки',
        labelRes: 'Итоговая сумма с наценкой',
        key1: 'Сумма наценки / налога:',
        prefix1: '+'
      },
      reverse: {
        idx: 2,
        labelA: 'Сумма на руки (остаток)',
        labelB: 'Удержанный процент',
        labelRes: 'Первоначальная сумма (до вычета)',
        key1: 'Было удержано:',
        prefix1: ''
      },
      compare: {
        idx: 3,
        labelA: 'Первая сумма (Часть)',
        labelB: 'Вторая сумма (Целое)',
        labelRes: 'Доля первой суммы от второй',
        key1: 'Абсолютная разница:',
        prefix1: calc && calc.deltaValue > 0 ? '+' : ''
      }
    }[state.mode];

    // Перемещение стеклянного ползунка в Segmented Control
    dom.segmentIndicator.style.transform = `translateX(${modeConfig.idx * 100}%)`;
    dom.modeTabs.forEach((tab) => {
      const isSelected = tab.dataset.mode === state.mode;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', String(isSelected));
    });

    dom.labelAmount.textContent = modeConfig.labelA;
    dom.labelPercent.textContent = modeConfig.labelB;
    dom.labelResult.textContent = modeConfig.labelRes;

    // Подсветка активного пресета процента
    const currentPercentNum = parseRaw(state.percentRaw);
    dom.presetChips.forEach((chip) => {
      const chipVal = parseFloat(chip.dataset.percent);
      chip.classList.toggle('active', state.mode !== 'compare' && chipVal === currentPercentNum);
    });

    // Вывод результата
    if (calc.isError) {
      dom.displayResult.textContent = calc.errorMessage;
      dom.breakdownKey1.textContent = 'Статус:';
      dom.breakdownVal1.textContent = 'Проверьте параметры';
      dom.breakdownKey2.textContent = 'Подсказка:';
      dom.breakdownVal2.textContent = calc.formulaText;
    } else {
      const resultUnit = state.mode === 'compare' ? '%' : cur;
      dom.displayResult.textContent = `${formatNumber(calc.resultValue)} ${resultUnit}`;
      dom.breakdownKey1.textContent = modeConfig.key1;
      dom.breakdownVal1.textContent = `${modeConfig.prefix1}${formatNumber(calc.deltaValue)} ${cur}`;
      dom.breakdownKey2.textContent = 'Расчёт:';
      dom.breakdownVal2.textContent = calc.formulaText;
    }
  }

  /* ========================================================================
     5. Обработка ввода с тактильной и физической клавиатуры
     ======================================================================== */
  function getActiveRaw() {
    return state.activeField === 'amount' ? state.amountRaw : state.percentRaw;
  }

  function setActiveRaw(newVal) {
    if (state.activeField === 'amount') {
      state.amountRaw = newVal;
    } else {
      state.percentRaw = newVal;
    }
  }

  function handleKeyInput(key) {
    triggerHaptic();

    if (key === 'clear') {
      setActiveRaw('0');
      state.overwriteOnNextInput = true;
      compute();
      return;
    }

    if (key === 'switch-field') {
      state.activeField = state.activeField === 'amount' ? 'percent' : 'amount';
      state.overwriteOnNextInput = true;
      renderUI();
      return;
    }

    if (key === 'quick-save') {
      saveCurrentCalculation();
      return;
    }

    if (key === 'step-up' || key === 'step-down') {
      if (state.mode === 'compare') return;
      const delta = key === 'step-up' ? 1 : -1;
      const currentP = parseRaw(state.percentRaw);
      const nextP = Math.max(0, roundMoney(currentP + delta));
      state.percentRaw = String(nextP);
      compute();
      return;
    }

    if (key === 'backspace') {
      const current = getActiveRaw();
      if (current.length <= 1) {
        setActiveRaw('0');
        state.overwriteOnNextInput = true;
      } else {
        setActiveRaw(current.slice(0, -1));
      }
      compute();
      return;
    }

    // Ввод цифр и запятой
    const normalizedKey = key === ',' ? '.' : key;
    let current = getActiveRaw();

    if (state.overwriteOnNextInput && normalizedKey !== '.') {
      current = '';
      state.overwriteOnNextInput = false;
    } else if (state.overwriteOnNextInput && normalizedKey === '.') {
      current = '0';
      state.overwriteOnNextInput = false;
    }

    // Запрет второй десятичной точки
    if (normalizedKey === '.' && current.includes('.')) {
      return;
    }

    // Проверяем длину результата, включая клавиши «00» и «000».
    if (current === '0' && normalizedKey !== '.') current = '';
    const candidate = current + normalizedKey;
    const [whole, fraction = ''] = candidate.split('.');
    if (whole.length > 11 || fraction.length > 2) return;
    current = candidate;
    if (/^0{2,}(?!\.)/.test(current)) current = current.replace(/^0+(?=\d)/, '');
    setActiveRaw(current || '0');
    compute();
  }

  /* ========================================================================
     6. Цепочка расчётов, Копирование и Системный Шаринг
     ======================================================================== */
  function chainResultToBase() {
    const calc = state.lastCalculation;
    if (!calc || calc.isError) return;
    triggerHaptic();
    state.amountRaw = String(calc.resultValue);
    state.activeField = 'percent';
    state.overwriteOnNextInput = true;
    compute();
    showToast('Итог перенесён в исходную сумму');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;';
    document.body.appendChild(input);
    input.focus();
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    input.remove();
    return copied;
  }

  async function copyCurrentCalculation() {
    const calc = state.lastCalculation;
    if (!calc || calc.isError) return;
    triggerHaptic();
    showToast(await copyText(calc.summaryText)
      ? 'Расчёт скопирован'
      : 'Не удалось скопировать');
  }

  async function shareCurrentCalculation() {
    const calc = state.lastCalculation;
    if (!calc || calc.isError) return;
    triggerHaptic();

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AlterNative — Расчёт процентов',
          text: calc.summaryText
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    copyCurrentCalculation();
  }

  /* ========================================================================
     7. Хранилище: IndexedDB + LocalStorage Fallback для Журнала расчётов
     ======================================================================== */
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllSavedCalculations() {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.timestamp - a.timestamp));
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY_FALLBACK);
        return raw ? JSON.parse(raw) : [];
      } catch (_) { return []; }
    }
  }

  async function saveCurrentCalculation() {
    const calc = state.lastCalculation;
    if (!calc || calc.isError) return;
    triggerHaptic();

    const record = { ...calc, timestamp: Date.now() };

    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {
      try {
        const list = await getAllSavedCalculations();
        record.id = Date.now();
        list.unshift(record);
        localStorage.setItem(STORAGE_KEY_HISTORY_FALLBACK, JSON.stringify(list.slice(0, 100)));
      } catch (_) {
        showToast('Не удалось сохранить расчёт');
        return;
      }
    }

    await refreshHistoryUI();
    showToast('Расчёт сохранён в журнал');
  }

  async function deleteCalculationById(id) {
    triggerHaptic();
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(Number(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {
      const list = await getAllSavedCalculations();
      const filtered = list.filter((item) => item.id !== Number(id));
      localStorage.setItem(STORAGE_KEY_HISTORY_FALLBACK, JSON.stringify(filtered));
    }
    await refreshHistoryUI();
  }

  async function clearAllHistory() {
    if (!window.confirm('Удалить все сохранённые расчёты?')) return;
    triggerHaptic();
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {
      localStorage.removeItem(STORAGE_KEY_HISTORY_FALLBACK);
    }
    await refreshHistoryUI();
    showToast('Журнал очищен');
  }

  async function refreshHistoryUI() {
    const items = await getAllSavedCalculations();
    
    if (items.length > 0) {
      dom.historyCount.textContent = String(items.length);
      dom.historyCount.hidden = false;
      dom.btnClearHistory.hidden = false;
    } else {
      dom.historyCount.hidden = true;
      dom.btnClearHistory.hidden = true;
    }

    dom.historyList.innerHTML = '';

    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'empty-history';
      emptyEl.textContent = 'Сохранённых расчётов пока нет. Нажмите «Сохранить» или «★», чтобы зафиксировать важный расчёт.';
      dom.historyList.appendChild(emptyEl);
      return;
    }

    const modeNames = {
      subtract: '−% Вычет',
      add: '+% Наценка',
      reverse: '↺ До вычета',
      compare: 'Δ% Доля'
    };

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const timeStr = new Date(item.timestamp).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      const unit = item.mode === 'compare' ? '%' : item.currency;

      const mainMatchingDiv = document.createElement('div');
      mainMatchingDiv.className = 'history-card-main';
      const badgeRow = document.createElement('div');
      badgeRow.className = 'history-badge-row';
      const modeBadge = document.createElement('span');
      modeBadge.className = 'history-mode-tag';
      modeBadge.textContent = modeNames[item.mode] || 'Расчёт';
      const stamp = document.createElement('span');
      stamp.className = 'history-time';
      stamp.textContent = timeStr;
      badgeRow.append(modeBadge, stamp);
      const resultLine = document.createElement('div');
      resultLine.className = 'history-result-line';
      resultLine.textContent = `${formatNumber(item.resultValue)} ${unit}`;
      const metaLine = document.createElement('div');
      metaLine.className = 'history-meta-line';
      metaLine.textContent = item.formulaText;
      mainMatchingDiv.append(badgeRow, resultLine, metaLine);

      // Восстановление расчёта по тапу на карточку
      mainMatchingDiv.addEventListener('click', () => {
        triggerHaptic();
        state.mode = item.mode;
        state.amountRaw = String(item.amount);
        state.percentRaw = String(item.percent);
        state.overwriteOnNextInput = true;
        compute();
        dom.historySheet.hidden = true;
        showToast('Расчёт загружен из журнала');
      });

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'history-card-actions';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'icon-btn';
      copyBtn.setAttribute('aria-label', 'Скопировать запись');
      copyBtn.textContent = 'Копия';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        triggerHaptic();
        showToast(await copyText(item.summaryText) ? 'Запись скопирована' : 'Не удалось скопировать');
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn';
      delBtn.setAttribute('aria-label', 'Удалить запись');
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCalculationById(item.id);
      });

      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(delBtn);

      card.appendChild(mainMatchingDiv);
      card.appendChild(actionsDiv);
      dom.historyList.appendChild(card);
    });
  }

  /* ========================================================================
     8. Сохранение рабочего состояния между запусками
     ======================================================================== */
  function persistState() {
    try {
      const payload = {
        mode: state.mode,
        amountRaw: state.amountRaw,
        percentRaw: state.percentRaw,
        currencyIndex: state.currencyIndex
      };
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(payload));
    } catch (_) {}
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_STATE);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.mode) state.mode = saved.mode;
      if (saved.amountRaw) state.amountRaw = saved.amountRaw;
      if (saved.percentRaw) state.percentRaw = saved.percentRaw;
      if (typeof saved.currencyIndex === 'number') state.currencyIndex = saved.currencyIndex;
    } catch (_) {}
  }

  /* ========================================================================
     9. Всплывающие уведомления (Liquid Glass Toasts)
     ======================================================================== */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'glass-toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, 1900);
  }

  /* ========================================================================
     10. Привязка событий (Жесты свайпа, Клавиатура, Service Worker)
     ======================================================================== */
  function attachEvents() {
    // Переключение валюты
    dom.currencyBtn.addEventListener('click', () => {
      triggerHaptic();
      state.currencyIndex = (state.currencyIndex + 1) % CURRENCIES.length;
      compute();
    });

    // Переключение вкладок режимов
    dom.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        triggerHaptic();
        state.mode = tab.dataset.mode;
        state.overwriteOnNextInput = true;
        compute();
      });
    });

    // Выбор активного поля ввода + Свайп для удаления последнего символа
    [dom.fieldAmount, dom.fieldPercent].forEach((fieldEl) => {
      if (!fieldEl) return;
      let touchStartX = 0;

      fieldEl.addEventListener('click', () => {
        triggerHaptic();
        state.activeField = fieldEl.dataset.field;
        state.overwriteOnNextInput = true;
        renderUI();
      });

      fieldEl.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      fieldEl.addEventListener('touchend', (e) => {
        const deltaX = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(deltaX) > 42) {
          state.activeField = fieldEl.dataset.field;
          handleKeyInput('backspace');
        }
      }, { passive: true });
    });

    // Элементы двух интерактивных полей доступны также с физической клавиатуры.
    [dom.fieldAmount, dom.fieldPercent].forEach((el) => {
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.activeField = el.dataset.field;
          state.overwriteOnNextInput = true;
          renderUI();
        }
      });
    });

    // Быстрые пресеты процентов
    dom.presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        triggerHaptic();
        state.percentRaw = chip.dataset.percent;
        state.overwriteOnNextInput = true;
        compute();
      });
    });

    // Кнопки цифровой клавиатуры
    dom.numKeys.forEach((btn) => {
      btn.addEventListener('click', () => {
        handleKeyInput(btn.dataset.key);
      });
    });

    // Поддержка физической клавиатуры (iPad Magic Keyboard / macOS Safari)
    window.addEventListener('keydown', (e) => {
      if (!dom.historySheet.hidden) {
        if (e.key === 'Escape') dom.historySheet.hidden = true;
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.classList.contains('native-haptic-overlay')) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleKeyInput(e.key);
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        handleKeyInput(',');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeyInput('backspace');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleKeyInput('clear');
      } else if (e.key === 'Enter' && e.target === document.body) {
        e.preventDefault();
        saveCurrentCalculation();
      }
    });

    // Действия с результатом
    dom.btnChainResult.addEventListener('click', chainResultToBase);
    dom.btnSaveCalc.addEventListener('click', saveCurrentCalculation);
    dom.btnCopyCalc.addEventListener('click', copyCurrentCalculation);
    dom.btnShareCalc.addEventListener('click', shareCurrentCalculation);

    // Управление шторкой Журнала
    dom.btnOpenHistory.addEventListener('click', () => {
      triggerHaptic();
      dom.historySheet.hidden = false;
    });

    dom.btnCloseHistory.addEventListener('click', () => {
      triggerHaptic();
      dom.historySheet.hidden = true;
    });

    dom.historySheet.addEventListener('click', (e) => {
      if (e.target === dom.historySheet) {
        dom.historySheet.hidden = true;
      }
    });

    dom.btnClearHistory.addEventListener('click', clearAllHistory);
  }

  /* ========================================================================
     11. Регистрация Service Worker и бесшовное обновление версий
     ======================================================================== */
  function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    let registrationRef = null;
    let updateRequested = false;

    const showWaiting = (registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        dom.updateBanner.hidden = false;
      }
    };

    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(async (registration) => {
        registrationRef = registration;
        showWaiting(registration);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') showWaiting(registration);
          });
        });
        try { await registration.update(); } catch (_) {}
      }).catch(() => {});

    dom.btnApplyUpdate.addEventListener('click', () => {
      const worker = registrationRef && registrationRef.waiting;
      if (!worker) return;
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
      dom.updateBanner.hidden = true;
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateRequested) window.location.reload();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && registrationRef) registrationRef.update().catch(() => {});
    });
    window.setInterval(() => {
      if (registrationRef && !document.hidden) registrationRef.update().catch(() => {});
    }, 60 * 60 * 1000);
  }

  /* ========================================================================
     Инициализация приложения
     ======================================================================== */
  function init() {
    restoreState();
    attachEvents();
    compute();
    refreshHistoryUI();
    enableNativeTouchFeedback();
    initServiceWorker();
  }

  init();
})();