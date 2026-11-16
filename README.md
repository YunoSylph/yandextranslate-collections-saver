# Yandex Translate Collections Saver

Инструмент для экспорта подборок слов и выражений из Яндекс Переводчика в CSV (https://translate.yandex.ru/collections). Ничего не надо устанавливать, выполняется прямо в браузере. Позволяет сохранить отдельную подборку или сразу все подборки сразу, включая раздел "Мои подписки" в CSV. Работает и с длинными списками, где слова появляются только при прокрутке. А там уже файл можно скармливать это anki, ИИшкам, кто как хочет.

### Как пользоваться

1. Открой [подборки](https://translate.yandex.ru/collections).
2. Нажми в браузере на странице подборок **F12 → Console** (также известное как Консоль).
3. Ниже раскрой нужный вариант, нажми **Copy** в углу блока с кодом.
4. Вставь код в консоль и нажми **Enter**. Выбери текущую подборку или все сразу. (Также может потребоваться первой командой вписать и отправить в консоль **allow pasting**)

### Почему скрипта два, че выбрать?

- **Если в подборках языки не намешаны** — всё в одном файле. Слова из разных языков и подборок не разделяются. Выбор через обычное окно браузера надо ввести свой выбор (`all` / `current`)
- **Если в подборках бывают намешаны языки а надо разделить на отдельные файлы** — Если в подборках намешал языки, тут оно сохраняет каждый язык отдельным файлом например `Common — Английский - Русский.csv`, `Common — Анимецкий - Валирийский.csv`. Несколько файлов скачиваются одним ZIP-архивом

### Скопировать скрипт

Открой нужный вариант и нажми **Copy** в правом верхнем углу его кода.

<details>
<summary><strong>📄 У меня подборки без миксов языковых пар внутри</strong></summary>

```javascript
/**
 * Откройте https://translate.yandex.ru/collections
 * F12 → Console → вставьте этот код → Enter.
 * Никаких библиотек и расширений не требуется.
 */
(async () => {
  'use strict';

  const PREFIX = '[Collections Saver]';
  const root = document.querySelector('#collections');

  if (!root) {
    console.error(PREFIX, 'Откройте страницу подборок Яндекс Переводчика.');
    return;
  }
  if (window.__ycsRunning) {
    console.warn(PREFIX, 'Другой экспорт уже выполняется.');
    return;
  }

  // Встроенное окно браузера вместо отдельного интерфейса.
  const answer = prompt(
    'Что сохранить?\nall — все подборки\ncurrent — текущую подборку',
    'all'
  );
  if (answer === null) return;

  const mode = answer.trim().toLowerCase();
  if (mode !== 'all' && mode !== 'current') {
    console.error(PREFIX, 'Введите all или current.');
    return;
  }

  window.__ycsRunning = true;
  window.__ycsStop = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tabs = () => [...root.querySelectorAll(
    '[role="tab"][aria-controls^="panel:r1:"]'
  )];
  const active = () => tabs().find(tab =>
    tab.getAttribute('aria-selected') === 'true'
  );
  const panel = tab => document.getElementById(tab.getAttribute('aria-controls'));
  const rows = tab => [...(panel(tab)?.querySelectorAll('[role="listitem"]') || [])];
  const nameOf = tab =>
    tab.querySelector('div[tabindex="0"] span')?.textContent.trim() ||
    tab.textContent.trim().replace(/\s*\d+\s*$/, '') ||
    'Подборка';
  const countOf = tab => {
    const numbers = [...tab.querySelectorAll('span')]
      .map(el => el.textContent.trim())
      .filter(text => /^\d[\d\s]*$/.test(text));
    return numbers.length ? Number(numbers.at(-1).replace(/\s/g, '')) : null;
  };

  // Тексты берём по порядку: исходный и переведённый.
  // Языки не разделяются: все записи сохраняются вместе.
  function getPair(row) {
    const sides = [...(row.children[1]?.children || [])];
    const values = sides.map(side =>
      side.querySelector('[tabindex="0"]')?.textContent.trim()
    );
    return values.length >= 2 && values[0] && values[1]
      ? values.slice(0, 2)
      : null;
  }

  function findScroller(tab) {
    for (
      let el = rows(tab)[0]?.parentElement;
      el && el !== document.body;
      el = el.parentElement
    ) {
      const style = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 6 &&
          /(auto|scroll|hidden)/.test(style.overflowY)) return el;
    }

    // Короткая подборка может не иметь прокрутки: это не ошибка.
    return [...(panel(tab)?.querySelectorAll('*') || [])]
      .filter(el => el.scrollHeight > el.clientHeight + 6 &&
        /(auto|scroll)/.test(getComputedStyle(el).overflowY))
      .sort((a, b) =>
        (b.scrollHeight - b.clientHeight) -
        (a.scrollHeight - a.clientHeight))[0] || null;
  }

  async function selectTab(tab) {
    if (active() !== tab) {
      (tab.querySelector('[tabindex="0"]') || tab).click();
    }
    for (let i = 0; i < 40 && !window.__ycsStop; i++) {
      if (active() === tab && (rows(tab).length || countOf(tab) === 0)) break;
      await sleep(200);
    }
    await sleep(250);
  }

  async function readCollection(tab) {
    await selectTab(tab);
    const expected = countOf(tab);
    const found = new Map();

    const collect = () => {
      for (const row of rows(tab)) {
        const pair = getPair(row);
        if (pair) found.set(JSON.stringify(pair), pair);
      }
    };

    collect();
    let scroller = findScroller(tab);
    if (scroller) {
      scroller.scrollTop = 0;
      await sleep(450);
      collect();
      let stopped = 0;

      for (let i = 0; i < 12000 && !window.__ycsStop; i++) {
        if (!scroller.isConnected) {
          scroller = findScroller(tab);
          if (!scroller) break;
          stopped = 0;
        }

        const before = scroller.scrollTop;
        scroller.scrollTop += Math.max(70, Math.floor(scroller.clientHeight * .45));
        await sleep(210);
        collect();

        stopped = Math.abs(scroller.scrollTop - before) < 2 ? stopped + 1 : 0;
        if (expected !== null && found.size >= expected) break;
        if (stopped >= 7) break;
      }
    }

    collect();
    return {
      name: nameOf(tab),
      expected,
      pairs: [...found.values()]
    };
  }

  const csvCell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const safeName = value => String(value).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').slice(0, 100);

  function download(results, filename) {
    const lines = [
      ['Текст', 'Перевод', 'Подборка'],
      ...results.flatMap(result =>
        result.pairs.map(([text, translation]) =>
          [text, translation, result.name]))
    ];
    const csv = '\uFEFF' + lines
      .map(line => line.map(csvCell).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {
      type: 'text/csv;charset=utf-8'
    }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  const originallySelected = active();
  try {
    const selectedTabs = mode === 'all'
      ? tabs()
      : [active() || tabs()[0]].filter(Boolean);
    if (!selectedTabs.length) throw Error('Подборки не найдены.');

    const results = [];
    for (const [index, tab] of selectedTabs.entries()) {
      if (window.__ycsStop) break;
      console.log(PREFIX, `${index + 1}/${selectedTabs.length}: ${nameOf(tab)}`);
      const result = await readCollection(tab);
      results.push(result);
      console.log(PREFIX, `${result.name}: ${result.pairs.length} / ${result.expected ?? '?'}`);
    }

    // После отмены не скачиваем неполный результат молча.
    if (window.__ycsStop) {
      console.warn(PREFIX, 'Экспорт отменён.');
      return;
    }

    const total = results.reduce((sum, result) => sum + result.pairs.length, 0);
    if (!total) throw Error('Записи не найдены.');

    const filename = mode === 'all'
      ? 'Yandex-Collections.csv'
      : `${safeName(results[0].name)}.csv`;
    download(results, filename);

    console.table(results.map(result => ({
      Подборка: result.name,
      Собрано: result.pairs.length,
      Ожидалось: result.expected
    })));
    const incomplete = results.filter(result =>
      result.expected !== null && result.pairs.length !== result.expected
    );
    if (incomplete.length) console.warn(PREFIX, 'Проверьте неполные подборки:', incomplete);
    console.log(PREFIX, `Готово: ${total} записей, ${results.length} подборок.`);
  } catch (error) {
    console.error(PREFIX, error);
  } finally {
    if (originallySelected?.isConnected && active() !== originallySelected) {
      (originallySelected.querySelector('[tabindex="0"]') || originallySelected).click();
    }
    window.__ycsRunning = false;
  }
})();
```

</details>

<details>
<summary><strong>📂 У меня в подборке намешаны языки, хочу разделить на отдельные файлы каждую языковую пару</strong></summary>

```javascript
/**
 * Yandex Translate Collections Saver — экспорт по языковым парам
 * Откройте https://translate.yandex.ru/collections → F12 → Console.
 * Вставьте весь код и нажмите Enter.
 */
(async () => {
  'use strict';

  const root = document.querySelector('#collections');
  if (!root) return console.error('Откройте страницу подборок Яндекс Переводчика.');
  if (window.__ycsRunning) return console.warn('Экспорт уже выполняется.');
  document.querySelector('#ycs-dialog')?.remove();

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tabs = () => [...root.querySelectorAll('[role="tab"][aria-controls^="panel:r1:"]')];
  const active = () => tabs().find(t => t.getAttribute('aria-selected') === 'true');
  const panel = tab => document.getElementById(tab.getAttribute('aria-controls'));
  const rows = tab => [...(panel(tab)?.querySelectorAll('[role="listitem"]') || [])];
  const nameOf = tab => tab.querySelector('div[tabindex="0"] span')?.textContent.trim() ||
    tab.textContent.trim().replace(/\s*\d+\s*$/, '') || 'Подборка';
  const countOf = tab => {
    const numbers = [...tab.querySelectorAll('span')].map(s => s.textContent.trim())
      .filter(s => /^\d[\d\s]*$/.test(s));
    return numbers.length ? Number(numbers.at(-1).replace(/\s/g, '')) : null;
  };

  // Языки определяются по ссылке каждой карточки, а не по названию подборки.
  const known = {
    ru: 'Русский', en: 'Английский', zh: 'Китайский', de: 'Немецкий',
    fr: 'Французский', es: 'Испанский', ja: 'Японский', ko: 'Корейский',
    it: 'Итальянский', tr: 'Турецкий', pt: 'Португальский',
    uk: 'Украинский', be: 'Белорусский', kk: 'Казахский'
  };
  const languageNames = Object.fromEntries(Object.entries(known).map(([k, v]) => [v.toLowerCase(), k]));
  const displayName = code => {
    if (!code) return 'Неизвестный язык';
    if (known[code]) return known[code];
    try {
      const text = new Intl.DisplayNames(['ru'], { type: 'language' }).of(code);
      return text[0].toUpperCase() + text.slice(1);
    } catch { return code; }
  };

  function getCard(row) {
    const sides = [...(row.children[1]?.children || [])];
    const pair = sides.map(side => side.querySelector('[tabindex="0"]')?.textContent.trim());
    if (pair.length < 2 || !pair[0] || !pair[1]) return null;

    let from = '', to = '';
    const link = row.querySelector('a[href*="source_lang="][href*="target_lang="]');
    if (link) {
      try {
        const params = new URL(link.href, location.href).searchParams;
        from = params.get('source_lang') || '';
        to = params.get('target_lang') || '';
      } catch { /* Попробуем подписи карточки. */ }
    }

    // Резервный способ: подписи языков вокруг стрелки в карточке.
    if (!from || !to) {
      const label = row.children[0]?.querySelector('[tabindex="0"]');
      const labels = [...(label?.childNodes || [])]
        .filter(node => node.nodeType === 3)
        .map(node => node.textContent.trim().toLowerCase()).filter(Boolean);
      if (labels.length >= 2) {
        from ||= languageNames[labels[0]] || labels[0];
        to ||= languageNames[labels[1]] || labels[1];
      }
    }
    return { text: pair[0], translation: pair[1], from, to };
  }

  // На коротких подборках прокрутки может вообще не быть — это нормально.
  function findScroller(tab) {
    for (let el = rows(tab)[0]?.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 6 &&
          /(auto|scroll|hidden)/.test(getComputedStyle(el).overflowY)) return el;
    }
    return [...(panel(tab)?.querySelectorAll('*') || [])]
      .filter(el => el.scrollHeight > el.clientHeight + 6 &&
        /(auto|scroll)/.test(getComputedStyle(el).overflowY))
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0] || null;
  }

  // Небольшое окно с двумя кнопками.
  const overlay = document.createElement('div');
  overlay.id = 'ycs-dialog';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', display: 'grid',
    placeItems: 'center', background: 'rgba(0,0,0,.5)', fontFamily: 'Arial,sans-serif'
  });
  const box = document.createElement('div');
  Object.assign(box.style, {
    width: 'min(410px,calc(100vw - 32px))', boxSizing: 'border-box',
    background: '#fff', color: '#222', padding: '24px', borderRadius: '16px',
    boxShadow: '0 12px 50px #0004'
  });
  const heading = document.createElement('h2');
  heading.textContent = 'Yandex Collections Saver';
  heading.style.cssText = 'margin:0 0 8px;font-size:21px';
  const info = document.createElement('p');
  info.textContent = 'Каждая подборка и языковая пара — отдельный CSV.';
  info.style.cssText = 'color:#666;font-size:14px;margin:0 0 18px';
  const makeButton = (title, background) => {
    const btn = document.createElement('button');
    btn.textContent = title;
    btn.type = 'button';
    btn.style.cssText = 'border:0;border-radius:10px;padding:12px;cursor:pointer;font-size:14px;font-weight:600;width:100%';
    btn.style.background = background;
    return btn;
  };
  const allBtn = makeButton('Сохранить все подборки', '#ffdb4d');
  const currentBtn = makeButton('Сохранить текущую подборку', '#f0f1f3');
  const stopBtn = makeButton('Закрыть', '#fff');
  const progress = document.createElement('progress');
  progress.max = 100;
  progress.value = 0;
  progress.style.cssText = 'width:100%;height:9px;display:none';
  const status = document.createElement('p');
  status.style.cssText = 'white-space:pre-line;overflow-wrap:anywhere;color:#666;font-size:13px;margin:12px 0 0';
  status.textContent = `Найдено подборок: ${tabs().length}`;
  box.append(heading, info, allBtn, currentBtn, stopBtn, progress, status);
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.gap = '10px';
  overlay.append(box);
  document.body.append(overlay);

  const update = message => { status.textContent = message; console.log('[YCS]', message); };
  let cancelled = false;

  async function selectTab(tab) {
    if (active() !== tab) (tab.querySelector('[tabindex="0"]') || tab).click();
    for (let i = 0; i < 40 && !cancelled; i++) {
      if (active() === tab && (rows(tab).length || countOf(tab) === 0)) break;
      await sleep(200);
    }
    await sleep(250);
  }

  async function collectTab(tab, index, total) {
    await selectTab(tab);
    const name = nameOf(tab);
    const expected = countOf(tab);
    const seen = new Map();
    const collect = () => {
      for (const row of rows(tab)) {
        const item = getCard(row);
        if (item) seen.set(JSON.stringify([item.text, item.translation, item.from, item.to]), item);
      }
    };
    collect();
    let scroller = findScroller(tab);
    if (scroller) {
      scroller.scrollTop = 0;
      await sleep(450);
      collect();
      let stuck = 0;
      for (let i = 0; i < 12000 && !cancelled; i++) {
        const before = scroller.scrollTop;
        scroller.scrollTop += Math.max(70, Math.floor(scroller.clientHeight * .45));
        await sleep(210);
        collect();
        if (Math.abs(scroller.scrollTop - before) < 2) stuck++;
        else stuck = 0;
        if (i % 8 === 0) update(`Подборка ${index + 1}/${total}: ${name}\nСобрано ${seen.size} из ${expected ?? '?'}`);
        if (expected !== null && seen.size >= expected) break;
        if (stuck >= 7) break;
        if (!scroller.isConnected) {
          scroller = findScroller(tab);
          if (!scroller) break;
          stuck = 0;
        }
      }
    }
    collect();
    return { name, expected, items: [...seen.values()] };
  }

  const cleanFilename = text => String(text).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').trim().slice(0, 130) || 'Подборка';
  const csvCell = text => '"' + String(text ?? '').replace(/"/g, '""') + '"';
  const makeCSV = items => '\uFEFF' + [
    ['Текст', 'Перевод'],
    ...items.map(x => [x.text, x.translation])
  ].map(row => row.map(csvCell).join(';')).join('\r\n');

  // ZIP без сторонних библиотек: файлы сохраняются без сжатия.
  // Это избавляет от блокировки множества скачиваний в Chrome.
  function createZip(files) {
    const encoder = new TextEncoder();
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    const crc32 = bytes => {
      let c = 0xFFFFFFFF;
      for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    };
    const chunks = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const local = new Uint8Array(30);
      const l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x0800, true); // UTF-8
      l.setUint16(12, 33, true); // 1980-01-01
      l.setUint32(14, crc, true);
      l.setUint32(18, data.length, true);
      l.setUint32(22, data.length, true);
      l.setUint16(26, name.length, true);
      chunks.push(local, name, data);

      const central = new Uint8Array(46);
      const d = new DataView(central.buffer);
      d.setUint32(0, 0x02014b50, true);
      d.setUint16(4, 20, true);
      d.setUint16(6, 20, true);
      d.setUint16(8, 0x0800, true);
      d.setUint16(14, 33, true);
      d.setUint32(16, crc, true);
      d.setUint32(20, data.length, true);
      d.setUint32(24, data.length, true);
      d.setUint16(28, name.length, true);
      d.setUint32(42, offset, true);
      directory.push(central, name);
      directorySize += central.length + name.length;
      offset += local.length + name.length + data.length;
    }
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, directorySize, true);
    e.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function run(mode) {
    if (window.__ycsRunning) return;
    window.__ycsRunning = true;
    cancelled = false;
    allBtn.disabled = currentBtn.disabled = true;
    stopBtn.textContent = 'Отменить';
    progress.style.display = 'block';
    const initialTab = active();
    const choices = mode === 'all' ? tabs() : [active() || tabs()[0]].filter(Boolean);
    const groups = [];
    const report = [];
    try {
      if (!choices.length) throw Error('Подборки не найдены');
      for (const [index, tab] of choices.entries()) {
        if (cancelled) break;
        const result = await collectTab(tab, index, choices.length);
        report.push({ Подборка: result.name, Собрано: result.items.length, Ожидалось: result.expected });
        const pairs = new Map();
        for (const item of result.items) {
          const key = JSON.stringify([item.from, item.to]);
          if (!pairs.has(key)) pairs.set(key, []);
          pairs.get(key).push(item);
        }
        for (const items of pairs.values()) {
          const { from, to } = items[0];
          const name = cleanFilename(`${result.name} — ${displayName(from)} - ${displayName(to)}.csv`);
          groups.push({ name, content: makeCSV(items) });
        }
        progress.value = 100 * (index + 1) / choices.length;
      }
      if (cancelled) {
        update('Экспорт отменён. Файлы не сохранялись.');
        return;
      }
      if (!groups.length) throw Error('Не удалось найти записи для экспорта');

      // Защита от одинаковых имён файлов.
      const names = new Map();
      for (const group of groups) {
        const count = (names.get(group.name) || 0) + 1;
        names.set(group.name, count);
        if (count > 1) group.name = group.name.replace(/\.csv$/i, ` (${count}).csv`);
      }
      if (mode === 'current' && groups.length === 1) {
        download(new Blob([groups[0].content], { type: 'text/csv;charset=utf-8' }), groups[0].name);
      } else {
        download(createZip(groups), 'Yandex-Collections.zip');
      }
      console.table(report);
      update(`Готово! Подборок: ${report.length}; файлов CSV: ${groups.length}; записей: ${report.reduce((n, r) => n + r.Собрано, 0)}.`);
      const incomplete = report.filter(r => r.Ожидалось !== null && r.Ожидалось !== r.Собрано);
      if (incomplete.length) console.warn('Возможно, не все записи были загружены:', incomplete);
    } catch (error) {
      console.error('[YCS]', error);
      update('Ошибка: ' + error.message);
    } finally {
      if (initialTab?.isConnected && active() !== initialTab) {
        (initialTab.querySelector('[tabindex="0"]') || initialTab).click();
      }
      window.__ycsRunning = false;
      stopBtn.textContent = 'Закрыть';
    }
  }

  allBtn.onclick = () => run('all');
  currentBtn.onclick = () => run('current');
  stopBtn.onclick = () => {
    if (window.__ycsRunning) {
      cancelled = true;
      update('Останавливаем экспорт...');
    } else overlay.remove();
  };
})();
```

</details>

Оба скрипта работают прямо во вкладке браузера: ничего устанавливать не нужно. После экспорта проверь число сохранённых записей в консоли — если оно меньше числа в Яндексе, выгрузка могла быть неполной.

Если удобнее, код есть и отдельными файлами: [`saver-one-csv.js`](saver.js) · [`saver-by-language.js`](saver-sep-language.js).
