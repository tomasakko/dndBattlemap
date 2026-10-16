export interface ImageSize {
  width: number;
  height: number;
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function measureImage(url: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = url;
  });
}

/** Reads an uploaded file as a data URL together with its pixel size. Rejects if it isn't an image. */
export async function loadImageFile(file: File): Promise<ImageSize & { url: string }> {
  const url = await readAsDataUrl(file);
  return { url, ...(await measureImage(url)) };
}
