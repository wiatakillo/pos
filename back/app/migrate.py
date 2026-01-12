#!/usr/bin/env python3
"""
Database migration runner.

This script manages database schema versions by executing SQL migration files
in order. It tracks applied migrations in a schema_version table.

Usage:
    python -m app.migrate
    python -m app.migrate --check  # Only check, don't apply
"""
import argparse
import logging
import re
import sys
from pathlib import Path
from typing import Optional

from sqlmodel import Session, SQLModel, text

from app.db import engine
from app.settings import settings

# Set up logger
logger = logging.getLogger(__name__)


class MigrationRunner:
    """Manages database migrations."""

    def __init__(self, migrations_dir: Path):
        self.migrations_dir = migrations_dir
        self.schema_version_table = "schema_version"

    def _split_sql_statements(self, sql: str) -> list[str]:
        """
        Split a SQL migration file into executable statements.
        
        Postgres (via SQLAlchemy/psycopg) commonly rejects multi-statement strings
        in a single execute call ("cannot insert multiple commands into a prepared statement").
        Our migrations are plain SQL (DDL/DML), so a lightweight splitter is sufficient.
        """
        statements: list[str] = []
        buf: list[str] = []

        in_single = False
        in_double = False
        in_line_comment = False
        in_block_comment = False
        dollar_tag: str | None = None

        i = 0
        while i < len(sql):
            ch = sql[i]
            nxt = sql[i + 1] if i + 1 < len(sql) else ""

            # Handle line comments: -- ... \n
            if in_line_comment:
                buf.append(ch)
                if ch == "\n":
                    in_line_comment = False
                i += 1
                continue

            # Handle block comments: /* ... */
            if in_block_comment:
                buf.append(ch)
                if ch == "*" and nxt == "/":
                    buf.append(nxt)
                    i += 2
                    in_block_comment = False
                    continue
                i += 1
                continue

            # Enter comments if not in quotes/dollar-quote
            if not in_single and not in_double and dollar_tag is None:
                if ch == "-" and nxt == "-":
                    buf.append(ch)
                    buf.append(nxt)
                    i += 2
                    in_line_comment = True
                    continue
                if ch == "/" and nxt == "*":
                    buf.append(ch)
                    buf.append(nxt)
                    i += 2
                    in_block_comment = True
                    continue

            # Handle dollar-quoted blocks: $$ ... $$ or $tag$ ... $tag$
            if not in_single and not in_double:
                if dollar_tag is None and ch == "$":
                    # Try to parse a $tag$ opener.
                    j = i + 1
                    while j < len(sql) and (sql[j].isalnum() or sql[j] == "_"):
                        j += 1
                    if j < len(sql) and sql[j] == "$":
                        dollar_tag = sql[i : j + 1]  # inclusive of ending $
                        buf.append(dollar_tag)
                        i = j + 1
                        continue
                elif dollar_tag is not None and sql.startswith(dollar_tag, i):
                    buf.append(dollar_tag)
                    i += len(dollar_tag)
                    dollar_tag = None
                    continue

            # Toggle string literals
            if dollar_tag is None and not in_double and ch == "'" and not in_single:
                in_single = True
                buf.append(ch)
                i += 1
                continue
            if dollar_tag is None and in_single and ch == "'":
                buf.append(ch)
                # Escaped single quote inside string: ''
                if nxt == "'":
                    buf.append(nxt)
                    i += 2
                    continue
                in_single = False
                i += 1
                continue

            if dollar_tag is None and not in_single and ch == '"' and not in_double:
                in_double = True
                buf.append(ch)
                i += 1
                continue
            if dollar_tag is None and in_double and ch == '"':
                buf.append(ch)
                in_double = False
                i += 1
                continue

            # Statement terminator
            if ch == ";" and not in_single and not in_double and dollar_tag is None:
                stmt = "".join(buf).strip()
                if stmt:
                    statements.append(stmt)
                buf = []
                i += 1
                continue

            buf.append(ch)
            i += 1

        tail = "".join(buf).strip()
        if tail:
            statements.append(tail)
        return statements

    def ensure_version_table(self, session: Session) -> None:
        """Create the schema_version table if it doesn't exist."""
        # Check if table exists and if version column needs to be upgraded to BIGINT
        try:
            result = session.exec(text(f"""
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = '{self.schema_version_table}' 
                AND column_name = 'version'
            """))
            existing_type = result.first()
            if existing_type and existing_type[0] == 'integer':
                # Upgrade existing table from INTEGER to BIGINT
                logger.info("Upgrading schema_version.version column from INTEGER to BIGINT for timestamp support")
                session.exec(text(f"""
                    ALTER TABLE {self.schema_version_table} 
                    ALTER COLUMN version TYPE BIGINT
                """))
                session.commit()
        except Exception:
            # Table doesn't exist yet, create it with BIGINT
            pass
        
        # Create table if it doesn't exist (or recreate if needed)
        session.exec(text(f"""
            CREATE TABLE IF NOT EXISTS {self.schema_version_table} (
                version BIGINT PRIMARY KEY,
                description TEXT,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        session.commit()

    def get_current_version(self, session: Session | None = None) -> int:
        """
        Get the current database schema version.
        
        Args:
            session: Optional session. If not provided, creates a new one.
        
        Returns:
            int: Current schema version (0 if no migrations applied)
        """
        if session is None:
            with Session(engine) as session:
                return self._get_current_version_internal(session)
        else:
            return self._get_current_version_internal(session)
    
    def _get_current_version_internal(self, session: Session) -> int:
        """Internal method to get version from a session."""
        try:
            result = session.exec(
                text(f"SELECT MAX(version) FROM {self.schema_version_table}")
            ).first()
            return result[0] if result and result[0] is not None else 0
        except Exception:
            return 0

    def get_migration_files(self) -> list[tuple[int, Path]]:
        """
        Get all migration files sorted by version number.
        
        Supports two naming patterns:
        1. Sequential: 001_description.sql, 002_description.sql
        2. Timestamp: 20260111103000_description.sql (YYYYMMDDHHMMSS)
        
        Timestamp-based migrations are preferred for concurrent development.
        """
        migrations = []
        # Pattern 1: Sequential numbers (001, 002, etc.)
        sequential_pattern = re.compile(r"^(\d{3})_(.+)\.sql$")
        # Pattern 2: Timestamps (YYYYMMDDHHMMSS)
        timestamp_pattern = re.compile(r"^(\d{14})_(.+)\.sql$")

        if not self.migrations_dir.exists():
            return []

        for file in sorted(self.migrations_dir.glob("*.sql")):
            # Try timestamp pattern first (preferred)
            match = timestamp_pattern.match(file.name)
            if match:
                # Convert timestamp to integer for ordering
                # Timestamps are naturally ordered chronologically
                timestamp_str = match.group(1)
                # Use timestamp as version number (it's already a large integer)
                version = int(timestamp_str)
                migrations.append((version, file))
                continue
            
            # Fall back to sequential pattern (backward compatibility)
            match = sequential_pattern.match(file.name)
            if match:
                version = int(match.group(1))
                migrations.append((version, file))

        return migrations

    def apply_migration(self, session: Session, version: int, file_path: Path) -> bool:
        """Apply a single migration file."""
        try:
            version_type = "timestamp" if len(str(version)) == 14 else "sequential"
            logger.info(f"Applying migration {version} ({version_type}): {file_path.name}")

            # Read and execute SQL
            sql = file_path.read_text(encoding="utf-8")
            
            # Execute the migration (split into statements for Postgres compatibility)
            statements = self._split_sql_statements(sql)
            for stmt in statements:
                session.exec(text(stmt))
            
            # Record the migration
            # Extract description from filename (works for both patterns)
            if len(str(version)) == 14:  # Timestamp pattern
                description = file_path.stem.replace(f"{version}_", "").replace("_", " ")
            else:  # Sequential pattern
                description = file_path.stem.replace(f"{version:03d}_", "").replace("_", " ")
            
            session.exec(
                text(f"""
                    INSERT INTO {self.schema_version_table} (version, description)
                    VALUES (:version, :description)
                """).bindparams(version=version, description=description)
            )
            
            session.commit()
            logger.info(f"Migration {version} ({version_type}) applied successfully")
            return True

        except Exception as e:
            session.rollback()
            logger.error(f"Migration {version} failed: {e}")
            raise

    def run_migrations(self, dry_run: bool = False) -> int:
        """
        Run all pending migrations.
        
        Returns:
            int: The current database version after migrations
        """
        migrations_dir = Path(__file__).parent.parent / "migrations"
        
        if not migrations_dir.exists():
            logger.warning(f"Migrations directory not found: {migrations_dir}")
            return 0

        with Session(engine) as session:
            # Ensure version table exists
            self.ensure_version_table(session)

            # Get current version
            current_version = self._get_current_version_internal(session)
            logger.info(f"Database schema version: {current_version}")

            # Get all migration files
            migration_files = self.get_migration_files()
            
            if not migration_files:
                logger.info("No migration files found")
                return current_version
            
            # Log migration file details
            logger.info(f"Found {len(migration_files)} migration file(s):")
            for version, path in migration_files:
                version_type = "timestamp" if len(str(version)) == 14 else "sequential"
                status = "applied" if version <= current_version else "pending"
                logger.info(f"  - {path.name} (version: {version}, type: {version_type}, status: {status})")

            # Find pending migrations
            pending = [
                (version, path)
                for version, path in migration_files
                if version > current_version
            ]

            if not pending:
                logger.info(f"Database is up to date (version {current_version})")
                return current_version

            logger.info(f"Found {len(pending)} pending migration(s)")

            if dry_run:
                logger.info("Pending migrations (dry run):")
                for version, path in pending:
                    version_type = "timestamp" if len(str(version)) == 14 else "sequential"
                    logger.info(f"  - {version} ({version_type}): {path.name}")
                return current_version

            # Apply pending migrations
            for version, path in pending:
                try:
                    self.apply_migration(session, version, path)
                except Exception as e:
                    logger.error(f"Migration failed. Database may be in an inconsistent state.")
                    logger.error(f"Last successful version: {current_version}")
                    raise

            # Get final version
            final_version = self._get_current_version_internal(session)
            logger.info(f"All migrations applied successfully: version {current_version} → {final_version}")
            return final_version


def main():
    """Main entry point."""
    # Set up logging for CLI usage
    logging.basicConfig(
        level=logging.INFO,
        format='%(levelname)s: %(message)s'
    )
    
    parser = argparse.ArgumentParser(description="Run database migrations")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check for pending migrations without applying them",
    )
    parser.add_argument(
        "--migrations-dir",
        type=Path,
        default=None,
        help="Path to migrations directory (default: back/migrations)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    migrations_dir = args.migrations_dir or (Path(__file__).parent.parent / "migrations")
    runner = MigrationRunner(migrations_dir)
    
    try:
        version = runner.run_migrations(dry_run=args.check)
        if not args.check:
            print(f"✅ Database schema version: {version}")
    except Exception as e:
        logger.error(f"Migration runner failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
