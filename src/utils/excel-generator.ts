import ExcelJS from 'exceljs';

const BR = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
const DT = (d: any) => { try { return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); } catch { return '-'; } };
const DTH = (d: any) => {
  try {
    return new Date(d).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day:'2-digit', month:'2-digit',
      year:'numeric', hour:'2-digit', minute:'2-digit'
    });
  } catch { return '-'; }
};

const PURPLE       = 'FF6B21A8';
const PURPLE_LIGHT = 'FFF3E8FF';
const PURPLE_PALE  = 'FFF9F5FF';
const WHITE_ARGB   = 'FFFFFFFF';
const GREEN_ARGB   = 'FF15803D';
const RED_ARGB     = 'FFDC2626';

function applyHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: WHITE_ARGB }, size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = { bottom: { style: 'thin', color: { argb: PURPLE } } };
  });
}

function applySummaryRow(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_LIGHT } };
    cell.border = { bottom: { style: 'hair' } };
  });
  row.getCell(1).font = { bold: true, color: { argb: PURPLE } };
}

function applyDataRow(row: ExcelJS.Row, isEven: boolean) {
  if (isEven) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_PALE } }; });
}

function addTitle(ws: ExcelJS.Worksheet, title: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell('A1');
  t.value     = title;
  t.font      = { bold: true, size: 16, color: { argb: PURPLE } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, cols);
  const sub = ws.getCell('A2');
  sub.value     = `BarberFlow  •  Gerado em ${DT(new Date())}`;
  sub.font      = { size: 9, color: { argb: 'FF9CA3AF' } };
  sub.alignment = { horizontal: 'center' };
  ws.addRow([]);
}

function addSectionHeader(ws: ExcelJS.Worksheet, title: string, cols: number) {
  ws.addRow([]);
  const r = ws.addRow([title]);
  r.getCell(1).font = { bold: true, size: 12, color: { argb: PURPLE } };
  ws.mergeCells(r.number, 1, r.number, cols);
}

