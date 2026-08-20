import assert from "node:assert/strict";
import { test } from "node:test";

import { extractCompanyName, extractRequirementItems, joinHebrewItems } from "./setup-extract";
import { extractPersonName } from "./setup-parse";

test("חשבונית ואישור פיקוח splits into two items", () => {
  const items = extractRequirementItems("חשבונית ואישור פיקוח");
  assert.equal(items.length, 2);
  assert.equal(items[0]?.label.includes("חשבונית"), true);
  assert.equal(items[1]?.label.includes("אישור"), true);
  assert.equal(items[1]?.kind, "ambiguous");
});

test("סיכום עבודה, חשבונית וחמש תמונות splits into three items", () => {
  const items = extractRequirementItems("סיכום עבודה, חשבונית וחמש תמונות");
  assert.equal(items.length, 3);
  assert.equal(items[0]?.kind, "text");
  assert.equal(items[1]?.kind, "file");
  assert.equal(items[2]?.kind, "file");
  assert.equal(items[2]?.filePreset, "images");
});

test("painting sentence keeps both documents and the company", () => {
  const text = "איסוף חשבוניות ואישור פיקוח על ביצוע הצביעה בקומה 4 במגדל גשם מחברת דוד קידוחים בע״מ.";
  const items = extractRequirementItems(text);
  assert.equal(items.length, 2);
  assert.match(items[0]?.label ?? "", /חשבונ/);
  assert.match(items[1]?.label ?? "", /אישור פיקוח/);
  assert.equal(extractCompanyName(text), "דוד קידוחים בע״מ");
});

test("PDF ואקסל stay one file field", () => {
  const items = extractRequirementItems("PDF ואקסל");
  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, "file");
});

test("the hours-report sentence keeps two items and דוד עמר", () => {
  const text = "קבלת דוח שעות עובדים בצירוף אישור של מנהל האתר מדוד עמר קבלן גבס";
  const items = extractRequirementItems(text);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.label, "דוח שעות עובדים");
  assert.equal(items[1]?.label, "אישור מנהל האתר");
  assert.equal(extractPersonName(text), "דוד עמר");
  assert.equal(
    items.some((item) => /אימייל|מייל|יום|שעה/.test(item.label)),
    false,
  );
});

test("gaash metals sentence keeps company, three files, and monthly", () => {
  const text = "קבלת חשבוניות + קבלות + אישור ניכוי מס במקור של חברת געש מתכות בעמ באופן חודשי";
  const items = extractRequirementItems(text);
  assert.equal(items.length, 3);
  assert.equal(items[0]?.label, "חשבוניות");
  assert.equal(items[1]?.label, "קבלות");
  assert.equal(items[2]?.label, "אישור ניכוי מס במקור");
  assert.equal(items.every((item) => item.kind === "file"), true);
  assert.equal(extractCompanyName(text), "געש מתכות בע״מ");
  assert.equal(extractPersonName(text), null);
});

test("nissim nekassim sentence keeps company, bank statements, and monthly cadence", () => {
  const text = 'קבלת חשבוניות + קבלות + תדפיסי בנק כל חודש מחברת ניסים נכסים בע"מ';
  const items = extractRequirementItems(text);
  assert.equal(items.length, 3);
  assert.equal(items[0]?.label, "חשבוניות");
  assert.equal(items[1]?.label, "קבלות");
  assert.equal(items[2]?.label, "תדפיסי בנק");
  assert.equal(items.every((item) => item.kind === "file"), true);
  assert.equal(extractCompanyName(text), "ניסים נכסים בע״מ");
});

test("assistant item join lists every extracted label", () => {
  const joined = joinHebrewItems(["חשבונית", "אישור פיקוח על ביצוע הצביעה"]);
  assert.equal(joined.includes("חשבונית"), true);
  assert.equal(joined.includes("אישור פיקוח"), true);
});

test("gaash industries peels mem and keeps an ambiguous worker report", () => {
  const text = "קבלת דוח עובדים, חשבוניות קבלות ותדפיס בנק באופן חודשי מגעש תעשיות מתכת";
  const items = extractRequirementItems(text);
  assert.deepEqual(
    items.map((item) => item.label),
    ["דוח עובדים", "חשבוניות", "קבלות", "תדפיס בנק"],
  );
  assert.equal(items[0]?.kind, "ambiguous");
  assert.equal(items.slice(1).every((item) => item.kind === "file"), true);
  assert.equal(extractCompanyName(text), "געש תעשיות מתכת");
  assert.equal(extractPersonName(text), null);
});

test("hours report inspector and tax invoices split without swallowing the company", () => {
  const text = "קבלת דוח שעות עובדים ואישור מפקח האתר וחשבוניות מס מגעש תעשיות מתכת";
  assert.deepEqual(
    extractRequirementItems(text).map((item) => item.label),
    ["דוח שעות עובדים", "אישור מפקח האתר", "חשבוניות מס"],
  );
  assert.equal(extractCompanyName(text), "געש תעשיות מתכת");
});

test("invoices and receipts from a company stay two items", () => {
  const text = "קבלת חשבוניות וקבלות מחברת געש";
  assert.deepEqual(
    extractRequirementItems(text).map((item) => item.label),
    ["חשבוניות", "קבלות"],
  );
  assert.equal(extractCompanyName(text), "געש");
});

test("hours report manager approval and invoices from nissim construction stay three items", () => {
  const text = "איסוף דוח שעות עובדים, אישור מנהל וחשבוניות מס מניסים בנייה";
  assert.deepEqual(
    extractRequirementItems(text).map((item) => item.label),
    ["דוח שעות עובדים", "אישור מנהל", "חשבוניות מס"],
  );
  assert.equal(extractCompanyName(text), "ניסים בנייה");
});

test("david and sons company is not split into extra items", () => {
  const text = "קבלת אישור ניהול ספרים ואישור ניכוי מס במקור מחברת דוד ובניו";
  assert.deepEqual(
    extractRequirementItems(text).map((item) => item.label),
    ["אישור ניהול ספרים", "אישור ניכוי מס במקור"],
  );
  assert.equal(extractCompanyName(text), "דוד ובניו");
});

test("explicit contact is kept and company mem-names are not peeled after מחברת", () => {
  assert.equal(extractPersonName("מגעש תעשיות, איש הקשר דוד כהן"), "דוד כהן");
  assert.equal(extractPersonName("לשלוח לדוד כהן מגעש תעשיות"), "דוד כהן");
  assert.equal(extractPersonName("מחברת געש תעשיות מתכת"), null);
  assert.equal(extractPersonName("של חברת ניסים נכסים בע״מ"), null);
  assert.equal(extractCompanyName("מחברת מטריקס"), "מטריקס");
  assert.equal(extractCompanyName("ממגדל חברה לביטוח"), "מגדל חברה לביטוח");
  assert.equal(extractCompanyName("מחברת מנורה מבטחים"), "מנורה מבטחים");
});
