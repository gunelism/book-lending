#!/bin/sh
# Runs once, when the Postgres volume is first created.
# Creates a separate database for the e2e tests so they never touch demo data.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE library_test;
EOSQL
