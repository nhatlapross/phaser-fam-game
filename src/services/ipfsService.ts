// src/services/ipfsService.ts

interface FilebaseUploadResponse {
  Name: string;
  Hash: string;
  Size: string;
}

export class IPFSService {
  private static FILEBASE_URL = process.env.NEXT_PUBLIC_FILEBASE_URL || '';
  private static FILEBASE_TOKEN = process.env.NEXT_PUBLIC_FILEBASE_TOKEN || '';
  private static GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_FILEBASE || '';

  /**
   * Upload an image file to IPFS via Filebase
   * @param file The image file to upload
   * @returns The IPFS gateway URL of the uploaded image
   */
  static async uploadImage(file: File): Promise<string> {
    if (!this.FILEBASE_URL || !this.FILEBASE_TOKEN) {
      throw new Error('Filebase configuration is missing');
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are allowed');
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('Image size must be less than 5MB');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(this.FILEBASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.FILEBASE_TOKEN}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const data: FilebaseUploadResponse = await response.json();
      
      // Return the full gateway URL
      return `${this.GATEWAY_URL}/${data.Hash}`;
    } catch (error) {
      console.error('Error uploading to IPFS:', error);
      throw error;
    }
  }

  /**
   * Get the full IPFS gateway URL from a hash
   * @param hash The IPFS hash
   * @returns The full gateway URL
   */
  static getGatewayUrl(hash: string): string {
    return `${this.GATEWAY_URL}/${hash}`;
  }
}
