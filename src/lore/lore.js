// The story is never told in one place. Everything below is a fragment found in the world.
// Each entry: id, src (which pool drops it), kind (letter | note | document | item), title, text, needs (how many
// fragments must already be found before it can appear: keeps the late truths late), maps (where it turns up most).
// Text markup: "\n" for line breaks, ~~struck~~ for crossed-out words. Edit freely; nothing else in the game depends on the wording.
//
// Pools:  world  = scattered on the ground and in chests
//         request = dropped by the dark ghosts (everything everyone ever wanted from him)
//         body    = left in the ash when a body burns (what he never buried)
//         child   = left behind when the Collective lets you go
//
// What the fragments, taken together, say (never stated outright anywhere):
//   Everett Vane founded and funded Vane House, a children's home that bore his name and was the reason everyone
//   called him good. He hated it. On the night before Founder's Night he sent the staff home, kept thirty children
//   in the east dormitory behind a bolt he had ordered fitted on the outside, and left. The fire brigade was called
//   twenty-one minutes after the neighbours saw smoke. He signed the report that blamed the wiring. The town mourned
//   him. One child, Wren, was in the corridor and watched him go with the light in his hand.
//   The letters are to himself. Each begins "Reasons to stay:", blank at first. "You" becomes "I" only at the end.

