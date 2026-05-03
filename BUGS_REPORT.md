# Alfa Tracker — диагностический отчёт для автоматического исправления

> **Назначение файла.** Этот документ — вход для следующей итерации (LLM-фиксер).
> Он содержит весь контекст, необходимый, чтобы внести правки **без повторного анализа кода**.
> Каждый баг самодостаточен: путь, строки, причина, последствия, направление фикса.
> Не нужно искать «что имелось в виду» — всё указано явно.

---

## 0. Контекст проекта (быстрая загрузка)

- **Проект:** Однофайловый SPA `index.html` (1103 строки) — трекер встреч сотрудника Альфа-Банка с расчётом вознаграждения.
- **Стек:** ванильный JS + DOM, без сборки, без зависимостей.
- **Хранилище:** `localStorage`, ключ `alfa_h`.
- **Точки входа:**
  - Модель встречи: `newMeeting()` → [index.html:118-165](index.html#L118-L165)
  - Тариф БС: `bsRate(totalBS)` → [index.html:170-174](index.html#L170-L174)
  - Месячный накопитель БС: `monthlyBSTotal()` → [index.html:176-185](index.html#L176-L185)
  - Главная формула: `calcEarnings(m, forceBSRate?)` → [index.html:190-213](index.html#L190-L213)
  - State: `meeting`, `screen`, `history`, `navStack`, `awStack` → [index.html:218-225](index.html#L218-L225)
  - Навигация: `navigate / goBack / goHome / startMtg / completeMtg / setStage / goStage / backStage` → [index.html:227-268](index.html#L227-L268)
  - Рендер-диспетчер: `render(keepScroll)` → [index.html:1080-1091](index.html#L1080-L1091)
- **Соглашения проекта (из CLAUDE.md):**
  1. Минимальные точечные правки, без рефакторинга и абстракций.
  2. Без новых файлов и зависимостей.
  3. UI-тексты на русском.
  4. Комментарии — только если "почему" неочевидно.
  5. Не менять схему полей history без миграции `localStorage`.

---

## 1. Карта семантики полей (что означает каждая колонка)

Эта таблица — словарь для понимания формулы. Используй её при принятии решений о правках.

| Поле | Группа | Смысл | Где устанавливается | Где читается в `calcEarnings` |
|---|---|---|---|---|
| `F,G,H,I,J,K,L` | DC | Сумма по типам ДК | `pickDC`, LIST_ALL | через `E` |
| `E` | DC | Сумма F..L | `completeMtg` | `(dcE-dcM)*250 + dcM*310` |
| `M` | DC | Активация (ВА+) | `handleDC`, LIST_ALL | через `dcM` |
| `N` | DC | Транзакция (ТР+) | `handleDC` | **не используется** ⚠️ |
| `O,P` | KK | КК1, КК2 | `pickKK`, LIST_ALL | `(O+P-Q)*450 + Q*570` |
| `Q` | KK | Активация КК | `handleKK`, LIST_ALL | да |
| `R` | KK | Транзакция КК | `handleKK` | **не используется** ⚠️ |
| `S` | KK | ФЗ CC1 | `renderES3`, LIST_ALL | `S*100` |
| `T` | Кросс | КДК к ДК | `pickCrossKDK`, LIST_ALL | `T*270` |
| `U` | Кросс | ИИС к НБ | **нигде не устанавливается** ⚠️ | `U*270` (мёртвая ветка) |
| `V,W` | Кросс | КДК акт/ТР | `handleKDK` | **не используется** ⚠️ |
| `X` | Кросс | КЛ/ККК | `pickCrossKL`, LIST_ALL | `X*570` |
| `Y` | Кросс | КЛ ТР+ | `handleKL` | **не используется** ⚠️ |
| `Z` | Доп. | Инвесткопилка | `renderES0`, LIST_ALL | `Z*270` |
| `AA` | Доп. | БС | `renderES0`, LIST_ALL | `AA*rate` (270/430/570) |
| `AB` | Доп. | ЦП | `renderES1`, LIST_ALL | `AB*20` |
| `AC,AD,AE` | Селфи | n2b / ДК / КК | `pickSelf`, `pickCrossSelf`, LIST_ALL | `AC*430 + AD*270 + AE*570` |
| `AF` | Селфи | Активация | `handleSelf*`, LIST_ALL | **не используется** ⚠️ |
| `AG` | Селфи | Транзакция | `handleSelf*` | **не используется** ⚠️ |
| `AH` | App | Установлено? | `renderApp`, LIST_ALL | не в формуле |
| `AI` | Спец | Установка МП | `pickSpecial`, LIST_ALL | `AI*310` |
| `AJ` | Кросс | СИМ | `pickCrossDiff`, LIST_ALL | `AJ*430` |
| `AK` | Спец | КН | `pickSpecial`, LIST_ALL | `AK*570` |
| `AL,AM` | Доп. | Кэш / Защитник | `renderES2`, LIST_ALL | `AL*10 + AM*100` |
| `AN` | Кросс | Детская | `pickCrossDiff`, LIST_ALL | `AN*430` |
| `AO` | Доп. | Вок | `renderES1`, LIST_ALL | не в формуле напрямую — см. **BUG** |
| `AP` | Спец/УП | Отказ банка ИЛИ УП (конфликт) | `pickRefusal`, `renderES3`, LIST_ALL | `AP*230` |
| `AQ` | Доп. | Смарт | `renderES2`, LIST_ALL | `AQ*30` |
| `AR` | Доп. | Уст.МП Х5 | `renderES2`, LIST_ALL | `AR*0` ⚠️ (нулевой тариф!) |
| `AS,AT` | Доп. | ПДС / Пенсия | `renderES2`, LIST_ALL | `AS*270 + AT*270` |
| `AU` | Доп. | Комбо 1Р | `renderES2`, LIST_ALL | `AU*30` |
| `AV` | Итог | Вознаграждение ₽ | `completeMtg` | сохраняется |
| `AW` | Стейт | Этап встречи | `goStage`, `setStage` | строковый ключ |
| `AY,AZ,BA,BB` | Стейт | Активация (для отображения) | хендлеры | только в `renderResult` |
| `CL,AH` | App | iPhone(0)/Android(1), установлено | `renderApp`, LIST_ALL | только в UI |
| `CM,CN,CO` | Флаги | спец-продукт / отказ банка / УП | разные места | **CO и AO не в формуле** ⚠️ |
| `awStack` | Стейт | стек этапов внутри встречи | `goStage`, `backStage` | navigation |

**Критическое замечание:** Поля, помеченные ⚠️, либо собираются и не платят (мертвый сбор), либо платят и не собираются (мертвая выплата). См. issues #3, #4, #5, #11.

---

## 2. Сводная таблица багов (для быстрого планирования)

| ID | Severity | Локация | Краткое описание |
|---|---|---|---|
| #1 | CRITICAL | `backStage` :263-268, все `pick*` | Накопление полей при возврате назад |
| #2 | CRITICAL | LIST_ALL :582 vs `calcEarnings` :196 | `'DC нерез.'` ≠ `'DC нерезидент'` — нерезидент платит как обычная DC |
| #3 | CRITICAL | `calcEarnings` :190-213 | Поля `N,R,Y,V,W,AG` собираются, но не в формуле |
| #4 | CRITICAL | `calcEarnings` :203 | `m.U` в формуле, но нигде не устанавливается |
| #5 | CRITICAL | `calcEarnings` :209 | `m.AR * 0` — Уст.МП Х5 платит ноль |
| #6 | CRITICAL | `calcEarnings` :196 | Нерезидент-как-доп-продукт игнорирует активацию |
| #7 | CRITICAL | LIST_ALL :613,656 | Конфликт «Отказ банка» и «УП» через одно поле `AP` |
| #8 | CRITICAL | `renderResult` :1064-1066 | «iPhone ✗» показывается для встреч без шага APP |
| #9 | CRITICAL | :220 | `JSON.parse` без try/catch — белый экран при битом `localStorage` |
| #10 | CRITICAL | LIST_ALL :629-631 | Селфи-кросс при том же primary не декрементируется при отжатии |
| #11 | HIGH | `renderDailyCard` :383-401 | Хардкод `0` в строках «КДК к CC», «ТЗ КДК», «ТЗ Комбо», «Комбо 1₽» |
| #12 | HIGH | `renderHome` :347 vs `renderDailyCard` :407 | История показывает `m.AV` (старый тир БС), дашборд — пересчитанный |
| #13 | HIGH | `completeMtg` :244-253 | Нет валидации — пустую встречу можно сохранить |
| #14 | HIGH | `monthlyBSTotal` :180-184 | Парсинг даты зависит от локали записи (`split('.')`) |
| #15 | HIGH | `saveHistory` :222 | Нет catch на `QuotaExceededError` |
| #16 | HIGH | LIST_ALL :613 | Toggle off «Отказ банка» не сбрасывает `S, CO` |
| #17 | HIGH | `pickRefusal` :747-751, спец-продукты | После «Отказ банка»/«КН»/«Уст.МП» нельзя добавить кросс — flow жёстко идёт в `AFTER_APP` |
| #18 | HIGH | `gotoES3` :894-899 | `ФЗ CC1 и УП` устанавливает `AP=1, CO=1, S=1` — конфликт с Refusal |
| #19 | HIGH | `meeting.AO` (Вок) | Поле собирается, но не входит в `calcEarnings` |
| #20 | HIGH | `meeting.CO` (УП) | Поле собирается, но не входит в `calcEarnings` отдельной строкой |
| #21 | MEDIUM | `render` :1080-1091 | `.fade` анимация запускается на каждом ререндере → мерцание |
| #22 | MEDIUM | `render` :1090 | `scrollTo top` теряет позицию пользователя на длинных экранах |
| #23 | MEDIUM | `navStack` | Неограниченный рост стека при долгой работе |
| #24 | MEDIUM | `clientName` input :459-462 | Потеря фокуса при ререндере (вход в input) |
| #25 | MEDIUM | `renderHome` :340 | Только 15 последних встреч, нет пагинации, нет удаления одной |
| #26 | MEDIUM | `renderResult` :1027 | `history[history.length-1]` — хрупкая привязка к последнему элементу |
| #27 | MEDIUM | LIST_ALL :594-596 | Нельзя выбрать одновременно КК1+КК2 (clearMain wipes) |
| #28 | MEDIUM | `legacyCopy` :362-370 | Не проверяется результат `execCommand('copy')` |
| #29 | MEDIUM | `navigate()` :227-232 | Функция определена, но никем не вызывается |
| #30 | MEDIUM | LIST_ALL :575,624,640,663 | `insertBefore(badge, firstChild.nextSibling)` — хрупкая DOM-манипуляция |
| #31 | LOW | `renderHome` :347 | `${m.AV}₽` без разделителя тысяч |
| #32 | LOW | `today()` :223 | Дата фиксируется при создании встречи; пересечение полуночи не обновит |
| #33 | LOW | `bot-structure.md` | Файл — Python-обёртка `content = """..."""`, не валидный markdown |
| #34 | LOW | `pickSpecial` :741-746 | `Установка МП` и `КН` идут сразу в AFTER_APP, минуя кросс-продукт |
| #35 | LOW | LIST_ALL :617 | Условный класс кнопки «Отказ банка» одинаков в обеих ветках (бессмысленный тернарник) |
| #36 | LOW | `meeting` shallow copy :249 | `awStack` — общая ссылка с `history[i].awStack` |

---

## 3. Подробное описание (по убыванию серьёзности)

> Шаблон каждой записи строго фиксированный — не упрощай и не сокращай при правке.

---

### CRITICAL

**Issue #1: Накопление числовых полей при возврате назад через `backStage`**
- **Location:** [index.html:263-268](index.html#L263-L268), все хелперы `pick*` ([index.html:726-845](index.html#L726-L845))
- **Detailed Description:** `backStage()` восстанавливает только `meeting.AW` (этап) из `awStack`, но **не откатывает** изменения числовых полей. Все хелперы выбора (`pickDC`, `pickKK`, `pickSelf`, `pickSpecial`, `pickRefusal`, `pickCrossKL`, `pickCrossKDK`, `pickCrossSelf`, `pickCrossDiff`, `pickMore`) делают `meeting[col] = (meeting[col]||0) + 1` и сразу `goStage(...)`. Любой возврат назад и повторный выбор продукта приводит к двойному инкременту.
- **System Impact:** Пользователь, ошибочно нажавший «← Назад», получает завышенный итог. Сценарий: «ДК → ВА+ ТР+ → Назад → ДК → ВА+ ТР-» даст `F=2, M=2, N=1, AY=1, E=2`. Формула посчитает (2−2)·250 + 2·310 = 620 ₽ × 0.87, а реально клиент сделал одну ДК с ВА+ТР-, что должно дать 1·310 = 310 × 0.87.
- **Technical Context for Fixing:** Снимок `meeting` нужно класть в `awStack` вместе с этапом. Заменить структуру стека: вместо `awStack: ['OP', 'DC_ACT_TR']` хранить `awStack: [{aw:'OP', snapshot: {...}}]`. В `goStage` пушить `{aw: meeting.AW, snapshot: structuredClone(meeting)}` (или JSON.parse(JSON.stringify(...))). В `backStage` восстанавливать `meeting = pop.snapshot`. Внимание: `awStack` сам должен быть исключён из снапшота, иначе бесконечная вложенность.

---

**Issue #2: Несовпадение `primaryType` для DC-нерезидента в режиме «Полный список» ломает тариф**
- **Location:** [index.html:582](index.html#L582), [index.html:196](index.html#L196), [index.html:692](index.html#L692)
- **Detailed Description:** В `renderOP` кнопка ставит `primaryType='DC нерезидент'` (полное написание). В `renderListAll` в массиве кнопок — сокращение `'DC нерез.'`, и оно записывается в `meeting.primaryType`. В `calcEarnings` строгое сравнение `m.primaryType === 'DC нерезидент'`. При выборе через «Полный список» условие `nerAct` всегда ложно.
- **System Impact:** Все нерезиденты, оформленные в списочном режиме, оплачиваются как обычная DC: 250/310 ₽ вместо 450/570 ₽. Прямая недоплата ~260 ₽ за карту с активацией.
- **Technical Context for Fixing:** Привести строки к одному значению. Самый безопасный путь — изменить отображаемую подпись в LIST_ALL на `'DC нерезидент'` (строка 582 в массиве `[['ДК','F'],['Х5','G'],['DC ИНВ','H'],['RE','I'],['DC нерез.','J'],['Семейный','K']]` → заменить `'DC нерез.'` на `'DC нерезидент'`), либо передавать в кнопку две строки (label vs primaryType). Альтернатива — ввести флаг `m.isNerJ` и не зависеть от текста.

---

**Issue #3: Поля транзакции/активации (`N,R,Y,V,W,AG`) собираются, но не используются в `calcEarnings`**
- **Location:** [index.html:190-213](index.html#L190-L213), [index.html:774-814](index.html#L774-L814)
- **Detailed Description:** Хендлеры инкрементируют:
  - `handleDC`: `N` (ТР DC) — не в формуле
  - `handleKK`: `R` (ТР KK) — не в формуле
  - `handleKL`: `Y` (ТР KL) — не в формуле
  - `handleKDK`: `V` (акт КДК), `W` (ТР КДК) — не в формуле
  - `handleSelf*`: `AF` (акт), `AG` (ТР) — `AF` есть как заглушка только для LIST_ALL, в формуле НЕТ
  
  Дашборд при этом показывает «ТЗ CC1: N» и т.д., что вводит пользователя в заблуждение.
- **System Impact:** Тарифы за транзакции (как заявлено в `bot-structure.md` Tariff_DB) не платятся. Возможна систематическая недоплата либо лишний учёт.
- **Technical Context for Fixing:** Сверить с эталонным Excel (его пользователь должен прислать). Два варианта:
  - **Вариант А (тариф зашит в основные коэффициенты):** удалить сбор полей в хендлерах и колонки в `renderDailyCard`, оставить только `M, Q, AF` для отслеживания активации. Формула не меняется.
  - **Вариант Б (нужны отдельные доплаты):** добавить слагаемые `m.N*<rate> + m.R*<rate> + m.Y*<rate> + m.V*<rate> + m.W*<rate> + m.AG*<rate>` в `calcEarnings`. Конкретные тарифы — из Excel.

  **До получения Excel** — пометить как «верифицировать» и не делать самостоятельных предположений о тарифах.

---

**Issue #4: Поле `m.U` (ИИС к НБ) используется в формуле, но никогда не устанавливается**
- **Location:** [index.html:203](index.html#L203), [index.html:138](index.html#L138)
- **Detailed Description:** В `calcEarnings` слагаемое `m.U * 270`. По всему файлу `meeting.U` не получает значений нигде — ни в `pickCross*`, ни в LIST_ALL, ни в `renderMoreProduct`. В `newMeeting` инициализируется нулём.
- **System Impact:** Продукт «ИИС к НБ» нельзя зафиксировать через UI — оплата всегда 0.
- **Technical Context for Fixing:** Решение зависит от бизнес-требования:
  - **Если ИИС к НБ нужен:** добавить кнопку в `renderCP` и `renderListAll` («ИИС к НБ» в кросс-секции), инкрементирующую `m.U`. Также добавить в `renderMoreProduct`.
  - **Если не нужен:** удалить `m.U * 270` из формулы и поле `U` из `newMeeting`.

  Запросить у пользователя: «Нужен ли продукт ИИС к НБ?»

---

**Issue #5: Поле `m.AR` (Уст.МП Х5) умножается на 0**
- **Location:** [index.html:209](index.html#L209)
- **Detailed Description:** Формула содержит `m.AR * 0`. UI кнопка «Уст.МП Х5» доступна (`renderES2` :881, `renderListAll` :645), отображается в `renderDailyCard` (:391). Тариф зашит как 0 — выглядит как заглушка вместо реального тарифа.
- **System Impact:** Любая отметка «Установка МП Х5» бесплатна.
- **Technical Context for Fixing:** Сверить с Excel. По аналогии с `AI*310` (обычная Установка МП) логично, что `AR` тоже должен платить ~310 (или другой тариф). Заменить `m.AR * 0` на `m.AR * <rate>`. Если бизнес не платит — удалить кнопку и поле.

---

**Issue #6: Нерезидент-как-доп-продукт игнорирует активацию**
- **Location:** [index.html:196](index.html#L196), [index.html:984-991](index.html#L984-L991)
- **Detailed Description:** Условие `nerAct = (nerJ>0 && primaryType==='DC нерезидент' && (AY===1||AY===2))` привязано к `AY` — статус *основного* продукта. Если DC-нерезидент добавляется через MORE_PRODUCT*, активация попадает в `BA`/`BB`, а `primaryType` остаётся другим. Условие не сработает.
- **System Impact:** Нерезидент в качестве доп-продукта недоплачивается. Кроме того, в `pickMore` нет варианта «DC нерезидент» — добавить его в принципе нельзя.
- **Technical Context for Fixing:** Развязать `nerAct` от `primaryType`:
  ```
  // концептуально: нерезидент активен, если есть J И есть любая активация
  nerAct = min(m.J, m.M /* +активации, относящиеся к J */ )
  ```
  Полное решение требует трекать активацию **по типу карты**, а не по агрегату `M`. Минимальный фикс — позволить добавить нерезидента в `renderMoreProduct` (добавить кнопку с col='J', type='dc') и в `handleMoreDC` различать тип через `meeting.moreProduct1Type==='DC нерезидент'`.

---

**Issue #7: Кнопка УП в режиме «Полный список» затирает состояние «Отказ банка» через общее поле `AP`**
- **Location:** [index.html:613-618](index.html#L613-L618), [index.html:656](index.html#L656)
- **Detailed Description:** «Отказ банка» ставит `AP=1, CN=1, CM=1`. «УП» делает `if(AP&&CO){AP=0;CO=0;}else{AP=1;CO=1;}`. Сценарии:
  - Refusal сначала (AP=1,CO=0) → нажать УП: ветка `else`, AP остаётся 1, CO=1 → нажать УП ещё раз: AP=0, CO=0, но `CN=1, CM=1` остаются → состояние Refusal частично разрушено.
  - В формуле: `m.AP * 230` платит 230 за оба смысла одновременно.
- **System Impact:** Невозможно одновременно отметить Refusal и УП корректно. Формула не различает эти бизнес-сущности.
- **Technical Context for Fixing:** Развести по разным полям:
  - `AP` — только Refusal.
  - `CO` — флаг УП. Добавить отдельный тариф для УП в `calcEarnings`.
  - В `renderES3` кнопка «УП» больше не должна устанавливать `AP=1`.
  - В LIST_ALL УП-toggle: только `CO`.
  
  Сверить с Excel реальные тарифы Refusal и УП.

---

**Issue #8: `renderResult` показывает «iPhone ✗» по умолчанию для встреч, где экран APP был пропущен**
- **Location:** [index.html:1064-1066](index.html#L1064-L1066), [index.html:894-919](index.html#L894-L919)
- **Detailed Description:** Спец-продукты (`КН`, `Установка МП`, `Отказ банка`) ставят `CM=1`, и flow в `gotoES3`/`afterES3` идёт в `AFTER_APP`, минуя `APP`. `CL` и `AH` остаются `0`. В `renderResult` блок «Приложение» рендерится безусловно: `CL===1?'Android':'iPhone'` → `'iPhone'`, `AH===1?'✓':'✗'` → `'✗'`.
- **System Impact:** Дезинформация в финальном отчёте и в копируемом тексте.
- **Technical Context for Fixing:** Ввести трёхзначное состояние. В `newMeeting`: `CL: null, AH: null`. В `renderResult` рендерить блок «Приложение» только если `m.CL !== null`. Альтернатива — ввести явный флаг `m.appAsked = false`, ставить в `true` в `renderApp` и LIST_ALL android/iphone-кнопках. **Внимание к миграции:** старые записи в `localStorage` имеют `CL=0, AH=0` — нужна либо миграция при загрузке (если оба = 0 и `CM` встречи был 1, ставить `null`), либо хелпер `wasAppAsked(m)` без миграции данных.

---

**Issue #9: `JSON.parse` без try/catch — белый экран при битом `localStorage`**
- **Location:** [index.html:220](index.html#L220)
- **Detailed Description:** `let history = JSON.parse(localStorage.getItem('alfa_h') || '[]')` исполняется на верхнем уровне. Невалидный JSON (частичная запись после прерывания, ручное вмешательство, кросс-браузерные несовместимости) бросает `SyntaxError`, скрипт падает, `render()` не вызывается.
- **System Impact:** Белая страница без признаков ошибки. Пользователь не может пользоваться приложением.
- **Technical Context for Fixing:** Обернуть:
  ```
  let history;
  try { history = JSON.parse(localStorage.getItem('alfa_h') || '[]'); }
  catch(e) { console.warn('alfa_h corrupt, resetting:', e); history = []; }
  if (!Array.isArray(history)) history = [];
  ```
  Также `saveHistory` обернуть в try/catch для `QuotaExceededError` (см. issue #15).

---

**Issue #10: Селфи-кросс при том же primary-типе не декрементируется при отжатии**
- **Location:** [index.html:629-631](index.html#L629-L631)
- **Detailed Description:** Логика toggle:
  ```
  if(m.crossType==='Селфи n2b'){
    const prev=m.AC;
    clearCross();
    m.AC = m.primaryType==='Селфи n2b' ? prev : Math.max(0, prev-1);
  } else {
    clearCross();
    m.AC++;
    m.crossType='Селфи n2b';
  }
  ```
  При включении кросса `AC++` всегда. При выключении, если primary тоже Селфи n2b — возвращается `prev` без декремента (т.е. остаётся `2`, хотя кросс снят).
  Аналогично для `AD`/`AE`.
- **System Impact:** «Призрачные» селфи в формуле и дашборде — лишняя оплата за каждый цикл клик-отжать с совпадающим primary.
- **Technical Context for Fixing:** Декремент должен быть всегда (поскольку `++` всегда выполнялся при включении):
  ```
  m.AC = Math.max(0, prev - 1);
  ```
  Условие `m.primaryType==='...'` убрать. Применить ко всем трём кнопкам Селфи в LIST_ALL.

---

### HIGH

**Issue #11: Хардкод `0` в строках дашборда «Итог за сегодня»**
- **Location:** [index.html:383-401](index.html#L383-L401)
- **Detailed Description:** Массив `rows` содержит:
  ```
  ['КДК к CC',        0],
  ['ТЗ КДК',          0],
  ['Комбо',           t.AU],
  ['ТЗ Комбо',        0],
  ['Комбо 1₽',        0],   // дублирует «Комбо» по смыслу, всегда 0
  ```
  Реальные значения существуют (`t.AU` для Комбо 1Р, `t.V`/`t.W` для КДК), но не подставлены.
- **System Impact:** Пользователь не видит часть собранной статистики; «Комбо 1₽» дублирует «Комбо», вводя в заблуждение.
- **Technical Context for Fixing:**
  - Удалить дублирующие строки «Комбо» (оставить одну).
  - Заменить `0` на реальные суммы (`t.V`, `t.W` и т.д.) либо удалить строки, если поля не используются.
  - Согласовать с issue #3 (что считать «активацией» и «транзакцией»).

---

**Issue #12: Несогласованность сумм между историей и дашбордом**
- **Location:** [index.html:347](index.html#L347), [index.html:407](index.html#L407)
- **Detailed Description:** В `renderHome` список истории показывает `${m.AV}₽` — значение, рассчитанное в момент `completeMtg` по тиру БС, актуальному тогда. В `renderDailyCard` итог пересчитывается с актуальным тиром: `t.AV = mtgs.reduce((s,m) => s + calcEarnings(m, mRate), 0)`. Если тир сменился (например, перешли с 270 на 430 после 11-й БС), сумма по истории и дашборду расходится.
- **System Impact:** Пользователь видит разные числа в двух местах одной и той же страницы. Ломается доверие.
- **Technical Context for Fixing:** Вариант А — в `renderHome` тоже пересчитывать `m.AV` через `calcEarnings(m, mRate)` (но это может отличаться от исторически сохранённого). Вариант Б — обновлять `m.AV` всех записей текущего месяца в `localStorage` после каждого `completeMtg`. Вариант В — добавить в карточке дашборда подпись «(актуальный тир)» и оставить как есть, но визуально выровнять. Решение требует подтверждения от пользователя.

---

**Issue #13: `completeMtg` не валидирует встречу — пустые встречи сохраняются**
- **Location:** [index.html:244-253](index.html#L244-L253)
- **Detailed Description:** Пользователь может на любом шаге через `AFTER_APP` нажать «✅ Завершить встречу», даже если ничего не выбрано. Создастся запись с `AV=0` и пустыми полями.
- **System Impact:** Мусор в истории, пустые карточки в `renderHome`.
- **Technical Context for Fixing:** В начало `completeMtg` добавить проверку: если ни один значимый продукт не выбран (нет `primaryType` И всех ключевых полей == 0) — `confirm('Сохранить пустую встречу?')` или `alert('Выберите хотя бы один продукт')` и `return`.

---

**Issue #14: Парсинг даты в `monthlyBSTotal` зависит от формата записи**
- **Location:** [index.html:176-185](index.html#L176-L185)
- **Detailed Description:** `today()` возвращает `toLocaleDateString('ru-RU')` → `DD.MM.YYYY`. `monthlyBSTotal` делает `h.date.split('.')`. Если в localStorage есть записи, созданные с другим форматом (старая версия, импорт, другая ОС с нестандартным локалем) — `+p[1]`/`+p[2]` дадут `NaN`, фильтр пропустит запись.
- **System Impact:** Тир БС считается по неполной выборке → возможен выбор более низкого тира → недоплата.
- **Technical Context for Fixing:** Хранить в встрече `m.month: 'YYYY-MM'` (или ISO timestamp) и сравнивать по нему. Для обратной совместимости — попробовать оба формата, при `NaN` — fallback через `new Date(m.id).getMonth()`.

---

**Issue #15: `saveHistory` не ловит `QuotaExceededError`**
- **Location:** [index.html:222](index.html#L222)
- **Detailed Description:** При переполнении `localStorage` (~5MB) `setItem` бросает исключение, история не сохраняется, ошибка не сообщается пользователю. После завершения встречи `screen` переключится на `result`, но в истории её нет.
- **System Impact:** Молчаливая потеря данных.
- **Technical Context for Fixing:** Try/catch вокруг `setItem`, `alert('Хранилище переполнено, очистите часть истории')`.

---

**Issue #16: Toggle off «Отказ банка» в LIST_ALL не сбрасывает все связанные флаги**
- **Location:** [index.html:613-618](index.html#L613-L618), `clearMain` :528-534
- **Detailed Description:** Кнопка «Отказ банка» при отжатии вызывает `clearMain()`, но `clearMain` не очищает `S, CO`, которые могли быть установлены из секций «Только для КК» / `renderES3`. Также class всегда `btn-danger` (issue #35).
- **System Impact:** Часть флагов «зависает».
- **Technical Context for Fixing:** Дополнить `clearMain`: `m.S=0; m.CO=0;`. Учесть взаимодействие с issue #7 (если развести AP и CO).

---

**Issue #17: После «Отказ банка»/«КН»/«Уст.МП» нельзя добавить кросс-продукт**
- **Location:** [index.html:741-751](index.html#L741-L751)
- **Detailed Description:** `pickSpecial` и `pickRefusal` идут в `AFTER_APP`, пропуская `CP` и весь блок ES. Кнопка «Доп. продажи» в `renderAfterApp` доступна только если `m.CM && !primaryType.includes('Отказ')`. Кросса нет вообще.
- **System Impact:** Реальные сценарии «КН + кросс СИМ» не покрываются.
- **Technical Context for Fixing:** Уточнить у пользователя бизнес-логику. Если кросс должен быть доступен — `pickSpecial` направлять в `CP`, как обычные продукты.

---

**Issue #18: Кнопка «ФЗ CC1 и УП» в `renderES3` устанавливает `AP=1` — конфликт с Refusal**
- **Location:** [index.html:909](index.html#L909)
- **Detailed Description:** `'ФЗ CC1 и УП'` ставит `m.S=1; m.AP=1; m.CO=1`. Поле `AP` — то же, что у Refusal. См. issue #7 — общая семантическая проблема.
- **System Impact:** Если КК-флоу + УП, в формулу попадает `AP*230`, формально как «Отказ банка». Дашборд может показывать некорректный счётчик.
- **Technical Context for Fixing:** Решается в рамках issue #7 (отдельное поле для УП).

---

**Issue #19: `m.AO` (Вок) собирается, но не входит в `calcEarnings`**
- **Location:** [index.html:864](index.html#L864), [index.html:190-213](index.html#L190-L213)
- **Detailed Description:** Кнопка «Вок» в `renderES1` ставит `AO=1`. В формуле `calcEarnings` нет ни одного слагаемого с `AO`. Дашборд показывает «Вок на встрече: t.AO».
- **System Impact:** Вок не оплачивается, хотя UI это предполагает.
- **Technical Context for Fixing:** Сверить с Excel — должен ли Вок платить? Если да — добавить `m.AO * <rate>`. Если нет — убрать строку из дашборда и подпись «(оплачивается отдельно)» если нужно.

---

**Issue #20: `m.CO` (УП) собирается, но не имеет отдельного слагаемого в `calcEarnings`**
- **Location:** [index.html:906,909,656](index.html#L656)
- **Detailed Description:** Поле `CO` устанавливается одновременно с `AP=1` в УП-кнопках. В формуле УП-выплата идёт через `AP*230`, но `AP` — это и Refusal (см. #7). Отдельного `m.CO * <rate>` нет.
- **System Impact:** Невозможно различить вклад УП и Refusal в итоговую сумму.
- **Technical Context for Fixing:** В рамках issue #7 — ввести отдельный тариф `m.CO * <rateUP>`, не привязанный к `AP`.

---

### MEDIUM

**Issue #21: Анимация `.fade` срабатывает на каждом ререндере → мерцание**
- **Location:** [index.html:92-93](index.html#L92-L93), [index.html:1083](index.html#L1083)
- **Detailed Description:** `render()` делает `root.className = 'fade'`. CSS `@keyframes fi` — opacity 0→1 + translateY. На каждый клик по кнопке (а в LIST_ALL — на каждое переключение) экран мерцает.
- **System Impact:** Раздражает глаз, ощущение «лагает».
- **Technical Context for Fixing:** Анимировать только при смене `screen`, не при `render(true)` (keepScroll). В `render` — добавлять класс `fade` только когда `screen` сменился, отслеживая через переменную `let lastScreen`.

---

**Issue #22: `scrollTo top` теряет позицию пользователя**
- **Location:** [index.html:1090](index.html#L1090)
- **Detailed Description:** При каждом ререндере без флага `keepScroll` страница прокручивается наверх. Если пользователь прокрутил историю и нажал «Очистить» в `confirm` (cancel) — всё равно произойдёт прокрутка наверх (через `render()` после `confirm`).
- **System Impact:** UX-неудобство.
- **Technical Context for Fixing:** Убедиться, что все рендеры внутри `screen='home'` после изменений списка вызывают с `keepScroll`. Либо запоминать `window.scrollY` перед `render()` и восстанавливать.

---

**Issue #23: Неограниченный рост `navStack`**
- **Location:** [index.html:225,228,242](index.html#L225)
- **Detailed Description:** Каждый `navigate`/`startMtg` пушит без ограничения. За долгий день — десятки/сотни элементов.
- **System Impact:** Утечка памяти (минорная), непредсказуемое поведение `goBack`.
- **Technical Context for Fixing:** Ограничить размер (`if (navStack.length > 50) navStack.shift()`).

---

**Issue #24: Потеря фокуса в input «Имя клиента»**
- **Location:** [index.html:459-462](index.html#L459-L462)
- **Detailed Description:** Поле имени отображается только на этапе `OP`. В этом этапе нет кнопок, перерисовывающих экран при наборе текста — фокус не теряется. Но если пользователь нажмёт любую кнопку «продукт», `goStage` сменит экран. Минорная проблема: имя сохраняется через `addEventListener('input')`, фокус снимается переходом — это OK. **Реальная проблема** — в LIST_ALL при `render(true)` после каждого toggle экран перерисовывается, и если бы там был input, фокус терялся бы. Сейчас input в LIST_ALL отсутствует, поэтому проблема гипотетическая.
- **System Impact:** Потенциальная — при будущем добавлении полей ввода.
- **Technical Context for Fixing:** Не критично для текущей версии. Если будет добавлен input в LIST_ALL — обернуть в отдельный поддиалог или использовать ручной DOM-патч вместо innerHTML.

---

**Issue #25: История ограничена 15 записями, нет per-item delete**
- **Location:** [index.html:340](index.html#L340), [index.html:352-356](index.html#L352-L356)
- **Detailed Description:** `done.slice(0,15)` — старше 15 не показывается. Удалить можно только всю историю целиком.
- **System Impact:** Нельзя удалить ошибочную запись, нельзя посмотреть старые встречи.
- **Technical Context for Fixing:** Добавить кнопку «✕» рядом с каждой записью + пагинацию или «Показать ещё».

---

**Issue #26: `renderResult` использует `history[history.length-1]` — хрупкая привязка**
- **Location:** [index.html:1027](index.html#L1027)
- **Detailed Description:** Предполагается, что последний элемент истории — это только что завершённая встреча. Если параллельно произойдёт что-то (нет реальной возможности при синхронном UI, но архитектурно неправильно), показ результата будет некорректным.
- **System Impact:** Низкий, но повышает хрупкость рефакторинга.
- **Technical Context for Fixing:** Хранить ссылку `let lastCompleted = null;` в `completeMtg`, использовать в `renderResult`.

---

**Issue #27: В LIST_ALL нельзя выбрать одновременно КК1 + КК2**
- **Location:** [index.html:594-596](index.html#L594-L596)
- **Detailed Description:** Кнопки КК1/КК2 вызывают `clearMain()` — обнуляют всё. Сценарий «КК1 + КК2 на одной встрече» не покрывается.
- **System Impact:** Бизнес-сценарий нельзя зафиксировать через LIST_ALL. (В пошаговом режиме можно через `MORE_PRODUCT*`.)
- **Technical Context for Fixing:** Сделать КК1/КК2 в LIST_ALL не взаимоисключающими — toggle без `clearMain` (как для доп.продаж).

---

**Issue #28: `legacyCopy` не проверяет результат `execCommand('copy')`**
- **Location:** [index.html:362-370](index.html#L362-L370)
- **Detailed Description:** `document.execCommand('copy')` возвращает `boolean`. Если `false`, копирование не произошло. Сейчас не проверяется, пользователь видит «✅ Скопировано!».
- **System Impact:** Ложно-положительная индикация.
- **Technical Context for Fixing:** `const ok = document.execCommand('copy'); if(!ok) alert('Не удалось скопировать');`

---

**Issue #29: Функция `navigate()` определена, но никем не вызывается**
- **Location:** [index.html:227-232](index.html#L227-L232)
- **Detailed Description:** Мёртвый код. `goHome`/`startMtg`/`completeMtg` напрямую устанавливают `screen` и пушат в `navStack`, не используя `navigate`.
- **System Impact:** Шум в коде, риск рассинхронизации.
- **Technical Context for Fixing:** Удалить или начать использовать. По CLAUDE.md «без рефакторинга», но удаление мёртвого кода допустимо.

---

**Issue #30: Хрупкая DOM-манипуляция через `insertBefore(badge, firstChild.nextSibling)`**
- **Location:** [index.html:575,624,640,663](index.html#L575)
- **Detailed Description:** `mainCard.insertBefore(badge('Шаг 1 из 4'), mainCard.firstChild.nextSibling)`. Зависит от того, что `firstChild` — title и `firstChild.nextSibling` существует. Если `card()` будет рефакториться — сломается.
- **System Impact:** Хрупкость к будущим правкам.
- **Technical Context for Fixing:** Передать `badge` как аргумент в `card(...)` или использовать `card.prepend(badge)`.

---

### LOW

**Issue #31: `${m.AV}₽` без разделителя тысяч**
- **Location:** [index.html:347,429,1033](index.html#L347)
- **Detailed Description:** `15234₽` вместо `15 234 ₽`.
- **System Impact:** Читабельность.
- **Technical Context for Fixing:** Использовать `m.AV.toLocaleString('ru-RU')`.

---

**Issue #32: `today()` фиксируется при создании встречи — не обновляется при пересечении полуночи**
- **Location:** [index.html:120](index.html#L120)
- **Detailed Description:** `date: today()` в `newMeeting`. Если встреча начата в 23:55 и завершена в 00:05, дата будет вчерашней. Дашборд «за сегодня» не покажет её.
- **System Impact:** Минорный edge-case.
- **Technical Context for Fixing:** Устанавливать `m.date` в `completeMtg`, а не в `newMeeting`.

---

**Issue #33: `bot-structure.md` — невалидный markdown (Python-обёртка)**
- **Location:** [bot-structure.md](bot-structure.md)
- **Detailed Description:** Файл начинается с `import os` и оборачивает контент в `content = """..."""`. Это артефакт скрипта-генератора, не валидный markdown.
- **System Impact:** Файл не рендерится корректно.
- **Technical Context for Fixing:** Убрать Python-обёртку, оставить чистый markdown.

---

**Issue #34: `pickSpecial` (КН/Уст.МП) идёт в AFTER_APP минуя CP**
- **Location:** [index.html:741-746](index.html#L741-L746)
- **Detailed Description:** См. issue #17 — связанная проблема. Здесь же — вопрос дизайна flow.
- **System Impact:** См. #17.
- **Technical Context for Fixing:** См. #17.

---

**Issue #35: Бессмысленный тернарник класса в кнопке «Отказ банка» LIST_ALL**
- **Location:** [index.html:617](index.html#L617)
- **Detailed Description:** `(m.AP>0&&m.CN>0?'btn-danger':'btn-danger')+' btn-full'` — оба варианта одинаковые.
- **System Impact:** Кнопка не отражает on/off состояние.
- **Technical Context for Fixing:** Заменить на `(m.AP>0&&m.CN>0?'btn-danger on':'btn-danger')+' btn-full'` или другой явный «активный» класс.

---

**Issue #36: `history.push({...meeting})` — shallow copy, `awStack` шарится**
- **Location:** [index.html:249](index.html#L249)
- **Detailed Description:** Spread копирует только верхний уровень. Массив `awStack` остаётся общей ссылкой. После сохранения в history можно (теоретически) изменить awStack текущего meeting и затронуть запись.
- **System Impact:** В текущем флоу после `completeMtg` `meeting` не модифицируется до `startMtg`, который создаёт новый объект — проблема скрытая. Но при будущих правках может проявиться.
- **Technical Context for Fixing:** `history.push(JSON.parse(JSON.stringify(meeting)))` или `structuredClone(meeting)`.

---

## 4. Зависимости между фиксами (порядок применения)

Чтобы не наделать каскадных конфликтов, фиксить в этом порядке:

1. **Сначала структурные:**
   - Issue #1 (snapshot в `awStack`) — это меняет структуру стека, многое от него зависит.
   - Issue #9 (try/catch на `localStorage`) — независимый, можно делать первым.
   - Issue #15 (try/catch на `saveHistory`) — независимый.

2. **Семантика полей:**
   - Issue #7 + #18 + #20 (развести `AP` и `CO`) — связка, делать вместе.
   - Issue #16 (доп. сброс полей в `clearMain`) — после #7.
   - Issue #2 (`'DC нерез.'` → `'DC нерезидент'`) — независимый.
   - Issue #6 (нерезидент-как-доп) — после понимания, как добавлять нерезидента в more-product.

3. **Формула `calcEarnings` (требуют Excel):**
   - Issue #3 (поля `N,R,Y,V,W,AG`) — **запросить Excel у пользователя** перед правкой.
   - Issue #4 (`m.U`) — запросить решение от пользователя.
   - Issue #5 (`m.AR * 0`) — запросить тариф.
   - Issue #19 (`m.AO`) — запросить.
   - Issue #20 (`m.CO`) — запросить.

4. **UI-логика:**
   - Issue #8 (трёхзначный `CL`) — затрагивает `newMeeting`, `renderApp`, `renderResult`, миграцию.
   - Issue #10 (декремент в LIST_ALL Селфи) — точечный.
   - Issue #11 (хардкод `0` в дашборде) — после #3.
   - Issue #12 (`m.AV` в истории) — обсудить с пользователем.
   - Issue #13 (валидация `completeMtg`) — независимый.
   - Issue #14 (формат даты) — миграция.

5. **Косметика и hygiene:**
   - #21 (анимация), #22 (скролл), #23 (стек), #25 (per-item delete), #28 (execCommand check), #29 (мёртвый navigate), #30 (insertBefore), #31 (formatNumber), #32 (date в completeMtg), #33 (bot-structure.md), #35 (тернарник), #36 (deep copy).
   - #17 + #34 + #27 — UX-вопросы, требуют подтверждения от пользователя.

---

## 5. Что нужно запросить у пользователя перед фиксом

> Не правь эти места без ответов — иначе можно усугубить ситуацию.

1. **Эталонный Excel с тарифами.** Без него невозможно достоверно править issues #3, #4, #5, #19, #20.
2. **Должен ли продукт «ИИС к НБ» быть в UI?** — issue #4.
3. **Реальный тариф для «Уст.МП Х5» (`m.AR`)?** — issue #5.
4. **Должен ли «Вок» (`m.AO`) платиться?** — issue #19.
5. **Тариф для УП отдельно от Refusal?** — issue #7, #20.
6. **Поведение `m.AV` в истории** — пересчитывать актуальным тиром или замораживать на момент завершения? — issue #12.
7. **Нужен ли flow «спец-продукт + кросс»?** — issues #17, #34.
8. **Можно ли в LIST_ALL отмечать КК1 и КК2 одновременно?** — issue #27.

---

## 6. Чек-лист тестирования после фикса

После каждой правки проверить:

- [ ] **Smoke #1: Один ДК ВА+ТР+** — итог 310×0.87 = 270 ₽ (округлено).
- [ ] **Smoke #2: Один DC нерезидент ВА+ТР+, через LIST_ALL** — итог 570×0.87 = 496 ₽ (после фикса #2).
- [ ] **Smoke #3: КК1 ВА+ТР+ + ФЗ CC1** — (450·0+1·570) + 100 = 670, ×0.87 = 583 ₽.
- [ ] **Smoke #4: 1 БС, история пуста** — `bsRate=270`, итог 270×0.87 = 235 ₽.
- [ ] **Smoke #5: 11 БС в текущем месяце** — итог по 11-й БС: 430×0.87 = 374 ₽; первые 10 БС в дашборде должны пересчитаться по 430.
- [ ] **Regression #1: Назад → перевыбор** — поля не должны накапливаться (issue #1).
- [ ] **Regression #2: Битый localStorage** — `localStorage.setItem('alfa_h', 'bad')` → reload → не должно быть белого экрана (issue #9).
- [ ] **Regression #3: Селфи primary + Селфи cross + отжать cross** — `AC` должен вернуться к 1, не 2 (issue #10).
- [ ] **Regression #4: КН → завершить** — в результате не должно быть «iPhone ✗» (issue #8).
- [ ] **Regression #5: Refusal → УП** — флаги не конфликтуют (issue #7).

---

## 7. Не править без обсуждения

- **Структуру `localStorage` (`alfa_h`)** — можно расширять (новые поля), но не переименовывать существующие. Старые записи должны читаться.
- **Округление `Math.round(r)`** в `calcEarnings` — есть подозрение, что итоговые суммы сверяются с Excel, и любое изменение формы округления вызовет расхождения.
- **Множитель `0.87` (НДФЛ)** — только если пользователь подтвердит (например, ставка 13% → 0.87 = 1−0.13).

---

*Конец отчёта. Подготовлено для подачи в LLM-фиксер. Не редактируй структуру разделов — она важна для парсинга.*