// ─── APPOINTMENTS ────────────────────────────────────────────
export async function generateAppointmentsExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarberFlow';

  // Aba 1: Resumo
  const wsSum = wb.addWorksheet('Resumo');
  addTitle(wsSum, 'Relatório de Agendamentos', 4);
  const s = data.summary || {};
  [
    ['Total de Agendamentos', s.total || 0],
    ['Concluídos',            s.completed || 0],
    ['Cancelados',            s.cancelled || 0],
    ['Agendados',             s.scheduled || 0],
    ['Confirmados',           s.confirmed || 0],
    ['Receita Total',         BR(s.totalRevenue || 0)],
    ['Ticket Médio',          BR(s.averageTicket || 0)]
  ].forEach(([l, v]) => applySummaryRow(wsSum.addRow([l, v])));

  if (data.byBarber?.length) {
    addSectionHeader(wsSum, 'Por Barbeiro', 4);
    const h = wsSum.addRow(['Barbeiro', 'Total', 'Concluídos', 'Receita']);
    applyHeaderRow(h);
    data.byBarber.forEach((b: any, i: number) => applyDataRow(wsSum.addRow([b.name, b.total, b.completed, BR(b.revenue)]), i % 2 === 0));
  }

  wsSum.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 18 }];

  // Aba 2: Agendamentos
  const wsApt = wb.addWorksheet('Agendamentos');
  addTitle(wsApt, 'Detalhamento dos Agendamentos', 7);
  const hRow = wsApt.addRow(['Data/Hora', 'Cliente', 'Telefone', 'Barbeiro', 'Serviço', 'Status', 'Valor']);
  applyHeaderRow(hRow);
  (data.appointments || []).forEach((a: any, i: number) => {
    const row = wsApt.addRow([
      DTH(a.date), a.customerName || '', a.customerPhone || '',
      a.barberName || '', a.serviceName || '', a.statusLabel || a.status,
      BR(a.price || 0)
    ]);
    applyDataRow(row, i % 2 === 0);
  });
  wsApt.columns = [{ width: 20 }, { width: 24 }, { width: 16 }, { width: 18 }, { width: 22 }, { width: 14 }, { width: 14 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ─── REVENUE ─────────────────────────────────────────────────
export async function generateRevenueExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarberFlow';
  const s = data.summary || {};

  // Aba 1: Resumo
  const wsSum = wb.addWorksheet('Resumo');
  addTitle(wsSum, 'Relatório de Faturamento', 3);
  [
    ['Receita Total',              BR(s.totalRevenue || 0)],
    ['  Agendamentos',             BR(s.appointmentsRevenue || 0)],
    ['  Transações Manuais',       BR(s.manualTransactionsRevenue || 0)],
    ['Total de Despesas',          BR(s.totalExpenses || 0)],
    ['Lucro Líquido',              BR(s.netProfit || 0)],
    ['Margem de Lucro',            `${s.profitMargin || 0}%`],
    ['Total de Agendamentos',      String(s.totalAppointments || 0)],
    ['Ticket Médio',               BR(s.averageTicket || 0)]
  ].forEach(([l, v]) => applySummaryRow(wsSum.addRow([l, v])));
  wsSum.columns = [{ width: 30 }, { width: 20 }];

  // Aba 2: Por Barbeiro
  if (data.byBarber?.length) {
    const wsB = wb.addWorksheet('Por Barbeiro');
    addTitle(wsB, 'Faturamento por Barbeiro', 5);
    applyHeaderRow(wsB.addRow(['Barbeiro', 'Agendamentos', 'Rec. Agendamentos', 'Rec. Manual', 'Total']));
    data.byBarber.forEach((b: any, i: number) => applyDataRow(wsB.addRow([
      b.name, b.appointments || 0, BR(b.appointmentsRevenue||0), BR(b.manualRevenue||0), BR(b.totalRevenue||0)
    ]), i % 2 === 0));
    wsB.columns = [{ width: 26 }, { width: 16 }, { width: 20 }, { width: 18 }, { width: 18 }];
  }

  // Aba 3: Por Serviço
  if (data.byService?.length) {
    const wsS = wb.addWorksheet('Por Serviço');
    addTitle(wsS, 'Faturamento por Serviço', 3);
    applyHeaderRow(wsS.addRow(['Serviço', 'Quantidade', 'Receita']));
    data.byService.forEach((s: any, i: number) => applyDataRow(wsS.addRow([s.name, s.count, BR(s.revenue)]), i % 2 === 0));
    wsS.columns = [{ width: 30 }, { width: 14 }, { width: 18 }];
  }

  // Aba 4: Transações
  if (data.transactions?.length) {
    const wsTx = wb.addWorksheet('Transações');
    addTitle(wsTx, 'Transações Financeiras', 8);
    applyHeaderRow(wsTx.addRow(['Data', 'Tipo', 'Categoria', 'Descrição', 'Barbeiro', 'Cliente', 'Pagamento', 'Valor']));
    data.transactions.forEach((t: any, i: number) => {
      const row = wsTx.addRow([
        DT(t.date), t.typeLabel || t.type, t.categoryLabel || t.category,
        t.description || '', t.barberName || '-', t.customerName || '-',
        t.paymentMethod || '-', BR(t.amount || 0)
      ]);
      applyDataRow(row, i % 2 === 0);
      // Colorir tipo
      const typeCell = row.getCell(2);
      typeCell.font = { color: { argb: t.type === 'income' ? GREEN_ARGB : RED_ARGB }, bold: true };
    });
    wsTx.columns = [{ width: 14 }, { width: 12 }, { width: 16 }, { width: 30 }, { width: 18 }, { width: 20 }, { width: 14 }, { width: 16 }];
  }

  // Aba 5: Comissões
  if (data.commissions?.length) {
    const wsC = wb.addWorksheet('Comissões');
    addTitle(wsC, 'Comissões dos Barbeiros', 5);
    applyHeaderRow(wsC.addRow(['Barbeiro', 'Mês Referência', '% Comissão', 'Valor', 'Status']));
    data.commissions.forEach((c: any, i: number) => applyDataRow(wsC.addRow([
      c.barberName, DT(c.referenceMonth), `${c.percentage}%`, BR(c.amount), c.statusLabel || c.status
    ]), i % 2 === 0));
    wsC.columns = [{ width: 22 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 14 }];
  }

  // Aba 6: Despesas
  const expEntries = Object.entries(data.expensesByCategory || {});
  if (expEntries.length) {
    const wsE = wb.addWorksheet('Despesas');
    addTitle(wsE, 'Despesas por Categoria', 2);
    applyHeaderRow(wsE.addRow(['Categoria', 'Total']));
    expEntries.forEach(([cat, val]: any, i) => applyDataRow(wsE.addRow([cat, BR(val)]), i % 2 === 0));
    wsE.columns = [{ width: 24 }, { width: 18 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ─── CUSTOMERS ───────────────────────────────────────────────
export async function generateCustomersExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarberFlow';
  const s = data.summary || {};

  // Aba 1: Resumo
  const wsSum = wb.addWorksheet('Resumo');
  addTitle(wsSum, 'Relatório de Clientes', 2);
  [
    ['Total de Clientes',            s.totalCustomers || 0],
    ['Clientes Ativos',              s.activeCustomers || 0],
    ['Novos Clientes (no período)',  s.newCustomers || 0],
    ['Clientes Inativos',            s.inactiveCustomers || 0],
    ['Receita Total',                BR(s.totalRevenue || 0)],
    ['Receita Média por Cliente',    BR(s.averageRevenuePerCustomer || 0)]
  ].forEach(([l, v]) => applySummaryRow(wsSum.addRow([l, v])));
  wsSum.columns = [{ width: 30 }, { width: 20 }];

  // Aba 2: Clientes
  const wsCl = wb.addWorksheet('Clientes');
  addTitle(wsCl, 'Análise de Clientes', 9);
  applyHeaderRow(wsCl.addRow([
    'Nome', 'Telefone', 'E-mail', 'Visitas', 'Receita Total',
    'Ticket Médio', 'Última Visita', 'Serviço Favorito', 'Barbeiro Favorito'
  ]));
  (data.customers || []).forEach((c: any, i: number) => {
    const row = wsCl.addRow([
      c.name || '', c.phone || '', c.email || '-',
      c.totalVisits || 0,
      BR(c.totalRevenue || 0),
      BR(c.averageTicket || 0),
      c.lastVisit ? DT(c.lastVisit) : '-',
      c.favoriteService || '-',
      c.favoriteBarber  || '-'
    ]);
    applyDataRow(row, i % 2 === 0);
    if (c.isNew) row.getCell(1).font = { bold: true, color: { argb: GREEN_ARGB } };
  });
  wsCl.columns = [
    { width: 24 }, { width: 16 }, { width: 26 }, { width: 10 },
    { width: 16 }, { width: 14 }, { width: 16 }, { width: 22 }, { width: 20 }
  ];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}