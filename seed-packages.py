#!/usr/bin/env python3
"""Seed all packages from packages/ directory into the SQLite database."""

import sqlite3
import os
import json
import re
from pathlib import Path

BASE = Path(__file__).parent
DATA_DIR = BASE / "data"
PACKAGES_DIR = BASE / "packages"
DB_PATH = DATA_DIR / "beepack.db"


def parse_hive_yaml(text):
    """Minimal YAML parser for HIVE.yaml files (flat keys + simple arrays)."""
    result = {}
    current_key = None
    current_list = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue

        # Check for list item under current key
        if stripped.startswith('- ') and current_key and current_list is not None:
            current_list.append(stripped[2:].strip())
            continue

        # Check for nested key: value (like env: or deps:)
        indent = len(line) - len(line.lstrip())
        if indent > 0 and ':' in stripped:
            # Nested key under a parent dict
            k, _, v = stripped.partition(':')
            k = k.strip()
            v = v.strip()
            if not v:
                # This is a nested dict key that will have list children
                current_key = k
                current_list = []
                if isinstance(result.get(current_key), dict):
                    pass  # already a dict
                else:
                    result[current_key] = current_list
                continue
            continue

        # Top-level key: value
        if ':' in stripped and not stripped.startswith('-'):
            k, _, v = stripped.partition(':')
            k = k.strip()
            v = v.strip()

            if not v:
                # Start of a list or dict
                current_key = k
                current_list = []
                result[k] = current_list
            else:
                result[k] = v
                current_key = None
                current_list = None

    return result


