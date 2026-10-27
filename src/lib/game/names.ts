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

const SACRED_WORD: Record<string, string> = { ابن: "بن", ابي: "ابو", ابا: "ابو" };
/** Folded and joined like normalizeName, but ابن/بن and أبو/أبي/أبا compare equal. */
function sacredForm(raw: string) {
  return foldWord(nameWords(raw).map((w) => SACRED_WORD[w] ?? w).join(""));
}

const anywhere = ANYWHERE.map(normalizeName);
const wholeWord = new Set([...WHOLE_WORD, ...PROPHET_WORDS].map(normalizeName));
const sacred = SACRED.map(sacredForm);
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

/** True when the name is profane, poses as staff, or uses a sacred name. */
export function blockedName(raw: string) {
  const joined = normalizeName(raw);
  if (anywhere.some((term) => joined.includes(term))) return true;
  const holy = sacredForm(raw);
  if (sacred.some((term) => holy.includes(term)) || divineName(raw)) return true;
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
