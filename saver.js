/**
 * Yandex Translate Collections Saver — один CSV
 * Сохраняет одну или все подборки в один CSV.
 *
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
