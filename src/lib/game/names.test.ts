import assert from "node:assert/strict";
import test from "node:test";
import { blockedName, cleanName, letterCount, normalizeName } from "./names";

test("normalization folds diacritics, tatweel, alef forms, ta marbuta and spacing", () => {
  assert.equal(normalizeName("الإِدَارَة"), normalizeName("الاداره"));
  assert.equal(normalizeName("إدارة"), normalizeName("ادارہ"));
  assert.equal(normalizeName("صـــاحب  الـديوان"), normalizeName("صاحبالديوان"));
  assert.equal(normalizeName("A d M 1 n"), "admin");
  assert.equal(normalizeName("аdmin"), "admin", "Cyrillic а");
});

test("posing as staff is blocked in Arabic and English, however it is written", () => {
  for (const name of [
    "إدارة", "الإدارة", "الادارة", "ادارة اللعبة", "المشرف", "مُشْرِف", "مشـــرف الوادي", "صاحب الديوان",
    "صاحبُ الدّيوان", "ديوان القبائل", "الدعم الفني", "Admin", "ADMIN", "adm1n", "A D M I N", "Moderator",
    "support team", "Grok", "grok bot", "MZ", "mz", "M Z", "غروك", "Official", "بعد مأرب",
  ]) {
    assert.equal(blockedName(name), true, name);
  }
});

test("basic Arabic and English profanity is blocked", () => {
  for (const name of ["شرموط", "شَرْمُوطة", "شرمـوطه", "قحبة", "يا منيوك", "كس امك", "ابن الكلب", "خول", "fuck", "FUUUCK", "f u c k", "Bitch", "sh1t", "ass"]) {
    assert.equal(blockedName(name), true, name);
  }
});

test("ordinary tribe and sheikh names still pass", () => {
  for (const name of [
    "حمير", "كندة", "الأوس الجدد", "خولان", "كسرى", "همدان", "مذحج", "الأزد", "بني هلال", "عمرو بن عامر",
    "سيف", "ذو يزن", "Hamza", "Massimo", "Dev Raj Tribe", "Sassan", "Classic", "Kassab", "مشارف", "الديار",
  ]) {
    assert.equal(blockedName(name), false, name);
  }
});

test("cleanName rejects blocked names, so found() refuses them", () => {
  assert.equal(cleanName("المشرف"), null);
  assert.equal(cleanName("صـاحب الديوان"), null);
  assert.equal(cleanName("حمير"), "حمير");
});

test("the Prophet's names and titles are blocked ﷺ", () => {
  for (const name of [
    "محمد", "أحمد", "احمد", "المصطفى", "الرسول", "النبي", "رسول الله", "رسول  الله", "رسولالله", "خاتم النبيين",
    "خاتم الأنبياء", "نبي الله", "سيد المرسلين", "محمد الحربي", "ﷺ",
  ]) assert.equal(blockedName(name), true, name);
});

test("famous Companions are blocked by their full forms and unique titles", () => {
  for (const name of [
    "أبو بكر الصديق", "ابي بكر الصديق", "عمر بن الخطاب", "عمر ابن الخطاب", "عثمان بن عفان", "علي بن أبي طالب",
    "طلحة بن عبيد الله", "الزبير بن العوام", "عبد الرحمن بن عوف", "سعد بن أبي وقاص", "سعيد بن زيد",
    "أبو عبيدة بن الجراح", "بلال بن رباح", "خالد بن الوليد", "خالدبن الوليد", "حمزة بن عبد المطلب",
    "حمزة بن عبدالمطلب", "الفاروق", "ذو النورين", "سيف الله", "أسد الله",
  ]) assert.equal(blockedName(name), true, name);
});

test("the Mothers of the Believers are blocked", () => {
  for (const name of [
    "أم المؤمنين", "خديجة بنت خويلد", "عائشة بنت أبي بكر", "حفصة بنت عمر", "زينب بنت جحش", "صفية بنت حيي",
    "ميمونة بنت الحارث", "سودة بنت زمعة",
  ]) assert.equal(blockedName(name), true, name);
});

