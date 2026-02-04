// back-end/src/utils/excel-generator.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/excel-generator.py');
const TEMP_DIR = path.join(__dirname, '../../temp');

// Garantir que o diretório temp existe
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    // Ignora se já existe
  }
}

export async function generateAppointmentsExcel(data: any): Promise<Buffer> {
  await ensureTempDir();
  
  const jsonFile = path.join(TEMP_DIR, `appointments-${Date.now()}.json`);
  const excelFile = path.join(TEMP_DIR, `report-${Date.now()}.xlsx`);
  
  try {
    // Salvar dados em JSON
    await fs.writeFile(jsonFile, JSON.stringify(data, null, 2));
    
    // Executar script Python
    await execAsync(`python3 ${PYTHON_SCRIPT} ${jsonFile} ${excelFile}`);
    
    // Ler Excel gerado
    const excelBuffer = await fs.readFile(excelFile);
    
    // Limpar arquivos temporários
    await fs.unlink(jsonFile);
    await fs.unlink(excelFile);
    
    return excelBuffer;
  } catch (error) {
    console.error('Erro ao gerar Excel:', error);
    // Tentar limpar arquivos mesmo em caso de erro
    try { await fs.unlink(jsonFile); } catch {}
    try { await fs.unlink(excelFile); } catch {}
    throw new Error('Erro ao gerar Excel');
  }
}

export async function generateRevenueExcel(data: any): Promise<Buffer> {
  // Por enquanto usa a mesma função, mas pode ser customizada
  return generateAppointmentsExcel(data);
}

export async function generateCustomersExcel(data: any): Promise<Buffer> {
  // Por enquanto usa a mesma função, mas pode ser customizada
  return generateAppointmentsExcel(data);
}