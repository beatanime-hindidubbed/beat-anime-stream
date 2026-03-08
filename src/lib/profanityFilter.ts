// Profanity filter for English and Hindi bad words
// Replaces detected words with *****

const EN_WORDS = [
  "fuck","shit","ass","bitch","damn","dick","pussy","cock","cunt","bastard",
  "whore","slut","nigger","nigga","faggot","retard","motherfucker","asshole",
  "bullshit","piss","crap","douche","wanker","twat","bollocks","arsehole",
  "jackass","dipshit","shithead","dumbass","fuckoff","stfu","wtf","lmfao",
];

const HI_WORDS = [
  "madarchod","bhenchod","chutiya","gandu","bhosdike","randi","harami",
  "lauda","lund","gaand","chut","behenchod","mc","bc","bkl","bsdk",
  "sala","saala","kamina","kameena","chodu","tatti","jhant","haram",
  "kutta","kutti","haramkhor","gadha","ullu","bevda","bewda","suar",
  "maderchod","bhosdi","laudu","jhaatu","chinal","raand",
];

const ALL_WORDS = [...EN_WORDS, ...HI_WORDS];

// Build regex pattern
const pattern = new RegExp(
  ALL_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi'
);

export function filterProfanity(text: string): string {
  return text.replace(pattern, (match) => '*'.repeat(match.length));
}

export function containsProfanity(text: string): boolean {
  return pattern.test(text);
}

// Block personal info patterns (phone numbers, emails)
const PERSONAL_INFO = /(\b\d{10,}\b)|(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b)/g;

export function filterPersonalInfo(text: string): string {
  return text.replace(PERSONAL_INFO, '[blocked]');
}

export function sanitizeMessage(text: string): string {
  let clean = filterProfanity(text);
  clean = filterPersonalInfo(clean);
  return clean;
}
