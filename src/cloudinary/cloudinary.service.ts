// src/cloudinary/cloudinary.service.ts
import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  /**
   * Upload a single file (from multer memory storage) to Cloudinary.
   * Returns the full Cloudinary response including secure_url and public_id.
   */
  uploadImage(
    file: Express.Multer.File,
    folder = 'hotels/rooms',
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          // Automatically set quality and format for best web performance
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve(result);
        },
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  /**
   * Upload multiple files concurrently.
   * Returns an array of secure_url strings ready to store in the DB.
   */
  async uploadImages(
    files: Express.Multer.File[],
    folder = 'hotels/rooms',
  ): Promise<string[]> {
    const results = await Promise.all(files.map((f) => this.uploadImage(f, folder)));
    return results.map((r) => r.secure_url);
  }

  /**
   * Delete an image from Cloudinary by its public_id.
   */
  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  /**
   * Extract the Cloudinary public_id from a secure_url.
   *
   * Example URL:
   *   https://res.cloudinary.com/mycloud/image/upload/v1234567890/hotels/rooms/abc123.jpg
   * Extracted public_id:
   *   hotels/rooms/abc123
   */
  extractPublicId(secureUrl: string): string {
    // Split on '/upload/' and take everything after it
    const [, afterUpload] = secureUrl.split('/upload/');
    if (!afterUpload) return '';

    // Drop the optional version segment (v1234567890/)
    const withoutVersion = afterUpload.replace(/^v\d+\//, '');

    // Remove file extension (.jpg, .png, .webp, etc.)
    return withoutVersion.replace(/\.[^/.]+$/, '');
  }
}