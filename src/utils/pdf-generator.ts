import PDFDocument from 'pdfkit';

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

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, cols: Record<string, number>, labels: string[]) {
  doc.rect(50, y - 4, 500, 18).fill('#6B21A8');
  doc.fontSize(8).fillColor('#FFFFFF');
  Object.values(cols).forEach((x, i) => {
    doc.text(labels[i] || '', x, y, { width: 90, lineBreak: false });
  });
}

export async function generateAppointmentsPDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Título
    doc.fontSize(20).fillColor('#6B21A8').text('Relatório de Agendamentos', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — BarberFlow`, { align: 'center' });
    doc.moveDown(1);

    // Resumo
    const summary = data.summary || {};
    doc.fontSize(13).fillColor('#000').text('Resumo', { underline: true });
    doc.moveDown(0.3);

    const summaryItems = [
      ['Total de Agendamentos', String(summary.total || 0)],
      ['Concluídos', String(summary.completed || 0)],
      ['Cancelados', String(summary.cancelled || 0)],
      ['Receita Total', formatCurrency(summary.totalRevenue || 0)],
    ];

    summaryItems.forEach(([label, value]) => {
      const rowY = doc.y;
      doc.rect(50, rowY - 2, 250, 16).fill('#F3E8FF');
      doc.fontSize(10).fillColor('#333').text(label, 55, rowY, { width: 150, lineBreak: false });
      doc.text(value, 200, rowY, { width: 95, align: 'right', lineBreak: false });
      doc.moveDown(0.8);
    });

    doc.moveDown(0.5);

    // Tabela de agendamentos
    if (data.appointments?.length > 0) {
      doc.fontSize(13).fillColor('#000').text('Detalhamento', { underline: true });
      doc.moveDown(0.5);

      const cols = { date: 52, customer: 140, barber: 255, service: 340, status: 430, price: 495 };
      const labels = ['Data', 'Cliente', 'Barbeiro', 'Serviço', 'Status', 'Valor'];

      drawTableHeader(doc, doc.y, cols, labels);
      doc.moveDown(1);

      data.appointments.slice(0, 50).forEach((apt: any, i: number) => {
        if (doc.y > 750) { doc.addPage(); }
        const rowY = doc.y;

        if (i % 2 === 0) doc.rect(50, rowY - 2, 500, 14).fill('#F9F5FF');

        doc.fontSize(7.5).fillColor('#333');
        doc.text(formatDate(apt.date), cols.date, rowY, { width: 84, lineBreak: false });
        doc.text((apt.customer?.name || '').substring(0, 18), cols.customer, rowY, { width: 111, lineBreak: false });
        doc.text((apt.barber?.name || '').substring(0, 15), cols.barber, rowY, { width: 81, lineBreak: false });
        doc.text((apt.service?.name || '').substring(0, 18), cols.service, rowY, { width: 86, lineBreak: false });
        doc.text(apt.status || '', cols.status, rowY, { width: 61, lineBreak: false });
        doc.text(formatCurrency(Number(apt.price) || 0), cols.price, rowY, { width: 55, lineBreak: false });
        doc.moveDown(0.85);
      });
    }

    doc.end();
  });
}

export async function generateRevenuePDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#6B21A8').text('Relatório de Receita', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — BarberFlow`, { align: 'center' });
    doc.moveDown(1);

    const summary = data.summary || {};
    doc.fontSize(13).fillColor('#000').text('Resumo', { underline: true });
    doc.moveDown(0.3);

    [
      ['Receita Total', formatCurrency(summary.totalRevenue || 0)],
      ['Total de Agendamentos', String(summary.totalAppointments || 0)],
      ['Ticket Médio', formatCurrency(summary.averageTicket || 0)],
    ].forEach(([label, value]) => {
      const rowY = doc.y;
      doc.rect(50, rowY - 2, 250, 16).fill('#F3E8FF');
      doc.fontSize(10).fillColor('#333').text(label, 55, rowY, { width: 150, lineBreak: false });
      doc.text(value, 200, rowY, { width: 95, align: 'right', lineBreak: false });
      doc.moveDown(0.8);
    });

    doc.moveDown(0.5);

    if (data.revenueByBarber?.length > 0) {
      doc.fontSize(13).fillColor('#000').text('Receita por Barbeiro', { underline: true });
      doc.moveDown(0.3);

      const hY = doc.y;
      doc.rect(50, hY - 4, 350, 18).fill('#6B21A8');
      doc.fontSize(9).fillColor('#FFF').text('Barbeiro', 55, hY, { width: 150, lineBreak: false });
      doc.text('Receita', 210, hY, { width: 100, lineBreak: false });
      doc.text('Agendamentos', 310, hY, { width: 85, lineBreak: false });
      doc.moveDown(1);

      data.revenueByBarber.forEach((b: any, i: number) => {
        if (i % 2 === 0) doc.rect(50, doc.y - 2, 350, 14).fill('#F9F5FF');
        doc.fontSize(9).fillColor('#333');
        doc.text(b.name || '', 55, doc.y, { width: 150, lineBreak: false });
        doc.text(formatCurrency(b.revenue || 0), 210, doc.y, { width: 100, lineBreak: false });
        doc.text(String(b.appointments || 0), 310, doc.y, { width: 85, lineBreak: false });
        doc.moveDown(0.85);
      });

      doc.moveDown(0.5);
    }

    if (data.revenueByService?.length > 0) {
      doc.fontSize(13).fillColor('#000').text('Receita por Serviço', { underline: true });
      doc.moveDown(0.3);

      const hY = doc.y;
      doc.rect(50, hY - 4, 350, 18).fill('#6B21A8');
      doc.fontSize(9).fillColor('#FFF').text('Serviço', 55, hY, { width: 150, lineBreak: false });
      doc.text('Receita', 210, hY, { width: 100, lineBreak: false });
      doc.text('Qtd', 310, hY, { width: 85, lineBreak: false });
      doc.moveDown(1);

      data.revenueByService.forEach((s: any, i: number) => {
        if (i % 2 === 0) doc.rect(50, doc.y - 2, 350, 14).fill('#F9F5FF');
        doc.fontSize(9).fillColor('#333');
        doc.text(s.name || '', 55, doc.y, { width: 150, lineBreak: false });
        doc.text(formatCurrency(s.revenue || 0), 210, doc.y, { width: 100, lineBreak: false });
        doc.text(String(s.count || 0), 310, doc.y, { width: 85, lineBreak: false });
        doc.moveDown(0.85);
      });
    }

    doc.end();
  });
}

