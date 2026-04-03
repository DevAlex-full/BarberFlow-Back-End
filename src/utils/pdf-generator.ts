import PDFDocument from 'pdfkit';

const BR = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
const DT = (d: string | Date) => {
  try { return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  catch { return '-'; }
};
const DTH = (d: string | Date) => {
  try {
    return new Date(d).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return '-'; }
};

const PURPLE   = '#6B21A8';
const PURPLE_L = '#F3E8FF';
const WHITE    = 'white';
const GRAY     = '#6B7280';
const BLACK    = '#111827';
const GREEN    = '#15803D';
const RED      = '#DC2626';

function header(doc: PDFKit.PDFDocument, title: string) {
  doc.rect(0, 0, 595, 70).fill(PURPLE);
  doc.fontSize(22).fillColor(WHITE).text(title, 50, 22, { align: 'center' });
  doc.fontSize(9).fillColor('#DDD8FF')
    .text(`BarberFlow  •  Gerado em ${DT(new Date())}`, 50, 52, { align: 'center' });
  doc.moveDown(3);
}

function summaryCards(doc: PDFKit.PDFDocument, items: { label: string; value: string }[]) {
  const cardW = (500 - (items.length - 1) * 8) / items.length;
  let x = 47;
  const y = doc.y;
  items.forEach(({ label, value }) => {
    doc.rect(x, y, cardW, 40).fillAndStroke(PURPLE_L, PURPLE);
    doc.fontSize(7.5).fillColor(GRAY).text(label, x + 4, y + 6, { width: cardW - 8, align: 'center' });
    doc.fontSize(11).fillColor(PURPLE).text(value, x + 4, y + 18, { width: cardW - 8, align: 'center' });
    x += cardW + 8;
  });
  doc.y = y + 52;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  if (doc.y > 730) doc.addPage();
  doc.moveDown(0.5);
  doc.rect(47, doc.y, 500, 18).fill(PURPLE);
  doc.fontSize(10).fillColor(WHITE).text(title, 52, doc.y - 14);
  doc.moveDown(1.2);
}

function tableRow(doc: PDFKit.PDFDocument, cols: { text: string; x: number; w: number; align?: string }[], isEven: boolean) {
  if (doc.y > 760) doc.addPage();
  const y = doc.y;
  if (isEven) doc.rect(47, y - 2, 500, 14).fill('#FAFAFA');
  doc.fontSize(7.5).fillColor(BLACK);
  cols.forEach(c => doc.text(c.text, c.x, y, { width: c.w, lineBreak: false, align: (c.align as any) || 'left' }));
  doc.moveDown(0.85);
}

function tableHeader(doc: PDFKit.PDFDocument, cols: { text: string; x: number; w: number; align?: string }[]) {
  if (doc.y > 730) doc.addPage();
  const y = doc.y;
  doc.rect(47, y - 3, 500, 16).fill(PURPLE);
  doc.fontSize(8).fillColor(WHITE);
  cols.forEach(c => doc.text(c.text, c.x, y, { width: c.w, lineBreak: false, align: (c.align as any) || 'left' }));
  doc.moveDown(1.1);
}

// ─── APPOINTMENTS ────────────────────────────────────────────
export async function generateAppointmentsPDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Relatório de Agendamentos');

    const s = data.summary || {};
    summaryCards(doc, [
      { label: 'Total',     value: String(s.total || 0) },
      { label: 'Concluídos', value: String(s.completed || 0) },
      { label: 'Cancelados', value: String(s.cancelled || 0) },
      { label: 'Receita',   value: BR(s.totalRevenue || 0) },
      { label: 'Ticket Médio', value: BR(s.averageTicket || 0) }
    ]);

    // Por barbeiro
    if (data.byBarber?.length) {
      sectionTitle(doc, 'Resumo por Barbeiro');
      const cols = [
        { text: 'Barbeiro',    x: 52, w: 180 },
        { text: 'Total',       x: 238, w: 70, align: 'center' },
        { text: 'Concluídos',  x: 314, w: 80, align: 'center' },
        { text: 'Receita',     x: 400, w: 140, align: 'right' }
      ];
      tableHeader(doc, cols);
      data.byBarber.forEach((b: any, i: number) => tableRow(doc, [
        { text: b.name, x: 52, w: 180 },
        { text: String(b.total), x: 238, w: 70, align: 'center' },
        { text: String(b.completed), x: 314, w: 80, align: 'center' },
        { text: BR(b.revenue), x: 400, w: 140, align: 'right' }
      ], i % 2 === 0));
    }

    // Tabela principal
    sectionTitle(doc, 'Detalhamento dos Agendamentos');
    const cols = [
      { text: 'Data/Hora',  x: 52,  w: 90 },
      { text: 'Cliente',    x: 147, w: 110 },
      { text: 'Barbeiro',   x: 262, w: 80 },
      { text: 'Serviço',    x: 347, w: 100 },
      { text: 'Status',     x: 452, w: 55 },
      { text: 'Valor',      x: 510, w: 35, align: 'right' }
    ];
    tableHeader(doc, cols);
    (data.appointments || []).slice(0, 100).forEach((a: any, i: number) => tableRow(doc, [
      { text: DTH(a.date),          x: 52,  w: 90 },
      { text: (a.customerName || '').substring(0, 18), x: 147, w: 110 },
      { text: (a.barberName  || '').substring(0, 14), x: 262, w: 80 },
      { text: (a.serviceName || '').substring(0, 17), x: 347, w: 100 },
      { text: a.statusLabel || a.status, x: 452, w: 55 },
      { text: BR(a.price || 0),     x: 510, w: 35, align: 'right' }
    ], i % 2 === 0));

    doc.end();
  });
}

