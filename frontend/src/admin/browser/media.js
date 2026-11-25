/**
 * Browser image preparation shared by menu and event uploads.
 * The encoded-data budget is intentional: images are sent in the existing JSON API payload.
 */

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read image."));
    image.src = src;
  });
}

export async function compressMenuImage(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const maxDataUrlLength = 420_000;
  const attempts = [
    [900, 0.68],
    [760, 0.62],
    [620, 0.56],
    [520, 0.5],
  ];

  let bestResult = "";

  for (const [maxSide, quality] of attempts) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);

    const result = canvas.toDataURL("image/jpeg", quality);
    bestResult = result;

    if (result.length <= maxDataUrlLength) {
      return result;
    }
  }

  if (bestResult.length <= maxDataUrlLength) {
    return bestResult;
  }

  throw new Error("Image is too large. Please choose a smaller photo.");
}

export async function compressEventImage(file) {
  return compressMenuImage(file);
}

