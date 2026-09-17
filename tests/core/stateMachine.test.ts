import { expect, it } from "vitest";
import { transition } from "../../src/core/stateMachine";

it("allows a pending item to enter opening", () => {
  expect(transition("pending", "opening")).toBe("opening");
});
