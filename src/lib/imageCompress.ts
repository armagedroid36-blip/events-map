// Сжатие изображений на клиенте перед загрузкой в storage.
// Зачем: лимит storage 1 ГБ и трафик 5 ГБ/мес — фото с телефона 5–8 МБ
// быстро их съедят. Canvas-сжатие: большая сторона ≤ 1600px (достаточно
// для экрана), JPEG 0.82 — обычно выходит ≤ ~500 КБ.
// Как пользоваться: const compressed = await compressImage(file);
// затем getApi().uploadPhoto(compressed). Мелкие фото (≤ 500 КБ и ≤ 1600px)
// возвращаются без изменений — качество не страдает.
export async function compressImage(file: File): Promise<File> {
  try {
    const dims = await imageSize(file);
    const small = file.size <= 500 * 1024 && dims.width <= 1600 && dims.height <= 1600;
    if (small) return file;

    // Не увеличиваем мелкие: scale ≤ 1
    const scale = Math.min(1, 1600 / Math.max(dims.width, dims.height));
    const w = Math.max(1, Math.round(dims.width * scale));
    const h = Math.max(1, Math.round(dims.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // Белый фон: PNG с прозрачностью при JPEG-сжатии стал бы чёрным
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const bitmap = await createImageBitmap(file);
    try {
      ctx.drawImage(bitmap, 0, 0, w, h);
    } finally {
      if ('close' in bitmap) bitmap.close();
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) return file;
    // Новое имя: uploadPhoto берёт расширение из имени файла → .jpg
    return new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch {
    // Любая ошибка декодирования/отрисовки — грузим оригинал, не роняем загрузку
    return file;
  }
}

/** Размеры изображения (naturalWidth/Height). Ошибка декодирования → reject */
function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}
