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
 *
 * Sacred names (MZ Executive decision; content rules forbid depicting the
 * Prophet ﷺ or the Companions as characters):
 *  - The Prophet ﷺ: his names محمد and أحمد are blocked as a whole word even
 *    alone (they ARE his name); his titles (المصطفى, الرسول, النبي as whole
 *    words; رسول الله, خاتم النبيين... anywhere) and the ﷺ ligature too.
 *  - Companions and the Mothers of the Believers: only full forms that clearly
 *    denote the person ("خالد بن الوليد", "حمزة بن عبد المطلب", "عائشة بنت أبي
 *    بكر") and their unique titles (الفاروق, ذو النورين, سيف الله, أسد الله,
 *    أم المؤمنين). A first name alone (خالد, بلال, حمزة, Hamza, عائشة, علي,
 *    عمر, أبو بكر) is an ordinary name and stays allowed. ابن/بن and أبو/أبي/أبا
 *    compare equal.
 *  - Allah and the Beautiful Names: blocked when they ARE the whole name,
 *    optionally after «يا». Names only God bears (الله, الرحمن/رحمن, القيوم,
 *    القدوس, الصمد...) are blocked with or without «ال»; names people also
 *    carry (علي, كريم, عزيز, مالك, رشيد...) only in the «ال» form (العزيز), so
 *    a player called عزيز is not blocked. Compounds (عبدالله, عبد الرحمن,
 *    عبدالعزيز, نصر الله) never equal the whole name, so they stay allowed.
 *  - «الله» / «لله» standing as their own word anywhere in the name ("قبيلة الله",
 *    "جند الله") are blocked too, unless the word before is a compound head
 *    (عبد الله, نصر الله, فضل الله...). Same for Latin "Allah" (Abd Allah passes).
 *
 * Phrases (QA N1, MZ pre-deploy): holy places (مكة, الكعبة, الحرم, المسجد
 * النبوي, الأقصى, القدس...), dhikr / shahada / takbir / basmala, Latin forms
 * (Allah, Muhammad, Kaaba, Mecca, Madinah, Prophet...), the Companions above,
 * and the historical figures the game itself names in balance.ts (its poets,
 * كعب بن مالك, لبيد بن ربيعة...). They match on WORD BOUNDARIES anywhere in the
 * name, never inside a longer word, so «سعيد بن زيدان» is not «سعيد بن زيد» and
 * «الفاروقي» is not «الفاروق». Spaces inside a phrase are optional
 * ("سبحانالله", "الحمدلله", "اللهاكبر"), and a leading و/ف/ب/ك/ل proclitic is
 * allowed ("بالكعبة", "للحرم", "والله").
 *
 * Normalization never merges a doubled «لل» into «ل», so «الطيف» stays apart
 * from «اللطيف» (and «اله» from «الله»). Arabic look-alikes from Persian/Urdu
 * and dotless letters (ٮ, پ, ک, ی, ڤ, گ, ں, ھ, ے...) fold to the Arabic letter
 * before any comparison.
 */

import { LINEAGE, LINEAGES } from "./balance";

/** Documented (jahili) poets the game ships in LINEAGE: players may not take their names. */
const JAHILI_POETS = LINEAGES.map((id) => LINEAGE[id]).filter((l) => l.poetKind === "jahili").map((l) => l.poet);

const ARABIC_MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const LATIN_MARKS = /[\u0300-\u036f]/g;
const FOLD: Record<string, string> = {
  أ: "ا", إ: "ا", آ: "ا", ٱ: "ا", ى: "ي", ئ: "ي", ی: "ي", ؤ: "و", ة: "ه", ہ: "ه", ک: "ك", ء: "",
  // Persian/Urdu letters and dotless forms that pass for Arabic ones (QA N4)
  ٮ: "ب", پ: "ب", ڀ: "ب", ٹ: "ت", ٺ: "ت", ٿ: "ت", ڤ: "ف", ڡ: "ف", ٯ: "ق", ڨ: "ق", چ: "ج", ڃ: "ج", ژ: "ز", ڑ: "ر",
  ڈ: "د", گ: "ك", ڪ: "ك", ں: "ن", ڻ: "ن", ھ: "ه", ۀ: "ه", ە: "ه", ۃ: "ه", ے: "ي", ۓ: "ي", ې: "ي", ێ: "ي", ۍ: "ي",
  // Cyrillic look-alikes
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", к: "k", м: "m", т: "t", і: "i", ѕ: "s",
  // digit tricks
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s",
};