test("Allah and the Beautiful Names are blocked alone or with «ال»", () => {
  for (const name of [
    "الله", "لله", "إله", "الرحمن", "رحمن", "يا رحمن", "الرحيم", "العزيز", "القدوس", "قدوس", "القيوم", "الصمد",
    "الملك", "الكريم", "العلي", "رب العالمين",
  ]) assert.equal(blockedName(name), true, name);
});

test("compound names and ordinary first names stay allowed (Hamza and حمزة alone are fine)", () => {
  for (const name of [
    "عبدالله", "عبد الله", "عبد الرحمن", "عبدالرحمن", "عبدالعزيز", "عبد العزيز", "عبد الكريم", "نصر الله",
    "حمزة", "Hamza", "حمزة الأزدي", "خالد", "بلال", "عمر", "علي", "عثمان", "عائشة", "خديجة", "أبو بكر", "عزيز",
    "كريم", "مالك", "رشيد", "مصطفى", "محمود", "حامد", "النبيل", "سيف", "رحمة",
  ]) assert.equal(cleanName(name), name, name);
});

test("diacritics and tatweel do not get sacred names past the list", () => {
  for (const name of [
    "مُحَمَّد", "مـحـمـد", "أَحْمَد", "اللّٰه", "اللــه", "الرَّحْمٰن", "الرحـــمن", "خَالِد بْن الوَلِيد",
    "حمـزة بن عبـد المطلـب", "رَسُولُ اللَّهِ", "عـائشة بنت أبي بكر",
  ]) assert.equal(blockedName(name), true, name);
});

// ---- QA PR #3: N1 (holy places, dhikr, Latin, figures), N2 (letters), N4/S4 (look-alikes) ----

test("N1: holy places are blocked anywhere in the name, on word boundaries", () => {
  for (const name of [
    "الكعبة", "الكعبه", "سدنة الكعبة", "مكة", "مكه", "بنو مكة", "مكّة المكرمة", "الحرم", "حماة الحرم", "البيت الحرام",
    "المسجد النبوي", "الأقصى", "المسجد الأقصى", "المدينة المنورة", "القدس", "أهل القدس", "بيت المقدس", "بالكعبة",
    "للحرم", "ومكة", "الحرمين", "مـكـة", "مَكَّة",
  ]) assert.equal(blockedName(name), true, name);
});

test("N1: dhikr, shahada, takbir and basmala are blocked, also glued together or inside a longer name", () => {
  for (const name of [
    "سبحان الله", "سبحانالله", "سبحان اللّه", "الحمد لله", "الحمدلله", "لا إله إلا الله", "لااله الاالله",
    "لا اله الا الله", "الله أكبر", "اللهاكبر", "الله اكبر يا قوم", "بسم الله", "بسمالله", "أستغفر الله",
    "استغفرالله", "لا حول ولا قوة إلا بالله", "لاحول ولاقوة الا بالله", "محمد رسول الله", "ما شاء الله",
    "ماشاءالله", "إن شاء الله", "قبيلة سبحان الله", "فرسان الله أكبر", "والله", "بالله", "سـبـحـان الله",
  ]) assert.equal(blockedName(name), true, name);
});

test("N1: «الله» standing as its own word is blocked unless it closes a compound name", () => {
  for (const name of ["قبيلة الله", "جند الله", "بنو الله", "يا الله", "حزب الله", "الله"]) assert.equal(blockedName(name), true, name);
  for (const name of ["عبدالله", "عبد الله", "نصر الله", "فضل الله", "عطا الله", "جار الله", "عبيد الله", "عبد الله الأزدي"]) {
    assert.equal(cleanName(name), name, name);
  }
});

