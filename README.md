# Azure Bay — interactive 3D restaurant & resort

A walk-through 3D website built with plain JavaScript and Three.js, following the
"How to Build a 3D Interactive Website" guide chapter by chapter.

Walk in from the street, past security and the fountain, through the sliding glass
doors to **reception**. Turn left for **Café Azure** (restaurant, buffet, kitchen), turn right for the
**guest rooms**, or go straight through the lobby to the **infinity pool**, the **pool bar**
and the **beach**. About 50 people are living their day: diners eating, waiters
carrying trays, Chef Rajesh stirring pots, housekeeping making beds, swimmers doing laps,
sunbathers, a Bollywood dancer, a pool server, pedestrians and traffic outside.

Everyone is Indian, in traditional dress, built in code in a warm animated-film style: big
expressive eyes with kajal, arched brows, rosy cheeks, centre-parted hair with sindoor, buns
with jasmine gajra and long braids with parandas; silk sarees with pleats, zari borders and
pallu, lehenga cholis, anarkalis and salwar kameez with dupattas; kurta pyjama with Nehru
jackets, sherwanis with Rajasthani safas, dhoti-kurta with shawls, a Sikh guard in a pagri;
jhumkas, necklaces, maang tikka, nath, bangles, payal, mojaris and juttis.

**Everything is usable.** Sit on any free chair, sofa, bar stool, bench or bed; lie on a
bed or a sun lounger; switch the room TVs on and flip channels; use the laptop on every
room desk or the guest computer in the lobby; order food at a table, drinks at the bar or
room service from a laptop. **Chat with anyone by typing in English**: they answer in
character (directions, the menu, prices, timings, Wi-Fi, weather, events, small talk) and
can walk you somewhere or place your order.

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
| Chat with someone · sit · lie down · use a TV, laptop or computer | `E` |
| Stand up / get up | `↑` (or the button in the activity bar) |
| Close chat, laptop or panels | `Esc` |
| Wave | `Space` |
| Look around / zoom | drag the mouse / scroll wheel (pinch on phones) |
| First-person view | `C` |
| Day / night | `N` |
| Name labels | `L` |
| Quick travel | `1`–`8` |
| Reset camera | `R` |

On phones and tablets an on-screen joystick and an **E** button appear.

**Things to try:**
- Walk up to Priya at reception, press `E` and type *"Take me to the pool"*. She stands up
  and walks you there (state machine: `IDLE → TYPING → GREETING → STANDING → ESCORTING →
  WAITING/ARRIVED → RETURNING → SITTING`).
- Type *"My name is …"* to anyone; they remember it. Ask Sameer the waiter *"What's today's
  special?"* or *"I'd like a masala dosa"*, Joseph at the pool bar for a mango lassi, Arjun the
  concierge to book a cab, Harpreet at the door whether it's safe.
- Sit at a free café table (`E`), press **Order food**, and your plate arrives a few seconds later.
- In any guest room: sit on the bed, **Lie down**, **TV on**, **Next channel** (live cricket,
  Bollywood music, news, nature); or sit at the desk and **Use the laptop** (resort guide,
  room service, weather & events, cricket score, notes).
- Click anyone to see their name, role, what they're doing right now and what they're wearing.

## How it maps to the guide

| Guide chapter | Where it lives |
|---|---|
| 1 · Scene, camera, renderer, mesh, light, loop | `main.js` |
| 2 · Three.js, `.glb` assets, local dev server | `vendor/`, `assets/models/` |
| 3 · Folder structure split by responsibility | `scene/`, `characters/`, `systems/`, `ui/` |
| 3 · Hybrid building: procedural shell + loaded models | `scene/architecture.js`, `scene/furniture.js` + `characters/loader.js` |
| 3 · Three-light setup (warm sun with shadows, hemisphere sky, cool fill) | `scene/environment.js` |
| 4 · Mixamo characters + `AnimationMixer`, 0.3 s crossfades | `characters/loader.js`, `characters/character.js` |
| Every person generated in code (face, hair, clothes, jewellery) as one skinned mesh on the X-Bot skeleton | `characters/indian.js` |
| Typed chat: intent matching, answers in character, action buttons | `characters/dialogue.js`, `ui/chat.js` |
| Usable furniture and devices (seats, beds, loungers, TVs, laptops, computer, orders) | `systems/interact.js`, `scene/furniture.js` |
| 4 · State machines (the receptionist example, verbatim) | `characters/npc.js` → `Receptionist` |
| 4 · Waypoint routing, no pathfinding AI | `systems/routes.js` |
| 4 · Living scene: traffic, pedestrians, airplane every 60–90 s, boats, wind-swayed palms | `systems/traffic.js`, `scene/neighbourhood.js` |
| 5 · Quality profiles + automatic device detection | `config.js`, `systems/performance.js` |
| 5 · InstancedMesh, shared material cache, frustum culling, shadow budget, pause when hidden | `scene/helpers.js`, `scene/materials.js`, `main.js` |
| 5 · HTML UI over the canvas, glassmorphism, raycast clicking, loading bar | `index.html`, `ui/hud.js` |
| 6 · Static hosting + caching headers | `_headers` |

### Performance budget (measured, Balanced profile)

- About 280 draw calls per frame, counting the shadow pass. Each person is a single skinned mesh (two materials: cloth/skin and gold), and identical outfits share geometry.
- About 840k triangles per frame including shadows at the opening view, most of them in the detailed faces and clothes. Use the **Lightweight** profile on phones, which halves the cast.
- Character meshes were simplified with `gltf-transform simplify`.
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
- Skeleton and animations from the three.js examples: *X-Bot* (Mixamo); *Michelle* is loaded only
  for her samba, which is retargeted onto X-Bot for the dancer. Every body, face, hairstyle, outfit
  and piece of jewellery is generated in code (`characters/indian.js`). *Soldier* and
  *RobotExpressive* are still in `assets/models/` but are no longer loaded.
- Every other surface, texture, sign and prop is generated in code.
