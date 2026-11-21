/**
 * One step change at a time, the newest wins (2026-11-21: quick `progress(i)` calls ran side by side; each drew its own
 * highlight and overlay, Foundry kept a reference to the last one only, and the others stayed in the page after `exit()`,
 * blocking every click).
 *
 *   const q = serialQueue();
 *   q.run(() => work())   runs after the call before it has wholly finished; a call that a newer one or `cancel()`
 *                         overtook while it waited is skipped (resolves undefined)
 *   q.current             false while the running call is stale: a newer call is waiting, or `cancel()` came — it should
 *                         not draw anything any more
 *   q.busy                a call is running
 *   q.cancel()            the waiting calls are skipped, the running one becomes stale
 *   q.settled()           resolves once the calls made so far are done
 */
export function serialQueue() {
  let chain = Promise.resolve();
  let gen = 0, running = 0, busy = false;
  return {
    get busy() { return busy; },
    get current() { return running === gen; },
    cancel() { gen++; },
    settled() { return chain; },
    run(fn) {
      const my = ++gen;
      const p = chain.then(async () => {
        if (my !== gen) return undefined;
        running = my;
        busy = true;
        try { return await fn(); } finally { busy = false; }
      });
      chain = p.catch(() => {});
      return p;
    },
  };
}
