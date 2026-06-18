-- BarberFlow 2.0 — Bloco B1: Índices de Performance
-- Migration: 20260609120000_add_performance_indexes
-- Gerada em: 2026-06-09
--
-- 13 índices adicionados. Zero alterações de schema destrutivas.
-- Nenhum dado é modificado ou removido.
--
-- RISCO DE LOCK:
--   PostgreSQL 12+ (Supabase): CREATE INDEX é bloqueante por padrão.
--   Recomendado: aplicar em horário de baixo tráfego (madrugada BR).
--   Em produção com muitas linhas no futuro, usar CREATE INDEX CONCURRENTLY
--   via SQL direto no Supabase em vez desta migration.
--
-- ROLLBACK: ver rollback.sql na mesma pasta.

-- ─── appointments (3 índices — modelo mais consultado) ────────────────────────

-- [barbershopId, date]: cobre dashboard, Finance, reports, reminder job
CREATE INDEX "appointments_barbershopId_date_idx"
  ON "appointments"("barbershopId", "date");

-- [barbershopId, status]: cobre topServices groupBy, analytics conversionFunnel
CREATE INDEX "appointments_barbershopId_status_idx"
  ON "appointments"("barbershopId", "status");

-- [barbershopId, barberId]: cobre reports por barbeiro, commissions calculate
CREATE INDEX "appointments_barbershopId_barberId_idx"
  ON "appointments"("barbershopId", "barberId");

-- ─── transactions (1 índice) ──────────────────────────────────────────────────

-- [barbershopId, date]: cobre Finance/summary, Finance/cashflow, Finance/DRE,
--   dashboard/charts, analytics. Nota: type e status não indexados separadamente
--   porque 100% das queries de Transaction já filtram por date.
CREATE INDEX "transactions_barbershopId_date_idx"
  ON "transactions"("barbershopId", "date");

-- ─── customers (1 índice composto — substitui simples) ───────────────────────

-- [barbershopId, active]: leftmost prefix cobre { barbershopId } simples.
--   Também cobre { barbershopId, active: true } — dashboard count, analytics.
CREATE INDEX "customers_barbershopId_active_idx"
  ON "customers"("barbershopId", "active");

-- ─── services (1 índice composto — melhora simples) ──────────────────────────

-- [barbershopId, active]: mesmo racional do customers acima.
CREATE INDEX "services_barbershopId_active_idx"
  ON "services"("barbershopId", "active");

-- ─── users (1 índice composto) ────────────────────────────────────────────────

-- [barbershopId, role]: cobre { barbershopId } simples via prefixo.
--   Cobre { barbershopId, role: 'barber' } e { barbershopId, role, active }
--   para analytics, dashboard occupancy, commissions calculate.
CREATE INDEX "users_barbershopId_role_idx"
  ON "users"("barbershopId", "role");

-- ─── barbershops (1 índice composto) ─────────────────────────────────────────

-- [planStatus, active]: cobre public-barbershop route { active, planStatus }
--   e update-plan-status job updateMany { planStatus: { not: 'expired' } }.
CREATE INDEX "barbershops_planStatus_active_idx"
  ON "barbershops"("planStatus", "active");

-- ─── commissions (1 índice composto — substitui 2 simples) ───────────────────

-- [barbershopId, barberId]: barbershopId como coluna LÍDER.
--   Cobre { barbershopId } → listagem geral de comissões.
--   Cobre { barbershopId, barberId } → loop do calculate.
--   Cobre { barbershopId, barberId, referenceMonth } → verificação de mês calculado.
CREATE INDEX "commissions_barbershopId_barberId_idx"
  ON "commissions"("barbershopId", "barberId");

-- ─── stock_items (1 índice simples) ──────────────────────────────────────────

CREATE INDEX "stock_items_barbershopId_idx"
  ON "stock_items"("barbershopId");

-- ─── stock_movements (1 índice simples) ──────────────────────────────────────

CREATE INDEX "stock_movements_stockItemId_idx"
  ON "stock_movements"("stockItemId");

-- ─── customer_packages (1 índice simples) ────────────────────────────────────

CREATE INDEX "customer_packages_barbershopId_idx"
  ON "customer_packages"("barbershopId");

-- ─── goals (1 índice simples) ─────────────────────────────────────────────────

CREATE INDEX "goals_barbershopId_idx"
  ON "goals"("barbershopId");