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
    hapticLabel: document.getElementById('webkit-haptic-label'),
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
  function triggerHaptic() {
    try {
      if (dom.hapticLabel) {
        dom.hapticLabel.click();
      } else if (navigator.vibrate) {
        navigator.vibrate(8);
      }
    } catch (_) {
      // Игнорируем на платформах без поддержки
    }
  }

  /* ========================================================================
     2. Точная финансовая математика и форматирование
     ======================================================================== */
  function round Money(num) {
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
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
    const cur = getCurrency();

    let resultValue = 0;
    let deltaValue = 0;
    let isError = false;
    let errorMessage = '';
    let formulaText = '';
    let summaryText = '';

    switch (state.mode) {
      case 'subtract': {
        // Сценарий 1: Вычитание процента
        deltaValue = roundMoney(amount * (percent / 100));
        resultValue = roundMoney(amount - deltaValue);
        formulaText = `${formatNumber(amount)} − ${formatNumber(percent)}%`;
        summaryText = `${formatNumber(amount)} ${cur} − ${formatNumber(percent)}% = ${formatNumber(resultValue)} ${cur} (скидка/вычет: ${formatNumber(deltaValue)} ${cur})`;
        break;
      }

      case 'add': {
        // Сценарий 2: Добавление процента
        deltaValue = roundMoney(amount * (percent / 100));
        resultValue = roundMoney(amount + deltaValue);
        formulaText = `${formatNumber(amount)} + ${formatNumber(percent)}%`;
        summaryText = `${formatNumber(amount)} ${cur} + ${formatNumber(percent)}% = ${formatNumber(resultValue)} ${cur} (наценка/доход: +${formatNumber(deltaValue)} ${cur})`;
        break;
      }

      case 'reverse': {
        // Сценарий 3: Обратный расчёт (Поиск суммы ДО удержания процента)
        // Формула: Первоначальная = Остаток / (1 - Процент / 100)
        if (percent >= 100) {
          isError = true;
          errorMessage = 'Удержание ≥ 100% невозможно';
          formulaText = 'Деление на ноль или отрицательную долю';
        } else {
          const factor = (100 - percent) / 100;
          resultValue = roundMoney(amount / factor);
          deltaValue = roundMoney(resultValue - amount);
          formulaText = `${formatNumber(amount)} ÷ (1 − ${formatNumber(percent / 100)})`;
          summaryText = `После вычета ${formatNumber(percent)}% осталось ${formatNumber(amount)} ${cur} → Исходная сумма: ${formatNumber(resultValue)} ${cur} (удержано: ${formatNumber(deltaValue)} ${cur})`;
        }
        break;
      }

      case 'compare': {
        // Сценарий 4 (Доп.): Какой % составляет Число А от Числа Б + разница
        if (percent === 0) {
          isError = true;
          errorMessage = 'База сравнения равна 0';
          formulaText = 'Введите вторую сумму больше 0';
        } else {
          resultValue = roundMoney((amount / percent) * 100);
          deltaValue = roundMoney(amount - percent);
          formulaText = `(${formatNumber(amount)} ÷ ${formatNumber(percent)}) × 100%`;
          summaryText = `${formatNumber(amount)} ${cur} от ${formatNumber(percent)} ${cur} составляет ${formatNumber(resultValue)}% (разница: ${deltaValue >= 0 ? '+' : ''}${formatNumber(deltaValue)} ${cur})`;
        }
        break;
      }
    }

    state.lastCalculation = {
      mode: state.mode,
      amount,
      percent,
      resultValue,
      deltaValue,
      currency: cur,
      isError,
      errorMessage,
      formulaText,
      summaryText,
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
      const delta = key === 'step-up' ? 1 : -1;
       const currentP = parseRaw(state.percentRaw);
      const nextP = Math.max(0, roundMoney(currentP + delta));
      state.percentRaw = String(nextP);
      compute();
      return;
    }

    if (key === 'backspace') {
      let current = getActiveRaw();
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

    // Ограничение длины ввода (до 12 символов до точки и 2 после)
    const parts = current.split('.');
    if (parts.length === 2 && normalizedKey !== '.' && parts[1].length >= 2) {
      return;
    }
    if (parts[0].length >= 11 && normalizedKey !== '.' && parts.length === 1) {
      return;
    }

    if (current === '0' && normalizedKey !== '.') {
      current = normalizedKey;
    } else {
      current += normalizedKey;
    }

    // Защита от пустых нулей вроде "000" в начале
    if (/^0{2,}/.test(current)) {
      current = '0';
    }

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

  async function copyCurrentCalculation() {
    const calc = state.lastCalculation;
    if (!calc || calc.isError) return;
    triggerHaptic();

    try {
      await navigator.clipboard.writeText(calc.summaryText);
      showToast('Скопировано в буфер обмена');
    } catch (_) {
      showToast(`${ formatNumber(calc.resultValue)} ${calc.currency}`);
    }
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
        if (err.name === 'AbortError') return;
      }
    }
    // Если Web Share API недоступен (например, на десктопе), копируем
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
      const raw = localStorage.getItem(STORAGE_KEY_HISTORY_FALLBACK);
      return raw ? JSON.parse(raw) : [];
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
      const list = await getAllSavedCalculations();
      record.id = Date.now();
      list.unshift(record);
      localStorage.setItem(STORAGE_KEY_HISTORY_FALLBACK, JSON.stringify(list.slice(0, 100)));
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

      const timeStr = new Date(item.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const unit = item.mode === 'compare' ? '%' : item.currency;

      const main matchingDiv = document.createElement('div');
      mainMatchingDiv.className = 'history-card-main';
      mainMatchingDiv.innerHTML = `
        <div class="history-badge-row">
          <span class="history-mode-tag">${modeNames[item.mode] || 'Расчёт'}</span>
          <span class="history-time">${timeStr}</span>
        </div>
        <div class="history-result-line">${formatNumber(item.resultValue)} ${unit}</div>
        <div class="history-meta-line">${item.formulaText}</div>
      `;

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
      copyBtn.textContent = '📋';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        triggerHaptic();
        try {
          await navigator.clipboard.writeText(item.summaryText);
          showToast('Запись скопирована');
        } catch (_) {}
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
      if (!dom.historySheet.hidden && e.key === 'Escape') {
        dom.historySheet.hidden = true;
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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
      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleKeyInput('switch-field');
      } else if (e.key === 'Enter') {
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

    let waitingWorker = null;

    navigator.serviceWorker.register('./sw.js').then((registration) => {
      if (registration.waiting) {
        waitingWorker = registration.waiting;
        dom.updateBanner.hidden = false;
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = newWorker;
            dom.updateBanner.hidden = false;
          }
        });
      });
    }).catch(() => {});

    dom.btnApplyUpdate.addEventListener('click', () => {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      dom.updateBanner.hidden = true;
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  /* ========================================================================
     Инициализация приложения
     ======================================================================== */
  function init() {
    restoreState();
    attachEvents();
    compute();
    refreshHistoryUI();
    initServiceWorker();
  }

  init();
})();