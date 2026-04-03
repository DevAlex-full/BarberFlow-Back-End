import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Router, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';

import { prisma } from '../config/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  upload,
  UPLOADS_DIR,
  ensureUploadsDir,
  buildUploadUrl,
  deleteFileByUrl,
} from '../config/multer';

const router = Router();

type UploadVariant = 'logo' | 'avatar' | 'hero' | 'gallery' | 'generic';

type UploadRule = {
  maxSizeBytes: number;
  minWidth: number;
  minHeight: number;
  outputWidth: number;
  outputHeight: number;
  quality: number;
  fit: 'cover' | 'contain' | 'inside';
  filePrefix: string;
};

const uploadRules: Record<UploadVariant, UploadRule> = {
  logo: {
    maxSizeBytes: 2 * 1024 * 1024,
    minWidth: 200,
    minHeight: 200,
    outputWidth: 512,
    outputHeight: 512,
    quality: 92,
    fit: 'contain',
    filePrefix: 'logo',
  },
  avatar: {
    maxSizeBytes: 1 * 1024 * 1024,
    minWidth: 200,
    minHeight: 200,
    outputWidth: 512,
    outputHeight: 512,
    quality: 90,
    fit: 'cover',
    filePrefix: 'avatar',
  },
  hero: {
    maxSizeBytes: 3 * 1024 * 1024,
    minWidth: 1200,
    minHeight: 600,
    outputWidth: 1600,
    outputHeight: 900,
    quality: 88,
    fit: 'cover',
    filePrefix: 'hero',
  },
  gallery: {
    maxSizeBytes: 3 * 1024 * 1024,
    minWidth: 600,
    minHeight: 600,
    outputWidth: 1400,
    outputHeight: 1400,
    quality: 88,
    fit: 'inside',
    filePrefix: 'gallery',
  },
  generic: {
    maxSizeBytes: 3 * 1024 * 1024,
    minWidth: 600,
    minHeight: 600,
    outputWidth: 1400,
    outputHeight: 1400,
    quality: 88,
    fit: 'inside',
    filePrefix: 'image',
  },
};

function isMulterError(error: unknown): error is multer.MulterError {
  return error instanceof multer.MulterError;
}

function handleUploadError(res: Response, error: unknown, fallbackMessage: string) {
  console.error('❌ Upload error:', error);

  if (isMulterError(error)) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Arquivo muito grande. O tamanho máximo global permitido no upload é 5MB.',
      });
    }

    return res.status(400).json({
      error: error.message || fallbackMessage,
    });
  }

  if (error instanceof Error) {
    return res.status(400).json({
      error: error.message || fallbackMessage,
    });
  }

  return res.status(500).json({
    error: fallbackMessage,
  });
}

function resolveGenericUploadVariant(uploadType?: string): UploadVariant {
  if (uploadType === 'hero') return 'hero';
  if (uploadType === 'gallery') return 'gallery';
  return 'generic';
}

async function processAndSaveImage(
  file: Express.Multer.File,
  variant: UploadVariant
) {
  const rule = uploadRules[variant];

  if (file.size > rule.maxSizeBytes) {
    const maxMb = Math.round((rule.maxSizeBytes / (1024 * 1024)) * 10) / 10;
    throw new Error(`Arquivo muito grande para este tipo de imagem. Máximo permitido: ${maxMb}MB.`);
  }

  const image = sharp(file.buffer).rotate();
  const metadata = await image.metadata();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    throw new Error('Não foi possível identificar as dimensões da imagem enviada.');
  }

  if (width < rule.minWidth || height < rule.minHeight) {
    throw new Error(
      `Imagem muito pequena. Mínimo recomendado para este upload: ${rule.minWidth}x${rule.minHeight}px.`
    );
  }

  ensureUploadsDir();

  const fileName = `${rule.filePrefix}-${Date.now()}-${randomUUID()}.webp`;
  const outputPath = path.resolve(UPLOADS_DIR, fileName);

  let pipeline = sharp(file.buffer).rotate();

  if (variant === 'logo') {
    pipeline = pipeline.resize(rule.outputWidth, rule.outputHeight, {
      fit: rule.fit,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      withoutEnlargement: true,
    });
  } else if (variant === 'gallery' || variant === 'generic') {
    pipeline = pipeline.resize(rule.outputWidth, rule.outputHeight, {
      fit: rule.fit,
      withoutEnlargement: true,
    });
  } else {
    pipeline = pipeline.resize(rule.outputWidth, rule.outputHeight, {
      fit: rule.fit,
      position: 'centre',
      withoutEnlargement: false,
    });
  }

  await pipeline.webp({ quality: rule.quality }).toFile(outputPath);

  const stats = fs.statSync(outputPath);

  return {
    fileName,
    url: buildUploadUrl(fileName),
    original: {
      width,
      height,
      size: file.size,
      mimeType: file.mimetype,
    },
    optimized: {
      width:
        variant === 'gallery' || variant === 'generic'
          ? Math.min(width, rule.outputWidth)
          : rule.outputWidth,
      height:
        variant === 'gallery' || variant === 'generic'
          ? Math.min(height, rule.outputHeight)
          : rule.outputHeight,
      size: stats.size,
      format: 'webp',
    },
  };
}

