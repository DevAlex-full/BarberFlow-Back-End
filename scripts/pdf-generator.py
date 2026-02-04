#!/usr/bin/env python3
"""
Gerador de PDFs para relatórios do BarberFlow
"""

from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from datetime import datetime
import json
import sys

def format_currency(value):
    """Formata valor para moeda brasileira"""
    return f"R$ {value:,.2f}".replace(',', '_').replace('.', ',').replace('_', '.')

def format_date(date_str):
    """Formata data para padrão brasileiro"""
    try:
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return dt.strftime('%d/%m/%Y %H:%M')
    except:
        return date_str

def generate_appointments_pdf(data, output_path):
    """Gera PDF de relatório de agendamentos"""
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = getSampleStyleSheet()
    story = []
    
    # Título
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#6B21A8'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    story.append(Paragraph("Relatório de Agendamentos", title_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Período
    if data.get('filters', {}).get('startDate'):
        period = f"Período: {format_date(data['filters']['startDate'])} a {format_date(data['filters']['endDate'])}"
        story.append(Paragraph(period, styles['Normal']))
        story.append(Spacer(1, 0.3*cm))
    
    # Resumo
    summary = data.get('summary', {})
    summary_data = [
        ['Total de Agendamentos', str(summary.get('total', 0))],
        ['Concluídos', str(summary.get('completed', 0))],
        ['Cancelados', str(summary.get('cancelled', 0))],
        ['Receita Total', format_currency(summary.get('totalRevenue', 0))]
    ]
    
    summary_table = Table(summary_data, colWidths=[10*cm, 5*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F3E8FF')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#9333EA'))
    ]))
    
    story.append(summary_table)
    story.append(Spacer(1, 1*cm))
    
    # Tabela de agendamentos
    if data.get('appointments'):
        story.append(Paragraph("Detalhamento", styles['Heading2']))
        story.append(Spacer(1, 0.5*cm))
        
        appointments_data = [['Data', 'Cliente', 'Barbeiro', 'Serviço', 'Status', 'Valor']]
        
        for apt in data['appointments'][:50]:  # Limitar a 50 para não quebrar o PDF
            appointments_data.append([
                format_date(apt['date']),
                apt['customer']['name'][:20],
                apt['barber']['name'][:15],
                apt['service']['name'][:20],
                apt['status'],
                format_currency(float(apt['price']))
            ])
        
        apt_table = Table(appointments_data, colWidths=[3*cm, 3.5*cm, 3*cm, 3.5*cm, 2*cm, 2.5*cm])
        apt_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6B21A8')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 8)
        ]))
        
        story.append(apt_table)
    
    # Rodapé
    story.append(Spacer(1, 2*cm))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.grey,
        alignment=TA_CENTER
    )
    story.append(Paragraph(f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} - BarberFlow", footer_style))
    
    doc.build(story)
    print(f"✅ PDF gerado: {output_path}")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Uso: python pdf-generator.py <json_file> <output_pdf>")
        sys.exit(1)
    
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    generate_appointments_pdf(data, sys.argv[2])