// ─── REVENUE ─────────────────────────────────────────────────
export async function generateRevenuePDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Relatório de Faturamento');

    const s = data.summary || {};
    summaryCards(doc, [
      { label: 'Receita Total',  value: BR(s.totalRevenue || 0) },
      { label: 'Lucro Líquido',  value: BR(s.netProfit || 0) },
      { label: 'Despesas',       value: BR(s.totalExpenses || 0) },
      { label: 'Margem',         value: `${s.profitMargin || 0}%` },
      { label: 'Ticket Médio',   value: BR(s.averageTicket || 0) }
    ]);

    // Por barbeiro
    if (data.byBarber?.length) {
      sectionTitle(doc, 'Faturamento por Barbeiro');
      tableHeader(doc, [
        { text: 'Barbeiro',       x: 52,  w: 160 },
        { text: 'Agendamentos',   x: 217, w: 80, align: 'center' },
        { text: 'Rec. Agend.',    x: 302, w: 90, align: 'right' },
        { text: 'Rec. Manual',    x: 397, w: 90, align: 'right' },
        { text: 'Total',          x: 492, w: 55, align: 'right' }
      ]);
      data.byBarber.forEach((b: any, i: number) => tableRow(doc, [
        { text: b.name,                       x: 52,  w: 160 },
        { text: String(b.appointments || 0),  x: 217, w: 80,  align: 'center' },
        { text: BR(b.appointmentsRevenue||0), x: 302, w: 90,  align: 'right' },
        { text: BR(b.manualRevenue || 0),     x: 397, w: 90,  align: 'right' },
        { text: BR(b.totalRevenue  || 0),     x: 492, w: 55,  align: 'right' }
      ], i % 2 === 0));
    }

    // Por serviço
    if (data.byService?.length) {
      sectionTitle(doc, 'Faturamento por Serviço');
      tableHeader(doc, [
        { text: 'Serviço',  x: 52,  w: 260 },
        { text: 'Qtd',      x: 317, w: 60,  align: 'center' },
        { text: 'Receita',  x: 382, w: 165, align: 'right' }
      ]);
      data.byService.forEach((s: any, i: number) => tableRow(doc, [
        { text: s.name,        x: 52,  w: 260 },
        { text: String(s.count || 0), x: 317, w: 60, align: 'center' },
        { text: BR(s.revenue || 0),   x: 382, w: 165, align: 'right' }
      ], i % 2 === 0));
    }

    // Despesas por categoria
    const expCats = Object.entries(data.expensesByCategory || {});
    if (expCats.length) {
      sectionTitle(doc, 'Despesas por Categoria');
      tableHeader(doc, [
        { text: 'Categoria', x: 52, w: 300 },
        { text: 'Valor',     x: 357, w: 190, align: 'right' }
      ]);
      expCats.forEach(([cat, val]: any, i: number) => tableRow(doc, [
        { text: cat,   x: 52,  w: 300 },
        { text: BR(val), x: 357, w: 190, align: 'right' }
      ], i % 2 === 0));
    }

    // Transações
    if (data.transactions?.length) {
      sectionTitle(doc, 'Transações Financeiras');
      tableHeader(doc, [
        { text: 'Data',        x: 52,  w: 65 },
        { text: 'Tipo',        x: 122, w: 50 },
        { text: 'Categoria',   x: 177, w: 75 },
        { text: 'Descrição',   x: 257, w: 130 },
        { text: 'Barbeiro',    x: 392, w: 75 },
        { text: 'Valor',       x: 472, w: 75, align: 'right' }
      ]);
      data.transactions.slice(0, 80).forEach((t: any, i: number) => {
        const color = t.type === 'income' ? GREEN : RED;
        if (doc.y > 760) doc.addPage();
        const y = doc.y;
        if (i % 2 === 0) doc.rect(47, y - 2, 500, 14).fill('#FAFAFA');
        doc.fontSize(7.5);
        doc.fillColor(BLACK).text(DT(t.date),             52,  y, { width: 65,  lineBreak: false });
        doc.fillColor(color).text(t.typeLabel || t.type,  122, y, { width: 50,  lineBreak: false });
        doc.fillColor(BLACK).text(t.categoryLabel || '',  177, y, { width: 75,  lineBreak: false });
        doc.fillColor(BLACK).text((t.description||'').substring(0,22), 257, y, { width: 130, lineBreak: false });
        doc.fillColor(BLACK).text((t.barberName || '-').substring(0,14), 392, y, { width: 75, lineBreak: false });
        doc.fillColor(color).text(BR(t.amount||0),        472, y, { width: 75,  lineBreak: false, align: 'right' });
        doc.moveDown(0.85);
      });
    }

    // Comissões
    if (data.commissions?.length) {
      sectionTitle(doc, 'Comissões dos Barbeiros');
      tableHeader(doc, [
        { text: 'Barbeiro',     x: 52,  w: 150 },
        { text: 'Mês Ref.',     x: 207, w: 80 },
        { text: '%',            x: 292, w: 40, align: 'center' },
        { text: 'Valor',        x: 337, w: 100, align: 'right' },
        { text: 'Status',       x: 442, w: 105 }
      ]);
      data.commissions.forEach((c: any, i: number) => tableRow(doc, [
        { text: c.barberName,             x: 52,  w: 150 },
        { text: DT(c.referenceMonth),     x: 207, w: 80 },
        { text: `${c.percentage}%`,       x: 292, w: 40, align: 'center' },
        { text: BR(c.amount || 0),        x: 337, w: 100, align: 'right' },
        { text: c.statusLabel || c.status, x: 442, w: 105 }
      ], i % 2 === 0));
    }

    doc.end();
  });
}

