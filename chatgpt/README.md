# AlterNative — Калькулятор процентов

PWA-калькулятор процентов для **iOS 27 / Safari 27**, спроектированный по правилам AlterNative: iPhone-first, WebKit-first, HIG-first.

## Целевая платформа

- iOS 27 only;
- основной сценарий — установленное Home Screen Web App;
- приоритет — Safari/WebKit и нативные web controls;
- без React, Flutter и сторонних UI-фреймворков;
- Liquid Glass используется только для navigation/actions chrome, а не как фон всего контента.

## Режимы

- **Вычесть** — получить сумму после удержания процента.
- **Добавить** — начислить процент к исходной сумме.
- **До вычета** — восстановить исходную сумму, если известна сумма после удержания процента.

## Возможности

- мгновенный расчёт;
- быстрый выбор 5%, 6%, 15% и 20%;
- нативный `<select>` для режима расчёта с Safari 27 enhancement;
- копирование результата;
- локальная история расчётов;
- сохранение последнего состояния;
- light/dark appearance;
- safe-area для Dynamic Island и Home Indicator;
- Visual Viewport для экранной клавиатуры;
- `prefers-reduced-motion` и increased contrast;
- Service Worker + offline app shell;
- Web App Manifest + standalone;
- `apple-touch-icon` и PNG manifest icon;
- без внешней аналитики.

## Структура

- `index.html` — semantic HTML и native web controls;
- `style.css` — iOS 27 UI и Liquid Glass control layer;
- `app.js` — расчёты, Clipboard, history, dialog sheet и viewport handling;
- `manifest.webmanifest` — PWA metadata;
- `sw.js` — offline cache;
- `icon.svg` — browser favicon;
- `apple-touch-icon.png` — Home Screen icon;
- `icon-512.png` — manifest icon.

## Формулы

`Вычесть: результат = сумма × (1 − процент / 100)`

`Добавить: результат = сумма × (1 + процент / 100)`

`До вычета: исходная сумма = полученная сумма / (1 − процент / 100)`

## Развёртывание

GitHub Pages из корня ветки `main`. Production URL: `https://shrekerianez.github.io/alter-native-percent/`.
