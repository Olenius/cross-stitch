# Cross-Stitch Patterns

A page with 10×10 cross-stitch patterns (square cells ~10×10 px) — currently
28 patterns, from simple motifs to a mini art gallery (Van Gogh, Monet,
Leonardo, Munch, Vermeer, Dalí, Klimt, Malevich, Aivazovsky, Shishkin,
Botticelli, Hopper, Matisse). Pattern data lives in `schemes.json`; the page
loads it via `fetch` on open.

## Running

```bash
npm start
# open http://localhost:8000
```

or any other HTTP server:

```bash
python3 -m http.server 8000
npx serve .
```

If the JSON still fails to load, the page shows instructions and a
“Show demo patterns” button (random symmetric motifs) so you can preview
the rendering.

## Deploying to Railway

1. Create a project at [railway.app](https://railway.app) → “Deploy from GitHub repo” → the `Olenius/cross-stitch` repository.
2. Railway detects Node.js from `package.json` and runs `npm start` (see `server.js`). No build step needed — there are no dependencies.
3. The port is taken from the `PORT` variable, which Railway sets automatically. For a public URL: Settings → Networking → Generate Domain.

## Files

| File          | Purpose                                            |
|---------------|----------------------------------------------------|
| `index.html`  | page markup                                        |
| `style.css`   | styles (cell size, grid, legend, tooltip)          |
| `app.js`      | JSON loading and pattern rendering                 |
| `schemes.json`| pattern data                                       |
| `server.js`   | static file server for deployment                  |
| `package.json`| start script for Railway and other platforms       |
| `convert.js`  | image → pattern converter (canvas + median cut)    |

## `schemes.json` format

```jsonc
{
  "meta": { "gridSize": 10, "emptyChar": "." },
  "schemes": [
    {
      "id": "heart",              // unique key (optional)
      "name": "Heart",
      "palette": {                // symbol -> color
        "R": { "hex": "#d32f2f", "name": "Red" }
      },
      "pattern": [                // 10 rows of 10 chars each
        "..........",
        ".RR....RR."
        // ...
      ]
    }
  ]
}
```

- Each `pattern` row is a scheme row; each character is a cell.
- The `.` character (or a space) is an empty cell (“fabric”, not stitched).
- Other characters are looked up in `palette`: `hex` is the fill color, `name` is the legend label.
- Instead of an object you can write just `"R": "#d32f2f"` — then the name = hex.
- Rows can also be arrays: `"pattern": [[".", "R", ...], ...]`.

## Image → pattern converter (this branch)

Drop or pick a PNG/JPG and get a 10×10 pattern with a reduced palette:

- the image is downscaled step-by-step to 10×10, averaging colors along the way;
- colors are quantized with the **median cut** algorithm to 2–10 colors
  (slider), near-duplicate colors are merged;
- letters are assigned by usage, most used color = `A`;
- the result is rendered with the same viewer (legend, stitch counts, tooltips)
  and can be downloaded as JSON in the `schemes.json` format.

Everything runs in the browser — the file never leaves your machine.

## Viewer features

- “Cell size” slider — cell size from 8 to 28 px;
- “grid” checkbox — lines between cells;
- hover over a cell — row, column, color name and hex;
- click a cell — copy the hex to the clipboard;
- under each pattern — a legend with the stitch count of each color.
