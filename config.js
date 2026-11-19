// config.js — every user-facing setting lives here (names, colours, zones, people).
// Edit this file to rename the resort, move zones or change who works where.

export const CONFIG = {
  name: 'Azure Bay',
  tagline: 'Restaurant · Resort · Pool',

  player: {
    walkSpeed: 2.2,      // metres / second
    runSpeed: 5.2,
    backSpeed: 1.4,
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
    { id: 'kitchen',   name: 'Kitchen',               desc: 'Chef Marco runs the line. Waiters collect plates at the pass window.', rect: [-36, -20, -28, -4], color: '#b9c2c6', spawn: [-31.5, -8, Math.PI] },
    { id: 'cafe',      name: 'Café Azure · Restaurant', desc: 'All-day dining with a buffet. Guests are eating, waiters are serving. Click the menu stand to see the menu.', rect: [-36, -20, -10, 20], color: '#b98a5e', spawn: [-12, 0, -Math.PI / 2] },
    { id: 'rooms',     name: 'Guest Rooms 101–106',   desc: 'A corridor of six rooms. Doors open as you approach.', rect: [10, -20, 36, 20], color: '#8f9bb3', spawn: [12, 0, Math.PI / 2] },
    { id: 'poolbar',   name: 'Pool Bar & Stage',      desc: 'Cold drinks, a robot server and live samba by the water.', rect: [17, -54, 40, -24], color: '#2bb3a8', spawn: [22.5, -40, 0.45] },
    { id: 'pool',      name: 'Infinity Pool',         desc: 'Swimmers, sun loungers and a lifeguard on duty.', rect: [-40, -60, 40, -20], color: '#3fc6e0', spawn: [0, -24, Math.PI] },
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

  palette: {
    sun: 0xffefd7, sky: 0xfff4e0, ground: 0x7d8f6a, fill: 0x9ec4ff,
  },
};
