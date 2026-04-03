import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Request } from 'express';

export const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads');

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

ensureUploadsDir();

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(
        'Tipo de arquivo inválido. Envie apenas imagens JPG, PNG, WEBP ou GIF.'
      )
    );
  }

  cb(null, true);
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

export function buildUploadUrl(fileName: string) {
  return `/uploads/${fileName}`;
}

export function getFilePathFromUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;

  const normalizedUrl = fileUrl.replace(/\\/g, '/');

  if (!normalizedUrl.startsWith('/uploads/')) {
    return null;
  }

  const fileName = normalizedUrl.replace('/uploads/', '');
  return path.resolve(UPLOADS_DIR, fileName);
}

export function deleteFileByUrl(fileUrl?: string | null) {
  try {
    const filePath = getFilePathFromUrl(fileUrl);

    if (!filePath) return;
    if (!fs.existsSync(filePath)) return;

    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('❌ Erro ao remover arquivo antigo:', error);
  }
}