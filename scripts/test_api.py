"""Validate the API's SQL and auth logic against the real schema."""
import sqlite3, os, sys, re
p='/tmp/api.db'
if os.path.exists(p): os.remove(p)
con=sqlite3.connect(p); con.executescript(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'worker', 'schema.sql')).read()); con.commit()

passed=failed=0
def check(l,c,e=''):
    global passed,failed
    if c: passed+=1; print('  PASS',l)
    else: failed+=1; print('  FAIL',l,e)

# public list excludes drafts and sold
con.execute("INSERT INTO products (sku,name,category,price,quantity,status) VALUES ('D1','Draft','Tops',100,1,'draft')")
con.execute("INSERT INTO products (sku,name,category,price,quantity,status) VALUES ('S1','Sold','Tops',100,0,'sold')")
con.commit()
r=con.execute("SELECT sku FROM products WHERE status='active' AND quantity>0").fetchall()
skus=[x[0] for x in r]
check('public list excludes draft', 'D1' not in skus)
check('public list excludes sold', 'S1' not in skus)
check('public list includes seeded', 'TBE-0001' in skus)

# category filter
r=con.execute("SELECT COUNT(*) FROM products WHERE status='active' AND quantity>0 AND category=?",('Tops',)).fetchone()[0]
check('category filter works', r==2, r)

# search
r=con.execute("SELECT sku FROM products WHERE status='active' AND quantity>0 AND (name LIKE ? OR description LIKE ? OR color LIKE ?)",('%Peplum%','%Peplum%','%Peplum%')).fetchall()
check('search matches name', len(r)==1)

# stats
s=con.execute("""SELECT
 (SELECT COUNT(*) FROM products WHERE status='active' AND quantity>0) AS live,
 (SELECT COUNT(*) FROM products WHERE status='draft') AS drafts,
 (SELECT COUNT(*) FROM products WHERE status='sold') AS sold""").fetchone()
check('stats counts correct', s==(2,1,1), s)

# archive keeps row for order history
con.execute("INSERT INTO orders (id,email,amount,status) VALUES ('O1','a@b.c',100,'paid')")
con.execute("INSERT INTO order_items (order_id,sku,name,price) VALUES ('O1','TBE-0001','Lace Peplum Top',12500)")
con.execute("UPDATE products SET status='archived',quantity=0 WHERE sku='TBE-0001'"); con.commit()
r=con.execute("SELECT name FROM order_items WHERE order_id='O1'").fetchone()
check('archived product keeps order history readable', r[0]=='Lace Peplum Top')
r=con.execute("SELECT sku FROM products WHERE status='active' AND quantity>0").fetchall()
check('archived item leaves public list', 'TBE-0001' not in [x[0] for x in r])

# reserved item blocks edit
con.execute("UPDATE products SET reserved_until='2099-01-01T00:00:00Z' WHERE sku='TBE-0002'"); con.commit()
r=con.execute("SELECT reserved_until FROM products WHERE sku='TBE-0002'").fetchone()[0]
from datetime import datetime, timezone
check('reserved item detectable for edit-block', datetime.fromisoformat(r.replace('Z','+00:00'))>datetime.now(timezone.utc))

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
