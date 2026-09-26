import test from "node:test";
import assert from "node:assert/strict";
import * as timePicker from "../scripts/time-picker.js";

test("blank time stays unscheduled until period, hour, and minute are chosen", () => {
  assert.equal(typeof timePicker.selectTimePart, "function");
  const period = timePicker.selectTimePart("", null, "period", "AM");
  assert.equal(period.value, "");
  const hour = timePicker.selectTimePart("", period.draft, "hour", "12");
  assert.equal(hour.value, "");
  const minute = timePicker.selectTimePart("", hour.draft, "minute", "05");
  assert.equal(minute.value, "00:05");
  assert.equal(minute.draft, null);
});

test("noon, midnight, and saved off-step minutes convert without rounding", () => {
  assert.equal(timePicker.timeFromParts({ period: "PM", hour: "12", minute: "55" }), "12:55");
  assert.equal(timePicker.formatTime12("12:55"), "12:55 PM");
  assert.equal(timePicker.formatTime12("00:05"), "12:05 AM");
  assert.equal(timePicker.formatTime12("08:07"), "08:07 AM");
  assert.equal(timePicker.selectTimePart("08:07", null, "period", "PM").value, "20:07");
  assert.equal(timePicker.selectTimePart("08:07", null, "minute", "10").value, "08:10");
  assert.equal(timePicker.timeFromParts({ period: "AM", hour: "", minute: "10" }), "");
});

test("partial selections remain drafts and commit once the time is complete", () => {
  assert.equal(typeof timePicker.applyTimeChoice, "function");
  const drafts = new Map();
  const commits = [];
  const choose = (part, choice) => timePicker.applyTimeChoice({
    key: "meal:one:time", value: "", part, choice, drafts,
    commit: (value) => commits.push(value),
  });
  choose("period", "PM");
  choose("hour", "01");
  assert.deepEqual(commits, []);
  assert.deepEqual(drafts.get("meal:one:time"), { period: "PM", hour: "01", minute: "" });
  choose("minute", "05");
  assert.deepEqual(commits, ["13:05"]);
  assert.equal(drafts.has("meal:one:time"), false);
});
