import assert from "node:assert/strict";
import test from "node:test";
import { blockedName, cleanName, normalizeName } from "./names";

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