test("N1: Latin forms are blocked, case-insensitive, on word boundaries", () => {
  for (const name of [
    "Allah", "allah", "ALLAH", "Muhammad", "MUHAMMAD", "Mohammed", "mohamed", "Ahmad", "Kaaba", "Mecca", "MECCA",
    "Makkah", "Madinah", "Medina", "Prophet", "the Prophet", "Mecca Riders", "Tribe of Allah", "Allahu Akbar",
    "allahuakbar", "Subhanallah", "Bismillah", "Alhamdulillah", "Al Aqsa",
  ]) assert.equal(blockedName(name), true, name);
  for (const name of ["Abdullah", "Nasrallah", "Abd Allah", "Abdul Allah", "Hamza", "Massimo", "Prophetess Tribe"]) {
    assert.equal(blockedName(name), false, name);
  }
});

test("N1: Companions and the historical figures balance.ts names are blocked", () => {
  for (const name of [
    "كعب بن مالك", "كعب ابن مالك", "لبيد بن ربيعة", "حسان بن ثابت", "أبو سفيان", "أبو سفيان بن حرب", "كعب بن زهير",
    "عبد الله بن رواحة", "الخنساء", "أحيحة بن الجلاح", "النابغة الذبياني", "عدي بن زيد العبادي", "عدي بن زيد",
    "مالك بن فهم", "مهلهل بن ربيعة", "بنو كعب بن مالك",
  ]) assert.equal(blockedName(name), true, name);
});

test("N1: every documented poet and every «X بن Y» full name in balance.ts is blocked (collected from the code)", async () => {
  const { readFileSync } = await import("node:fs");
  const { LINEAGE, LINEAGES } = await import("./balance");
  const src = readFileSync(new URL("./balance.ts", import.meta.url), "utf8");
  const found = new Set<string>();
  for (const id of LINEAGES) if (LINEAGE[id].poetKind === "jahili") found.add(LINEAGE[id].poet);
  for (const m of src.matchAll(/[\p{L}]+ (?:بن|ابن|بنت) [\p{L}]+(?: [\p{L}]+)?/gu)) found.add(m[0]);
  assert.ok(found.size >= 3, `collected ${[...found].join("، ")}`);
  for (const name of found) assert.equal(blockedName(name), true, name);
});

test("N1: word boundaries and «لل» keep honest names allowed (no «الطيف» false positive)", () => {
  for (const name of [
    "الطيف", "بنو الطيف", "سعيد بن زيدان", "الفاروقي", "المكي", "مكين", "حرمل", "القدسي", "حسان", "كعب", "بنو كعب",
    "لبيد الشعر", "عدي", "مهلهل", "عمرو بن عامر", "المحمدي", "الأقصر", "بني هلال", "الحمدي", "عبد العزيز", "سبحة",
    "عبد الله", "ابن الليل", "أبو الشرى",
  ]) assert.equal(cleanName(name), name, name);
  assert.notEqual(normalizeName("الطيف"), normalizeName("اللطيف"));
  assert.notEqual(normalizeName("اله"), normalizeName("الله"));
  assert.equal(blockedName("اللطيف"), true);
  assert.equal(normalizeName("الللللطيف"), normalizeName("اللطيف"), "a stretched «ل» run still folds, to two");
});

test("N2: a name with fewer than 2 letters after normalization is refused", () => {
  for (const name of ["ـــــ", "ــ", "ـ ـ", "اا", "ءء", "مم", "11", "٢٠", "a a"]) assert.equal(cleanName(name), null, JSON.stringify(name));
  assert.equal(letterCount("ـــــ"), 0);
  assert.equal(cleanName("عز"), "عز");
  assert.equal(cleanName("Ra"), "Ra");
});

