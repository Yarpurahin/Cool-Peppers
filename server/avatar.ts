import { z } from 'zod';

// Restrict uploads to small raster images. SVG and external URLs are not accepted.
export const avatarSchema = z
  .object({
    avatar: z
      .string()
      .max(700000)
      .refine((value) => {
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
        if (!match || match[2].length % 4 !== 0) return false;
        const bytes = Buffer.from(match[2], 'base64');
        if (bytes.length < 16 || bytes.length > 512 * 1024 || bytes.toString('base64') !== match[2])
          return false;
        if (match[1] === 'png')
          return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if (match[1] === 'jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        return (
          bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        );
      }, 'Выберите изображение PNG, JPEG или WebP размером до 512 КБ')
      .nullable(),
  })
  .strict();
