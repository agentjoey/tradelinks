import { describe, it, expect } from "vitest";
import { extractJson } from "../src/ai/json.js";

describe("extractJson", () => {
  it("parses a clean JSON object", () => {
    expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores prose before and after the object", () => {
    expect(extractJson('Sure! Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it("recovers from trailing garbage braces (Gemini Flex quirk)", () => {
    // model emitted valid JSON then spammed extra closing braces
    expect(extractJson('{"title":"x","tags":["a","b"]}\n}\n}\n}\n}')).toEqual({ title: "x", tags: ["a", "b"] });
  });

  it("does not stop at a brace inside a string value", () => {
    expect(extractJson('{"body":"a } b { c","n":2}')).toEqual({ body: "a } b { c", n: 2 });
  });

  it("handles escaped quotes inside strings", () => {
    expect(extractJson('{"q":"she said \\"hi\\" }"}')).toEqual({ q: 'she said "hi" }' });
  });

  it("extracts the first array value", () => {
    expect(extractJson('[{"a":1},{"a":2}] trailing')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("repairs raw newlines inside string values (LLM quirk)", () => {
    // a literal newline inside the "body" string — invalid JSON, but recoverable
    expect(extractJson('{"body":"line one\nline two","n":1}')).toEqual({ body: "line one\nline two", n: 1 });
  });

  it("repairs raw tabs inside string values", () => {
    expect(extractJson('{"x":"a\tb"}')).toEqual({ x: "a\tb" });
  });
});
