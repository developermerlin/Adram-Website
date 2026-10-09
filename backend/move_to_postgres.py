"""
Copy everything in db.sqlite3 into PostgreSQL, check that nothing was lost, then switch the site over.

Run from the backend folder:

    env\\Scripts\\python.exe move_to_postgres.py

It asks for the password of the "postgres" account (the one chosen when PostgreSQL was installed) and then:
  1. creates a database user and database for the site (adram_user / adram_db) with a new random password
     (the user may create databases, which Django's tests need for their temporary test database),
  2. builds every table in PostgreSQL (manage.py migrate),
  3. copies all the data across (dumpdata / loaddata), keeping every id the same,
  4. resets the id counters so new rows don't clash with copied ones,
  5. compares the row count of every table in SQLite and PostgreSQL,
  6. only if every table matches: points backend/.env at PostgreSQL.

db.sqlite3 itself is never changed or deleted. If the new database already has data in it, the script stops
(pass --replace to empty it and copy again).

Stop the Django server first (the script checks port 8000), so nothing new is added while the data is copied.

Options: --host localhost --port 5432 --db adram_db --user adram_user --replace --no-switch --server-port 8000
The postgres password can also come from the PGSU_PASSWORD environment variable.
"""
import argparse
import getpass
import os
import re
import secrets
import socket
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

import psycopg2
from psycopg2 import sql

HERE = Path(__file__).resolve().parent
ENV_FILE = HERE / '.env'
SQLITE_FILE = HERE / 'db.sqlite3'
# Django rebuilds these itself during migrate, so they aren't copied (other rows refer to them by name, not id).
REBUILT = {'django_content_type', 'auth_permission'}


# dumpdata, except that times keep their microseconds: Django's JSON format normally rounds them to milliseconds
# (and the XML format, which doesn't, trims spaces and line breaks off the ends of text).
EXACT_DUMP = """
import datetime, os
from django.core.management import call_command
from django.core.serializers.json import DjangoJSONEncoder
plain = DjangoJSONEncoder.default
def exact(self, o):
    if isinstance(o, (datetime.datetime, datetime.time)):
        r = o.isoformat()
        return r[:-6] + 'Z' if r.endswith('+00:00') else r
    return plain(self, o)
DjangoJSONEncoder.default = exact
call_command('dumpdata', natural_foreign=True, exclude=['contenttypes', 'auth.permission'], output=os.environ['DUMP_PATH'])
"""


def manage(args, env, capture=False):
    result = subprocess.run([sys.executable, 'manage.py', *args], cwd=HERE, env=env, text=True, encoding='utf-8',
                            capture_output=capture)
    if result.returncode:
        if capture:
            print(result.stdout, result.stderr)
        sys.exit(f'manage.py {args[0]} failed - nothing was switched over; the site still uses db.sqlite3.')
    return result.stdout