/**
 * One word, folded: no marks, unified letter forms, lowercase, runs collapsed
 * ("حمـــار", "fuuuck"). A run of «ل» collapses to two, never one: «لل» is a
 * real letter pair (اللطيف, الله, للحرم) and must not fold into «ل» (الطيف).
 */
function foldWord(word: string) {
  const plain = word.normalize("NFKD").replace(LATIN_MARKS, "").replace(ARABIC_MARKS, "").toLowerCase();
  let out = "";
  for (const ch of plain) {
    const c = FOLD[ch] ?? ch;
    if (!c) continue;
    if (c === "ل" ? out.endsWith("لل") : out.endsWith(c)) continue;
    out += c;
  }
  return out;
}

/** The words of a name, folded. */
export function nameWords(raw: string) {
  return raw
    .normalize("NFKD") // ﷺ and other ligatures become their words first
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

/** The Prophet ﷺ: his names and titles, as a whole word. */
const PROPHET_WORDS = ["محمد", "أحمد", "المصطفى", "الرسول", "النبي"];

/** Sacred full names and titles, matched anywhere (after ابن→بن, أبي→أبو). */
const SACRED = [
  // the Prophet ﷺ
  "رسول الله", "نبي الله", "حبيب الله", "خاتم النبيين", "خاتم الأنبياء", "سيد المرسلين", "صلى الله عليه وسلم",
  "عليه الصلاة والسلام",
  // the ten promised Paradise
  "أبو بكر الصديق", "عمر بن الخطاب", "عثمان بن عفان", "علي بن أبي طالب", "طلحة بن عبيد الله", "الزبير بن العوام",
  "عبد الرحمن بن عوف", "سعد بن أبي وقاص", "سعيد بن زيد", "أبو عبيدة بن الجراح", "أبو عبيدة عامر بن الجراح",
  // other well-known Companions
  "بلال بن رباح", "خالد بن الوليد", "حمزة بن عبد المطلب", "جعفر بن أبي طالب", "عمار بن ياسر", "معاذ بن جبل",
  "سلمان الفارسي", "أبو ذر الغفاري", "أبو هريرة", "مصعب بن عمير", "زيد بن حارثة", "أسامة بن زيد",
  "عبد الله بن مسعود", "عبد الله بن عباس", "عبد الله بن عمر", "أنس بن مالك", "أبي بن كعب", "سعد بن معاذ",
  "أبو أيوب الأنصاري", "حسان بن ثابت", "عمرو بن العاص", "معاوية بن أبي سفيان", "الحسن بن علي", "الحسين بن علي",
  "فاطمة الزهراء",
  // unique titles
  "الفاروق", "ذو النورين", "سيف الله", "أسد الله", "سيد الشهداء", "أمين الأمة",
  // the Mothers of the Believers
  "أم المؤمنين", "أمهات المؤمنين", "خديجة بنت خويلد", "سودة بنت زمعة", "عائشة بنت أبي بكر", "حفصة بنت عمر",
  "زينب بنت خزيمة", "هند بنت أبي أمية", "زينب بنت جحش", "جويرية بنت الحارث", "رملة بنت أبي سفيان",
  "صفية بنت حيي", "ميمونة بنت الحارث", "مارية القبطية",
];

/** Beautiful Names only God bears: blocked as the whole name, with or without «ال». */
const DIVINE_ONLY = [
  "الله", "لله", "إله", "رحمن", "قدوس", "مهيمن", "قيوم", "صمد", "خالق", "بارئ", "متكبر", "مصور", "جبار", "أحد",
  "رب العالمين", "ذو الجلال والإكرام", "مالك الملك",
];
/** Beautiful Names people also carry: blocked as the whole name only in the «ال» form. */
const DIVINE_AL = [
  "رحيم", "ملك", "سلام", "مؤمن", "عزيز", "غفار", "قهار", "وهاب", "رزاق", "فتاح", "عليم", "قابض", "باسط",
  "خافض", "رافع", "معز", "مذل", "سميع", "بصير", "حكم", "عدل", "لطيف", "خبير", "حليم", "عظيم", "غفور", "شكور",
  "علي", "كبير", "حفيظ", "مقيت", "حسيب", "جليل", "كريم", "رقيب", "مجيب", "واسع", "حكيم", "ودود", "مجيد",
  "باعث", "شهيد", "حق", "وكيل", "قوي", "متين", "ولي", "حميد", "محصي", "مبدئ", "معيد", "محيي", "مميت", "حي",
  "واجد", "ماجد", "واحد", "قادر", "مقتدر", "مقدم", "مؤخر", "أول", "آخر", "ظاهر", "باطن", "والي", "متعالي",
  "بر", "تواب", "منتقم", "عفو", "رؤوف", "مقسط", "جامع", "غني", "مغني", "مانع", "ضار", "نافع", "نور", "هادي",
  "بديع", "باقي", "وارث", "رشيد", "صبور",
];

/**
 * Holy places (QA N1). Mecca is never a target, so no tribe on the map may
 * carry its name either.
 */
const HOLY_PLACES = [
  "الكعبة", "الكعبة المشرفة", "كعبة", "مكة", "بكة", "الحرم", "الحرمين", "الحرمان", "البيت الحرام", "المسجد الحرام",
  "المسجد النبوي", "الحرم النبوي", "الأقصى", "المسجد الأقصى", "المدينة المنورة", "طيبة الطيبة", "القدس",
  "بيت المقدس", "قبة الصخرة", "الروضة الشريفة", "غار حراء", "جبل عرفات",
];

/** Dhikr, the shahada, takbir and basmala (QA N1). Spaces inside are optional. */
const DHIKR = [
  "سبحان الله", "سبحان ربي", "سبحانه وتعالى", "الحمد لله", "لا إله إلا الله", "لا إله إلا", "أشهد أن لا إله",
  "الله أكبر", "الله اكبر", "بسم الله", "أستغفر الله", "استغفر الله", "لا حول ولا قوة إلا بالله", "لا حول ولا قوة",
  "محمد رسول الله", "ما شاء الله", "إن شاء الله", "تبارك الله", "حسبي الله", "حسبنا الله", "جل جلاله", "عز وجل",
  "لا إله غيره", "سبحانك اللهم", "اللهم",
  // «لله» and the oath forms of «الله» are never part of an honest name
  "لله", "بالله", "والله", "تالله", "فالله",
];

/** Latin spellings (QA N1). Lower-cased and folded like the rest. */
const LATIN = [
  "muhammad", "mohammed", "mohammad", "muhammed", "mohamed", "mohamad", "ahmad", "ahmed", "prophet",
  "rasul allah", "rasulullah", "rasool allah", "rasoolullah", "kaaba", "kaabah", "kabah", "mecca", "makkah",
  "makka", "mekka", "mekkah", "madinah", "madina", "medina", "medinah", "al aqsa", "aqsa", "al quds",
  "subhan allah", "alhamdulillah", "alhamdulilah", "al hamdu lillah", "allahu akbar", "allah akbar", "bismillah",
  "bism allah", "astaghfirullah", "la ilaha illallah", "la ilaha illa allah", "mashallah", "masha allah",
  "inshallah", "insha allah", "in sha allah", "wallah", "wallahi", "billah", "lillah",
  "habib allah", "habibullah",
];

/**
 * Companions and historical figures the game itself names, collected from
 * balance.ts (its poets, now and in earlier versions: حسان بن ثابت and كعب بن
 * مالك were lineage poets, «لبيد» a sheikh name), from content.test.ts, and from
 * QA N1. JAHILI_POETS below adds every documented poet LINEAGE ships, so a
 * poet added later is covered without editing this list.
 */
const FIGURES = [
  // Companions
  "حسان بن ثابت", "كعب بن مالك", "لبيد بن ربيعة", "كعب بن زهير", "عبد الله بن رواحة", "الخنساء", "النابغة الجعدي",
  "العباس بن مرداس", "أبو سفيان بن حرب", "أبو سفيان",
  // pre-Islamic figures named by the game (LINEAGE poets, sheikh name origin)
  "أحيحة بن الجلاح", "النابغة الذبياني", "عدي بن زيد", "عدي بن زيد العبادي", "مالك بن فهم", "مهلهل بن ربيعة",
  "المهلهل بن ربيعة", "الزير سالم",
];

/** «الله» as its own word passes only after one of these (عبد الله, نصر الله...). */
const ALLAH_HEADS = [
  "عبد", "عبيد", "نصر", "فضل", "عطا", "عطاء", "جار", "خير", "ضيف", "فتح", "حمد", "سعد", "عوض", "رزق", "حسب", "هبة",
  "نعمة", "جاب", "مال", "حرز", "جود", "فرج", "عون", "جاد", "شكر",
  "abd", "abdul", "abdel", "abdal", "nasr", "nasir", "fadl", "fazl", "ata", "khair", "khayr", "saad", "fath",
];

const SACRED_WORD: Record<string, string> = { ابن: "بن", ابي: "ابو", ابا: "ابو" };

/** The words of a name folded for sacred matching: ابن/بن and أبو/أبي/أبا compare equal. */
function sacredWords(raw: string) {
  return nameWords(raw).map((w) => SACRED_WORD[w] ?? w);
}

/** Leading proclitics a phrase may carry: وبالكعبة، للحرم، فمكة. */
const PROCLITICS = ["", "و", "ف", "ب", "ك", "ل", "وب", "ول", "فب", "فل", "وك"];

/** Every spelling of `phrase` that counts: words glued, optional proclitic, ال after ل written «لل». */
function phraseForms(phrase: string) {
  const glued = foldWord(sacredWords(phrase).join(""));
  const forms = new Set<string>();
  for (const p of PROCLITICS) {
    forms.add(foldWord(p + glued));
    if (p.endsWith("ل") && glued.startsWith("ال")) forms.add(foldWord(p + glued.slice(1)));
  }
  return forms;
}

const anywhere = ANYWHERE.map(normalizeName);
const wholeWord = new Set([...WHOLE_WORD, ...PROPHET_WORDS].map(normalizeName));
const phrases = new Set<string>();
for (const phrase of [
  ...PROPHET_WORDS, ...SACRED, ...HOLY_PLACES, ...DHIKR, ...LATIN, ...FIGURES, ...JAHILI_POETS,
]) {
  for (const form of phraseForms(phrase)) phrases.add(form);
}
const allahWords = new Set(["الله", "allah"].map((w) => foldWord(w)));
const allahHeads = new Set(ALLAH_HEADS.map((w) => foldWord(w)));
const divine = new Set([
  ...DIVINE_ONLY.flatMap((n) => [n, `ال${n}`]),
  ...DIVINE_AL.map((n) => `ال${n}`),
].map(normalizeName));

/** True when the whole name, with an optional leading «يا», is one of the Beautiful Names. */
function divineName(raw: string) {
  const words = nameWords(raw);
  const rest = words[0] === normalizeName("يا") ? words.slice(1) : words;
  return divine.has(normalizeName(words.join(" "))) || divine.has(foldWord(rest.join("")));
}

/**
 * True when some run of whole words in the name, glued together, spells one of
 * the protected phrases. Word boundaries hold at both ends of the run, so a
 * phrase never matches inside a longer word.
 */
function hasPhrase(words: string[]) {
  for (let i = 0; i < words.length; i++) {
    let run = "";
    for (let j = i; j < words.length; j++) {
      run = foldWord(run + words[j]);
      if (phrases.has(run)) return true;
    }
  }
  return false;
}

/** «الله» / "Allah" as its own word, not as the second half of a compound name. */
function looseAllah(words: string[]) {
  return words.some((w, i) => allahWords.has(w) && !(i > 0 && allahHeads.has(words[i - 1]!)));
}

/** True when the name is profane, poses as staff, or uses a sacred name. */
export function blockedName(raw: string) {
  const joined = normalizeName(raw);
  if (anywhere.some((term) => joined.includes(term))) return true;
  const words = sacredWords(raw);
  if (hasPhrase(words) || looseAllah(words) || divineName(raw)) return true;
  return nameWords(raw).some((word) => wholeWord.has(word)) || wholeWord.has(joined);
}

/** Letters left once the name is normalized (QA N2: «ـــــ» normalizes to nothing). */
export function letterCount(raw: string) {
  return [...normalizeName(raw)].filter((ch) => /\p{L}/u.test(ch)).length;
}

/** Trimmed, 2-18 letters/digits/spaces, at least 2 letters once normalized, and not blocked; null otherwise. */
export function cleanName(raw: string) {
  const name = raw.replace(/[\u200B-\u200F\u202A-\u202E]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 18) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(name)) return null;
  if (letterCount(name) < 2) return null;
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

/** The battle caption on the map: «قبيلة الريح على بني السراب», never «على بنو» (QA #17, MapView). */
export function clashCaption(attacker: string, defender: string) {
  return `${attacker} على ${genitive(defender)}`;
}