// ─── CUSTOMERS ───────────────────────────────────────────────
export async function generateCustomersPDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'Relatório de Clientes');

    const s = data.summary || {};
    summaryCards(doc, [
      { label: 'Total',          value: String(s.totalCustomers || 0) },
      { label: 'Ativos',         value: String(s.activeCustomers || 0) },
      { label: 'Novos',          value: String(s.newCustomers || 0) },
      { label: 'Inativos',       value: String(s.inactiveCustomers || 0) },
      { label: 'Receita Total',  value: BR(s.totalRevenue || 0) }
    ]);

    sectionTitle(doc, 'Lista de Clientes');
    tableHeader(doc, [
      { text: 'Nome',        x: 52,  w: 120 },
      { text: 'Telefone',    x: 177, w: 80 },
      { text: 'Visitas',     x: 262, w: 45, align: 'center' },
      { text: 'Receita',     x: 312, w: 80, align: 'right' },
      { text: 'Ticket Méd.', x: 397, w: 70, align: 'right' },
      { text: 'Última Visita', x: 472, w: 75 }
    ]);

    (data.customers || []).slice(0, 80).forEach((c: any, i: number) => tableRow(doc, [
      { text: (c.name || '').substring(0, 20), x: 52,  w: 120 },
      { text: c.phone || '-',                  x: 177, w: 80 },
      { text: String(c.totalVisits || 0),      x: 262, w: 45,  align: 'center' },
      { text: BR(c.totalRevenue || 0),          x: 312, w: 80,  align: 'right' },
      { text: BR(c.averageTicket || 0),         x: 397, w: 70,  align: 'right' },
      { text: c.lastVisit ? DT(c.lastVisit) : '-', x: 472, w: 75 }
    ], i % 2 === 0));

    doc.end();
  });
}