import multer from 'multer';

export const MAX_COVER_SIZE = 5 * 1024 * 1024;

// Kept in memory so the image type can be checked before anything is written to disk
export const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_SIZE, files: 1 },
}).single('cover');