// Upload genérico (hero / galeria / outros)
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.user?.barbershopId) {
      return res.status(400).json({ error: 'Usuário sem barbearia vinculada.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const variant = resolveGenericUploadVariant(req.body?.uploadType);
    const processed = await processAndSaveImage(req.file, variant);

    return res.status(200).json({
      success: true,
      message: 'Imagem enviada com sucesso.',
      uploadType: variant,
      url: processed.url,
      image: processed,
    });
  } catch (error) {
    return handleUploadError(res, error, 'Erro ao fazer upload da imagem.');
  }
});

// Upload de logo da barbearia
router.post('/barbershop-logo', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    if (!req.user?.barbershopId) {
      return res.status(400).json({ error: 'Usuário sem barbearia vinculada.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const currentBarbershop = await prisma.barbershop.findUnique({
      where: { id: req.user.barbershopId },
      select: { id: true, logo: true },
    });

    if (!currentBarbershop) {
      return res.status(404).json({ error: 'Barbearia não encontrada.' });
    }

    const processed = await processAndSaveImage(req.file, 'logo');

    await prisma.barbershop.update({
      where: { id: req.user.barbershopId },
      data: { logo: processed.url },
    });

    if (currentBarbershop.logo && currentBarbershop.logo !== processed.url) {
      deleteFileByUrl(currentBarbershop.logo);
    }

    return res.status(200).json({
      success: true,
      message: 'Logo atualizada com sucesso.',
      logoUrl: processed.url,
      image: processed,
    });
  } catch (error) {
    return handleUploadError(res, error, 'Erro ao fazer upload do logo.');
  }
});

// Upload do avatar do próprio usuário
router.post('/user-avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, avatar: true },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const processed = await processAndSaveImage(req.file, 'avatar');

    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: processed.url },
    });

    if (currentUser.avatar && currentUser.avatar !== processed.url) {
      deleteFileByUrl(currentUser.avatar);
    }

    return res.status(200).json({
      success: true,
      message: 'Avatar atualizado com sucesso.',
      avatarUrl: processed.url,
      image: processed,
    });
  } catch (error) {
    return handleUploadError(res, error, 'Erro ao fazer upload do avatar.');
  }
});

// Upload do avatar de outro usuário da mesma barbearia
router.post('/user-avatar/:userId', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.user?.barbershopId) {
      return res.status(400).json({ error: 'Usuário sem barbearia vinculada.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const { userId } = req.params;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        avatar: true,
        barbershopId: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (targetUser.barbershopId !== req.user.barbershopId) {
      return res.status(403).json({ error: 'Sem permissão para alterar este usuário.' });
    }

    const processed = await processAndSaveImage(req.file, 'avatar');

    await prisma.user.update({
      where: { id: userId },
      data: { avatar: processed.url },
    });

    if (targetUser.avatar && targetUser.avatar !== processed.url) {
      deleteFileByUrl(targetUser.avatar);
    }

    return res.status(200).json({
      success: true,
      message: 'Avatar atualizado com sucesso.',
      avatarUrl: processed.url,
      image: processed,
    });
  } catch (error) {
    return handleUploadError(res, error, 'Erro ao fazer upload do avatar.');
  }
});

export default router;