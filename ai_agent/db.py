import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
from .config import DATABASE_URL

# Threaded connection pool for thread-safe concurrent execution
_db_pool = None

def get_pool():
    global _db_pool
    if _db_pool is None:
        _db_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=10,
            dsn=DATABASE_URL
        )
    return _db_pool

@contextmanager
def get_db_cursor(commit=False):
    """
    Context manager that yields a cursor and safely returns the connection to the pool.
    Explicitly handles commit and rollback to prevent transaction locks on remote pooler.
    """
    p = get_pool()
    conn = p.getconn()
    try:
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
        else:
            conn.rollback()  # Cleans up any read locks on transaction pooler
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        p.putconn(conn)
