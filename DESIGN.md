# Agent House — design contract

Mode: **Operate** (glanceable status, not a game to play). Expression lives in the scene, not
in chrome. One idea per form: the house is the status; the header is the caption.

## World

A cozy pixel-art dollhouse cross-section at dusk, drawn flat — think early-90s VGA adventure
interiors, not neon cyberpunk and not corporate dashboard. Three rooms on one floor connected
by a bottom corridor:

```
┌────────────┬──────────────────┬─────────────┐
│  BEDROOM   │   LIVING ROOM    │   OFFICE    │
│  bunks,    │  sofa, rug,      │  rows of    │
│  night     │  lamp, shelf,    │  desks with │
│  window    │  plant           │  CRT lamps  │
└─────┬──────┴────────┬─────────┴──────┬──────┘
      └────────── corridor ────────────┘
```

Evening light, warm interior, dusk sky through windows. Furniture is rectilinear, 1px dark
outlines, no gradients, no blur, no glassmorphism. Pixel grid: integer coordinates, no
anti-aliased shapes (text and emoji excepted).

## Palette (tokens; canvas mirrors CSS vars)

| Token        | Hex       | Use                                  |
| ------------ | --------- | ------------------------------------ |
| `--page`     | `#12141c` | page background outside the house    |
| `--frame`    | `#2b2119` | house outline, furniture outlines    |
| `--wall-bed` | `#a9bcce` | bedroom wallpaper (cool, night)      |
| `--wall-liv` | `#e7d3ac` | living room wallpaper (warm)         |
| `--wall-off` | `#c9d3ae` | office wallpaper (sage)              |
| `--floor`    | `#a06a45` | main wood floor                      |
| `--floor-2`  | `#8a5a3b` | corridor planks / shadow rows        |
| `--ink`      | `#2b2119` | labels, outlines                     |
| `--muted`    | `#8b8171` | secondary text                       |
| `--working`  | `#f0a33a` | amber: actively working              |
| `--idle`     | `#7fb069` | green: idle / waiting                |
| `--sleeping` | `#6f7f95` | slate: not running                   |

Harness accents (ring around sprite + legend chip): opencode `#e07a5f`, codex `#5b8def`,
pi `#b48ead`, omp `#d9a441`, hermes `#6fb1a8`.

Bans: purple-blue gradients, glow/neon, translucent cards, emoji as UI chrome, three-column
marketing layout, "AI slop" sparkle iconography, text baked into background images.

## Typography

- One family: `ui-monospace, "Cascadia Mono", Consolas, monospace`.
- Title `AGENT HOUSE` 18px, 700, letter-spacing .18em, uppercase.
- Subtitle/caption 12px, `--muted`.
- Canvas labels: 11px monospace, `--ink`, single line, truncated with `…`.
- No display fonts, no italics.

## Layout / chrome

Page: dark `--page`, content centered, max width 980px. Header row: title + one-line
status sentence ("2 working · 1 idle · 2 sleeping") and a connection dot (green connected /
red disconnected). Below: the canvas (960×580 logical, scaled to fit width; crisp scaling).
Below: a single footer line with harness legend chips (name + accent dot) and a quiet hint.

No sidebars, no cards, no shadows. The scene is the interface.

## Motion

- Walk speed 40px/s on a waypoint path: room floor → doorway → corridor → doorway → target
  slot. No diagonal wall clipping.
- Walk bob at 6fps, 2px, snapped to integers; flip sprite by direction.
- Working: 2px bob + a dotted "…" typing bubble; tool name in a speech bubble for 4s.
- Sleeping: floating `z z z` above the sprite, slow.
- Idle: still, occasional single blink is allowed but not required.
- `prefers-reduced-motion`: snap to target, no bob, no floating letters.

## Components

- Character: 44px emoji glyph (subagents 30px), harness-accent ring + floor shadow ellipse
  (flat), name label below, title in parentheses if present.
- Subagent: dashed parent line, label `↳ parentName`.
- Speech bubble: cream rect, 1px ink outline, 11px mono text, 2px corner radius, tail triangle.
- Empty room: fixed furniture only, the room label dims.
- Disconnected banner: thin amber strip above canvas, "server offline — retrying".

## Copy rules

Sentence case for body, uppercase only for room labels and title. Room labels: `BEDROOM`,
`LIVING ROOM`, `OFFICE`. No exclamation marks, no fake enthusiasm.
