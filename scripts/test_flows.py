import sqlite3, os, sys
import os
SCHEMA = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'worker', 'schema.sql')).read()
p='/tmp/flows.db'
if os.path.exists(p): os.remove(p)
con=sqlite3.connect(p); con.executescript(SCHEMA); con.commit()

CLAIM = """UPDATE products SET reserved_by=?, reserved_until=? WHERE sku=?
 AND status='active' AND quantity>0
 AND (reserved_until IS NULL OR reserved_until<datetime('now') OR reserved_by=?)"""

passed=failed=0
def check(label, cond, extra=''):
    global passed, failed
    if cond: passed+=1; print('  PASS', label)
    else: failed+=1; print('  FAIL', label, extra)

# 1. expired reservation can be reclaimed
con.execute(CLAIM, ('old','2000-01-01T00:00:00Z','TBE-0001','old')); con.commit()
c=con.execute(CLAIM, ('new','2099-01-01T00:00:00Z','TBE-0001','new')); con.commit()
check('expired reservation is reclaimable', c.rowcount==1)

# 2. same session re-reserving is idempotent (shopper refreshes checkout)
c=con.execute(CLAIM, ('new','2099-01-01T00:00:00Z','TBE-0001','new')); con.commit()
check('same session can re-reserve its own item', c.rowcount==1)

# 3. a different session is blocked while live
c=con.execute(CLAIM, ('other','2099-01-01T00:00:00Z','TBE-0001','other')); con.commit()
check('live reservation blocks another shopper', c.rowcount==0)

# 4. sold item cannot be reserved
con.execute("UPDATE products SET quantity=0,status='sold',reserved_by=NULL,reserved_until=NULL WHERE sku='TBE-0002'"); con.commit()
c=con.execute(CLAIM, ('x','2099-01-01T00:00:00Z','TBE-0002','x')); con.commit()
check('sold item cannot be reserved', c.rowcount==0)

# 5. draft item cannot be reserved
con.execute("INSERT INTO products (sku,name,category,price,quantity,status) VALUES ('TBE-9999','Draft','Tops',100,1,'draft')"); con.commit()
c=con.execute(CLAIM, ('x','2099-01-01T00:00:00Z','TBE-9999','x')); con.commit()
check('draft item cannot be reserved', c.rowcount==0)

# 6. release only clears your own reservation
con.execute("UPDATE products SET reserved_by='alice',reserved_until='2099-01-01T00:00:00Z' WHERE sku='TBE-0001'"); con.commit()
c=con.execute("UPDATE products SET reserved_by=NULL,reserved_until=NULL WHERE sku=? AND reserved_by=?", ('TBE-0001','mallory')); con.commit()
check('cannot release another shopper\'s reservation', c.rowcount==0)
c=con.execute("UPDATE products SET reserved_by=NULL,reserved_until=NULL WHERE sku=? AND reserved_by=?", ('TBE-0001','alice')); con.commit()
check('owner can release own reservation', c.rowcount==1)

# 7. webhook idempotency via PK
con.execute("INSERT INTO webhook_events (id,event,reference) VALUES ('charge.success:123','charge.success','TBE-ORD-1')"); con.commit()
dup=False
try:
    con.execute("INSERT INTO webhook_events (id,event,reference) VALUES ('charge.success:123','charge.success','TBE-ORD-1')"); con.commit()
except sqlite3.IntegrityError:
    dup=True
check('duplicate webhook is rejected by PK', dup)

# 8. sweep frees expired but not live
con.execute("UPDATE products SET reserved_by='a',reserved_until='2000-01-01T00:00:00Z' WHERE sku='TBE-0001'")
con.execute("INSERT OR IGNORE INTO products (sku,name,category,price,quantity,status,reserved_by,reserved_until) VALUES ('TBE-0003','Live','Tops',500,1,'active','b','2099-01-01T00:00:00Z')")
con.commit()
c=con.execute("UPDATE products SET reserved_by=NULL,reserved_until=NULL WHERE reserved_until IS NOT NULL AND reserved_until<datetime('now') AND quantity>0"); con.commit()
still=con.execute("SELECT reserved_by FROM products WHERE sku='TBE-0003'").fetchone()[0]
check('sweep frees expired only', c.rowcount==1 and still=='b', f'freed={c.rowcount} live={still}')

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
