import fs from 'node:fs/promises';
import path from 'node:path';
import { badRequest } from '../../utils/http-error.js';
import { slugify } from '../../utils/slug.js';

// Uploaded covers go to pictures/uploads/. The original covers in pictures/ are never deleted.
const UPLOADS = 'uploads';

/** Detects the image type from its first bytes instead of trusting the client's MIME type. */
export function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function createCoversService({ booksService, config }) {
  const uploadsDir = path.join(config.picturesDir, UPLOADS);

  async function removeUploadedFile(fileName) {
    await fs.rm(path.join(uploadsDir, path.basename(fileName)), { force: true });
  }

  /** Deletes an uploaded cover once no book references it any more. */
  async function removeIfUnused(coverPath) {
    if (!coverPath?.startsWith(`pictures/${UPLOADS}/`)) return;
    if (booksService.isCoverInUse(coverPath)) return;
    await removeUploadedFile(coverPath);
  }

  /** Saves `file` (from multer) as the book's new cover and returns the updated book. */
  async function replaceCover(bookId, file) {
    if (!file) throw badRequest('COVER_REQUIRED', 'Attach an image in the "cover" form field');
    const extension = detectImageType(file.buffer);
    if (!extension) {
      throw badRequest('INVALID_IMAGE', 'The cover must be a JPEG, PNG or WebP image');
    }

    const book = booksService.getById(bookId);
    // A new name on every upload, so browsers never show a cached old cover
    const fileName = `${slugify(book.title)}-${bookId}-${Date.now().toString(36)}.${extension}`;
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, fileName), file.buffer, { flag: 'wx' });

    let previous;
    try {
      previous = booksService.setCoverPath(bookId, `pictures/${UPLOADS}/${fileName}`);
    } catch (err) {
      await removeUploadedFile(fileName);
      throw err;
    }
    await removeIfUnused(previous);
    return booksService.getById(bookId);
  }

  return { replaceCover, removeIfUnused };
}