export const ENTRIES = [
  // ── Letters: his own hand, to himself ──
  { id: 'letter-sept-2', src: 'world', kind: 'letter', title: 'Letter, 2 September', needs: 0, maps: ['snow', 'rural'],
    text: "Sept. 2\nReasons to stay:\n  1.\n\nThey stood and clapped for eleven minutes tonight. I counted. I have never been so far from a room while standing inside it.\n\nYou will call it gratitude. It is a leash that applauds." },
  { id: 'letter-sept-17', src: 'world', kind: 'letter', title: 'Letter, 17 September', needs: 0, maps: ['snow', 'cave'],
    text: "Sept. 17\nReasons to stay:\n  1.\n\nAt nineteen I knew exactly how my life should go. I wrote it down. Everyone read it, nodded, and then told me what the next year would be.\n\nWisdom is a very quiet way of being owned." },
  { id: 'letter-oct-6', src: 'world', kind: 'letter', title: 'Letter, 6 October', needs: 4, maps: ['forest', 'hell'],
    text: "Oct. 6\nReasons to stay:\n\nThe east door sticks in the damp. Pruitt has asked three times for it to be seen to. You said you would see to it.\n\nYou are very good at saying." },
  { id: 'letter-dec-2', src: 'world', kind: 'letter', title: 'Letter, 2 December', needs: 6,
    text: "Dec. 2\nReasons to stay:\n  1. ~~nothing~~\n\nThe body goes on. It eats. It sleeps badly. It woke today wanting tea, and I did not ask it to.\n\nWrite down why it does that." },
  { id: 'letter-oct-10', src: 'world', kind: 'letter', title: 'Letter, 10 October', needs: 8, maps: ['rural'],
    text: "Oct. 10\nReasons to stay:\n\nThe papers say tragedy. They say ~~the man~~ the man who lost everything. You let them.\n\nInes brought soup. You thanked her. You practised the face in the glass first, and it was a good face." },
  { id: 'letter-oct-31', src: 'world', kind: 'letter', title: 'Letter, 31 October', needs: 10, maps: ['cave'],
    text: "Oct. 31\nReasons to stay:\n\nYou keep reciting the argument. It is a good argument. A god who builds a world where the small are burned, and calls it love, has taught you something.\n\nMaybe it taught you to do the same. That is the part you leave out when you recite it." },
  { id: 'letter-woods', src: 'world', kind: 'letter', title: 'Letter, no date', needs: 12, maps: ['forest'],
    text: "No date\nReasons to stay:\n\nThree nights of the same dream. The woods behind the house go on much farther than the house had grounds. Something stands at the tree line holding a light the way I hold one.\n\nYou would call it a symptom. I would call it the only honest witness I have ever had." },
  { id: 'letter-the-ninth', src: 'world', kind: 'letter', title: 'Letter, the ninth', needs: 14, maps: ['hell'],
    text: "The ninth\nReasons to stay:\n\nThey are singing in the dormitory. Pruitt is at her sister's. I gave the staff the night; they were so glad.\n\nI keep waiting for a verdict, as if one were coming from somewhere. Nothing is coming. Nothing ever was. That is the whole of what I know." },
  { id: 'letter-feb-14', src: 'world', kind: 'letter', title: 'Letter, 14 February', needs: 16,
    text: "Feb. 14\nReasons to stay:\n  1. The smell of the road after rain.\n\nSmall. I know. Take it anyway." },
  { id: 'letter-mar-3', src: 'world', kind: 'letter', title: 'Letter, 3 March', needs: 20,
    text: "Mar. 3\nReasons to stay:\n  1. The road after rain.\n  2. Ines saves me the window seat on the train.\n\nYou keep trying to make it bigger. It is not supposed to be bigger. Stop." },
  { id: 'letter-undated', src: 'world', kind: 'letter', title: 'Letter, torn at the fold', needs: 26,
    text: "Reasons to stay:\n\nShe watched me from the end of the hall. The light was in my hand. I remember that I remember.\n\nI have never been able to decide whether she was afraid of me, or only looking. I think I have been afraid to decide." },
  { id: 'letter-last', src: 'world', kind: 'letter', title: 'The last letter', needs: 38,
    text: "Reasons to stay:\n  1. The road after rain.\n  2. Ines saves me the window seat.\n  3. Someone has to tell it right.\n\nI held the key. I will not write that it was anything else.\n\nI am going to stay, and I am going to say it." },

  // ── Requests: what everyone wanted. Dropped by the dark ghosts ──
  { id: 'req-words', src: 'request', kind: 'note', title: 'Request: a few words', needs: 0,
    text: "Mr. Vane, the Board would be so grateful if you would say a few words. Two minutes. Three, if you are feeling generous.\n— D." },
  { id: 'req-grey', src: 'request', kind: 'note', title: 'Request: the grey', needs: 0,
    text: "Everett, Mother asks that you wear the grey. She says the blue makes you look unwell." },
  { id: 'req-letter', src: 'request', kind: 'note', title: 'Request: a letter', needs: 0,
    text: "Dear Mr. Vane, our son's application is due Friday. We thought, given your position, that perhaps a line from you would settle it..." },
  { id: 'req-sunday', src: 'request', kind: 'note', title: 'Request: Sunday', needs: 0,
    text: "Sunday. Six o'clock, Mother's table. Please do not talk about the home.\n— I." },
  { id: 'req-photo', src: 'request', kind: 'note', title: 'Request: one more photograph', needs: 0,
    text: "Sir, the photographer would like one more with the children. Could you crouch? They look warmer when you crouch." },
  { id: 'req-sign', src: 'request', kind: 'note', title: 'Request: your signature', needs: 0,
    text: "Will you sign these before lunch? You needn't read them. They're only for the Fund." },
  { id: 'req-kind', src: 'request', kind: 'note', title: 'Request: a kind word', needs: 0,
    text: "You always know what to say. Could you say it to my brother for me? I am no good at it." },
  { id: 'req-tears', src: 'request', kind: 'note', title: 'Request: tears, not excessive', needs: 0,
    text: "Founder's Night: a lantern for every child, a speech from you, and if you could weep a little at the end, nothing excessive. Reporters like it." },

  // ── Documents ──
  { id: 'doc-menu', src: 'world', kind: 'document', title: 'Menu card, October', needs: 0, maps: ['forest'],
    text: "Oct. 9. Porridge, bread, plums.\nA lantern each after supper.\n\n(Pip may have two. He cries.)" },
  { id: 'doc-maintenance', src: 'world', kind: 'document', title: 'Maintenance request no. 14', needs: 2, maps: ['hell'],
    text: "East dormitory door sticks when damp. Please plane the frame. This is the third request.\n— Mrs. P.\n\n[stamped]  NOTED" },
  { id: 'doc-physician', src: 'world', kind: 'document', title: "Doctor's note", needs: 5, maps: ['snow', 'rural'],
    text: "Mr. Vane, you are not ill. You are tired in a way I cannot prescribe for. I wish you would let someone sit with you.\n— Dr. O." },
  { id: 'doc-minutes', src: 'world', kind: 'document', title: 'Board minutes (torn)', needs: 6, maps: ['hell', 'rural'],
    text: "...and the new bolt on the east dormitory to be fitted at the founder's direction, following the incident in March. Carried.\n\nMr. Vane abstained from the vote, and from the cost.\n\nThe incident is not described in these minutes." },
  { id: 'doc-courier', src: 'world', kind: 'document', title: 'Clipping: The Courier, 11 October', needs: 8, maps: ['rural'],
    text: "TRAGEDY AT VANE HOUSE\nThirty children lost. The founder escaped through a window.\n\n\"He stood in the yard,\" said a neighbour. \"He did not shout. I remember thinking he was waiting for something.\"\n\nThe fire has been traced to the wiring." },
  { id: 'doc-roster', src: 'world', kind: 'document', title: 'Duty roster, week of the 9th', needs: 10, maps: ['hell', 'forest'],
    text: "EAST DORMITORY (30 beds)\n  Mon to Fri: Mrs. Pruitt, nights\n  Sat. 9th: ~~Mrs. Pruitt~~  none (per Mr. Vane)\n\nAttendant: none (per Mr. Vane)\nDoor: see him." },
  { id: 'doc-guestbook', src: 'world', kind: 'document', title: "Guest book, Founder's Night", needs: 12, maps: ['rural'],
    text: "\"Lovely evening.\"\n\"What a man.\"\n\"Weeping.\"\n\nBelow, in another hand, pressed hard enough to tear the page:\nHe did not look at the lanterns." },
  { id: 'doc-solicitor', src: 'world', kind: 'document', title: 'Letter from the solicitor', needs: 18, maps: ['rural'],
    text: "...the Vane Memorial Fund now holds more than the House ever cost.\n\nYou have asked that the surplus be left unspent.\nYou have asked that no one be told why." },

  // ── Margins: his books ──
  { id: 'margin-way', src: 'world', kind: 'note', title: 'Margin note', needs: 3, maps: ['cave'],
    text: "In a book of meditations, beside a paragraph on duty:\n\n\"Knowing the way is not the same as being let walk it.\"" },
  { id: 'margin-bolt', src: 'world', kind: 'note', title: 'Underlined passage', needs: 9, maps: ['cave'],
    text: "Underlined twice:\n\n\"...a house built by one who says he loves us, and bolts the doors.\"\n\nIn the margin, someone has drawn the bolt, very carefully." },
  { id: 'margin-violet', src: 'world', kind: 'note', title: 'A pressed violet', needs: 13, maps: ['cave'],
    text: "Pressed between two pages. The page it marked has been cut out with a razor. The flower has been kept." },
  { id: 'margin-flyleaf', src: 'world', kind: 'note', title: 'The flyleaf', needs: 22, maps: ['cave'],
    text: "A column headed \"Reasons to stay.\"\n\nEleven attempts to begin it. Each crossed out before the first line was written." },

  // ── Things he carried, and things that were kept ──
  { id: 'item-matchbook', src: 'world', kind: 'item', title: "Founder's Night matchbook", needs: 0,
    text: "Printed: VANE HOUSE. A LANTERN FOR EVERY CHILD.\n\nNearly every head is spent. Once a year the children lit their lanterns from these, one small flame passed from hand to hand.\n\nSomeone has kept the empty book." },
  { id: 'item-cufflink', src: 'world', kind: 'item', title: 'Grey cufflink', needs: 3, maps: ['snow'],
    text: "Engraved with a single E.\n\nGrey, because his mother thought blue made him look unwell. The post is bent from being worn too long." },
  { id: 'item-lantern', src: 'world', kind: 'item', title: 'Crushed paper lantern', needs: 4,
    text: "Thin as breath. Each lantern carried a name in a child's hand.\n\nThis one is blank. Whoever held it did not get to write." },
  { id: 'item-whistle', src: 'world', kind: 'item', title: "Matron's whistle", needs: 5,
    text: "Brass. Blown once to bring the children in from the grounds, and once again for supper.\n\nIt was in a drawer that night. She was at her sister's." },
  { id: 'item-slipper', src: 'world', kind: 'item', title: 'Dormitory slipper', needs: 8, maps: ['forest'],
    text: "Small, worn through at the toe.\n\nThere were thirty pairs by the east door every night. Someone had set them in a line." },
  { id: 'item-frame', src: 'world', kind: 'item', title: 'Empty portrait frame', needs: 11, maps: ['cave'],
    text: "Gilt, heavy. The canvas was cut out cleanly.\n\nWhoever did it could not stand to be looked at, or could not stand to look." },
  { id: 'item-watch', src: 'world', kind: 'item', title: 'Stopped pocket watch', needs: 15, maps: ['hell'],
    text: "The hands stand at eleven thirty-one.\n\nIt has been wound every day since." },
  { id: 'item-cushion', src: 'world', kind: 'item', title: 'Window-seat cushion', needs: 20,
    text: "Embroidered: For Everett. The stitches are uneven.\n\nA card is pinned to it. It says: for whenever." },

  // ── What a burning body leaves in the ash ──
  { id: 'body-key', src: 'body', kind: 'item', title: 'The brass key', needs: 0,
    text: "Heavy, and warm, though nothing in this place is warm. The teeth are worn bright from a single turn, made once.\n\nIt does not open anything here." },
  { id: 'body-calllog', src: 'body', kind: 'document', title: 'Fire brigade call log', needs: 0,
    text: "RECEIVED 11:52.\nCaller: V., E. Reports \"a smell of smoke.\" Location: Vane House.\nDispatcher's note: caller calm.\nENGINE AWAY 11:54.\n\nIn pencil, in another hand:\nNeighbours first saw smoke at 11:31." },
  { id: 'body-report', src: 'body', kind: 'document', title: "The inspector's report", needs: 0,
    text: "CAUSE: electrical, kitchen circuit (probable). Statement of the founder accepted without further inquiry.\n\nThe east dormitory bolt was found engaged. At Mr. Vane's request it is not to appear in the public summary." },
  { id: 'body-order', src: 'body', kind: 'document', title: 'Order for one bolt', needs: 0,
    text: "Exterior bolt, east dormitory. Cost to be borne by the founder personally.\n\nSo that they stay safe.\n— E.V." },
  { id: 'body-glove', src: 'body', kind: 'item', title: 'Burned glove', needs: 0,
    text: "Left hand. The palm is scorched through, but the fingers are not.\n\nAs if something was held very hard, for a long time, and not let go." },
  { id: 'body-lens', src: 'body', kind: 'item', title: 'Scorched flashlight lens', needs: 0,
    text: "Cracked. The reflector behind it is black.\n\nSomeone held it up in a corridor and looked down it for a long while." },

  // ── What the children leave when the Collective lets you go ──
  { id: 'child-mitten', src: 'child', kind: 'item', title: 'Red mitten', needs: 0,
    text: "Pip is three. That afternoon he wrapped himself around a man's leg and held on.\n\nHe was not pushed away. He was not picked up, either." },
  { id: 'child-hem', src: 'child', kind: 'item', title: 'Singed nightgown hem', needs: 0,
    text: "White flannel burned to lace. It has been mended, badly, with thread stolen from the sewing room.\n\nSomeone had meant to keep it." },
  { id: 'child-song', src: 'child', kind: 'note', title: 'The lamp song', needs: 4,
    text: "A page in a child's careful hand: a song about a lamp that waits at the end of a hall.\n\nThe last verse is blank, as if she had been promised it would be added later." },
  { id: 'child-tags', src: 'child', kind: 'item', title: 'Ring of name tags', needs: 8,
    text: "Thirty cloth tags, each with a name and an age, sewn once into a nightgown.\n\nOne has been scratched out. From which side, you cannot tell." },
  { id: 'child-drawing', src: 'child', kind: 'item', title: "Child's drawing", needs: 12,
    text: "Crayon. Thirty small figures in a row. A long yellow arm reaches down a corridor.\n\nAt its far end stands a tall figure holding a light. It has no face. Beneath it, in careful capitals: MR V." },
  { id: 'child-hairpin', src: 'child', kind: 'item', title: 'A hairpin with a name', needs: 16,
    text: "Scratched into it: W R E N.\n\nWren was eleven. She did not go to bed when she was told. She is the only child with no bed in the east dormitory." },
];

export const KINDS = [
  { id: 'letter', label: 'LETTERS' }, { id: 'note', label: 'NOTES' },
  { id: 'document', label: 'DOCUMENTS' }, { id: 'item', label: 'ITEMS' },
];
export const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

// Pick something not yet found (and not already lying on the ground this round) from a pool. Earlier fragments come
// first: an entry waits until enough others have been found. Entries tied to the current map are favoured.
export function drawLore(pool, map, taken, foundCount, rng = Math.random) {
  const ok = ENTRIES.filter((e) => e.src === pool && !taken.has(e.id) && (e.needs || 0) <= foundCount);
  if (!ok.length) return null;
  const w = ok.map((e) => (e.maps ? (e.maps.includes(map) ? 3 : 0.6) : 1));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r <= 0) return ok[i]; }
  return ok[ok.length - 1];
}
