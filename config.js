// config.js — every user-facing setting lives here (names, colours, zones, people).
// Edit this file to rename the resort, move zones or change who works where.

export const CONFIG = {
  name: 'Azure Bay',
  tagline: 'Restaurant · Resort · Pool',

  player: {
    walkSpeed: 1.5,      // metres / second (a natural walk: real people walk at 1.3–1.5)
    runSpeed: 3.6,       // an easy run; faster than this and the legs spin unnaturally
    backSpeed: 1.1,
    turnSpeed: 2.4,      // radians / second
    radius: 0.35,
    start: { x: 0, z: 33.5, yaw: Math.PI },   // on the pavement, facing the building
  },

  camera: {
    distance: 5.2, minDistance: 2.2, maxDistance: 11,
    height: 2.1, fov: 60,
    indoorCeiling: 4.55,
  },

  building: { minX: -36, maxX: 36, minZ: -20, maxZ: 20, height: 5 },

  // Named areas: used for the "You are in…" label, the minimap and quick travel.
  zones: [
    { id: 'street',    name: 'Ocean Drive',           desc: 'The street outside. Traffic, pedestrians and the resort entrance.', rect: [-90, 34, 90, 60], color: '#5b6670', spawn: [0, 33.5, Math.PI] },
    { id: 'park',      name: 'Azure Gardens',         desc: 'A small park beside the plaza: cherry blossoms, bluebells that glow at night, a meadow in the wind and the Vortex light sculpture. Sit on any bench (press E).', rect: [-80, -19, -41, 33.5], color: '#7fb069', spawn: [-46, 25.4, -Math.PI / 2] },
    { id: 'plaza',     name: 'Entrance Plaza',        desc: 'Fountain, palms and the main glass doors. Security stands at the door.', rect: [-40, 20, 40, 34], color: '#c9b48f', spawn: [0, 26, Math.PI] },
    { id: 'lobby',     name: 'Reception Lobby',       desc: 'Check in with Priya at the front desk. Walk up to her and press E to be escorted anywhere.', rect: [-10, -20, 10, 20], color: '#e6d7bd', spawn: [0, 4, Math.PI] },
    { id: 'kitchen',   name: 'Kitchen',               desc: 'Chef Rajesh runs the line. Waiters collect plates at the pass window.', rect: [-36, -20, -28, -4], color: '#b9c2c6', spawn: [-31.5, -8, Math.PI] },
    { id: 'cafe',      name: 'Café Azure · Restaurant', desc: 'All-day Indian and coastal dining with a buffet. Sit at any free table and press E to order. Click the menu stand to see the menu.', rect: [-36, -20, -10, 20], color: '#b98a5e', spawn: [-12, 0, -Math.PI / 2] },
    { id: 'rooms',     name: 'Guest Rooms 101–106',   desc: 'Six rooms. Sit on the bed, watch TV, or use the laptop on the desk (walk up and press E).', rect: [10, -20, 36, 20], color: '#8f9bb3', spawn: [12, 0, Math.PI / 2] },
    { id: 'poolbar',   name: 'Pool Bar & Stage',      desc: 'Fresh lassi, nimbu soda and Bollywood dancing by the water. Sit on a stool to order.', rect: [17, -54, 40, -24], color: '#2bb3a8', spawn: [22.5, -40, 0.45] },
    { id: 'pool',      name: 'Infinity Pool',         desc: 'Swimmers, sun loungers (press E to lie down) and a lifeguard on duty.', rect: [-40, -60, 40, -20], color: '#3fc6e0', spawn: [0, -24, Math.PI] },
    { id: 'beach',     name: 'Azure Beach',           desc: 'The private beach. Watch the boats on the bay.', rect: [-90, -95, 90, -60], color: '#e8d6a8', spawn: [0, -64, Math.PI] },
  ],

  // Quick-travel buttons (1–9 on the keyboard)
  travel: ['plaza', 'lobby', 'cafe', 'kitchen', 'rooms', 'pool', 'poolbar', 'beach', 'park'],

  // Real 3D people (optional). Drop a rigged .glb into assets/people/ with the file name
  // below and the listed cast members use it instead of the generated character; the
  // player can use one too (player: 'm' / 'f'). A missing file is skipped quietly.
  // "Rigged" = it has a Mixamo-style skeleton (Hips, Spine, LeftUpLeg…). Unrigged models
  // must go through mixamo.com first (upload → auto-rig → download FBX/GLB with skin).
  // Run tools/import-model.sh on each download to shrink it for the web.
  people: [
    // Every man is built from one of the men's bodies: 'kurta' (kurta-pyjama), 'polo' (polo
    // and jeans or chinos), 'shirt' (printed shirt and jeans), 'beach' (T-shirt and shorts);
    // every woman from the body that matches what she wears: 'saree' or 'suit' (kameez + churidar + dupatta). characters/looks.js gives each person their own face, colours, height and
    // jewellery. face: true = a model that only lends its head (same skeleton family), so
    // there are five real men's faces and six real women's faces. parts: how each clothing
    // material is recoloured; hairRef: the hair texture's brightness (for hair dye).
    { file: 'assets/people/indian-man-in-kurta.glb', sex: 'm', height: 1.76, base: 'kurta', player: 'm', parts: { outfit: 'kurta' }, hairRef: 0.0077,
      credit: 'Indian Man In Kurta by Nodeaxis Interactive (Sketchfab, Free Standard)', url: 'https://sketchfab.com/3d-models/indian-man-in-kurta-a7fcb7ce36984b1b860ac7e476033bb1' },
    { file: 'assets/people/indian-teenager.glb', sex: 'm', height: 1.7, base: 'polo', hairRef: 0.006,
      parts: { outfit_top: { tint: 'main', ref: 0.1396 }, outfit_bottom: { tint: 'jeans', ref: 0.0253 } },
      credit: 'Indian Teenager by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-teenager-b2804b40f671431ca7b5cc53b239175e' },
    { file: 'assets/people/indian-man-in-tshirt.glb', sex: 'm', height: 1.75, base: 'shirt', hairRef: 0.006,
      parts: { outfit_top: { hue: 'main', h: 0.026, s: 0.42, v: 0.46 }, outfit_bottom: { tint: 'jeans', ref: 0.0253 } },
      credit: 'Indian Man In Tshirt by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-man-in-tshirt-091381a4eeb14e3b9814e3aaf075ac59' },
    { file: 'assets/people/indian-football-fan.glb', sex: 'm', height: 1.74, face: true,
      credit: 'Indian Football Fan by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-football-fan-cf50624deae649ddbfccae9f4f213e6c' },
    { file: 'assets/people/indian-man-punching-bag.glb', sex: 'm', height: 1.78, base: 'beach', hairRef: 0.006,
      parts: { outfit_top: { tint: 'main', ref: 0.0242 }, outfit_bottom: { tint: 'shorts', ref: 0.0724 } },
      credit: 'Indian man, Punching Bag by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-man-punching-bag-8408c80ccd9548e4bad84bc0dd8e0d7e' },
    // women
    { file: 'assets/people/indian-woman-in-saree.glb', sex: 'f', height: 1.62, base: 'saree', skirt: 'outfit', parts: { outfit: 'hue' }, hairRef: 0.0047,
      credit: 'Indian Woman in Saree by Nodeaxis Interactive (Sketchfab, Free Standard)', url: 'https://sketchfab.com/3d-models/indian-woman-in-saree-b5965a93b03440dea65160f7cbac1fc7' },
    { file: 'assets/people/indian-office-woman.glb', sex: 'f', height: 1.64, base: 'suit', parts: { outfit: 'kameez' }, legs: true, dupatta: true, hairRef: 0.0034,
      credit: 'Indian Office Woman by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-office-woman-e6c60cafd33c4d54b0b840c4146ed244' },
    { file: 'assets/people/modern-indian-woman.glb', sex: 'f', height: 1.63, face: true, hairRef: 0.0147,
      credit: 'Modern Indian Woman by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/modern-indian-woman-830d8ed3236a4221862290b81807f408' },
    { file: 'assets/people/modern-indian-woman-2.glb', sex: 'f', height: 1.63, face: true, hairRef: 0.007,
      credit: 'modern indian woman 2 by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/modern-indian-woman-2-1ab2e8ecceee4e6e897f8fddb17d2b02' },
    { file: 'assets/people/indian-teen-woman-hoodie.glb', sex: 'f', height: 1.6, face: true, hairRef: 0.0038,
      credit: 'Indian Teenager, Woman in Hoodie by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-teenager-woman-in-hoodie-3cffef3bcde9469aa3d1ad36755b363c' },
    { file: 'assets/people/indian-teen-woman-shorts.glb', sex: 'f', height: 1.6, face: true, hairRef: 0.0043,
      credit: 'Indian Teen In Shorts, Female by Nodeaxis Interactive (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-teen-in-shorts-female-a9e39f6c8e214776a02bfce983ec093f' },
    { file: 'assets/people/village-saree-woman.glb', sex: 'f', height: 1.57, skirt: 'Material.001', use: ['Lakshmi'],
      credit: 'Sareewoman by dk8026854 (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/sareewoman-c28105203127478b8e26ad0474083367' },
    // you, Aditi: exactly as made
    { file: 'assets/people/saree-woman.glb', sex: 'f', height: 1.63, player: 'f', skirt: 'mat2mat',
      credit: 'Free fire character in Indian look by kyrox (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/free-fire-character-in-indian-look-712015e84e7542e39916b62d0c02d73b' },
    // needs Mixamo rigging first: upload assets/incoming/for-mixamo/*.zip (see README)
    { file: 'assets/people/indian-village-old-man.glb', sex: 'm', height: 1.68, use: ['Ramesh', 'Suresh', 'Prakash'],
      credit: 'Indian Village Old Man Famous by saksham12x (Sketchfab, CC BY 4.0)', url: 'https://sketchfab.com/3d-models/indian-village-old-man-famous-1e5b1ce6cbdd47388eb694d5d2b56f1c' },
  ],

  // Escort destinations the receptionist offers (state machine: ESCORTING)
  escort: [
    { id: 'cafe',  label: 'Café Azure',    side: -1, path: [[-5, -3], [-8.5, 0], [-16, 0], [-20, 2.6]],  arrive: 'Here is Café Azure. The buffet is on the far wall. Enjoy your meal!' },
    { id: 'pool',  label: 'Infinity Pool', side: -1, path: [[-7.6, -9], [-7.6, -17], [-7, -22], [-4, -27]], arrive: 'Welcome to the pool deck! Towels are on the shelf to your left, and the bar is on your right.' },
    { id: 'park',  label: 'Azure Gardens', side: 1, path: [[2, -1], [2, 12], [0.8, 19], [0.8, 22.4], [-8, 24.6], [-22, 25.4], [-36, 25.6], [-41.6, 25.5], [-47, 25]], arrive: 'Welcome to Azure Gardens! The cherry trees are on the far side, and the bluebells glow after dark.' },
    { id: 'room',  label: 'Room 104',      side: 1,  path: [[5, -3], [8, 0], [14.3, 0], [14.3, 3.6]],   arrive: 'This is Room 104. Your key card is on the desk. Have a lovely stay!' },
  ],

  quality: {
    low:      { label: 'Lightweight', shadows: false, shadowSize: 0,    pixelRatio: 1,   antialias: false, npcScale: 0.5, env: false, pointLights: false },
    balanced: { label: 'Balanced',    shadows: true,  shadowSize: 1024, pixelRatio: 1.5, antialias: true,  npcScale: 1,   env: true,  pointLights: true },
    high:     { label: 'High',        shadows: true,  shadowSize: 2048, pixelRatio: 2,   antialias: true,  npcScale: 1,   env: true,  pointLights: true },
  },

  // Café Azure menu (₹). Used by the menu stand, the chat replies and room service.
  menu: [
    ['Breakfast · 7–11 am', [['Masala dosa', 'Potato masala, sambar, coconut chutney', 220], ['Masala omelette', 'Tomato, onion, green chilli, toast', 320], ['Poha', 'Flattened rice, peanuts, curry leaves', 180], ['Fresh fruit bowl', 'Papaya, pineapple, mango', 240]]],
    ['Mains · 12–11 pm', [['Goan prawn curry', 'Coconut, kokum, red rice', 640], ['Butter chicken', 'Tandoori chicken, tomato makhani, naan', 560], ['Paneer tikka platter', 'Mint chutney, pickled onion', 480], ['Veg biryani', 'Basmati, saffron, raita', 420], ['Dal makhani & jeera rice', 'Slow-cooked black lentils', 380]]],
    ['Drinks & desserts', [['Mango lassi', 'Alphonso mango, cardamom', 190], ['Masala chai', 'Ginger, cardamom', 90], ['Nimbu soda', 'Sweet or salted', 120], ['Tender coconut', 'Served in the shell', 150], ['Kokum cooler', 'Goan kokum, mint', 160], ['Gulab jamun', 'Two pieces, warm', 160]]],
  ],

  // Facts the staff use when you chat with them.
  info: {
    wifi: { network: 'AzureBay-Guest', password: 'namaste2024' },
    hours: { cafe: '7 am to 11 pm', pool: '7 am to 8 pm', bar: '11 am to midnight', kitchen: '6 am to 11 pm', beach: 'sunrise to sunset', checkin: '2 pm', checkout: '11 am', roomService: '24 hours' },
    events: ['Yoga on the beach at 7 am', 'Cooking class with Chef Rajesh at 4 pm', 'Bollywood night at the pool stage at 8 pm'],
    weather: { day: '31°C and sunny with a sea breeze', night: '26°C, clear sky and a warm breeze' },
  },

  palette: {
    sun: 0xffefd7, sky: 0xfff4e0, ground: 0x7d8f6a, fill: 0x9ec4ff,
  },
};
