// How the fragments connect. The storyboard (storyboard.js) pins every fragment to a board and strings these links
// between them once both ends have been found. A thread is a colour of string; its name stays hidden until at least
// one of its links is known, so the board never gives away more than the player has read.
// Link: [a, b, thread, why]. "why" is shown on the string. Edit freely; ids must match lore.js (bad ones are skipped).

export const THREADS = [
  { id: 'bolt',     label: 'THE BOLT',              color: '#c8473a' },
  { id: 'fire',     label: 'THE NIGHT OF THE 9TH',  color: '#e0802e' },
  { id: 'founders', label: "FOUNDER'S NIGHT",       color: '#d9b55c' },
  { id: 'wren',     label: 'THE GIRL IN THE HALL',  color: '#8fb6dc' },
  { id: 'reasons',  label: 'REASONS TO STAY',       color: '#e3dac0' },
  { id: 'ines',     label: 'INES',                  color: '#d08fa3' },
  { id: 'leash',    label: 'WHAT EVERYONE WANTED',  color: '#9fae72' },
  { id: 'thirty',   label: 'THE THIRTY',            color: '#c9a98a' },
  { id: 'fund',     label: 'THE FUND',              color: '#6fb0a2' },
  { id: 'verdict',  label: 'THE VERDICT',           color: '#a497cf' },
];

