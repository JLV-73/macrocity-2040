# MacroCity 2040 🏙️

A browser-based 3D city-builder simulation set in a dystopian future.  
Built with Three.js, vanilla HTML/CSS/JS — no server, no build step.

---

## Project Structure

```
MacroCity2040/
├── index.html    ← Entry point (HUD, panels, canvas, CDN imports)
├── style.css     ← Cyberpunk/retro-futuristic UI theme
├── main.js       ← All game logic (Three.js scene, grid, resources, input)
└── README.md     ← This file
```

---

## How to Run

### Option A — Open directly (simplest)
Just open `index.html` in a modern browser (Chrome / Firefox / Edge).  
No server required — Three.js is loaded from CDN.

### Option B — Local server (avoids any CORS issues)
```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .
```
Then visit `http://localhost:8080`

---

## How to Play

| Action | How |
|---|---|
| **Select a cell** | Hover over the grid |
| **Place a building** | Click a build button on the right → then click a cell |
| **Demolish** | Click 💥 DEMOLISH → click a building |
| **Orbit camera** | Click + drag |
| **Zoom** | Scroll wheel |
| **Pan** | Right-click + drag |

---

## Buildings

| Building | Cost | Effect |
|---|---|---|
| 🏠 Housing | 500 cr | +80 pop, −15 energy/tick, −5 cr/tick |
| ⚡ Power Plant | 1200 cr | +120 energy/tick, −20 cr/tick, −5 sat |
| 🏢 Commercial | 900 cr | +60 cr/tick, −25 energy/tick, +12 pop, +12 sat |
| 🌿 Green Park | 300 cr | +20 sat, −3 energy/tick, −2 cr/tick |

---

## Resource System

- **Credits** — your budget. Drops below 0 = game over.
- **Energy** — power for the city. Shortage triggers red crisis mode.
- **Population** — grows with housing & commercial zones.
- **Satisfaction** — quality of life score. Too low = city collapse.

A tick fires every **4 seconds**. Each tick applies building income/costs.  
The year advances by 1 every 5 ticks (every 20 seconds).

---

## Win / Lose

| Condition | Result |
|---|---|
| Credits < −200 | 💸 Bankrupt — Game Over |
| Satisfaction < 5% AND credits < 0 | 💥 City Collapsed |
| Population ≥ 600 AND Satisfaction ≥ 75% | 🏆 Metropolis Achieved — You Win! |

---

## Code Architecture

```
SceneManager    — Three.js scene, camera, lights, fog, grid lines
GridManager     — 2D grid data, building placement/demolition, 3D mesh creation
BuildingDefs    — Data-driven building type configs (costs, tick effects)
ResourceManager — Per-tick resource delta calculation + win/lose logic
InputManager    — Raycasting for cell picking, button event wiring
UIManager       — DOM HUD updates, toast notifications, overlay
GameLoop        — requestAnimationFrame loop, tick timer, render call
```

---

## Tips

- Build a **Power Plant first** — without energy, satisfaction crashes.
- **Commercial buildings** are your main income source mid-game.
- **Parks** are cheap satisfaction boosters.
- Watch the **tick bar** at top-right to anticipate resource changes.
- Energy crisis turns the skyline red — build more power plants fast!
