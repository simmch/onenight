import { CULT_QUESTIONS } from './CultQuestions.js';

const DOCTRINES = [
  { name: 'The Open Ledger', emblem: 'ledger', color: 0xc48253, refrain: 'Keep the ledger open.', form: 'ritual',
    creed: 'Nothing goes unrecorded here. Even silence takes up a line.',
    instruction: 'A witness begins with the words on the lectern. Then the clerk will take your answer.',
    verdict: 'There is a line for you. I have already filled it in.' },
  { name: 'The Last Lantern', emblem: 'lantern', color: 0xe4a35c, refrain: 'Leave one burning.', form: 'ritual',
    creed: 'We kept a light on long after the last person should have come home.',
    instruction: 'Say what the congregation says before you give us your own words.',
    verdict: 'That was the last light you had to keep by yourself.' },
  { name: 'The House of Still Water', emblem: 'water', color: 0x89b1aa, refrain: 'Let the water settle.', form: 'plain',
    creed: 'A room full of voices can bury a person as deep as any water.',
    instruction: 'The congregation has its words. A witness answers in their own.',
    verdict: 'Keep still. You will see your face in ours soon enough.' },
  { name: 'The Empty Chair', emblem: 'chair', color: 0xb58695, refrain: 'Keep a place.', form: 'plain',
    creed: 'When somebody stops coming, we leave their place just as it was.',
    instruction: 'That refrain is for the seated. Speak plainly while you are still standing.',
    verdict: 'We have left a place for you since before you had a name.' },
];

const LEADERS = [
  { name: 'The Keeper', gesture: 'open', hooks: ['Take all the time you need.', 'You can tell me quietly.', 'Look at me when you say it.', 'Let us make this easy.', 'You can ask for a moment.', 'Let them hear you this once.'],
    approval: 'That will do. Keep your eyes here.', doubt: 'You heard the people. Listen more carefully.', concession: 'You can set that down now. We will hold it.', challenge: 'I had hoped to spare you another example.', escape: 'Look at me. The rest of them are already looking.' },
  { name: 'The Clerk', gesture: 'point', hooks: ['For the record.', 'State it as you found it.', 'We require one witness.', 'Speak so I can write it down.', 'I will record the exact words.', 'This is the line we keep.'],
    approval: 'The record will show your answer.', doubt: 'The record will show an error in form.', concession: 'That will be entered as consent.', challenge: 'Have the attendants come forward.', escape: 'Clerk’s correction. The witness is still bound.' },
  { name: 'The Mouth', gesture: 'reach', hooks: ['Say it to the ones in the back.', 'Let me see your mouth move.', 'They waited all night to hear this.', 'Say it before they say it for you.', 'I can hear you thinking.', 'Give them a word to take home.'],
    approval: 'Good. They heard all of it.', doubt: 'Did everyone hear what was missing?', concession: 'You heard them. Take it from their hands.', challenge: 'Stand, all of you. Let the witness see.', escape: 'Open your eyes. Every one of you.' },
];

const HALLS = {
  timber: { adjective: 'timber', stone: 0x392b26, shadow: 0x160d12, light: 0xca7a48, cue: 'The rafters creak. Pine needles are caught in the attendants’ hems.' },
  drowned: { adjective: 'drowned', stone: 0x383b36, shadow: 0x0b1316, light: 0x669aa3, cue: 'Water runs beneath the pews. Something has scraped the salt from the aisle.' },
  institutional: { adjective: 'institutional', stone: 0x3b3d40, shadow: 0x101019, light: 0x8c9bb8, cue: 'Old room numbers show through the paint on the pillars.' },
  industrial: { adjective: 'industrial', stone: 0x38363b, shadow: 0x100d17, light: 0xa281a4, cue: 'A pipe knocks above the pulpit. No one looks up.' },
  stone: { adjective: 'stone', stone: 0x3e3636, shadow: 0x100c18, light: 0x8889b2, cue: 'Cold air moves down from the galleries. None comes in through the door.' },
};
const MAP_HALL = {
  forest: 'timber', rural: 'timber', manor: 'timber', glasshouse: 'timber',
  swamp: 'drowned', cathedral: 'drowned', subway: 'drowned', deepsea: 'drowned',
  asylum: 'institutional', sanatorium: 'institutional', school: 'institutional', prison: 'institutional', apartments: 'institutional', mall: 'institutional', backrooms: 'institutional',
  offshore: 'industrial', accelerator: 'industrial', serverfarm: 'industrial',
};

