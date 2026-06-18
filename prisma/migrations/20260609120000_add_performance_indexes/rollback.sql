-- BarberFlow 2.0 — Bloco B1: ROLLBACK
-- Desfaz todos os 13 índices adicionados por 20260609120000_add_performance_indexes
--
-- QUANDO USAR:
--   Se a migration causar algum problema inesperado no banco de dados.
--   Execute via Supabase SQL Editor ou psql diretamente.
--
-- IMPACTO DO ROLLBACK:
--   Zero perda de dados. Apenas remove os índices.
--   As queries voltarão ao comportamento anterior (full table scan).

DROP INDEX IF EXISTS "appointments_barbershopId_date_idx";
DROP INDEX IF EXISTS "appointments_barbershopId_status_idx";
DROP INDEX IF EXISTS "appointments_barbershopId_barberId_idx";
DROP INDEX IF EXISTS "transactions_barbershopId_date_idx";
DROP INDEX IF EXISTS "customers_barbershopId_active_idx";
DROP INDEX IF EXISTS "services_barbershopId_active_idx";
DROP INDEX IF EXISTS "users_barbershopId_role_idx";
DROP INDEX IF EXISTS "barbershops_planStatus_active_idx";
DROP INDEX IF EXISTS "commissions_barbershopId_barberId_idx";
DROP INDEX IF EXISTS "stock_items_barbershopId_idx";
DROP INDEX IF EXISTS "stock_movements_stockItemId_idx";
DROP INDEX IF EXISTS "customer_packages_barbershopId_idx";
DROP INDEX IF EXISTS "goals_barbershopId_idx";