export async function generateCustomersPDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor('#6B21A8').text('Relatório de Clientes', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — BarberFlow`, { align: 'center' });
    doc.moveDown(1);

    const summary = data.summary || {};
    doc.fontSize(13).fillColor('#000').text('Resumo', { underline: true });
    doc.moveDown(0.3);

    [
      ['Total de Clientes', String(summary.totalCustomers || 0)],
      ['Clientes Ativos', String(summary.activeCustomers || 0)],
      ['Novos Clientes', String(summary.newCustomers || 0)],
      ['Inativos', String(summary.inactiveCustomers || 0)],
    ].forEach(([label, value]) => {
      const rowY = doc.y;
      doc.rect(50, rowY - 2, 250, 16).fill('#F3E8FF');
      doc.fontSize(10).fillColor('#333').text(label, 55, rowY, { width: 150, lineBreak: false });
      doc.text(value, 200, rowY, { width: 95, align: 'right', lineBreak: false });
      doc.moveDown(0.8);
    });

    doc.moveDown(0.5);

    if (data.customers?.length > 0) {
      doc.fontSize(13).fillColor('#000').text('Lista de Clientes', { underline: true });
      doc.moveDown(0.5);

      const hY = doc.y;
      doc.rect(50, hY - 4, 500, 18).fill('#6B21A8');
      doc.fontSize(9).fillColor('#FFF');
      doc.text('Nome', 55, hY, { width: 160, lineBreak: false });
      doc.text('Telefone', 220, hY, { width: 100, lineBreak: false });
      doc.text('Agendamentos', 325, hY, { width: 100, lineBreak: false });
      doc.text('Última Visita', 430, hY, { width: 115, lineBreak: false });
      doc.moveDown(1);

      data.customers.slice(0, 50).forEach((c: any, i: number) => {
        if (doc.y > 750) { doc.addPage(); }
        if (i % 2 === 0) doc.rect(50, doc.y - 2, 500, 14).fill('#F9F5FF');
        doc.fontSize(8.5).fillColor('#333');
        doc.text((c.name || '').substring(0, 25), 55, doc.y, { width: 160, lineBreak: false });
        doc.text(c.phone || '', 220, doc.y, { width: 100, lineBreak: false });
        doc.text(String(c.totalAppointments || 0), 325, doc.y, { width: 100, lineBreak: false });
        doc.text(c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('pt-BR') : 'N/A', 430, doc.y, { width: 115, lineBreak: false });
        doc.moveDown(0.85);
      });
    }

    doc.end();
  });
}