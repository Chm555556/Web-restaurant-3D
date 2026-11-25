// characters/dialogue.js — what the people of Azure Bay say when you type to them.
// No AI service: each message is matched against intents (greeting, directions, menu,
// ordering, timings, Wi-Fi…) and answered in character, using the facts in config.js.
// A reply can carry actions, which the chat panel shows as buttons
// (walk me there, quick-travel, open the menu, place an order).
import { CONFIG } from '../config.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const has = (t, re) => re.test(t);

// ---------- who is who ----------
const STAFF = /room service|receptionist|concierge|security|bellboy|waiter|waitress|buffet|chef|housekeeping|lifeguard|bartender|dancer|server|patrol/;
const SERVES = /room service|waiter|waitress|buffet|chef|bartender|server|concierge|receptionist/;
const HOME = ['Goa', 'Kochi in Kerala', 'Mumbai', 'Pune', 'Kolkata', 'Chennai', 'Jaipur', 'Lucknow', 'Hyderabad', 'Mysuru', 'Bhopal', 'Mangaluru', 'Indore', 'Nagpur'];
function hometown(npc) {
  if (/harpreet/i.test(npc.name)) return 'Amritsar in Punjab';
  if (/joseph/i.test(npc.name)) return 'Margao, right here in Goa';
  let h = 0; for (const c of npc.name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HOME[h % HOME.length];
}
const roleOf = (npc) => (npc.role || '').toLowerCase();
const isStaff = (npc) => STAFF.test(roleOf(npc));

// ---------- places ----------
const PLACES = [
  { id: 'cafe', re: /caf[eé]|restaurant|dining|buffet|breakfast|lunch|dinner|eat\b|food court/, name: 'Café Azure', how: 'Café Azure is through the big doorway on the left side of the lobby.' },
  { id: 'kitchen', re: /kitchen/, name: 'the kitchen', how: 'The kitchen is at the back of the café, behind the pass window. Staff only, but Chef Rajesh loves visitors!' },
  { id: 'rooms', re: /\brooms?\b|bedroom|corridor|my room|101|102|103|104|105|106/, name: 'the guest rooms', how: 'The guest rooms are through the doorway on the right side of the lobby. Rooms 101 to 106 are along that corridor.', escort: 'room' },
  { id: 'pool', re: /\bpool\b|swim/, name: 'the infinity pool', how: 'Walk straight through the lobby and out of the back doors. The pool is right there.', escort: 'pool' },
  { id: 'poolbar', re: /\bbar\b|stage|bollywood night|mocktail/, name: 'the pool bar', how: 'The pool bar is on the right side of the pool deck, under the thatched roof. The dance stage is next to it.' },
  { id: 'beach', re: /beach|\bsea\b|ocean|shore|sunset/, name: 'Azure Beach', how: 'Go past the pool and keep walking to the back. The beach is behind the pool deck.' },
  { id: 'lobby', re: /lobby|reception|front desk|check.?in desk|concierge/, name: 'the reception lobby', how: 'Reception is in the middle of the building, straight in from the main glass doors.' },
  { id: 'plaza', re: /entrance|\bexit\b|fountain|main door|way out/, name: 'the entrance plaza', how: 'The main entrance is at the front, past reception. You will see the fountain outside.' },
  { id: 'street', re: /street|road|outside|bus|auto/, name: 'Ocean Drive', how: 'Ocean Drive is the street in front of the resort, past the fountain.' },
  { id: 'lobby', re: /computer|\bpc\b|printer|internet terminal/, name: 'the guest computer', how: 'There is a guest computer in the lobby, against the right-hand wall near the rooms corridor. Sit down and press E to use it.' },
];
const findPlace = (t) => PLACES.find((p) => p.re.test(t));

// ---------- menu ----------
const ITEMS = CONFIG.menu.flatMap(([, items]) => items.map(([name, desc, price]) => ({ name, desc, price })));
const SYN = [
  [/dosa/, 'Masala dosa'], [/omelet/, 'Masala omelette'], [/poha/, 'Poha'], [/fruit/, 'Fresh fruit bowl'],
  [/prawn|fish curry|goan curry|\bcurry\b/, 'Goan prawn curry'], [/butter chicken|chicken/, 'Butter chicken'], [/paneer|tikka/, 'Paneer tikka platter'],
  [/biryani/, 'Veg biryani'], [/\bdal\b|daal|lentil|rice/, 'Dal makhani & jeera rice'], [/lassi/, 'Mango lassi'], [/chai|\btea\b|coffee/, 'Masala chai'],
  [/nimbu|lemon|lime|soda/, 'Nimbu soda'], [/coconut|nariyal/, 'Tender coconut'], [/kokum|cooler/, 'Kokum cooler'], [/gulab|jamun|dessert|sweet/, 'Gulab jamun'],
];
export function findItem(t) {
  const exact = ITEMS.find((i) => t.includes(i.name.toLowerCase()));
  if (exact) return exact;
  for (const [re, name] of SYN) if (re.test(t)) return ITEMS.find((i) => i.name === name);
  return null;
}
const VEG = ['Masala dosa', 'Poha', 'Paneer tikka platter', 'Veg biryani', 'Dal makhani & jeera rice'];

// ---------- the reply engine ----------
function greet(npc, ctx) {
  const r = roleOf(npc), you = npc.memory?.playerName ? `, ${npc.memory.playerName}` : '';
  const hello = ctx.night ? pick(['Good evening', 'Namaste', 'Shubh sandhya']) : pick(['Namaste', 'Hello', 'Good day']);
  if (/harpreet/i.test(npc.name)) return `Sat Sri Akal${you}! Welcome to Azure Bay. How can I help?`;
  if (/receptionist/.test(r)) return `${hello}${you}! Welcome to ${CONFIG.name}. I'm Priya at the front desk. Shall I walk you somewhere, or can I answer a question?`;
  if (/waiter|waitress/.test(r)) return `${hello}${you}! Welcome to Café Azure. Would you like to see the menu?`;
  if (/bartender/.test(r)) return `${hello}${you}! What can I get you: mango lassi, nimbu soda or a kokum cooler?`;
  if (/chef/.test(r)) return `${hello}${you}! Welcome to my kitchen. Mind the hot pans! Ask me anything about the food.`;
  if (/concierge/.test(r)) return `${hello}${you}! I'm Arjun, the concierge. Cabs, tours, dinner bookings: just ask.`;
  if (/housekeeping/.test(r)) return `${hello}${you}! Need fresh towels or your room cleaned?`;
  if (/lifeguard/.test(r)) return `${hello}${you}! Enjoy the pool, and please don't run on the deck.`;
  if (/dancer/.test(r)) return `${hello}${you}! Do you like Bollywood music? Join us at 8 pm!`;
  if (/swimmer/.test(r)) return `Oh, hi${you}! The water is lovely. Are you coming in?`;
  if (/sunbathing/.test(r)) return `Mmm… oh, ${hello.toLowerCase()}${you}! Just soaking up the sun.`;
  if (isStaff(npc)) return `${hello}${you}! I'm ${npc.name}, the ${npc.role.toLowerCase()}. How can I help you?`;
  return `${hello}${you}! I'm ${npc.name}. Lovely place, isn't it?`;
}

function aboutMe(npc) {
  const r = roleOf(npc);
  const jobs = {
    receptionist: 'I check guests in, answer questions and walk people wherever they need to go.',
    concierge: 'I book cabs, tours and tables, and I know every beach shack from here to Palolem.',
    security: 'I keep the entrance safe and help guests find their way.',
    patrol: 'I patrol the grounds and keep an eye on everything.',
    bellboy: 'I carry luggage up to the rooms. Light or heavy, I manage!',
    waiter: 'I serve the tables in Café Azure. Tell me what you would like to eat!', waitress: 'I look after the guests in Café Azure and take orders.',
    buffet: 'I keep the buffet full: idlis, dosas, fruit, and the desserts disappear fast!',
    'head chef': 'I run the kitchen. Twenty years of cooking, and Goan curry is still my favourite.',
    'sous chef': 'I help Chef Rajesh with everything: frying, chopping, chutneys.',
    housekeeping: 'I clean the rooms and make the beds. Fresh towels every day!',
    lifeguard: 'I watch the swimmers and keep everyone safe in the pool.',
    bartender: 'I make the best mocktails in Goa, if I say so myself.',
    dancer: 'I dance at the pool stage every evening. Bollywood, of course!',
    'pool server': 'I bring drinks to the guests on the loungers.',
  };
  const k = Object.keys(jobs).find((j) => r.includes(j));
  const job = k ? jobs[k] : /guest|diner|room/.test(r) ? 'I\'m on holiday here, just relaxing.' : 'I\'m just passing by, enjoying the day.';
  return `I'm ${npc.name}, from ${hometown(npc)}. ${job} Right now I'm ${String(npc.activity || 'relaxing').toLowerCase()}.`;
}

function capabilities(npc) {
  const r = roleOf(npc);
  if (/receptionist/.test(r)) return 'I can walk you to Café Azure, the pool or Room 104, and tell you about Wi-Fi, check-in times and events.';
  if (/waiter|waitress|buffet|chef/.test(r)) return 'Ask me about the menu, prices or vegetarian dishes, or just tell me what you would like to order.';
  if (/bartender|server/.test(r)) return 'I can make you a mango lassi, nimbu soda, kokum cooler, tender coconut or masala chai. Just say "one lassi, please".';
  if (/concierge/.test(r)) return 'I can book a cab, suggest tours around Goa, or tell you how to get anywhere in the resort.';
  return 'Ask me for directions, the Wi-Fi password, the weather, today\'s events, or what to eat.';
}

/**
 * @param npc  the NPC you are chatting with (npc.memory persists between messages)
 * @param raw  what the player typed
 * @param ctx  { night, canEscort }
 * @returns { text, actions: [{ label, type: 'escort'|'travel'|'menu'|'order', arg }], end }
 */
export function reply(npc, raw, ctx = {}) {
  const t = ` ${raw.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()} `;
  npc.memory ||= {};
  const mem = npc.memory, r = roleOf(npc), staff = isStaff(npc);
  const out = (text, actions = [], end = false) => ({ text, actions, end });
  const you = mem.playerName ? `, ${mem.playerName}` : '';

  // name introductions
  const nm = t.match(/\b(?:my name is|my name's|call me|this is|mera naam)\s+([a-z][a-z-]{1,20})/);
  if (nm && !/^(not|the|a|an)$/.test(nm[1])) {
    mem.playerName = nm[1][0].toUpperCase() + nm[1].slice(1);
    const hi = `Nice to meet you, ${mem.playerName}! I'm ${npc.name}.`;
    // answer whatever else was in the same message ("My name is Chandra. Where is the pool?")
    const rest = raw.replace(/(?:my name is|my name's|call me|this is|mera naam)\s+[a-z-]+[.!,]?/i, '').replace(/^\W*(hi|hello|hey|namaste)\W*/i, '').trim();
    if (rest.split(/\s+/).length >= 2) { const more = reply(npc, rest, ctx); return out(`${hi} ${more.text}`, more.actions, more.end); }
    return out(`${hi} ${staff ? 'How can I help you today?' : 'Are you enjoying your stay?'}`);
  }
  if (has(t, /\b(bye|goodbye|good bye|see you|see ya|alvida|tata|good night|gotta go|later)\b/)) {
    return out(pick([`Goodbye${you}! Enjoy your stay.`, `Alvida${you}! Come back soon.`, `See you around${you}!`]), [], true);
  }
  if (has(t, /\b(thank|thanks|thx|shukriya|dhanyavad|dhanyawad)\b/)) return out(pick([`You're welcome${you}!`, 'Koi baat nahi, my pleasure!', 'Anytime! Anything else?']));
  // gestures you ask for (ui/chat.js plays them, see gestureFor below)
  if (has(t, /\b(shake hands?|handshake|hand shake|haath milao)\b/)) return out(pick([`Of course${you}! Very nice to meet you.`, 'With pleasure! Welcome to Azure Bay.', 'Haan ji, so nice to meet you!']));
  if (has(t, /\b(high ?five|hi ?5|high-five|give me five)\b/)) return out(pick(['Up top! ✋', 'Ha! High five!', 'Yes! Too good!']));
  if (has(t, /\b(let'?s dance|dance (with|for) me|can you dance|show me (a |some |your )?(dance|moves|steps)|naacho|nachoge|do a dance)\b/)) return out(npc.ch.pose.sit > 0.5 ? 'I\'m sitting right now, but I\'ll clap along for you!' : pick(['Arre, why not! A few Bollywood steps, just for you.', 'Chalo! Watch this.']));
  if (has(t, /\bhugs?\b/)) return out('Haha! Here, a warm namaste is our hug. 🙏');
  if (has(t, /\b(stupid|idiot|shut up|hate you|useless|dumb)\b/)) return out('Oh dear, I\'m sorry if I upset you. Let me know how I can help.');

  // escort / directions
  const place = findPlace(t);
  const wantsGo = has(t, /\b(where|how (do|can|to) i|way to|take me|go to|show me|direction|find|lead me|guide me|walk me|get to|bring me to|looking for|kahan|kidhar)\b/);
  if (place && (wantsGo || t.trim().split(' ').length <= 3)) {
    const actions = [];
    const esc = place.escort && CONFIG.escort.find((e) => e.id === place.escort) || (place.id === 'cafe' && CONFIG.escort.find((e) => e.id === 'cafe'));
    if (ctx.canEscort && esc) {
      actions.push({ label: `Walk me to ${esc.label}`, type: 'escort', arg: esc });
      return out(`${place.how} I can walk you there myself, just say the word!`, actions);
    }
    const zone = CONFIG.zones.find((z) => z.id === place.id);
    if (zone) actions.push({ label: `Take me to ${zone.name.split(' ·')[0]}`, type: 'travel', arg: zone.id });
    return out(place.how, actions);
  }

  // ordering food and drinks
  const item = findItem(t);
  const ordering = has(t, /\b(order|i'?d like|i would like|i want|can i (have|get)|could i (have|get)|get me|bring me|i'?ll have|give me|one|two|please|chahiye|de do)\b/);
  if (item && ordering) {
    if (SERVES.test(r)) {
      const eta = /bartender|server/.test(r) || /lassi|chai|soda|coconut|cooler/i.test(item.name) ? 'It will be ready in a minute.' : 'It will be at your table in about 15 minutes.';
      return out(`${pick(['Of course!', 'Excellent choice!', 'Right away!', 'Bilkul!'])} One ${/^Goan/.test(item.name) ? item.name : item.name[0].toLowerCase() + item.name.slice(1)}, that's ₹${item.price}. ${eta}`, [{ label: `Order ${item.name} · ₹${item.price}`, type: 'order', arg: item }]);
    }
    return out(`Ha, I'm a guest too! Ask Sameer the waiter, or sit at any café table and press E to order the ${item.name.toLowerCase()}.`, [{ label: 'Show me the menu', type: 'menu' }]);
  }
  if (has(t, /\b(price|cost|how much|rate|kitne ka|kitna)\b/)) {
    if (item) return out(`The ${item.name} is ₹${item.price}. ${item.desc}.`);
    if (has(t, /room|night|stay/)) return out('Deluxe sea-view rooms start at ₹7,500 a night, breakfast included.');
    return out('Most mains are ₹380–₹640 and drinks are ₹90–₹190. Here is the full menu.', [{ label: 'Show me the menu', type: 'menu' }]);
  }
  if (has(t, /\b(veg|vegetarian|vegan|jain|no meat)\b/)) return out(`Plenty! Try the ${VEG.slice(0, 4).join(', ')}. The buffet dal is Jain, with no onion or garlic.`, [{ label: 'Show me the menu', type: 'menu' }]);
  if (has(t, /\b(spicy|spice|mild|chilli|chili|teekha)\b/)) return out('Our food is medium-spicy. Tell the waiter "kam teekha" for mild, or "extra teekha" if you are brave!');
  if (has(t, /\b(menu|food|hungry|eat|dish|khana|breakfast|lunch|dinner|snack)\b/)) {
    const fav = /chef/.test(r) ? 'My pride is the Goan prawn curry, slow-cooked with kokum and coconut.' : 'Guests love the masala dosa, the Goan prawn curry and the mango lassi.';
    return out(`${fav} Café Azure serves food from ${CONFIG.info.hours.cafe}.`, [{ label: 'Show me the menu', type: 'menu' }, ...(SERVES.test(r) ? [{ label: 'Order a masala dosa · ₹220', type: 'order', arg: ITEMS.find((i) => i.name === 'Masala dosa') }] : [])]);
  }
  if (has(t, /\b(drink|thirsty|juice|lassi|chai|tea|coffee|mocktail|water|soda|cocktail|beer|alcohol)\b/)) {
    if (has(t, /beer|alcohol|cocktail|wine/)) return out('We keep things fresh and alcohol-free at the pool bar: try a kokum cooler, it\'s Goa in a glass!');
    if (has(t, /coffee/)) return out('We serve masala chai rather than coffee here, with ginger and cardamom. Shall I get you one?', SERVES.test(r) ? [{ label: 'Order Masala chai · ₹90', type: 'order', arg: ITEMS.find((i) => i.name === 'Masala chai') }] : []);
    return out('The pool bar does mango lassi, nimbu soda, kokum cooler and tender coconut. Café Azure serves masala chai all day.', SERVES.test(r) ? [{ label: 'Order Mango lassi · ₹190', type: 'order', arg: ITEMS.find((i) => i.name === 'Mango lassi') }] : [{ label: 'Take me to the pool bar', type: 'travel', arg: 'poolbar' }]);
  }
  if (item) return out(`The ${item.name}: ${item.desc.toLowerCase()}. It's ₹${item.price}.${SERVES.test(r) ? ' Shall I order one for you?' : ''}`, SERVES.test(r) ? [{ label: `Order ${item.name} · ₹${item.price}`, type: 'order', arg: item }] : []);

  // facts
  const H = CONFIG.info.hours;
  if (has(t, /check.?in/)) return out(`Check-in is from ${H.checkin} and check-out is by ${H.checkout}. Priya at reception can help with both.`);
  if (has(t, /check.?out/)) return out(`Check-out is by ${H.checkout}. Need a late check-out? Ask at reception, it is usually fine until 1 pm.`);
  if (has(t, /\b(wi-?fi|wifi|internet|password|network)\b/)) return out(`The Wi-Fi network is "${CONFIG.info.wifi.network}" and the password is "${CONFIG.info.wifi.password}".`);
  if (has(t, /\b(what time|when|timing|timings|hours|open|close|closing|opening)\b/)) {
    if (has(t, /pool|swim/)) return out(`The pool is open from ${H.pool}. Towels are on the shelf by the deck.`);
    if (has(t, /bar|lassi|drink/)) return out(`The pool bar is open from ${H.bar}.`);
    if (has(t, /caf|restaurant|food|breakfast|lunch|dinner|buffet/)) return out(`Café Azure is open from ${H.cafe}. Breakfast runs until 11 am.`);
    if (has(t, /room service/)) return out(`Room service runs ${H.roomService}. Use the laptop in your room to order.`);
    if (has(t, /beach/)) return out(`The beach is open from ${H.beach}.`);
    if (has(t, /yoga|dance|bollywood|show|event|class/)) return out(`Today: ${CONFIG.info.events.join(', ')}.`);
    return out(`Café: ${H.cafe}. Pool: ${H.pool}. Pool bar: ${H.bar}. Check-out is by ${H.checkout}.`);
  }
  if (has(t, /\b(weather|temperature|hot|rain|sunny|monsoon|humid|cold)\b/)) return out(`It's ${ctx.night ? CONFIG.info.weather.night : CONFIG.info.weather.day}. ${ctx.night ? 'Perfect for a walk on the beach.' : 'Don\'t forget sunscreen!'} The monsoon arrives in June.`);
  if (has(t, /\b(special|recommend|suggest|must try|best|favourite|favorite)\b/) && has(t, /\b(special|dish|food|eat|menu|order|try|recommend)\b/) && !has(t, /tour|trip|place|visit|do\b/)) return out(/chef|waiter|waitress|buffet/.test(r) ? 'Today\'s special is the Goan prawn curry with red rice. For vegetarians, the paneer tikka is a hit.' : 'Everyone raves about the Goan prawn curry and the mango lassi. Café Azure is just off the lobby.');
  if (has(t, /\b(event|events|activity|activities|tonight|today|schedule|programme|program|show|happening|bored|fun|what (can|should) i do|things to do)\b/)) return out(`Today at Azure Bay: ${CONFIG.info.events.join('; ')}. You can also swim, watch the boats from the beach, or sit at any table and order food.`, [{ label: 'Take me to the pool', type: 'travel', arg: 'pool' }]);

  // role-specific topics
  if (has(t, /\b(taxi|cab|airport|tour|sightseeing|market|fort|church|old goa|shopping|trip|excursion)\b/)) {
    if (/concierge|receptionist/.test(r)) return out('A cab to Goa airport is ₹1,200. Popular trips: the Old Goa churches, Fort Aguada at sunset and the Anjuna flea market on Wednesdays. Shall I book something?');
    return out('Ask Arjun, the concierge at the front desk. He knows every trip around Goa!', [{ label: 'Take me to reception', type: 'travel', arg: 'lobby' }]);
  }
  if (has(t, /\b(bag|bags|luggage|suitcase|carry)\b/)) return out(/bellboy/.test(r) ? 'Leave it to me! Tell me your room number and your bags will be there in five minutes.' : 'Kabir the bellboy will carry your luggage. He is usually near the entrance.');
  if (has(t, /\b(towel|towels|clean|cleaning|housekeeping|sheets|pillow|soap|shampoo|toiletries)\b/)) return out(/housekeeping/.test(r) ? 'Of course! I will bring fresh towels and toiletries to your room right after this one.' : 'Lata from housekeeping can help. She is usually in the rooms corridor. Pool towels are on the shelf by the deck.');
  if (has(t, /\b(lost|stolen|emergency|police|doctor|hospital|hurt|injured|unsafe)\b/)) return out(/security|patrol|lifeguard/.test(r) ? 'Don\'t worry, I\'m here. Reception can call a doctor any time, and the nearest hospital is 4 km away. Tell me what happened.' : 'Please tell Harpreet at the entrance, or reception. They will help you right away.');
  if (has(t, /\b(deep|depth|lifeguard|drown|life jacket|safe to swim)\b/)) return out('The pool is 1.6 m deep at the far end and 1.1 m near the steps. The lifeguard is on duty until 8 pm.');
  if (has(t, /\b(book|reserve|reservation|availability|available)\b/)) return out(/receptionist|concierge/.test(r) ? 'I can check that for you. Deluxe sea-view rooms start at ₹7,500 a night with breakfast. Table bookings at Café Azure are free.' : 'Reception can take bookings. Priya is at the front desk.');

  if (has(t, /\b(safe|safety|secure|security)\b/)) return out(/security|patrol/.test(r) ? 'Completely safe. Security is on duty 24 hours, and there are cameras at every entrance.' : 'Very safe! Harpreet and Dev from security are on duty day and night.');
  if (has(t, /\b(sugar|diet|healthy|light|calories)\b/)) return out('Try a tender coconut or a salted nimbu soda: no added sugar and very refreshing. The fruit bowl is a light option too.', SERVES.test(r) ? [{ label: 'Order Tender coconut · ₹150', type: 'order', arg: ITEMS.find((i) => i.name === 'Tender coconut') }] : []);
  if (has(t, /\b(recommend|suggest|best|favourite|favorite|special|must try|famous)\b/)) return out(/concierge/.test(r) ? 'Old Goa\'s churches in the morning, Fort Aguada at sunset, and dinner at a beach shack in Baga!' : 'Have a mango lassi at the pool bar, then catch the sunset on the beach. Don\'t miss Bollywood night at 8!');

  // small talk
  if (has(t, /\b(how are you|how're you|how r u|how is it going|how's it going|kaise ho|kaise hain|kya haal|how do you do|what's up|sup)\b/)) {
    return out(pick([`I'm very well, thank you${you}! ${staff ? 'Busy day, but a good one.' : 'Holidays are the best.'}`, `Ekdum badhiya, thank you! And you${you}?`, `All good${you}! The weather is lovely today.`]));
  }
  if (has(t, /\b(your name|who are you|what are you|introduce|about yourself|tell me about you)\b/)) return out(aboutMe(npc));
  if (has(t, /\b(what are you doing|what're you doing|are you busy|what do you do|your job|work here)\b/)) return out(aboutMe(npc));
  if (has(t, /\b(where are you from|where're you from|hometown|native|which state|kahan se)\b/)) return out(`I'm from ${hometown(npc)}. ${/goa/i.test(hometown(npc)) ? 'Born and brought up right here!' : 'But Goa feels like home now.'}`);
  if (has(t, /\b(hindi|language|languages|speak|bhasha|english)\b/)) return out('Haan ji! I speak Hindi and English, and a little Konkani. Type in English and I\'ll do my best.');
  if (has(t, /\b(joke|funny|make me laugh)\b/)) return out(pick(['Why did the samosa go to school? To become a little more well-rounded!', 'My friend said he\'d bring chai at 4. Indian Standard Time: it arrived at 6!', 'Why don\'t dosas ever win arguments? They always fold!']));
  if (has(t, /\b(cricket|ipl|match|kohli|dhoni|sachin|rohit)\b/)) return out(pick(['India is batting right now, the room TVs have it live! Channel 1.', 'Cricket is not a sport here, it is a religion! Who\'s your favourite player?']));
  if (has(t, /\b(bollywood|movie|movies|film|song|songs|music|dance|srk|shah rukh|dancing)\b/)) return out(/dancer/.test(r) ? 'Bollywood night is at 8 pm on the pool stage. Come, I\'ll teach you a few steps!' : 'Ananya dances at the pool stage every evening, and the TVs have a Bollywood music channel too.');
  if (has(t, /\b(how old|age|married|family|kids|wife|husband|boyfriend|girlfriend)\b/)) return out('Ha! That\'s a personal question. Let\'s just say I\'m young at heart.');
  if (has(t, /\b(beautiful|lovely|amazing|awesome|great place|nice place|love (this|it|the)|wonderful|gorgeous|you look)\b/)) return out(pick(['Thank you so much! We\'re very proud of Azure Bay.', 'That\'s so kind of you!', 'Aww, thank you! Enjoy every moment.']));
  if (has(t, /\b(help|what can (you|i)|options|commands|what should i ask)\b/)) return out(capabilities(npc));
  if (has(t, /\b(hi|hii|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|sat sri akal|salaam|vanakkam|yo)\b/)) return out(greet(npc, ctx));
  if (has(t, /^ ?(ok|okay|yes|yeah|yep|sure|cool|great|nice|accha|achha|theek|thik|fine|alright|hmm|haan) ?$/)) return out(pick(['Great! Anything else I can help with?', 'Accha! Let me know if you need anything.', 'Wonderful!']));
  if (has(t, /^ ?(no|nope|nothing|nahi|nahin) ?/)) return out(pick(['No problem! Enjoy your day.', 'Alright! I\'m here if you need me.']));
  if (has(t, /\?/) && place) return out(place.how);

  return out(`Hmm, I'm not sure about that${you}. ${capabilities(npc)}`);
}

export function opening(npc, ctx) {
  npc.memory ||= {};
  return greet(npc, ctx);
}

/** Quick-reply chips shown under the chat box. */
export function suggestions(npc, ctx) {
  const r = roleOf(npc);
  if (/receptionist/.test(r) && ctx.canEscort) return ['Take me to the café', 'Take me to the pool', 'Take me to my room', 'What is the Wi-Fi password?'];
  if (/waiter|waitress|buffet/.test(r)) return ['What do you recommend?', 'I\'d like a masala dosa', 'Anything vegetarian?', 'Show me the menu'];
  if (/bartender|server/.test(r)) return ['One mango lassi, please', 'Something without sugar?', 'When is Bollywood night?'];
  if (/chef/.test(r)) return ['What\'s today\'s special?', 'Is the food spicy?', 'Where are you from?'];
  if (/concierge/.test(r)) return ['Book a cab to the airport', 'What tours do you suggest?', 'Where is the beach?'];
  if (/security|patrol/.test(r)) return ['Where is reception?', 'Is it safe here?', 'Sat Sri Akal!'];
  if (/housekeeping/.test(r)) return ['Can I get fresh towels?', 'When is check-out?'];
  if (/lifeguard/.test(r)) return ['How deep is the pool?', 'When does the pool close?'];
  return ['Namaste! How are you?', 'What are you doing?', 'Where are you from?', 'What should I do here?'];
}

/**
 * Which gesture goes with a message: { together } for a handshake / high five you do
 * together, or { npc } for a move the other person makes while answering.
 */
export function gestureFor(npc, raw) {
  const t = ` ${raw.toLowerCase().replace(/[’']/g, "'")} `;
  if (/shake hands?|handshake|hand shake|haath milao/.test(t)) return { together: 'handshake' };
  if (/high ?five|hi ?5|high-five|give me five/.test(t)) return { together: 'highfive' };
  if (/let'?s dance|dance (with|for) me|can you dance|show me (a |some |your )?(dance|moves|steps)|naacho|nachoge|do a dance/.test(t)) return { npc: npc.ch.pose.sit > 0.5 ? 'clap' : 'dance' };
  if (/\bhugs?\b/.test(t)) return { npc: 'namaste' };
  if (/\b(joke|funny|make me laugh|haha+|lol)\b/.test(t)) return { npc: 'laugh' };
  if (/\b(bye|goodbye|good bye|see you|alvida|tata|good night)\b/.test(t)) return { npc: 'wave' };
  if (/\b(thank|thanks|thx|shukriya|dhanyavad|dhanyawad)\b/.test(t)) return { npc: 'namaste' };
  if (/\b(namaste|namaskar|pranam|sat sri akal|vanakkam)\b/.test(t)) return { npc: 'namaste' };
  if (/\b(hi|hii|hello|hey|good (morning|afternoon|evening))\b/.test(t)) return { npc: isStaff(npc) ? 'namaste' : 'wave' };
  if (/\b(don't know|dunno|no idea|confused)\b/.test(t)) return { npc: 'shrug' };
  if (/^ (yes|yeah|ok|okay|sure|haan|accha|achha)\b/.test(t)) return { npc: 'nod' };
  if (/\b(beautiful|lovely|amazing|awesome|wonderful|gorgeous)\b/.test(t)) return { npc: 'namaste' };
  return null;
}
