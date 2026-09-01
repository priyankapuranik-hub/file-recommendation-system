const assert = require("node:assert/strict");
const test = require("node:test");
const { recommend } = require("../server");

test("returns matching files ordered by score", () => {
  const results = recommend("docker deployment", 5);
  assert.ok(results.length > 0);
  assert.equal(results[0].filename, "deployment.txt");
  assert.ok(results[0].similarity_score > 0);
});

test("limits recommendations to twenty files", () => {
  assert.ok(recommend("ci", 100).length <= 20);
});
