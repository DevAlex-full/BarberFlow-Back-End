import ExcelJS from 'exceljs';

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function formatDate(dateStr: string | Date): string {
  try {
    const dt = new Date(dateStr);
    return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' ' +
      dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(dateStr);
  }
}

const PURPLE = 'FF6B21A8';
const PURPLE_LIGHT = 'FFF3E8FF';
const WHITE = 'FFFFFFFF';

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  row.height = 22;
}

function styleSummaryRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE_LIGHT } };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  row.getCell(1).font = { bold: true };
}

export async function generateAppointmentsExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarberFlow';
  const ws = wb.addWorksheet('Agendamentos');

  // Título
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'RELATÓRIO DE AGENDAMENTOS — BarberFlow';
  titleCell.font = { bold: true, size: 16, color: { argb: PURPLE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.addRow([]);

  // Resumo
  const summary = data.summary || {};
  [
    ['Total de Agendamentos:', summary.total || 0],
    ['Concluídos:', summary.completed || 0],
    ['Cancelados:', summary.cancelled || 0],
    ['Receita Total:', formatCurrency(summary.totalRevenue || 0)],
  ].forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    styleSummaryRow(row);
  });

  ws.addRow([]);

  // Header tabela
  const headerRow = ws.addRow(['Data', 'Cliente', 'Telefone', 'Barbeiro', 'Serviço', 'Status', 'Valor']);
  styleHeaderRow(headerRow);

  // Dados
  (data.appointments || []).forEach((apt: any, i: number) => {
    const row = ws.addRow([
      formatDate(apt.date),
      apt.customer?.name || '',
      apt.customer?.phone || '',
      apt.barber?.name || '',
      apt.service?.name || '',
      apt.status || '',
      formatCurrency(Number(apt.price) || 0),
    ]);
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F5FF' } };
      });
    }
  });

  ws.columns = [
    { key: 'date', width: 20 },
    { key: 'customer', width: 26 },
    { key: 'phone', width: 16 },
    { key: 'barber', width: 22 },
    { key: 'service', width: 26 },
    { key: 'status', width: 16 },
    { key: 'price', width: 16 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateRevenueExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarberFlow';
  const ws = wb.addWorksheet('Receita');

  ws.mergeCells('A1:C1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'RELATÓRIO DE RECEITA — BarberFlow';
  titleCell.font = { bold: true, size: 16, color: { argb: PURPLE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.addRow([]);

  const summary = data.summary || {};
  [
    ['Receita Total:', formatCurrency(summary.totalRevenue || 0)],
    ['Total de Agendamentos:', String(summary.totalAppointments || 0)],
    ['Ticket Médio:', formatCurrency(summary.averageTicket || 0)],
  ].forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    styleSummaryRow(row);
  });

  ws.addRow([]);

  if (data.revenueByBarber?.length > 0) {
    ws.mergeCells(`A${ws.rowCount + 1}:C${ws.rowCount + 1}`);
    const sectionRow = ws.addRow(['Por Barbeiro']);
    sectionRow.getCell(1).font = { bold: true, size: 12, color: { argb: PURPLE } };

    const hRow = ws.addRow(['Barbeiro', 'Receita', 'Agendamentos']);
    styleHeaderRow(hRow);

    data.revenueByBarber.forEach((b: any, i: number) => {
      const row = ws.addRow([b.name || '', formatCurrency(b.revenue || 0), b.appointments || 0]);
      if (i % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F5FF' } }; });
    });

    ws.addRow([]);
  }

  if (data.revenueByService?.length > 0) {
    const sectionRow = ws.addRow(['Por Serviço']);
    sectionRow.getCell(1).font = { bold: true, size: 12, color: { argb: PURPLE } };

    const hRow = ws.addRow(['Serviço', 'Receita', 'Quantidade']);
    styleHeaderRow(hRow);

    data.revenueByService.forEach((s: any, i: number) => {
      const row = ws.addRow([s.name || '', formatCurrency(s.revenue || 0), s.count || 0]);
      if (i % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F5FF' } }; });
    });
  }

  ws.columns = [{ width: 28 }, { width: 20 }, { width: 20 }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateCustomersExcel(data: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BarberFlow';
  const ws = wb.addWorksheet('Clientes');

  ws.mergeCells('A1:E1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'RELATÓRIO DE CLIENTES — BarberFlow';
  titleCell.font = { bold: true, size: 16, color: { argb: PURPLE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.addRow([]);

  const summary = data.summary || {};
  [
    ['Total de Clientes:', summary.totalCustomers || 0],
    ['Clientes Ativos:', summary.activeCustomers || 0],
    ['Novos Clientes:', summary.newCustomers || 0],
    ['Inativos:', summary.inactiveCustomers || 0],
  ].forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    styleSummaryRow(row);
  });

  ws.addRow([]);

  const headerRow = ws.addRow(['Nome', 'Telefone', 'Email', 'Agendamentos', 'Última Visita']);
  styleHeaderRow(headerRow);

  (data.customers || []).forEach((c: any, i: number) => {
    const row = ws.addRow([
      c.name || '',
      c.phone || '',
      c.email || '',
      c.totalAppointments || 0,
      c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('pt-BR') : 'N/A',
    ]);
    if (i % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F5FF' } }; });
  });

  ws.columns = [
    { width: 26 }, { width: 16 }, { width: 26 }, { width: 16 }, { width: 16 },
  ];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}