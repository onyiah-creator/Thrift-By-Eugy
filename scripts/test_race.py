"""
Proves the reservation logic actually resolves the one-of-one race.

Simulates concurrent shoppers hitting the same SKU, using the exact
conditional UPDATE from the Worker. If the logic is wrong, more than one
shopper wins and we'd charge twice for one garment.
"""
import sqlite3, threading, queue, time, sys

import os
SCHEMA = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'worker', 'schema.sql')).read()

# The exact claim statement from worker-checkout.js
CLAIM = """
UPDATE products
   SET reserved_by = ?, reserved_until = ?, updated_at = datetime('now')
 WHERE sku = ?
   AND status = 'active'
   AND quantity > 0
   AND (reserved_until IS NULL
        OR reserved_until < datetime('now')
        OR reserved_by = ?)
"""

# The naive version, for contrast
NAIVE_READ = "SELECT quantity FROM products WHERE sku = ?"
NAIVE_WRITE = "UPDATE products SET reserved_by = ? WHERE sku = ?"

def setup(path):
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    con.commit(); con.close()

def run(path, n_shoppers, mode):
    results = queue.Queue()
    barrier = threading.Barrier(n_shoppers)

    def shopper(i):
        con = sqlite3.connect(path, timeout=10)
        con.execute("PRAGMA busy_timeout=10000")
        sid = f"session-{i}"
        barrier.wait()   # all start at once
        try:
            if mode == 'atomic':
                cur = con.execute(CLAIM, (sid, '2099-01-01T00:00:00Z', 'TBE-0001', sid))
                con.commit()
                results.put((sid, cur.rowcount == 1))
            else:
                q = con.execute(NAIVE_READ, ('TBE-0001',)).fetchone()[0]
                time.sleep(0.002)          # the window every race needs
                if q > 0:
                    con.execute(NAIVE_WRITE, (sid, 'TBE-0001'))
                    con.commit()
                    results.put((sid, True))
                else:
                    results.put((sid, False))
        except Exception as e:
            results.put((sid, f"ERR {e}"))
        finally:
            con.close()

    threads = [threading.Thread(target=shopper, args=(i,)) for i in range(n_shoppers)]
    for t in threads: t.start()
    for t in threads: t.join()

    out = []
    while not results.empty(): out.append(results.get())
    return out

import os
for mode in ['naive', 'atomic']:
    p = f'/tmp/race_{mode}.db'
    if os.path.exists(p): os.remove(p)
    setup(p)
    res = run(p, 8, mode)
    winners = [s for s,w in res if w is True]
    errs = [r for r in res if isinstance(r[1], str)]
    print(f"{mode.upper():7} 8 concurrent shoppers, 1 item -> {len(winners)} winner(s)"
          + (f", {len(errs)} errors" if errs else ""))
    if mode == 'atomic':
        ok = len(winners) == 1
        print(f"        {'PASS' if ok else 'FAIL'}: exactly one shopper may claim the item")
        sys.exit(0 if ok else 1)