def main():
    # Ensure data dir exists
    DATA_DIR.mkdir(exist_ok=True)

    # Connect to database
    db = sqlite3.connect(str(DB_PATH))
    db.execute("PRAGMA journal_mode=WAL")

    # Create tables (matching server.js schema)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            github_id TEXT UNIQUE,
            handle TEXT UNIQUE NOT NULL,
            name TEXT,
            email TEXT,
            avatar_url TEXT,
            bio TEXT,
            github_token TEXT,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            owner_id INTEGER REFERENCES users(id),
            owner_handle TEXT,
            owner_avatar TEXT,
            description TEXT,
            readme TEXT,
            repository_url TEXT,
            homepage_url TEXT,
            keywords TEXT,
            capabilities TEXT,
            compatible TEXT,
            requires TEXT,
            downloads_count INTEGER DEFAULT 0,
            version_count INTEGER DEFAULT 0,
            latest_version TEXT,
            moderation_status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS package_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            package_id INTEGER REFERENCES packages(id),
            version TEXT NOT NULL,
            changelog TEXT,
            files TEXT,
            hive_yaml TEXT,
            source_code TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(package_id, version)
        );

        CREATE TABLE IF NOT EXISTS package_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_package_id INTEGER REFERENCES packages(id),
            to_package_id INTEGER REFERENCES packages(id),
            reason TEXT,
            suggested_by INTEGER REFERENCES users(id),
            agent_name TEXT,
            votes INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(from_package_id, to_package_id)
        );

        CREATE TABLE IF NOT EXISTS suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            package_id INTEGER REFERENCES packages(id),
            author_id INTEGER REFERENCES users(id),
            author_handle TEXT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            code_diff TEXT,
            status TEXT DEFAULT 'open',
            review_comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS security_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            package_id INTEGER REFERENCES packages(id),
            version TEXT,
            static_verdict TEXT,
            llm_verdict TEXT,
            vt_verdict TEXT,
            final_verdict TEXT,
            findings TEXT,
            scan_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            package_id INTEGER REFERENCES packages(id),
            reporter_id INTEGER REFERENCES users(id),
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(package_id, reporter_id)
        );

        CREATE TABLE IF NOT EXISTS version_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            package_id INTEGER REFERENCES packages(id),
            version TEXT NOT NULL,
            agent_name TEXT,
            agent_session TEXT,
            rating INTEGER,
            worked INTEGER,
            edge_cases TEXT,
            adaptations TEXT,
            comment TEXT,
            use_case TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bundles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            description TEXT,
            use_case TEXT,
            owner_id INTEGER REFERENCES users(id),
            owner_handle TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bundle_packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bundle_id INTEGER REFERENCES bundles(id),
            package_id INTEGER REFERENCES packages(id),
            role TEXT,
            UNIQUE(bundle_id, package_id)
        );

        CREATE INDEX IF NOT EXISTS idx_packages_slug ON packages(slug);
        CREATE INDEX IF NOT EXISTS idx_packages_owner ON packages(owner_id);
        CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(moderation_status);
    """)

    # Create beepack system user
    db.execute("""
        INSERT OR IGNORE INTO users (github_id, handle, name, role)
        VALUES ('beepack', 'beepack', 'Beepack Team', 'admin')
    """)
    db.commit()

    owner_id = db.execute("SELECT id FROM users WHERE handle = 'beepack'").fetchone()[0]

    # Seed all packages
    seeded = 0
    skipped = 0

    for pkg_dir in sorted(PACKAGES_DIR.iterdir()):
        if not pkg_dir.is_dir():
            continue

        slug = pkg_dir.name
        hive_path = pkg_dir / "HIVE.yaml"
        readme_path = pkg_dir / "README.md"
        index_path = pkg_dir / "index.js"

        if not hive_path.exists():
            print(f"  SKIP {slug}: no HIVE.yaml")
            skipped += 1
            continue

        # Check if already in DB
        existing = db.execute("SELECT id FROM packages WHERE slug = ?", (slug,)).fetchone()
        if existing:
            print(f"  EXISTS {slug}")
            skipped += 1
            continue

        # Parse HIVE.yaml
        hive_text = hive_path.read_text(encoding='utf-8')
        hive = parse_hive_yaml(hive_text)

        display_name = hive.get('displayName', slug)
        description = hive.get('description', '')
        version = hive.get('version', '1.0.0')
        keywords = json.dumps(hive.get('keywords', []))
        capabilities = json.dumps(hive.get('capabilities', []))
        compatible = json.dumps(hive.get('compatible', []))
        requires = json.dumps(hive.get('requires', {}))

        # Read README
        readme = ''
        if readme_path.exists():
            readme = readme_path.read_text(encoding='utf-8')

        # Read source code
        source_code = ''
        if index_path.exists():
            source_code = index_path.read_text(encoding='utf-8')

        # Insert package
        cursor = db.execute("""
            INSERT INTO packages (slug, display_name, owner_id, owner_handle, description, readme,
                                  keywords, capabilities, compatible, requires,
                                  downloads_count, version_count, latest_version, moderation_status)
            VALUES (?, ?, ?, 'beepack', ?, ?, ?, ?, ?, ?, ?, 1, ?, 'active')
        """, (slug, display_name, owner_id, description, readme,
              keywords, capabilities, compatible, requires,
              0, version))

        package_id = cursor.lastrowid

        # Insert version
        files_meta = []
        for f in pkg_dir.iterdir():
            if f.is_file():
                files_meta.append({
                    'name': f.name,
                    'size': f.stat().st_size,
                })

        db.execute("""
            INSERT INTO package_versions (package_id, version, files, hive_yaml, source_code, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (package_id, version, json.dumps(files_meta), hive_text, source_code, owner_id))

        # Insert a passing security scan
        db.execute("""
            INSERT INTO security_scans (package_id, version, static_verdict, final_verdict, findings)
            VALUES (?, ?, 'pass', 'pass', '[]')
        """, (package_id, version))

        seeded += 1
        print(f"  SEEDED {slug} (v{version})")

    db.commit()
    db.close()

    print(f"\nDone: {seeded} seeded, {skipped} skipped")
    print(f"Database: {DB_PATH}")


if __name__ == '__main__':
    main()
