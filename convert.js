/* Image → 10×10 cross-stitch pattern converter.
   Runs entirely in the browser: the image is drawn to a canvas,
   downscaled with averaging, then colors are quantized with median cut. */
(() => {
  'use strict';

  const GRID = 10;
  const LETTERS = 'ABCDEFGHIJ';

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const colorCount = document.getElementById('colorCount');
  const statusEl = document.getElementById('convStatus');
  const resultEl = document.getElementById('convResult');
  const previewEl = document.getElementById('convPreview');
  const patternEl = document.getElementById('convPattern');
  const downloadBtn = document.getElementById('downloadBtn');

  let current = null; // { name, pixels: [[r,g,b]×100] }
  let currentScheme = null;

  /* ---------- downsampling ---------- */

  /* Stepwise halving before the final GRID×GRID pass gives much better
     color averaging on large images than a single drawImage call. */
  function imageToPixels(img) {
    let w = img.naturalWidth, h = img.naturalHeight;
    let canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    while (w > GRID * 2 && h > GRID * 2) {
      w = Math.max(GRID, Math.floor(w / 2));
      h = Math.max(GRID, Math.floor(h / 2));
      const small = document.createElement('canvas');
      small.width = w; small.height = h;
      const sctx = small.getContext('2d');
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(canvas, 0, 0, w, h);
      canvas = small; ctx = sctx;
    }

    const out = document.createElement('canvas');
    out.width = GRID; out.height = GRID;
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, 0, 0, GRID, GRID);

    const data = octx.getImageData(0, 0, GRID, GRID).data;
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    return pixels; // row-major, 100 pixels
  }

  /* ---------- median cut quantization ---------- */

  function channelRange(bucket, ch) {
    let min = 255, max = 0;
    for (const p of bucket) {
      if (p[ch] < min) min = p[ch];
      if (p[ch] > max) max = p[ch];
    }
    return max - min;
  }

  function medianCut(pixels, k) {
    let buckets = [pixels.slice()];

    while (buckets.length < k) {
      let bestIdx = -1, bestCh = 0, bestScore = 0;

      buckets.forEach((bucket, i) => {
        if (bucket.length < 2) return;
        for (let ch = 0; ch < 3; ch++) {
          const range = channelRange(bucket, ch);
          /* prefer wide-ranging buckets, break ties by pixel count */
          const score = range * Math.sqrt(bucket.length);
          if (score > bestScore) { bestScore = score; bestIdx = i; bestCh = ch; }
        }
      });

      if (bestIdx === -1) break; // nothing left to split

      const bucket = buckets[bestIdx].slice().sort((a, b) => a[bestCh] - b[bestCh]);
      const mid = Math.floor(bucket.length / 2);
      buckets.splice(bestIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
    }

    return buckets.map((bucket) => {
      const sum = [0, 0, 0];
      for (const p of bucket) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
      return sum.map((s) => Math.round(s / bucket.length));
    });
  }

  /* perceptually weighted Euclidean distance */
  function colorDist(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr * 2 + dg * dg * 4 + db * db * 3;
  }

  /* Over-partition with median cut, then iteratively merge the closest
     colors (weighted by pixel count) down to k. This avoids muddy
     in-between colors and duplicates in the final palette. */
  function quantize(pixels, k) {
    let colors = medianCut(pixels, Math.min(k * 2, 24));

    /* drop exact duplicates right away: an image with fewer distinct
       colors than k should not get a bloated palette */
    colors = [...new Map(colors.map((c) => [c.join(','), c])).values()];

    const nearest = (p) => {
      let best = 0, bestDist = Infinity;
      colors.forEach((c, ci) => {
        const d = colorDist(p, c);
        if (d < bestDist) { bestDist = d; best = ci; }
      });
      return best;
    };

    let assign = pixels.map(nearest);

    while (colors.length > k) {
      let mi = 0, mj = 1, minDist = Infinity;
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const d = colorDist(colors[i], colors[j]);
          if (d < minDist) { minDist = d; mi = i; mj = j; }
        }
      }

      const counts = new Array(colors.length).fill(0);
      assign.forEach((a) => counts[a]++);

      /* weighted average of the two closest colors */
      const w1 = counts[mi] || 1, w2 = counts[mj] || 1;
      colors[mi] = colors[mi].map((v, ch) =>
        Math.round((v * w1 + colors[mj][ch] * w2) / (w1 + w2)));
      colors.splice(mj, 1);

      assign = assign.map((a) => {
        if (a === mj) return mi;
        if (a > mj) return a - 1;
        return a;
      });
    }

    /* final pass: reassign every pixel to the nearest remaining color */
    return { colors, assign: pixels.map(nearest) };
  }

  /* ---------- pattern building ---------- */

  function buildScheme(name, pixels, k) {
    const { colors, assign } = quantize(pixels, k);

    /* letters sorted by usage, most used first */
    const counts = new Array(colors.length).fill(0);
    assign.forEach((a) => counts[a]++);

    const order = colors
      .map((_, ci) => ci)
      .sort((a, b) => counts[b] - counts[a]);
    const letterOf = new Array(colors.length);
    order.forEach((ci, rank) => { letterOf[ci] = LETTERS[rank]; });

    const palette = {};
    order.forEach((ci, rank) => {
      const [r, g, b] = colors[ci];
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      palette[LETTERS[rank]] = { hex, name: hex };
    });

    const pattern = [];
    for (let r = 0; r < GRID; r++) {
      pattern.push(assign.slice(r * GRID, r * GRID + GRID).map((ci) => letterOf[ci]).join(''));
    }

    return {
      id: 'converted-image',
      name: name + ' → 10×10',
      palette,
      pattern
    };
  }

  /* ---------- UI ---------- */

  function setStatus(text, isError) {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function rerender() {
    if (!current) return;
    currentScheme = buildScheme(current.name, current.pixels, Number(colorCount.value));
    window.CrossStitch.renderPattern(currentScheme, patternEl);
  }

  function loadImage(file) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setStatus('Unsupported file type — please use PNG or JPG.', true);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      current = { name: file.name, pixels: imageToPixels(img) };
      previewEl.src = url;
      resultEl.hidden = false;
      setStatus(file.name + ' → ' + GRID + '×' + GRID + ' cells, ' +
                colorCount.value + ' colors (median cut)');
      rerender();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus('Could not read the image.', true);
    };
    img.src = url;
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadImage(fileInput.files[0]);
    fileInput.value = '';
  });

  ['dragover', 'dragenter'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add('over');
    }));
  ['dragleave', 'drop'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove('over');
    }));
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) loadImage(file);
  });

  colorCount.addEventListener('change', () => {
    if (current) rerender();
  });

  downloadBtn.addEventListener('click', () => {
    if (!currentScheme) return;
    const blob = new Blob([JSON.stringify(currentScheme, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pattern-10x10.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
