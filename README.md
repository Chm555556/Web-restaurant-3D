# Azure Bay — interactive 3D restaurant & resort

A walk-through 3D website built with plain JavaScript and Three.js, following the
"How to Build a 3D Interactive Website" guide chapter by chapter.

Walk in from the street, past security and the fountain, through the sliding glass
doors to **reception**. Turn left for **Café Azure** (restaurant, buffet, kitchen), turn right for the
**guest rooms**, or go straight through the lobby to the **infinity pool**, the **pool bar**
and the **beach**. About 50 people are living their day: diners eating, waiters
carrying trays, a chef stirring pots, housekeeping making beds, swimmers doing laps,
sunbathers, a samba dancer, a robot server, pedestrians and traffic outside.

## Run it locally

JS modules need a web server (never open `index.html` directly):

```bash
cd restaurant-3d
python3 -m http.server 8000
```

Then open http://localhost:8000. Or use `npx serve .` or VS Code Live Server.

## Controls

| Action | Keys |
|---|---|
| Walk forward / back | `↑` `↓` (or `W` `S`) |
| Turn | `←` `→` (or `A` `D`) |
| Run | hold `Shift` |
| Talk / interact | `E` |
| Wave | `Space` |
| Look around / zoom | drag the mouse / scroll wheel (pinch on phones) |
| First-person view | `C` |
| Day / night | `N` |
| Name labels | `L` |
| Quick travel | `1`–`8` |
| Reset camera | `R` |

On phones and tablets an on-screen joystick and an **E** button appear.

**Things to try:** walk up to Priya at reception (she waves), press `E` and pick a
destination. She stands up and walks you there (state machine: `IDLE → TYPING →
GREETING → STANDING → ESCORTING → WAITING/ARRIVED → RETURNING → SITTING`).
Click anyone to see their name, role and what they're doing right now.
Click the menu stand inside Café Azure to read the menu.

## How it maps to the guide

| Guide chapter | Where it lives |
|---|---|
| 1 · Scene, camera, renderer, mesh, light, loop | `main.js` |
| 2 · Three.js, `.glb` assets, local dev server | `vendor/`, `assets/models/` |
| 3 · Folder structure split by responsibility | `scene/`, `characters/`, `systems/`, `ui/` |
| 3 · Hybrid building: procedural shell + loaded models | `scene/architecture.js`, `scene/furniture.js` + `characters/loader.js` |
| 3 · Three-light setup (warm sun with shadows, hemisphere sky, cool fill) | `scene/environment.js` |
| 4 · Mixamo characters + `AnimationMixer`, 0.3 s crossfades | `characters/loader.js`, `characters/character.js` |
| 4 · State machines (the receptionist example, verbatim) | `characters/npc.js` → `Receptionist` |
| 4 · Waypoint routing, no pathfinding AI | `systems/routes.js` |
| 4 · Living scene: traffic, pedestrians, airplane every 60–90 s, boats, wind-swayed palms | `systems/traffic.js`, `scene/neighbourhood.js` |
| 5 · Quality profiles + automatic device detection | `config.js`, `systems/performance.js` |
| 5 · InstancedMesh, shared material cache, frustum culling, shadow budget, pause when hidden | `scene/helpers.js`, `scene/materials.js`, `main.js` |
| 5 · HTML UI over the canvas, glassmorphism, raycast clicking, loading bar | `index.html`, `ui/hud.js` |
| 6 · Static hosting + caching headers | `_headers` |

### Performance budget (measured, Balanced profile)

- About 80 draw calls per frame (target is under 300). Static geometry is merged per material and repeated props are instanced.
- About 200k triangles (target is under 500k). Character meshes were simplified with `gltf-transform simplify`.
- Assets total 3.5 MB (target is under 10 MB). The models were 8.5 MB before `simplify`, `webp` and `resample`.
- Characters that are off-screen or far away are culled and animate at a reduced rate.

## Deploy for free

The site is just static files. Drag the `restaurant-3d` folder into Netlify, or connect
the repo to Cloudflare Pages or GitHub Pages. No build step is needed. The `_headers` file sets
long-term caching for `assets/` and `vendor/` and no caching for HTML.

## Customise

Everything a non-programmer might change is in `config.js`: the resort name, zones and
their descriptions, quick-travel order, the receptionist's escort destinations and messages,
walking speeds and the quality profiles. People and their routines are in
`characters/npc.js`.

## Credits

- [Three.js](https://threejs.org) r170 (MIT)
- Character models from the three.js examples: *Soldier*, *X-Bot* and *Michelle* (originally from
  Mixamo), and *RobotExpressive* by Tomás Laulhé (CC0). Optimised with gltf-transform.
- Every other surface, texture, sign and prop is generated in code.
