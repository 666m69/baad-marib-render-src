/**
 * Blocklist for player-chosen sheikh and tribe names: basic Arabic and English
 * profanity, and anything that poses as the game's staff.
 *
 * Both the name and the list go through `normalizeName`, so diacritics,
 * tatweel, alef/ya/ta-marbuta forms, spacing, letter stretching ("حمـــار",
 * "fuuuck"), digit tricks ("adm1n") and Cyrillic look-alikes all compare equal.
 *
 * Short words that hide inside honest names (كس in كسرى, خول in خولان, mz in
 * Hamza) only match as a whole word; longer ones match anywhere.
 */

const ARABIC_MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const LATIN_MARKS = /[\u0300-\u036f]/g;
const FOLD: Record<string, string> = {
  أ: "ا", إ: "ا", آ: "ا", ٱ: "ا", ى: "ي", ئ: "ي", ی: "ي", ؤ: "و", ة: "ه", ہ: "ه", ک: "ك", ء: "",
  // Cyrillic look-alikes
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", к: "k", м: "m", т: "t", і: "i", ѕ: "s",
  // digit tricks
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s",
};

/** One word, folded: no marks, unified letter forms, lowercase, runs collapsed. */
function foldWord(word: string) {
  const plain = word.normalize("NFKD").replace(LATIN_MARKS, "").replace(ARABIC_MARKS, "").toLowerCase();
  let out = "";
  for (const ch of plain) {
    const c = FOLD[ch] ?? ch;
    if (c && !out.endsWith(c)) out += c;
  }
  return out;
}

/** The words of a name, folded. */
export function nameWords(raw: string) {
  return raw
    .replace(ARABIC_MARKS, "")
    .split(/[\s\u200B-\u200F_.-]+/)
    .map(foldWord)
    .filter(Boolean);
}

/** The whole name folded, with every space removed. */
export function normalizeName(raw: string) {
  return foldWord(nameWords(raw).join(""));
}

/** Banned anywhere in the name (long enough not to hide inside honest names). */
const ANYWHERE = [
  // posing as staff
  "إدارة", "الإدارة", "اداره اللعبه", "مشرف", "المشرفين", "مدير", "صاحب الديوان", "ديوان", "الدعم الفني",
  "خدمة العملاء", "بعد مأرب", "غروك", "جروك",
  "admin", "administrator", "moderator", "support", "staff", "official", "system", "grok", "mzexecutive",
  "gamemaster", "baadmarib", "owner",
  // Arabic profanity
  "شرموط", "عاهر", "قحبه", "منيوك", "متناك", "معرص", "زانيه", "لوطي", "ابن الكلب", "ابن الحرام", "كس امك",
  "نيك امك", "يلعن",
  // English profanity
  "fuck", "shit", "bitch", "cunt", "whore", "slut", "nigger", "nigga", "asshole", "bastard", "pussy", "porn",
  "motherf",
];

/** Banned only as a whole word. */
const WHOLE_WORD = [
  "mz", "mod", "gm", "كس", "زب", "طيز", "نيك", "خول", "عرص", "زاني", "fag", "dick", "sex", "rape", "ass",
];

const anywhere = ANYWHERE.map(normalizeName);
const wholeWord = new Set(WHOLE_WORD.map(normalizeName));

/** True when the name is profane or poses as staff. */
export function blockedName(raw: string) {
  const joined = normalizeName(raw);
  if (anywhere.some((term) => joined.includes(term))) return true;
  return nameWords(raw).some((word) => wholeWord.has(word)) || wholeWord.has(joined);
}

/** Trimmed, 2-18 letters/digits/spaces, and not blocked; null otherwise. */
export function cleanName(raw: string) {
  const name = raw.replace(/[\u200B-\u200F\u202A-\u202E]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 18) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(name)) return null;
  if (blockedName(name)) return null;
  return name;
}

/**
 * A tribe name after a preposition (على، أمام، من، مع…): the leading
 * «بنو / أبو / ذو» takes the genitive, so «نصر على بني السراب», not «على بنو».
 */
export function genitive(name: string) {
  return name.replace(/^(بنو|أبو|ذو)(?=\s)/, (w) => ({ بنو: "بني", أبو: "أبي", ذو: "ذي" })[w] ?? w);
}
