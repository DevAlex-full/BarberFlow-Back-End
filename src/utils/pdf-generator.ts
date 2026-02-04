// back-end/src/utils/pdf-generator.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/pdf-generator.py');
const TEMP_DIR = path.join(__dirname, '../../temp');

// Garantir que o diretório temp existe
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    // Ignora se já existe
  }
}

export async function generateAppointmentsPDF(data: any): Promise<Buffer> {
  await ensureTempDir();
  
  const jsonFile = path.join(TEMP_DIR, `appointments-${Date.now()}.json`);
  const pdfFile = path.join(TEMP_DIR, `report-${Date.now()}.pdf`);
  
  try {
    // Salvar dados em JSON
    await fs.writeFile(jsonFile, JSON.stringify(data, null, 2));
    
    // Executar script Python
    await execAsync(`python3 ${PYTHON_SCRIPT} ${jsonFile} ${pdfFile}`);
    
    // Ler PDF gerado
    const pdfBuffer = await fs.readFile(pdfFile);
    
    // Limpar arquivos temporários
    await fs.unlink(jsonFile);
    await fs.unlink(pdfFile);
    
    return pdfBuffer;
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    // Tentar limpar arquivos mesmo em caso de erro
    try { await fs.unlink(jsonFile); } catch {}
    try { await fs.unlink(pdfFile); } catch {}
    throw new Error('Erro ao gerar PDF');
  }
}

export async function generateRevenuePDF(data: any): Promise<Buffer> {
  // Por enquanto usa a mesma função, mas pode ser customizada
  return generateAppointmentsPDF(data);
}

export async function generateCustomersPDF(data: any): Promise<Buffer> {
  // Por enquanto usa a mesma função, mas pode ser customizada
  return generateAppointmentsPDF(data);
}