export const CULT_MEMORY = {
  ghosts: 'You carried a light past something that hated being seen.',
  observer: 'You learned what it means to be watched without being touched.',
  collective: 'You found out how quickly a group of children can go quiet.',
  choir: 'The last congregation you heard came when you made a sound.',
  consumer: 'You know how a room sounds when someone stops running.',
  slime: 'You saw a floor become something that could swallow you.',
  unseen: 'Something moved the world beside you and left no body to look at.',
  lightbound: 'You waited for a light to stay on long enough to see who was there.',
  effigy: 'You learned how long a shape can stay still and still be watching.',
  burrower: 'You had reason to wonder what was moving under your feet.',
  seamstress: 'You have seen what a thread can hold.',
  counterfeit: 'You had to decide whether to trust what was waiting to be opened.',
  wickeater: 'You have had a light go out when you needed it most.',
  bellman: 'You heard a bell and learned to count the silence that followed.',
  cult: 'You remember how the last hall sounded after a shot.',
};

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createCultTrial({ random, round, map, health, recent = [] }) {
  const pick = items => items[Math.floor(random() * items.length)];
  const doctrine = pick(DOCTRINES), leader = pick(LEADERS), hall = HALLS[MAP_HALL[map] || 'stone'];
  const past = recent.find(type => type !== 'cult' && CULT_MEMORY[type]) ?? recent[0];
  const wound = health < 0.35 ? 'Blood drips through the rope. The Keeper of the door slides a tray under your wrists.'
    : health < 0.8 ? 'An attendant pulls the rope away from the bruising, then tightens it again.'
      : 'The rope is the only mark on your wrists. An attendant runs a thumb across it.';
  let suspicion = 0, submission = 0, resolve = 0;
  let mood = pick(['hushed', 'restless', 'eager']);
  const exception = pick([2, 3, 4]);
  const session = CULT_QUESTIONS.map((group, i) => ({ row: pick(group), alternate: random() < 0.5, exception: i === exception }));
  const contextOrder = shuffle(['hall', 'wound', 'memory', 'mood', 'mood', 'refrain'], random);
  const moods = {
    hushed: 'Even the people in the galleries stay quiet.',
    restless: 'Wood scrapes. The front row keeps checking the aisle.',
    eager: 'Someone mouths a word before the leader speaks.',
  };
  return {
    doctrine, leader, hall,
    get mood() { return mood; },
    count: session.length,
    question(index) {
      const { row, alternate, exception } = session[index];
      const [first, second, guarded, surrender, challenge] = row;
      const context = {
        hall: hall.cue,
        wound,
        memory: CULT_MEMORY[past] ?? 'Nobody has put your name in the book. There is a line waiting.',
        mood: moods[mood],
        refrain: `From the pews, almost inaudible: “${doctrine.refrain}”`,
      }[contextOrder[index]];
      const aside = doctrine.form === 'ritual' ? 'For this one, leave the refrain to the pews.' : 'For this one, begin with the congregation’s words.';
      return {
        context,
        line: `${exception ? aside : leader.hooks[index]} ${alternate ? second : first}`,
        options: shuffle([
          { type: 'plain', text: guarded },
          { type: 'ritual', text: `${doctrine.refrain} ${guarded}` },
          { type: 'surrender', text: surrender },
          { type: 'challenge', text: challenge },
        ], random),
      };
    },
    answer(index, type) {
      const preferred = session[index].exception ? (doctrine.form === 'ritual' ? 'plain' : 'ritual') : doctrine.form;
      if (type === preferred) {
        resolve += 2; suspicion = Math.max(0, suspicion - 1); mood = 'hushed';
        return leader.approval;
      }
      if (type === 'surrender') {
        submission += 3; suspicion = Math.max(0, suspicion - 2); mood = 'eager';
        return leader.concession;
      }
      if (type === 'challenge') {
        suspicion += mood === 'restless' ? 4 : 3; resolve += 2; mood = 'restless';
        return leader.challenge;
      }
      suspicion += 2; resolve += 1; mood = 'restless';
      return leader.doubt;
    },
    interruption(index, type) {
      if (type === 'loosen') { resolve += 2; return 'A little slack. You keep your wrists still and let the rope settle again.'; }
      if (type === 'ground') {
        suspicion = Math.max(0, suspicion - 2);
        return index === 1 ? `You count the voices. The refrain is “${doctrine.refrain}” ${doctrine.instruction}` : 'You keep your breathing even until the attendant lets go of your shoulder.';
      }
      if (type === 'gun') { resolve += 1; return 'In the attendant’s sash, you make out the butt of a small pistol.'; }
      resolve += 1;
      return 'One person never stood. They stare at the knot until you look down too.';
    },
    escaped() {
      return resolve >= (round >= 7 ? 8 : 7) && submission < 7 && suspicion <= (round >= 7 ? 5 : 6);
    },
  };
}