def sqlite_counts(labels):
    con = sqlite3.connect(SQLITE_FILE)
    tables = [r[0] for r in con.execute(
        "select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
    counts = {t: con.execute(f'select count(*) from "{t}"').fetchone()[0] for t in tables}
    # migration records of apps that are no longer installed (e.g. the old django-jet admin theme) aren't copied
    marks = ','.join('?' * len(labels))
    counts['django_migrations'] = con.execute(f'select count(*) from django_migrations where app in ({marks})', labels).fetchone()[0]
    con.close()
    return counts


def pg_counts(conn):
    with conn.cursor() as cur:
        cur.execute("select tablename from pg_tables where schemaname = 'public'")
        tables = [r[0] for r in cur.fetchall()]
        counts = {}
        for t in tables:
            cur.execute(sql.SQL('select count(*) from {}').format(sql.Identifier(t)))
            counts[t] = cur.fetchone()[0]
    return counts


def switch_env(opts, password):
    values = {
        'DB_ENGINE': 'django.db.backends.postgresql', 'DB_NAME': opts.db, 'DB_USER': opts.user,
        'DB_PASSWORD': password, 'DB_HOST': opts.host, 'DB_PORT': str(opts.port),
    }
    lines = ENV_FILE.read_text(encoding='utf-8').splitlines()
    # drop the old (active or commented-out) database lines, then write the new block where the first one was
    keep, at = [], None
    for line in lines:
        if re.match(r'^\s*#?\s*DB_(ENGINE|NAME|USER|PASSWORD|HOST|PORT)\s*=', line):
            at = len(keep) if at is None else at
            continue
        keep.append(line)
    block = [f'{k}={v}' for k, v in values.items()] + [
        '# The old SQLite database (db.sqlite3) is kept as it was before the move. To go back to it:',
        '# DB_ENGINE=django.db.backends.sqlite3',
        '# DB_NAME=db.sqlite3',
    ]
    at = len(keep) if at is None else at
    ENV_FILE.write_text('\n'.join(keep[:at] + block + keep[at:]) + '\n', encoding='utf-8')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--host', default='localhost')
    p.add_argument('--port', type=int, default=5432)
    p.add_argument('--db', default='adram_db')
    p.add_argument('--user', default='adram_user')
    p.add_argument('--superuser', default='postgres')
    p.add_argument('--replace', action='store_true', help='empty the PostgreSQL database first if it already has data')
    p.add_argument('--no-switch', action='store_true', help="copy and check, but leave .env pointing at SQLite")
    p.add_argument('--server-port', type=int, default=8000, help='where the Django server runs (it must be stopped)')
    opts = p.parse_args()

    # a running site keeps adding rows (logins, chats, page views), which would then miss the copy
    with socket.socket() as probe:
        probe.settimeout(0.5)
        if probe.connect_ex(('127.0.0.1', opts.server_port)) == 0:
            sys.exit(f'The Django server is still running on port {opts.server_port}. Stop it (Ctrl+C in its window), '
                     'then run this again, so nothing new is written to db.sqlite3 while it is copied.')

    if not SQLITE_FILE.exists():
        sys.exit(f'{SQLITE_FILE} not found.')
    su_password = os.environ.get('PGSU_PASSWORD') or getpass.getpass(f'Password for the PostgreSQL "{opts.superuser}" account: ')

    # 1. the site's own database user and database
    try:
        admin = psycopg2.connect(host=opts.host, port=opts.port, user=opts.superuser, password=su_password, dbname='postgres')
    except psycopg2.OperationalError as e:
        sys.exit(f'Could not sign in to PostgreSQL: {e}'.strip())
    admin.autocommit = True
    site_password = secrets.token_urlsafe(24)
    with admin.cursor() as cur:
        cur.execute('select 1 from pg_roles where rolname = %s', [opts.user])
        if cur.fetchone():
            cur.execute(sql.SQL('alter role {} with login createdb password %s').format(sql.Identifier(opts.user)), [site_password])
        else:
            cur.execute(sql.SQL('create role {} with login createdb password %s').format(sql.Identifier(opts.user)), [site_password])
        cur.execute('select 1 from pg_database where datname = %s', [opts.db])
        exists = cur.fetchone()
        if not exists:
            cur.execute(sql.SQL("create database {} owner {} encoding 'UTF8' template template0").format(
                sql.Identifier(opts.db), sql.Identifier(opts.user)))
    admin.close()
    print(f'1. Database "{opts.db}" and user "{opts.user}" are ready.')

    site = dict(host=opts.host, port=opts.port, user=opts.user, password=site_password, dbname=opts.db)
    conn = psycopg2.connect(**site)
    conn.autocommit = True
    if exists and pg_counts(conn):
        if not opts.replace:
            sys.exit(f'"{opts.db}" already has tables in it. Nothing was changed. Run again with --replace to empty it and copy again.')
        with conn.cursor() as cur:
            cur.execute('drop schema public cascade; create schema public')
        print('   (emptied the existing PostgreSQL database first)')

    base = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'}   # Windows would otherwise trip over characters like →
    sqlite_env = {**base, 'DB_ENGINE': 'django.db.backends.sqlite3', 'DB_NAME': 'db.sqlite3'}
    pg_env = {**base, 'DB_ENGINE': 'django.db.backends.postgresql', 'DB_NAME': opts.db, 'DB_USER': opts.user,
              'DB_PASSWORD': site_password, 'DB_HOST': opts.host, 'DB_PORT': str(opts.port)}

    # 2. tables
    manage(['migrate', '--noinput', '-v', '0'], pg_env)
    print('2. Built all tables in PostgreSQL.')

    # 3. data, read from SQLite (which is only read, never changed)
    out = manage(['shell', '-c', 'from django.apps import apps; print("LABELS:", *(a.label for a in apps.get_app_configs()))'],
                 pg_env, capture=True)
    labels = next(line for line in out.splitlines() if line.startswith('LABELS:')).split()[1:]
    before = sqlite_counts(labels)
    with tempfile.TemporaryDirectory() as tmp:
        dump = Path(tmp) / 'all-data.json'
        manage(['shell', '-c', EXACT_DUMP], {**sqlite_env, 'DUMP_PATH': str(dump)}, capture=True)
        with conn.cursor() as cur:   # migrate adds a few starter rows; the copy brings the real ones
            cur.execute("select tablename from pg_tables where schemaname = 'public'")
            tables = [r[0] for r in cur.fetchall() if r[0] not in REBUILT and r[0] != 'django_migrations']
            if tables:
                cur.execute(sql.SQL('truncate {} cascade').format(sql.SQL(', ').join(map(sql.Identifier, tables))))
        manage(['loaddata', str(dump), '-v', '0'], pg_env)
    print(f'3. Copied the data ({sum(before.values()):,} rows in SQLite).')

    # 4. id counters
    reset = manage(['sqlsequencereset', *labels], pg_env, capture=True)
    with conn.cursor() as cur:
        cur.execute(reset)
    print('4. Reset the id counters.')

    # 5. compare every table
    after = pg_counts(conn)
    conn.close()
    missing, wrong, leftovers = [], [], []
    for table, n in sorted(before.items()):
        if table not in after and n == 0:
            leftovers.append(table)   # an empty table of an app that is no longer installed
        elif table not in after:
            missing.append(table)
        elif table not in REBUILT and after[table] != n:
            wrong.append((table, n, after[table]))
    copied = sum(n for t, n in before.items() if t not in REBUILT)
    print(f'5. Checked {len(before)} tables: {copied:,} rows in SQLite, '
          f'{sum(n for t, n in after.items() if t not in REBUILT):,} in PostgreSQL.')
    if missing or wrong:
        for t in missing:
            print(f'   missing in PostgreSQL: {t}')
        for t, a, b in wrong:
            print(f'   {t}: {a} rows in SQLite, {b} in PostgreSQL')
        sys.exit('The copy does not match, so the site was NOT switched over. It still uses db.sqlite3.')
    print('   Every table matches.')
    if leftovers:
        print(f'   (skipped {len(leftovers)} empty tables of apps no longer installed: {", ".join(leftovers)})')

    # 6. switch over
    if opts.no_switch:
        print(f'6. Left .env on SQLite (--no-switch). The PostgreSQL password for "{opts.user}" is: {site_password}')
        return
    switch_env(opts, site_password)
    print('6. backend/.env now points at PostgreSQL. Restart the Django server to use it.')


if __name__ == '__main__':
    main()
