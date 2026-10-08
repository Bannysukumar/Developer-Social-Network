import { expect, test } from "bun:test";
import { TYPING_IDLE_MS, typingCommand } from "../src/extension/typing-debounce";

test("rapid keystrokes emit one typing start", () => {
  let typingOn = false;
  const emitted: boolean[] = [];
  for (const text of ["H", "He", "Hel", "Hell", "Hello"]) {
    const decision = typingCommand(typingOn, text);
    typingOn = decision.typingOn;
    expect(decision.armIdle).toBe(true);
    if (decision.active !== null) emitted.push(decision.active);
  }
  expect(emitted).toEqual([true]);
  expect(TYPING_IDLE_MS).toBe(2500);
});

test("clearing the box emits one stop", () => {
  const decision = typingCommand(true, "   ");
  expect(decision).toEqual({ typingOn: false, active: false, armIdle: false });
});
