// One step change at a time, the newest wins (module/tours/tour-queue.mjs; 2026-11-21: a tour's overlay outlived the tour).
// Run: node tests/tour-queue.test.mjs
import { serialQueue } from "../module/tours/tour-queue.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// quick calls one after another: never side by side; the waiting ones a newer call overtook are skipped
{
  const q = serialQueue(), log = [];
  let inside = 0, most = 0, staleSeen = [];
  const step = (i, ms) => q.run(async () => {
    inside++; most = Math.max(most, inside); log.push(`start ${i}`);
    await sleep(ms);
    staleSeen.push([i, q.current]);
    inside--; log.push(`end ${i}`);
    return i;
  });
  const a = step(1, 40);
  await sleep(5); // call 1 has started; 2 and 3 come while it runs
  ok(q.busy, "busy while call 1 runs");
  const b = step(2, 10), c = step(3, 10);
  const res = await Promise.all([a, b, c]);
  ok(most === 1, `one at a time (most ${most})`);
  ok(JSON.stringify(log) === JSON.stringify(["start 1", "end 1", "start 3", "end 3"]), `call 2 skipped: ${log}`);
  ok(res[0] === 1 && res[1] === undefined && res[2] === 3, `results ${res}`);
  ok(staleSeen[0][1] === false, "call 1 knew it was overtaken (should not draw)");
  ok(staleSeen[1][1] === true, "call 3 is current");
  ok(!q.busy, "not busy after");
  ok(q.current, "still current after the last call");
}

// calls made in one go: only the last runs
{
  const q = serialQueue(), log = [];
  await Promise.all([1, 2, 3].map((i) => q.run(async () => log.push(i))));
  ok(JSON.stringify(log) === "[3]", `only the newest: ${log}`);
}

// cancel (the tour left): the running call turns stale, the waiting ones never run
{
  const q = serialQueue(), log = [];
  let wasCurrent = null;
  const a = q.run(async () => { await sleep(30); wasCurrent = q.current; log.push("a"); });
  await sleep(5);
  ok(q.busy, "busy while a runs");
  const b = q.run(async () => { log.push("b"); });
  q.cancel();
  await Promise.all([a, b]);
  await q.settled();
  ok(wasCurrent === false, "a stale after cancel");
  ok(JSON.stringify(log) === '["a"]', `b skipped: ${log}`);
  ok(!q.current, "nothing current after cancel");
  // a new start after the cancel runs and is current
  let fresh = null;
  await q.run(async () => { fresh = q.current; });
  ok(fresh === true, "a new call after cancel is current");
}

// a failing call doesn't stop the next one
{
  const q = serialQueue();
  const a = q.run(async () => { throw new Error("boom"); });
  const b = q.run(async () => "after");
  let threw = false;
  try { await a; } catch { threw = true; }
  // a was overtaken by b before it started: skipped, no throw
  ok(!threw, "an overtaken call is skipped, not run");
  ok((await b) === "after", "next call runs");
  const c = q.run(async () => { throw new Error("boom"); });
  let err = null;
  try { await c; } catch (e) { err = e; }
  ok(err?.message === "boom", "the running call's error reaches its caller");
  ok((await q.run(async () => 7)) === 7, "the queue goes on after an error");
}

console.log(`tour-queue: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
