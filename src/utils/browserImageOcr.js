const JPEG_QUALITY = 0.92;

const canvasToBase64 = (canvas) => canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];

export const loadBase64Image = (base64Image) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/jpeg;base64,${base64Image}`;
  });

const drawImageToCanvas = (img, width = img.width, height = img.height) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const cloneCanvas = (source) => {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0);
  return canvas;
};

const rotateCanvas = (source, degrees) => {
  const normalized = ((degrees % 360) + 360) % 360;
  const swapsSize = normalized === 90 || normalized === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swapsSize ? source.height : source.width;
  canvas.height = swapsSize ? source.width : source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
};

const scaleCanvas = (source, factor) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * factor);
  canvas.height = Math.round(source.height * factor);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const processPixels = (source, pixelMapper) => {
  const canvas = cloneCanvas(source);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const [r, g, b] = pixelMapper(data[index], data[index + 1], data[index + 2], index, data);
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const grayscaleCanvas = (source) =>
  processPixels(source, (r, g, b) => {
    const gray = Math.round((r * 0.299) + (g * 0.587) + (b * 0.114));
    return [gray, gray, gray];
  });

const contrastCanvas = (source, contrast = 55) => {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return processPixels(source, (r, g, b) => [
    clamp(factor * (r - 128) + 128),
    clamp(factor * (g - 128) + 128),
    clamp(factor * (b - 128) + 128),
  ]);
};

const thresholdCanvas = (source) =>
  processPixels(grayscaleCanvas(source), (r) => {
    const value = r >= 145 ? 255 : 0;
    return [value, value, value];
  });

const sharpenCanvas = (source) => {
  const canvas = cloneCanvas(source);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const output = ctx.createImageData(canvas.width, canvas.height);
  const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const side = 3;
  const halfSide = 1;
  const { width, height } = canvas;
  const sourceData = imageData.data;
  const outputData = output.data;
  const clamp = (value) => Math.max(0, Math.min(255, value));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dstOff = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;

      for (let cy = 0; cy < side; cy += 1) {
        for (let cx = 0; cx < side; cx += 1) {
          const scy = Math.min(height - 1, Math.max(0, y + cy - halfSide));
          const scx = Math.min(width - 1, Math.max(0, x + cx - halfSide));
          const srcOff = (scy * width + scx) * 4;
          const wt = weights[(cy * side) + cx];
          r += sourceData[srcOff] * wt;
          g += sourceData[srcOff + 1] * wt;
          b += sourceData[srcOff + 2] * wt;
        }
      }

      outputData[dstOff] = clamp(r);
      outputData[dstOff + 1] = clamp(g);
      outputData[dstOff + 2] = clamp(b);
      outputData[dstOff + 3] = sourceData[dstOff + 3];
    }
  }

  ctx.putImageData(output, 0, 0);
  return canvas;
};

export const cropImageByDetection = async (base64Image, detection, config) => {
  const img = await loadBase64Image(base64Image);
  const marginRatio = config.cropMarginRatio ?? 0.18;
  const marginX = detection.width * marginRatio;
  const marginY = detection.height * marginRatio;
  const left = Math.max(0, detection.x - (detection.width / 2) - marginX);
  const top = Math.max(0, detection.y - (detection.height / 2) - marginY);
  const right = Math.min(img.width, detection.x + (detection.width / 2) + marginX);
  const bottom = Math.min(img.height, detection.y + (detection.height / 2) + marginY);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  canvas
    .getContext('2d', { willReadFrequently: true })
    .drawImage(img, left, top, width, height, 0, 0, canvas.width, canvas.height);

  return {
    base64: canvasToBase64(canvas),
    box: { left, top, right, bottom, width, height },
    debugDataUrl: config.saveDebugCrops ? canvas.toDataURL('image/jpeg', JPEG_QUALITY) : null,
  };
};

export const buildHeuristicContainerDetections = async (base64Image) => {
  const img = await loadBase64Image(base64Image);

  return [
    {
      class: 'container_code_vertical_heuristic',
      confidence: 0.25,
      x: img.width * 0.52,
      y: img.height * 0.43,
      width: img.width * 0.34,
      height: img.height * 0.82,
      raw: { source: 'heuristic_center_vertical_band' },
    },
    {
      class: 'container_code_vertical_heuristic',
      confidence: 0.24,
      x: img.width * 0.43,
      y: img.height * 0.43,
      width: img.width * 0.18,
      height: img.height * 0.82,
      raw: { source: 'heuristic_narrow_left_vertical_band' },
    },
    {
      class: 'container_code_vertical_heuristic',
      confidence: 0.23,
      x: img.width * 0.58,
      y: img.height * 0.43,
      width: img.width * 0.22,
      height: img.height * 0.82,
      raw: { source: 'heuristic_narrow_center_vertical_band' },
    },
    {
      class: 'container_code_heuristic',
      confidence: 0.22,
      x: img.width * 0.58,
      y: img.height * 0.28,
      width: img.width * 0.52,
      height: img.height * 0.28,
      raw: { source: 'heuristic_upper_horizontal_band' },
    },
    {
      class: 'container_code_heuristic',
      confidence: 0.21,
      x: img.width * 0.58,
      y: img.height * 0.48,
      width: img.width * 0.52,
      height: img.height * 0.28,
      raw: { source: 'heuristic_middle_horizontal_band' },
    },
  ];
};

export const generateOcrImageVariations = async (base64Image, config = {}, detectionClass = '') => {
  const img = await loadBase64Image(base64Image);
  const baseCanvas = drawImageToCanvas(img);
  const variations = [{ transform: 'original', canvas: baseCanvas }];
  const preferVertical = detectionClass.includes('vertical');

  if (config.enableRotations !== false) {
    const rotated90 = rotateCanvas(baseCanvas, 90);
    const rotatedMinus90 = rotateCanvas(baseCanvas, -90);
    variations.push(
      { transform: 'rotate_90', canvas: rotated90 },
      { transform: 'rotate_-90', canvas: rotatedMinus90 },
      { transform: 'rotate_180', canvas: rotateCanvas(baseCanvas, 180) }
    );

    if (config.enableContrast !== false) {
      variations.push(
        { transform: 'rotate_90_contrast', canvas: contrastCanvas(rotated90) },
        { transform: 'rotate_-90_contrast', canvas: contrastCanvas(rotatedMinus90) }
      );
    }
  }

  variations.push({ transform: 'scale_2x', canvas: scaleCanvas(baseCanvas, 2) });

  if (config.enableContrast !== false) variations.push({ transform: 'contrast', canvas: contrastCanvas(baseCanvas) });
  variations.push({ transform: 'grayscale', canvas: grayscaleCanvas(baseCanvas) });
  if (config.enableThreshold !== false) variations.push({ transform: 'threshold', canvas: thresholdCanvas(baseCanvas) });
  if (config.enableSharpen !== false) variations.push({ transform: 'sharpen', canvas: sharpenCanvas(baseCanvas) });

  const ordered = preferVertical
    ? variations.sort((a, b) => Number(b.transform.includes('rotate')) - Number(a.transform.includes('rotate')))
    : variations;

  return ordered.slice(0, config.maxOcrVariationsPerDetection || 8).map((variation) => ({
    transform: variation.transform,
    base64: canvasToBase64(variation.canvas),
    debugDataUrl: config.saveDebugCrops ? variation.canvas.toDataURL('image/jpeg', JPEG_QUALITY) : null,
  }));
};