export const LINKS = [
  // the bolt
  ['doc-maintenance', 'letter-oct-6', 'bolt', 'The east door sticks. He said he would see to it.'],
  ['letter-oct-6', 'doc-minutes', 'bolt', 'What he saw to was a bolt.'],
  ['doc-minutes', 'body-order', 'bolt', 'Fitted at the founder\'s direction.'],
  ['body-order', 'margin-bolt', 'bolt', 'He drew the bolt in the margin, very carefully.'],
  ['body-order', 'body-key', 'bolt', 'One bolt. One key. One turn.'],
  ['body-key', 'body-report', 'bolt', 'The bolt was found engaged.'],
  ['body-key', 'body-glove', 'bolt', 'Something held very hard, and not let go.'],
  ['body-key', 'letter-last', 'bolt', '"I held the key."'],
  ['body-report', 'doc-courier', 'bolt', 'What the town was told: the wiring.'],
  // the night of the 9th
  ['letter-the-ninth', 'doc-roster', 'fire', 'He gave the staff the night.'],
  ['doc-roster', 'item-whistle', 'fire', 'The matron was at her sister\'s.'],
  ['doc-roster', 'doc-maintenance', 'fire', 'Mrs. Pruitt, who asked three times.'],
  ['item-watch', 'body-calllog', 'fire', 'Eleven thirty-one: the first smoke.'],
  ['body-calllog', 'body-report', 'fire', 'Caller calm. Statement accepted.'],
  ['body-calllog', 'doc-courier', 'fire', 'He stood in the yard. He did not shout.'],
  ['doc-courier', 'letter-oct-10', 'fire', 'The papers say tragedy. You let them.'],
  ['item-watch', 'letter-the-ninth', 'fire', 'That night. Wound every day since.'],
  // founder's night
  ['req-tears', 'item-matchbook', 'founders', 'A lantern for every child.'],
  ['item-matchbook', 'item-lantern', 'founders', 'One small flame, hand to hand.'],
  ['item-lantern', 'doc-menu', 'founders', 'A lantern each after supper.'],
  ['req-tears', 'doc-guestbook', 'founders', '"Weeping." Nothing excessive.'],
  ['doc-guestbook', 'letter-sept-2', 'founders', 'He did not look at the lanterns.'],
  ['req-words', 'letter-sept-2', 'founders', 'A few words. Eleven minutes of applause.'],
  ['req-photo', 'child-mitten', 'founders', 'Crouch. They look warmer when you crouch.'],
  // the girl in the hall
  ['child-hairpin', 'letter-undated', 'wren', 'She watched from the end of the hall.'],
  ['letter-undated', 'body-lens', 'wren', 'The light was in my hand.'],
  ['body-lens', 'child-drawing', 'wren', 'A long yellow arm down a corridor.'],
  ['child-drawing', 'child-hairpin', 'wren', 'MR V, drawn by the one who saw.'],
  ['child-song', 'child-drawing', 'wren', 'A lamp that waits at the end of a hall.'],
  ['child-song', 'child-hairpin', 'wren', 'The last verse, promised later.'],
  ['letter-woods', 'body-lens', 'wren', 'Someone holding a light the way I hold one.'],
  ['child-tags', 'child-hairpin', 'wren', 'Thirty beds. She had none of them.'],
  // reasons to stay: the letters, in the order they come
  ['margin-flyleaf', 'letter-sept-2', 'reasons', 'Eleven attempts to begin the list.'],
  ['letter-sept-2', 'letter-sept-17', 'reasons', 'Reasons to stay: 1.'],
  ['letter-sept-17', 'letter-oct-6', 'reasons', 'Still blank.'],
  ['letter-oct-6', 'letter-dec-2', 'reasons', 'Still blank.'],
  ['letter-dec-2', 'letter-oct-10', 'reasons', '~~nothing~~'],
  ['letter-oct-31', 'letter-woods', 'reasons', 'Still blank.'],
  ['letter-dec-2', 'letter-feb-14', 'reasons', 'The body woke wanting tea. Then: the road after rain.'],
  ['letter-feb-14', 'letter-mar-3', 'reasons', 'A second reason.'],
  ['letter-mar-3', 'letter-last', 'reasons', 'A third: someone has to tell it right.'],
  ['letter-the-ninth', 'letter-undated', 'reasons', 'What he kept waiting to decide.'],
  // Ines
  ['req-sunday', 'letter-oct-10', 'ines', 'Ines brought soup. He practised the face first.'],
  ['letter-mar-3', 'item-cushion', 'ines', 'She saves him the window seat.'],
  ['item-cushion', 'letter-last', 'ines', 'For whenever.'],
  ['req-sunday', 'item-cushion', 'ines', 'Uneven stitches, from the same hand.'],
  // what everyone wanted
  ['req-grey', 'item-cufflink', 'leash', 'Grey, because blue made him look unwell.'],
  ['req-letter', 'letter-sept-17', 'leash', 'Everyone read it, nodded, and told him what next.'],
  ['letter-sept-17', 'margin-way', 'leash', 'Knowing the way is not being let walk it.'],
  ['req-kind', 'letter-oct-10', 'leash', 'You always know what to say. A good face.'],
  ['doc-physician', 'letter-dec-2', 'leash', 'Tired in a way no one can prescribe for.'],
  ['item-frame', 'letter-oct-10', 'leash', 'The face in the glass. The canvas cut out.'],
  ['req-words', 'req-photo', 'leash', 'One more speech. One more photograph.'],
  ['margin-violet', 'item-frame', 'leash', 'Cut out with a razor, and kept.'],
  // the thirty
  ['doc-menu', 'child-mitten', 'thirty', 'Pip may have two. He cries.'],
  ['item-slipper', 'child-tags', 'thirty', 'Thirty pairs by the east door.'],
  ['item-lantern', 'child-tags', 'thirty', 'Each lantern carried a name.'],
  ['child-hem', 'item-slipper', 'thirty', 'Night things from the east dormitory.'],
  ['child-hem', 'child-mitten', 'thirty', 'Someone had meant to keep it.'],
  // the fund
  ['req-sign', 'doc-solicitor', 'fund', 'You needn\'t read them. They\'re only for the Fund.'],
  ['doc-solicitor', 'doc-minutes', 'fund', 'Abstained from the vote, and from the cost.'],
  ['doc-solicitor', 'body-order', 'fund', 'Cost borne by the founder personally.'],
  // the verdict
  ['letter-oct-31', 'margin-bolt', 'verdict', 'A house built by one who says he loves us.'],
  ['letter-oct-31', 'letter-the-ninth', 'verdict', 'Waiting for a verdict. Nothing is coming.'],
  ['letter-the-ninth', 'body-key', 'verdict', 'The night he stopped waiting.'],
];
