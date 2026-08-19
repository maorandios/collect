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

test("assistant item join lists every extracted label", () => {
  const joined = joinHebrewItems(["חשבונית", "אישור פיקוח על ביצוע הצביעה"]);
  assert.equal(joined.includes("חשבונית"), true);
  assert.equal(joined.includes("אישור פיקוח"), true);
});
