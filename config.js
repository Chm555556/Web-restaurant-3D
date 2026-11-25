// config.js — every user-facing setting lives here (names, colours, zones, people).
// Edit this file to rename the resort, move zones or change who works where.

export const CONFIG = {
  name: 'Azure Bay',
  tagline: 'Restaurant · Resort · Pool',

  player: {
    walkSpeed: 1.75,     // metres / second (a brisk, natural walk)
    runSpeed: 4.3,       // a jog-run; the run clip is calibrated so the feet stay planted
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
    { id: 'plaza',     name: 'Entrance Plaza',        desc: 'Fountain, palms and the main glass doors. Security stands at the door.', rect: [-40, 20, 40, 34], color: '#c9b48f', spawn: [0, 26, Math.PI] },
    { id: 'lobby',     name: 'Reception Lobby',       desc: 'Check in with Priya at the front desk. Walk up to her and press E to be escorted anywhere.', rect: [-10, -20, 10, 20], color: '#e6d7bd', spawn: [0, 4, Math.PI] },
    { id: 'kitchen',   name: 'Kitchen',               desc: 'Chef Rajesh runs the line. Waiters collect plates at the pass window.', rect: [-36, -20, -28, -4], color: '#b9c2c6', spawn: [-31.5, -8, Math.PI] },
    { id: 'cafe',      name: 'Café Azure · Restaurant', desc: 'All-day Indian and coastal dining with a buffet. Sit at any free table and press E to order. Click the menu stand to see the menu.', rect: [-36, -20, -10, 20], color: '#b98a5e', spawn: [-12, 0, -Math.PI / 2] },
    { id: 'rooms',     name: 'Guest Rooms 101–106',   desc: 'Six rooms. Sit on the bed, watch TV, or use the laptop on the desk (walk up and press E).', rect: [10, -20, 36, 20], color: '#8f9bb3', spawn: [12, 0, Math.PI / 2] },
    { id: 'poolbar',   name: 'Pool Bar & Stage',      desc: 'Fresh lassi, nimbu soda and Bollywood dancing by the water. Sit on a stool to order.', rect: [17, -54, 40, -24], color: '#2bb3a8', spawn: [22.5, -40, 0.45] },
    { id: 'pool',      name: 'Infinity Pool',         desc: 'Swimmers, sun loungers (press E to lie down) and a lifeguard on duty.', rect: [-40, -60, 40, -20], color: '#3fc6e0', spawn: [0, -24, Math.PI] },
    { id: 'beach',     name: 'Azure Beach',           desc: 'The private beach. Watch the boats on the bay.', rect: [-90, -95, 90, -60], color: '#e8d6a8', spawn: [0, -64, Math.PI] },
  ],

  // Quick-travel buttons (1–8 on the keyboard)
  travel: ['plaza', 'lobby', 'cafe', 'kitchen', 'rooms', 'pool', 'poolbar', 'beach'],

  // Escort destinations the receptionist offers (state machine: ESCORTING)
  escort: [
    { id: 'cafe',  label: 'Café Azure',    side: -1, path: [[-5, -3], [-8.5, 0], [-16, 0], [-20, 2.6]],  arrive: 'Here is Café Azure. The buffet is on the far wall. Enjoy your meal!' },
    { id: 'pool',  label: 'Infinity Pool', side: -1, path: [[-7.6, -9], [-7.6, -17], [-7, -22], [-4, -27]], arrive: 'Welcome to the pool deck! Towels are on the shelf to your left, and the bar is on your right.' },
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
