-- Habilitar extensión para trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================
-- Filtros de TEXTO (contains, insensitive)
-- Index funcional + GIN (trigram) sobre LOWER(stringValue)
-- Útil para: TEXT / LONG_TEXT en 'contains' y 'eq' case-insensitive
-- =========================
CREATE INDEX IF NOT EXISTS "rc_string_trgm_gin"
  ON "RecordCell"
  USING GIN (LOWER("stringValue") gin_trgm_ops)
  WHERE "stringValue" IS NOT NULL;

-- =========================
-- Filtros NUMÉRICOS (gt/gte/lt/lte/eq/between)
-- =========================
CREATE INDEX IF NOT EXISTS "rc_field_number_partial_idx"
  ON "RecordCell" ("fieldId","numberValue")
  WHERE "numberValue" IS NOT NULL;

-- =========================
-- Filtros CHECKBOX (true/false)
-- =========================
CREATE INDEX IF NOT EXISTS "rc_field_bool_partial_idx"
  ON "RecordCell" ("fieldId","boolValue")
  WHERE "boolValue" IS NOT NULL;

-- =========================
-- Filtros DATE (on/before/after/between)
-- =========================
CREATE INDEX IF NOT EXISTS "rc_field_date_partial_idx"
  ON "RecordCell" ("fieldId","dateValue")
  WHERE "dateValue" IS NOT NULL;

-- =========================
-- Filtros DATETIME (on/before/after/between)
-- =========================
CREATE INDEX IF NOT EXISTS "rc_field_datetime_partial_idx"
  ON "RecordCell" ("fieldId","datetimeValue")
  WHERE "datetimeValue" IS NOT NULL;

-- =========================
-- Filtros TIME (eq/gt/gte/lt/lte/between)
-- =========================
CREATE INDEX IF NOT EXISTS "rc_field_time_partial_idx"
  ON "RecordCell" ("fieldId","timeMinutes")
  WHERE "timeMinutes" IS NOT NULL;

-- =========================
-- Filtros SINGLE_SELECT (eq/neq/is[not]empty)
-- =========================
CREATE INDEX IF NOT EXISTS "rc_field_select_partial_idx"
  ON "RecordCell" ("fieldId","selectOptionId")
  WHERE "selectOptionId" IS NOT NULL;

-- =========================
-- Filtros MULTI_SELECT (includes_any/includes_all/excludes_any)
-- Aceleran el join con la tabla de opciones
-- =========================
-- (ya sueles tener index en optionId y recordCellId por Prisma;
--  añadimos compuesto para los casos includes_all)
CREATE INDEX IF NOT EXISTS "rco_record_option_idx"
  ON "RecordCellOption" ("recordCellId","optionId");

-- =========================
-- Acceso más rápido a filas por tabla (no basurero)
-- =========================
CREATE INDEX IF NOT EXISTS "row_table_not_trashed_idx"
  ON "RecordRow" ("tableId")
  WHERE "isTrashed" = false;