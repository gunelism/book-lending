import { Faker } from '@faker-js/faker';
import { Genre } from '../entities/enums';

/** Word lists for plausible, varied (and fictional) book titles. */
const ADJECTIVES = [
  'Silent', 'Hidden', 'Last', 'Broken', 'Golden', 'Forgotten', 'Burning', 'Quiet', 'Endless', 'Crimson', 'Winter',
  'Midnight', 'Lost', 'Secret', 'Distant', 'Wild', 'Hollow', 'Bright', 'Restless', 'Glass', 'Paper', 'Iron', 'Salt',
  'Northern', 'Sunken', 'Little', 'Invisible', 'Final', 'Electric', 'Borrowed', 'Fading', 'Velvet', 'Bitter',
  'Amber', 'Scarlet', 'Silver', 'Frozen', 'Drowned', 'Painted', 'Wandering', 'Sleeping', 'Shattered', 'Second',
  'Unfinished', 'Lantern-lit', 'Weightless', 'Copper', 'Gentle', 'Savage', 'Ninth', 'Starless', 'Sapphire', 'Hungry',
];
const NOUNS = [
  'Garden', 'River', 'House', 'Orchard', 'Lighthouse', 'Archive', 'Kingdom', 'Harbor', 'Mirror', 'Forest', 'City',
  'Island', 'Letter', 'Promise', 'Shadow', 'Map', 'Song', 'Station', 'Library', 'Mountain', 'Bridge', 'Clockmaker',
  'Cartographer', 'Daughter', 'Stranger', 'Season', 'Tide', 'Compass', 'Witness', 'Atlas', 'Ember', 'Crown', 'Signal',
  'Orchestra', 'Beekeeper', 'Ferryman', 'Inheritance', 'Labyrinth', 'Meridian', 'Nocturne', 'Pilgrim', 'Quarry',
  'Reckoning', 'Sanctuary', 'Tapestry', 'Vineyard', 'Watchmaker', 'Alchemist', 'Balcony', 'Caravan', 'Dynasty',
  'Equinox', 'Foundling', 'Glacier', 'Hourglass', 'Lullaby', 'Monastery', 'Notebook', 'Observatory', 'Telegram',
];
const PLACES = [
  'Tallinn', 'Lisbon', 'the North', 'Prague', 'the Coast', 'Baku', 'Avalon', 'the Valley', 'Kyoto', 'Marrakesh',
  'the Steppe', 'Vienna', 'the Delta', 'Edinburgh', 'the Archipelago', 'Riga', 'the Old Town', 'Odessa', 'Seville',
];
const NONFICTION_TOPICS: Partial<Record<Genre, string[]>> = {
  [Genre.SCIENCE]: ['Quantum Worlds', 'The Living Cell', 'Climate', 'The Brain', 'Black Holes', 'Genes', 'Oceans', 'Mathematics', 'Evolution', 'Light'],
  [Genre.HISTORY]: ['the Silk Road', 'the Hanseatic League', 'the Ottoman Empire', 'the Cold War', 'Ancient Rome', 'the Baltic', 'the Printing Press', 'the Vikings', 'Byzantium'],
  [Genre.NON_FICTION]: ['Deep Work', 'Habits', 'Negotiation', 'Cities', 'Money', 'Attention', 'Design', 'Leadership', 'Sleep', 'Food'],
  [Genre.BIOGRAPHY]: ['a Revolutionary', 'an Inventor', 'a Composer', 'a Queen', 'an Explorer', 'a Chess Champion', 'a Physicist', 'a Painter'],
};

export const GENRE_WEIGHTS: Array<{ weight: number; value: Genre }> = [
  { value: Genre.FICTION, weight: 18 },
  { value: Genre.MYSTERY, weight: 11 },
  { value: Genre.THRILLER, weight: 9 },
  { value: Genre.SCIENCE_FICTION, weight: 9 },
  { value: Genre.FANTASY, weight: 10 },
  { value: Genre.ROMANCE, weight: 8 },
  { value: Genre.NON_FICTION, weight: 9 },
  { value: Genre.BIOGRAPHY, weight: 5 },
  { value: Genre.HISTORY, weight: 7 },
  { value: Genre.SCIENCE, weight: 6 },
  { value: Genre.CHILDREN, weight: 6 },
  { value: Genre.POETRY, weight: 2 },
];

export const NATIONALITIES = [
  'Estonian', 'Azerbaijani', 'British', 'American', 'French', 'German', 'Japanese', 'Italian', 'Spanish', 'Polish',
  'Swedish', 'Finnish', 'Irish', 'Canadian', 'Brazilian', 'Nigerian', 'Indian', 'Turkish', 'Georgian', 'Latvian',
];

