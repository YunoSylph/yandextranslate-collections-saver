
/* Yandex Translate Collections Saver
   Paste into Chrome DevTools Console.
   Modes: all / current
   Exports UTF-8 CSV, no external network requests.
*/
(async () => {
  'use strict';

  const PREFIX = '[Collections Saver]';

  if (window.__collectionsSaverRunning) {
    console.warn(PREFIX, 'Export is already running.');
    return;
  }

  const root = document.querySelector('#collections');

  if (!root) {
    console.error(
      PREFIX,
      'Open https://translate.yandex.ru/collections first.'
    );
    return;
  }

  const input = prompt(
    'Export mode:\n' +
    'all — all collections\n' +
    'current — selected collection',
    'all'
  );

  if (input === null) return;

  const mode = input.trim().toLowerCase();

  if (!['all', 'current'].includes(mode)) {
    console.error(PREFIX, 'Enter all or current.');
    return;
  }

  window.__collectionsSaverRunning = true;
  window.__collectionsSaverStop = false;

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const tabs = () =>
    [...root.querySelectorAll(
      '[role="tab"][aria-controls^="panel:r1:"]'
    )];

  const active = () =>
    tabs().find(tab =>
      tab.getAttribute('aria-selected') === 'true'
    );

  const nameOf = tab =>
    tab.querySelector('div[tabindex="0"] span')
      ?.textContent?.trim() ||
    tab.textContent.trim().replace(/\s*\d+\s*$/, '');

  const countOf = tab => {
    const numbers = [...tab.querySelectorAll('span')]
      .map(el => el.textContent.trim())
      .filter(text => /^\d[\d\s]*$/.test(text));

    return numbers.length
      ? Number(numbers.at(-1).replace(/\s/g, ''))
      : null;
  };

  const panel = tab =>
    document.getElementById(
      tab.getAttribute('aria-controls')
    );

  const rows = tab =>
    [...(panel(tab)?.querySelectorAll(
      '[role="listitem"]'
    ) || [])];

  const pairOf = row => {
    const body = row.children[1];
    const sides = body ? [...body.children] : [];

    const texts = sides.map(side =>
      side.querySelector('[tabindex="0"]')
        ?.textContent?.trim()
    );

    if (texts.length < 2 || !texts[0] || !texts[1]) {
      return null;
    }

    return texts.slice(0, 2);
  };

  function findScroller(tab) {
    const first = rows(tab)[0];

    for (
      let el = first?.parentElement;
      el && el !== document.body;
      el = el.parentElement
    ) {
      const style = getComputedStyle(el);

      if (
        el.scrollHeight > el.clientHeight + 6 &&
        /(auto|scroll|hidden)/.test(style.overflowY)
      ) {
        return el;
      }
    }

    const candidates = [
      ...(panel(tab)?.querySelectorAll('*') || [])
    ].filter(el => {
      const style = getComputedStyle(el);

      return (
        el.scrollHeight > el.clientHeight + 6 &&
        /(auto|scroll)/.test(style.overflowY)
      );
    });

    return candidates.sort(
      (a, b) =>
        (b.scrollHeight - b.clientHeight) -
        (a.scrollHeight - a.clientHeight)
    )[0] || null;
  }

  const output = [];
  const report = [];
  const selectedBefore = active();

  async function selectTab(tab) {
    if (active() !== tab) {
      (tab.querySelector('[tabindex="0"]') || tab)
        .click();

      for (
        let i = 0;
        i < 35 && !window.__collectionsSaverStop;
        i++
      ) {
        if (
          active() === tab &&
          (rows(tab).length || countOf(tab) === 0)
        ) {
          break;
        }

        await sleep(200);
      }
    }

    for (
      let i = 0;
      i < 25 &&
      !rows(tab).length &&
      !window.__collectionsSaverStop;
      i++
    ) {
      await sleep(200);
    }

    await sleep(220);
  }

  async function exportTab(tab) {
    const name = nameOf(tab);
    const expected = countOf(tab);

    await selectTab(tab);

    const seen = new Map();

    const collect = () => {
      for (const row of rows(tab)) {
        const pair = pairOf(row);

        if (pair) {
          seen.set(JSON.stringify(pair), pair);
        }
      }
    };

    collect();

    let scroller = findScroller(tab);

    if (scroller) {
      scroller.scrollTop = 0;
      await sleep(450);
      collect();

      let stationary = 0;

      for (
        let i = 0;
        i < 12000 && !window.__collectionsSaverStop;
        i++
      ) {
        const before = scroller.scrollTop;

        const step = Math.max(
          70,
          Math.floor(scroller.clientHeight * 0.45)
        );

        scroller.scrollTop = before + step;

        await sleep(210);
        collect();

        const after = scroller.scrollTop;

        if (Math.abs(after - before) < 2) {
          stationary++;
        } else {
          stationary = 0;
        }

        if (i % 25 === 0) {
          console.log(
            PREFIX,
            name,
            seen.size,
            '/',
            expected ?? '?'
          );
        }

        if (
          expected !== null &&
          seen.size >= expected
        ) {
          break;
        }

        if (stationary >= 7) {
          break;
        }

        // Handle React replacing the scroll node
        if (!scroller.isConnected) {
          scroller = findScroller(tab);

          if (!scroller) break;

          stationary = 0;
        }
      }
    } else {
      // Small collections do not need scrolling
      console.log(
        PREFIX,
        name,
        'No scrollbar. Collecting visible cards.'
      );
    }

    collect();

    const pairs = [...seen.values()];

    output.push(
      ...pairs.map(([english, russian]) => [
        english,
        russian,
        name
      ])
    );

    report.push({
      name,
      collected: pairs.length,
      expected,
      complete:
        expected === null
          ? null
          : pairs.length === expected
    });

    console.log(
      PREFIX,
      `${name}: ${pairs.length}` +
      (expected === null ? '' : ` / ${expected}`)
    );
  }

  const cell = value =>
    '"' +
    String(value ?? '').replace(/"/g, '""') +
    '"';

  function download() {
    const lines = [
      ['English', 'Russian', 'Collection'],
      ...output
    ];

    const csv = '\uFEFF' +
      lines
        .map(row => row.map(cell).join(';'))
        .join('\r\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;

    link.download = mode === 'all'
      ? 'yandex-collections-all.csv'
      : 'yandex-' +
        nameOf(selectedBefore || tabs()[0])
          .replace(/[\\/:*?"<>|]/g, '_') +
        '.csv';

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      30000
    );
  }

  try {
    const choices = mode === 'all'
      ? tabs()
      : [active() || tabs()[0]];

    if (!choices.length || !choices[0]) {
      throw new Error('No collections found.');
    }

    for (const tab of choices) {
      if (window.__collectionsSaverStop) {
        break;
      }

      await exportTab(tab);
    }

    if (output.length) {
      download();
    }

    console.table(report);

    const incomplete = report.filter(
      item => item.complete === false
    );

    if (incomplete.length) {
      console.warn(
        PREFIX,
        'Potentially incomplete collections:',
        incomplete.map(item => item.name).join(', ')
      );
    }

    console.log(
      PREFIX,
      `Finished: ${output.length} translations ` +
      `across ${report.length} collections.`
    );

  } catch (error) {
    console.error(PREFIX, error);

  } finally {
    // Restore original selected collection
    if (
      selectedBefore &&
      selectedBefore.isConnected &&
      active() !== selectedBefore
    ) {
      (
        selectedBefore.querySelector(
          '[tabindex="0"]'
        ) || selectedBefore
      ).click();
    }

    window.__collectionsSaverRunning = false;
  }
})();
