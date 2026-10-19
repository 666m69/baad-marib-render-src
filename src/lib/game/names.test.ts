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