test("S4/N4: Persian, Urdu and dotless look-alikes and tatweel fold before matching", () => {
  assert.equal(normalizeName("ٮنو السراب"), normalizeName("بنو السراب"), "dotless beh U+066E");
  assert.equal(normalizeName("بنو السراپ"), normalizeName("بنو السراب"), "peh");
  assert.equal(normalizeName("کندة"), normalizeName("كندة"), "keheh");
  assert.equal(normalizeName("بنی هلال"), normalizeName("بني هلال"), "Farsi yeh");
  assert.equal(normalizeName("بنـــو السـراب"), normalizeName("بنو السراب"), "tatweel");
  assert.equal(normalizeName("ڤارس"), normalizeName("فارس"));
  assert.equal(normalizeName("گندة"), normalizeName("كندة"));
  for (const name of ["مکة", "ٮسم الله", "سبحان اللھ", "الکعبة", "مـکـة", "محمد رسول اللہ"]) assert.equal(blockedName(name), true, name);
});

test("#17: the map's battle caption puts «بنو» in the genitive (MapView «على بني»)", async () => {
  const { clashCaption } = await import("./names");
  assert.equal(clashCaption("قبيلة الريح", "بنو السراب"), "قبيلة الريح على بني السراب");
  assert.equal(clashCaption("بنو السراب", "أبو الشرى"), "بنو السراب على أبي الشرى");
  assert.equal(clashCaption("قبيلة الريح", "غسان"), "قبيلة الريح على غسان");
  const { readFileSync } = await import("node:fs");
  const view = readFileSync(new URL("../../components/game/MapView.tsx", import.meta.url), "utf8");
  assert.match(view, /clashCaption\(caption\.attacker, caption\.defender\)/);
  assert.doesNotMatch(view, /\{caption\.attacker\} على \{caption\.defender\}/);
});

// ---- QA N4 (MZ follow-up): «بني» = «بنو», diacritics before the symbols check, display names ----

test("N4: «بني» normalizes like «بنو», so «بني أحمد» is blocked and «بني السراب» is the same name as «بنو السراب»", () => {
  assert.equal(normalizeName("بني السراب"), normalizeName("بنو السراب"));
  assert.equal(normalizeName("بنى السراب"), normalizeName("بنو السراب"), "alef maqsura spelling");
  for (const name of ["بني أحمد", "بنو أحمد", "بني مكة", "بني الكعبة", "بني محمد"]) {
    assert.equal(blockedName(name), true, name);
    assert.equal(cleanName(name), null, name);
  }
  for (const name of ["بني هلال", "بني تميم", "بنو تميم"]) assert.equal(cleanName(name), name, name);
});

test("N4: diacritics are stripped before the symbols check: «محمّد» is a blocked name, not a symbols error", () => {
  for (const name of ["محمّد", "مُحَمَّد", "أَحْمَد", "الكَعْبَة", "سُبْحَانَ اللَّه", "اللّٰه"]) {
    assert.equal(blockedName(name.replace(/[\u064B-\u065F\u0670]/g, "")), true, name);
    assert.equal(cleanName(name), null, name);
  }
  // Honest names with tashkeel are now accepted (stored without the marks), not refused as symbols.
  assert.equal(cleanName("خالِد"), "خالد");
  assert.equal(cleanName("بنو السرابَ"), "بنو السراب");
  assert.equal(cleanName("حِمْيَر"), "حمير");
  assert.equal(cleanName("ـــَـــ"), null, "only tatweel and a mark: still under 2 letters");
  assert.equal(cleanName("بنو<السراب"), null, "real symbols are still refused");
});

test("N4: the account display name goes through the same blocklist", async () => {
  const { blockedDisplayName } = await import("./names");
  for (const name of ["محمّد", "الكعبة", "Allah", "سبحانالله", "Admin", "بني أحمد", "Mecca\u202E"]) assert.equal(blockedDisplayName(name), true, name);
  for (const name of ["شيخ", "Marwan A.", "عبدالله", "خالد بن سعيد", "", undefined]) assert.equal(blockedDisplayName(name), false, String(name));
});
