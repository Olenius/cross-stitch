(() => {
  'use strict';

  const schemesEl = document.getElementById('schemes');
  const errorEl = document.getElementById('loadError');
  const tooltip = document.getElementById('tooltip');
  const toast = document.getElementById('toast');
  const subtitle = document.getElementById('subtitle');
  const cellSizeInput = document.getElementById('cellSize');
  const cellSizeValue = document.getElementById('cellSizeValue');
  const gridLinesInput = document.getElementById('gridLines');

  const EMPTY_CHARS = new Set(['.', ' ', '', undefined, null]);

  /* ---------- utils ---------- */

  const el = (tag, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /** palette value can be a string (#hex) or an object {hex, name} */
  function paletteEntry(scheme, key) {
    const raw = scheme.palette && scheme.palette[key];
    if (!raw) return null;
    if (typeof raw === 'string') return { hex: raw, name: raw };
    return { hex: raw.hex, name: raw.name || raw.hex };
  }

  /* ---------- render ---------- */

  function render(schemes, target) {
    const root = target || schemesEl;
    root.innerHTML = '';
    let totalCrosses = 0;

    schemes.forEach((scheme, i) => {
      const card = el('article', 'card');

      const title = el('h2');
      title.innerHTML =
        `<span>${escapeHtml(scheme.name || 'Pattern ' + (i + 1))}</span>` +
        `<span class="num">${String(i + 1).padStart(2, '0')}</span>`;
      card.appendChild(title);

      // rows can be strings of chars or arrays of palette keys
      const rows = (scheme.pattern || []).map((r) => (Array.isArray(r) ? r.join('') : String(r)));
      const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);

      const grid = el('div', 'stitch-grid');
      grid.style.setProperty('--cols', cols);

      const usage = new Map(); // palette key -> { entry, count }

      rows.forEach((row, r) => {
        for (let c = 0; c < cols; c++) {
          const ch = row[c];
          const cell = el('div', 'cell');

          if (EMPTY_CHARS.has(ch)) {
            cell.classList.add('empty');
            cell.dataset.tip = `row ${r + 1}, column ${c + 1} — canvas (not stitched)`;
          } else {
            const entry = paletteEntry(scheme, ch);
            if (entry) {
              cell.style.background = entry.hex;
              cell.dataset.color = entry.hex;
              cell.dataset.tip = `row ${r + 1}, column ${c + 1} — ${entry.name} (${entry.hex})`;
              const u = usage.get(ch) || { entry, count: 0 };
              u.count++;
              usage.set(ch, u);
            } else {
              cell.classList.add('unknown');
              cell.dataset.tip = `row ${r + 1}, column ${c + 1} — symbol “${ch}” is missing from the palette`;
            }
          }
          grid.appendChild(cell);
        }
      });

      card.appendChild(grid);
      totalCrosses += [...usage.values()].reduce((s, u) => s + u.count, 0);

      // legend with the stitch count of each color
      const legend = el('div', 'legend');
      [...usage.values()]
        .sort((a, b) => b.count - a.count)
        .forEach(({ entry, count }) => {
          const chip = el('span', 'chip');
          chip.innerHTML =
            `<span class="swatch" style="background:${escapeHtml(entry.hex)}"></span>` +
            `${escapeHtml(entry.name)} · ${escapeHtml(entry.hex)} · ${count}×`;
          legend.appendChild(chip);
        });
      card.appendChild(legend);

      root.appendChild(card);
    });

    if (!target) {
      subtitle.textContent =
        `${schemes.length} patterns · ${totalCrosses} stitches total · data from schemes.json`;
    }
  }

  /* expose a minimal API for other scripts (e.g. the image converter) */
  window.CrossStitch = {
    renderPattern: (scheme, target) => render([scheme], target)
  };

  /* ---------- data loading ---------- */

  async function loadSchemes() {
    const res = await fetch('schemes.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : data.schemes;
  }

  function showLoadError(err) {
    errorEl.hidden = false;
    errorEl.querySelector('.err-detail').textContent =
      'Details: ' + String((err && err.message) || err);
    subtitle.textContent = 'failed to load schemes.json';
  }

  /* ---------- demo mode (when JSON is unavailable) ---------- */

  function randomDemoSchemes(count = 10) {
    const palettePool = [
      ['#d32f2f', '#f48fb1'],
      ['#1565c0', '#90caf9'],
      ['#2e7d32', '#a5d6a7'],
      ['#6a1b9a', '#ce93d8'],
      ['#e65100', '#ffcc80'],
      ['#00695c', '#80cbc4'],
    ];
    const letters = 'ABCDEFG';

    return Array.from({ length: count }, (_, i) => {
      const pair = palettePool[Math.floor(Math.random() * palettePool.length)];
      const palette = {};
      pair.forEach((hex, j) => { palette[letters[j]] = { hex, name: hex }; });

      const pattern = [];
      for (let r = 0; r < 10; r++) {
        let left = '';
        for (let c = 0; c < 5; c++) {
          const rnd = Math.random();
          if (rnd < 0.25) left += letters[0];
          else if (rnd < 0.45) left += letters[1];
          else left += '.';
        }
        pattern.push(left + [...left].reverse().join('')); // mirror symmetry
      }
      return { id: 'demo-' + i, name: 'Random Pattern No. ' + (i + 1), palette, pattern };
    });
  }

  document.getElementById('demoBtn').addEventListener('click', () => {
    errorEl.hidden = true;
    render(randomDemoSchemes());
  });

  /* ---------- tooltip + copy color on click ---------- */

  schemesEl.addEventListener('pointermove', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !cell.dataset.tip) {
      tooltip.classList.remove('visible');
      return;
    }
    tooltip.textContent = cell.dataset.tip;
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
    tooltip.classList.add('visible');
  });

  schemesEl.addEventListener('pointerleave', () => tooltip.classList.remove('visible'));

  schemesEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !cell.dataset.color) return;
    copyText(cell.dataset.color);
  });

  function copyText(text) {
    const done = () => showToast('Copied: ' + text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (_) { /* ignore */ }
    ta.remove();
  }

  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 1400);
  }

  /* ---------- viewer settings ---------- */

  cellSizeInput.addEventListener('input', () => {
    document.documentElement.style.setProperty('--cell', cellSizeInput.value + 'px');
    cellSizeValue.textContent = cellSizeInput.value + 'px';
  });

  gridLinesInput.addEventListener('change', () => {
    document.body.classList.toggle('show-lines', gridLinesInput.checked);
  });

  /* ---------- start ---------- */

  loadSchemes()
    .then((schemes) => render(schemes || []))
    .catch(showLoadError);
})();
