import { describe, expect, it } from "vitest";

import { DecklistError, isDecklistError } from "../errors.js";
import { err, isErr, isOk, map, ok, unwrapOr, unwrapOrThrow } from "../result.js";

describe("Result", () => {
  it("narrows with isOk / isErr", () => {
    const good = ok(42);
    const bad = err(new DecklistError("empty-input", "no lines"));

    expect(isOk(good) && good.value).toBe(42);
    expect(isErr(bad) && bad.error.message).toBe("no lines");
  });

  it("returns the fallback without throwing", () => {
    expect(unwrapOr(err(new DecklistError("empty-input", "x")), 7)).toBe(7);
  });

  it("throws the underlying error", () => {
    expect(() => unwrapOrThrow(err(new DecklistError("empty-input", "boom")))).toThrow(
      "boom",
    );
  });

  it("maps only the success branch", () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    const failure = err(new DecklistError("no-entries", "x"));
    expect(map(failure, (n) => n * 2)).toBe(failure);
  });
});

describe("DecklistError", () => {
  it("carries a literal tag and a code", () => {
    const error = new DecklistError("no-entries", "nothing parsed");

    expect(error._tag).toBe("DecklistError");
    expect(error.code).toBe("no-entries");
    expect(isDecklistError(error)).toBe(true);
  });
});
