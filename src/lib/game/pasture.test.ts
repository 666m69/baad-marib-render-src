import assert from "node:assert/strict";
import test from "node:test";
import { chainLimit, claimSteps, evaluatePastures, type PastureAnchor, type PastureClaim } from "./pasture.ts";

const anchor = (userId: string, cavalry = 4, renown = 0): PastureAnchor => ({
  userId,
  x: 0,
  y: 0,
  cavalry,
  renown,
});

test("chain limit follows riders then renown", () => {
  assert.equal(chainLimit(0, 0), 1);
  assert.equal(chainLimit(4, 0), 2);
  assert.equal(chainLimit(0, 8), 3);
  assert.equal(chainLimit(4, 8), 4);
});

test("production, cap, dispute, and intruder", () => {
  const claims: PastureClaim[] = [
    { userId: "a", x: 1, y: 0, at: 1 },
    { userId: "a", x: 2, y: 0, at: 2 },
    { userId: "a", x: 3, y: 0, at: 3 },
  ];
  const open = evaluatePastures([anchor("a")], claims, []);
  const byX = new Map(open.map((state) => [state.x, state]));
  assert.equal(byX.get(3)?.reason, "cap");
  assert.equal(byX.get(3)?.yield, 0);
  assert.equal((byX.get(1)?.yield ?? 0) + (byX.get(2)?.yield ?? 0) > 0, true);

  const disputed = evaluatePastures(
    [anchor("a"), { userId: "b", x: 9, y: 9, cavalry: 4, renown: 0 }],
    [...claims, { userId: "b", x: 2, y: 0, at: 4 }],
    [],
  );
  const well = disputed.find((state) => state.userId === "a" && state.x === 2);
  const tail = disputed.find((state) => state.userId === "a" && state.x === 3);
  assert.equal(well?.reason, "dispute");
  assert.equal(well?.yield, 0);
  assert.equal(tail?.reason, "cut");
  assert.equal(tail?.bridge, false);

  const raided = evaluatePastures([anchor("a", 12, 0)], claims, [{ x: 1, y: 0, userId: "" }]);
  const hit = raided.find((state) => state.x === 1);
  const beyond = raided.find((state) => state.x === 2);
  assert.equal(hit?.reason, "intruder");
  assert.equal(beyond?.connected, true);
  assert.notEqual(beyond?.reason, "cut");
});

test("claim steps stop at a broken bridge", () => {
  assert.equal(claimSteps({ x: 0, y: 0 }, [{ x: 1, y: 0 }], { x: 2, y: 0 }), 2);
  assert.equal(claimSteps({ x: 0, y: 0 }, [], { x: 2, y: 0 }), null);
  assert.equal(claimSteps({ x: 0, y: 0 }, [{ x: 1, y: 0 }], { x: 0, y: 1 }), 1);
});
