import { strict as assert } from "node:assert";
import { chooseServingKeys, diffServingSet } from "./serving-set";

assert.deepEqual(
  diffServingSet(new Set(["movie:1", "tv:2"]), new Set(["movie:1", "movie:3"])),
  { retained: 1, toPublish: ["tv:2"], toRemove: ["movie:3"] },
);
assert.deepEqual(
  [...chooseServingKeys(["movie:3"], ["movie:1", "movie:2", "movie:3"], 2)],
  ["movie:3", "movie:1"],
);
assert.throws(() => chooseServingKeys(["movie:1", "movie:2"], [], 1), /required works exceed/);
console.log("serving-set selfcheck passed");
