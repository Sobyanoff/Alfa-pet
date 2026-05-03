# Alfa Tracker

Однофайловое SPA (`index.html`, ~1680 строк) для трекинга встреч сотрудника Альфа-Банка и расчёта вознаграждения. Без сборки, без зависимостей. Хранилище — `localStorage` (ключи: `alfa_h` — история встреч, `alfa_mode` — выбранный режим ввода `STEP`/`LIST`).

## Структура `index.html`
- `<head>` — PWA-минимум inline: `theme-color`, `apple-touch-icon`/`icon` через data-URL SVG, `apple-mobile-web-app-*` мета.
- `<style>` — дизайн-система:
  - Палитра: Alfa Red `#EF3124`, Ink `#0A0A0F`, Snow `#F7F7FA`, Slate-100/200/300/500/700, Green `#00B956`.
  - Радиусы `--r-card: 18px` / `--r-btn: 14px`. Тени `--sh-card`, `--sh-pop`.
  - Компоненты: `.hero` (сводка дня), `.cta`, `.btn` + `.btn.on` (полная красная заливка с белой ✓ — главный визуальный сигнал выбора), `.acc/.acc-head/.acc-body` (аккордеон), `.tier/.tier-bar/.tier-bar-fill` (БС-плашка), `.preview` (sticky превью-сумма), `.modeswitch` (pill-переключатель), `.progress`/`.progress-fill`.
- `<header>` — тёмная (Ink) шапка с красной полоской снизу. `← Назад` справа.
- `<script>`:
  - `newMeeting()` — модель встречи. Поля по буквам Excel-колонок. Default `AW: 'OP'`.
  - `bsRate(totalBS)` — ставка БС от месячного объёма (270 / 430 / 570).
  - `monthlyBSTotal()` — сумма `AA` из `history` за текущий месяц.
  - `calcEarnings(m, forceBSRate?)` — итоговая формула × `0.87` (НДФЛ).
  - `meetingsWord(n)` — склонение «встреча/встречи/встреч».
  - `getMode()`/`setMode(m)`/`switchMode(m)` — режим ввода в `localStorage`.
  - State: `meeting`, `screen` (`home`/`meeting`/`result`), `history`, `navStack`.
  - Навигация: `goBack()`, `goHome()`, `startMtg()` (читает `getMode()` и сразу ставит `OP`/`LIST_ALL`, без промежуточного `MODE_SELECT`), `completeMtg()`, `goStage()`/`backStage()`.
  - Render: один `render()` диспатчит на `renderHome` / `renderMeeting` / `renderResult`.
  - `renderHome` → hero (заработок сегодня крупно 44px) + аккордеон детализации (БС-тир с прогресс-баром, 22 строки + кнопка «Скопировать») + история.
  - `renderMeeting` → шапка встречи (modeswitch + прогресс-бар `STEP_PROGRESS[stage]` + поле имени клиента) → один из подэкранов (`renderOP`, `renderListAll`, `renderActTR`, ...) → блок «← Назад / Сбросить» внизу.
  - `renderAfterApp` → возвращает `<div>` с карточкой и `.preview` (sticky bottom, показывает текущую сумму через `calcEarnings`).
  - DOM-хелперы: `el`, `btn`, `card`, `grid`, `badge`, `desc`, `rrow`.

## Доменные правила (важно не сломать)
- `meeting.E = F+G+H+I+J+K+L` пересчитывается в `completeMtg()`.
- `AV` — итоговое вознаграждение, сохраняется в history только при `COMPLETED`.
- Ставка БС — динамическая по месячному накоплению, формула чувствительна к порядку расчёта.
- История — массив объектов meeting; не менять схему полей без миграции `localStorage`.

## Соглашения по правкам
- Минимальные точечные правки, без рефакторинга/абстракций.
- Без новых файлов и зависимостей.
- UI-тексты на русском.
- Комментарии — только если "почему" неочевидно.

## История изменений (хронология)
- **2026-05-02** — Кнопка `← Главная` заменена на `← Назад` во всех трёх местах (header, meeting, result). Добавлены `navStack`, `navigate()`, `goBack()`. `startMtg`/`completeMtg` пушат предыдущий экран в стек; `goHome()` стек обнуляет.