export function bookTitle(f: Faker, genre: Genre): string {
  return capitalize(rawTitle(f, genre));
}

function rawTitle(f: Faker, genre: Genre): string {
  const adj = f.helpers.arrayElement(ADJECTIVES);
  const noun = f.helpers.arrayElement(NOUNS);
  const topics = NONFICTION_TOPICS[genre];
  if (topics) {
    const topic = f.helpers.arrayElement(topics);
    if (genre === Genre.BIOGRAPHY) {
      return f.helpers.arrayElement([`The Life of ${topic}`, `Portrait of ${topic}`, `${f.person.fullName()}: Memoirs of ${topic}`]);
    }
    return f.helpers.arrayElement([
      `A Short History of ${topic}`,
      `The Story of ${topic}`,
      `${topic}: A New Introduction`,
      `Understanding ${topic}`,
      `${topic} and the Modern World`,
    ]);
  }
  if (genre === Genre.CHILDREN) {
    const animal = f.animal.type();
    return f.helpers.arrayElement([`The ${adj} ${capitalize(animal)}`, `${f.person.firstName()} and the ${noun}`, `Where the ${capitalize(animal)}s Sleep`]);
  }
  if (genre === Genre.POETRY) return f.helpers.arrayElement([`${adj} Hours`, `Poems from ${f.helpers.arrayElement(PLACES)}`, `Songs of the ${noun}`]);
  return f.helpers.arrayElement([
    `The ${adj} ${noun}`,
    `The ${noun} of ${f.helpers.arrayElement(PLACES)}`,
    `${adj} ${noun}s`,
    `${article(noun)} ${noun} in ${f.helpers.arrayElement(PLACES)}`,
    `The ${adj} ${noun} of ${f.helpers.arrayElement(PLACES)}`,
    `${f.person.firstName()} and the ${adj} ${noun}`,
    `Letters to the ${noun}`,
    `The Last Days of the ${noun}`,
    `The ${noun}'s ${f.helpers.arrayElement(NOUNS)}`,
    `Beyond the ${adj} ${noun}`,
    `${f.person.firstName()}'s ${noun}`,
    `When the ${noun} Falls`,
  ]);
}

export function authorBio(f: Faker, first: string, last: string, nationality: string, genre: Genre): string {
  const genreName = genre.toLowerCase().replace('_', ' ');
  return `${first} ${last} is a ${nationality} writer of ${genreName}. ${f.helpers.arrayElement([
    'Their debut was shortlisted for several national prizes.',
    'They previously worked as a journalist and a teacher.',
    'Their novels have been translated into more than twenty languages.',
    'They live by the sea with two cats and far too many books.',
    'They studied literature before turning to writing full time.',
  ])}`;
}

export function bookDescription(f: Faker, title: string): string {
  return `${title} — ${f.helpers.arrayElement([
    'a sweeping story of family, memory and the choices that define us.',
    'a page-turner that keeps its secrets until the very last chapter.',
    'an accessible and engaging account for curious readers.',
    'a warm, funny and unexpectedly moving tale.',
    'a bold exploration of a world on the edge of change.',
  ])} ${f.lorem.sentence({ min: 8, max: 16 })}`;
}

function article(word: string) {
  return /^[AEIOU]/i.test(word) ? 'An' : 'A';
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Cover palette per genre: [background top, background bottom, accent]. */
export const GENRE_COLORS: Record<Genre, [string, string, string]> = {
  [Genre.FICTION]: ['#2f4858', '#33658a', '#f6ae2d'],
  [Genre.NON_FICTION]: ['#e9ecef', '#adb5bd', '#212529'],
  [Genre.MYSTERY]: ['#1b1b2f', '#3a3a5e', '#e43f5a'],
  [Genre.SCIENCE_FICTION]: ['#0b132b', '#1c2541', '#5bc0be'],
  [Genre.FANTASY]: ['#3c1642', '#086375', '#affc41'],
  [Genre.ROMANCE]: ['#ffb4a2', '#e5989b', '#6d6875'],
  [Genre.THRILLER]: ['#111111', '#7f0000', '#f5f5f5'],
  [Genre.BIOGRAPHY]: ['#f1e3d3', '#d6ccc2', '#3d405b'],
  [Genre.HISTORY]: ['#6b4423', '#a47148', '#f2e8cf'],
  [Genre.SCIENCE]: ['#003049', '#2a9d8f', '#e9c46a'],
  [Genre.CHILDREN]: ['#ffd166', '#06d6a0', '#118ab2'],
  [Genre.POETRY]: ['#f8f9fa', '#ced4da', '#6a4c93'],
};
