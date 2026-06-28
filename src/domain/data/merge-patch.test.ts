import { describe, expect, it } from "vitest";
import { jsonMergePatch, mergePatchBlob } from "./merge-patch";
import { InvalidBlob } from "./errors";

// RFC 7396 — JSON Merge Patch. The pure transform over parsed JSON values.
describe("jsonMergePatch (RFC 7396)", () => {
  it("adds and overwrites top-level members", () => {
    expect(jsonMergePatch({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({
      a: 1,
      b: 3,
      c: 4,
    });
  });

  it("deletes a member when the patch value is null", () => {
    expect(jsonMergePatch({ a: 1, b: 2 }, { b: null })).toEqual({ a: 1 });
  });

  it("merges nested objects recursively", () => {
    expect(
      jsonMergePatch({ a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } }),
    ).toEqual({ a: { x: 1, y: 3, z: 4 } });
  });

  it("deletes a nested member with null", () => {
    expect(jsonMergePatch({ a: { x: 1, y: 2 } }, { a: { x: null } })).toEqual({
      a: { y: 2 },
    });
  });

  it("replaces (does not merge) array values", () => {
    expect(jsonMergePatch({ a: [1, 2, 3] }, { a: [4] })).toEqual({ a: [4] });
  });

  it("replaces a scalar with an object and vice versa", () => {
    expect(jsonMergePatch({ a: 1 }, { a: { b: 2 } })).toEqual({ a: { b: 2 } });
    expect(jsonMergePatch({ a: { b: 2 } }, { a: 1 })).toEqual({ a: 1 });
  });

  it("creates nested objects under a previously-absent key", () => {
    expect(jsonMergePatch({}, { a: { b: 1 } })).toEqual({ a: { b: 1 } });
  });

  it("does not mutate the target argument", () => {
    const target = { a: 1, nested: { keep: true } };
    jsonMergePatch(target, { a: 2, nested: { added: 1 } });
    expect(target).toEqual({ a: 1, nested: { keep: true } });
  });
});

// Blob-level orchestration: parse, enforce object-ness (the one place the store
// looks inside the blob), apply, re-serialize. Bounds are checked by the caller.
describe("mergePatchBlob (S17)", () => {
  it("merges a patch into the current blob", () => {
    expect(mergePatchBlob('{"a":1,"b":2}', '{"b":3,"c":4}')).toBe(
      '{"a":1,"b":3,"c":4}',
    );
  });

  it("treats an absent (null) current blob as {}", () => {
    expect(mergePatchBlob(null, '{"a":1}')).toBe('{"a":1}');
  });

  it("rejects a non-JSON patch body", () => {
    expect(() => mergePatchBlob("{}", "{not json")).toThrow(InvalidBlob);
    expect(() => mergePatchBlob("{}", "")).toThrow(InvalidBlob);
  });

  it("rejects a patch that is not a JSON object", () => {
    expect(() => mergePatchBlob("{}", "[1,2,3]")).toThrow(InvalidBlob);
    expect(() => mergePatchBlob("{}", "42")).toThrow(InvalidBlob);
    expect(() => mergePatchBlob("{}", "null")).toThrow(InvalidBlob);
  });

  it("rejects merging into a non-object current blob", () => {
    expect(() => mergePatchBlob("[1,2,3]", '{"a":1}')).toThrow(InvalidBlob);
    expect(() => mergePatchBlob('"str"', '{"a":1}')).toThrow(InvalidBlob);
  });
});
