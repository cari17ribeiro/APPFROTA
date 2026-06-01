import { OCR_CONFIG } from '../config/ocrConfig.js';
import {
  buildHeuristicContainerDetections,
  cropImageByDetection,
  generateOcrImageVariations,
  resizeBase64ImageForOcr,
} from '../utils/browserImageOcr.js';
import {
  chooseBestContainerCandidate,
  normalizeBrazilianPlate,
  normalizeVisionText,
} from '../utils/ocrNormalization.js';
import { runGoogleVisionOcr } from './googleVisionClient.js';
import { runRoboflowDetection } from './roboflowClient.js';

const extractFleetNumber = (rawText) => {
  const matches = String(rawText || '').toUpperCase().match(/(?<!\d)\d{3,4}(?!\d)/g);
  return matches?.[0] || '';
};

const normalizeClassName = (className) => String(className || '').toLowerCase().trim();

const runWithConcurrency = async (items, limit, handler) => {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit || 1), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  }));

  return results;
};

const getBoxFromVertices = (text, vertices = []) => {
  const xs = vertices.map((vertex) => vertex.x ?? 0);
  const ys = vertices.map((vertex) => vertex.y ?? 0);
  if (!xs.length || !ys.length) return null;
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    text: String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
};

const getBoxFromAnnotation = (annotation) =>
  getBoxFromVertices(annotation.description, annotation.boundingPoly?.vertices || []);

const getSymbolBoxesFromFullTextAnnotation = (fullTextAnnotation) => {
  const boxes = [];

  (fullTextAnnotation?.pages || []).forEach((page) => {
    (page.blocks || []).forEach((block) => {
      (block.paragraphs || []).forEach((paragraph) => {
        (paragraph.words || []).forEach((word) => {
          (word.symbols || []).forEach((symbol) => {
            const box = getBoxFromVertices(symbol.text, symbol.boundingBox?.vertices || word.boundingBox?.vertices || []);
            if (box?.text) boxes.push(box);
          });
        });
      });
    });
  });

  return boxes;
};

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const clusterBoxes = (boxes, axis, tolerance) => {
  const clusters = [];
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis]);

  sorted.forEach((box) => {
    const cluster = clusters.find((item) => Math.abs(item.center - box[axis]) <= tolerance);
    if (cluster) {
      cluster.items.push(box);
      cluster.center = cluster.items.reduce((sum, item) => sum + item[axis], 0) / cluster.items.length;
    } else {
      clusters.push({ center: box[axis], items: [box] });
    }
  });

  return clusters;
};

const extractColumnTexts = (boxes, kind, toleranceMultiplier = 1.8) => {
  if (!boxes.length) return [];

  const xTolerance = Math.max(12, median(boxes.map((box) => box.width)) * toleranceMultiplier);
  return clusterBoxes(boxes, 'centerX', xTolerance)
    .map((cluster) => ({
      kind,
      text: cluster.items
        .sort((a, b) => a.centerY - b.centerY)
        .map((box) => box.text)
        .join(''),
      size: cluster.items.length,
    }));
};

const extractSpatialTextsFromAnnotations = (textAnnotations = [], fullTextAnnotation = null) => {
  const boxes = textAnnotations
    .slice(1)
    .map(getBoxFromAnnotation)
    .filter(Boolean)
    .filter((box) => box.text && box.text.length <= 12);
  const symbolBoxes = getSymbolBoxesFromFullTextAnnotation(fullTextAnnotation);

  if (!boxes.length && !symbolBoxes.length) return [];

  const yTolerance = Math.max(12, median(boxes.map((box) => box.height)) * 1.4);
  const verticalTexts = [
    ...extractColumnTexts(boxes, 'vision_column', 1.8),
    ...extractColumnTexts(symbolBoxes, 'vision_symbol_column', 2.8),
  ];

  const horizontalTexts = clusterBoxes(boxes, 'centerY', yTolerance)
    .map((cluster) => ({
      kind: 'vision_row',
      text: cluster.items
        .sort((a, b) => a.centerX - b.centerX)
        .map((box) => box.text)
        .join(''),
      size: cluster.items.length,
    }));

  return [...verticalTexts, ...horizontalTexts]
    .filter((item) => item.text.length >= 10)
    .sort((a, b) => b.size - a.size)
    .slice(0, 12);
};

const runVisionAttempt = async ({ base64, transform, detection, crop, config }) => {
  const ocr = await runGoogleVisionOcr(base64, config.googleVisionApiKey);
  const normalized = normalizeVisionText(ocr.rawText);

  return {
    ...ocr,
    ...normalized,
    spatialTexts: extractSpatialTextsFromAnnotations(ocr.textAnnotations, ocr.fullTextAnnotation),
    transform,
    detectionClass: detection?.class || '',
    detectionConfidence: detection?.confidence || 0,
    boundingBox: detection || null,
    cropBox: crop?.box || null,
    requireFreightContainerCategory: config.requireFreightContainerCategory,
  };
};

export const runHybridOcrPipeline = async (base64Image, customConfig = {}) => {
  const pipelineStartedAt = performance.now();
  const config = { ...OCR_CONFIG, ...customConfig };
  const legacyBenchmarkPromise = config.benchmarkLegacyFullImage
    ? runGoogleVisionOcr(base64Image, config.googleVisionApiKey)
      .then((result) => ({ durationMs: result.durationMs, rawTextLength: result.rawText.length }))
      .catch((error) => ({ error: error.message }))
    : null;
  const resizeStartedAt = performance.now();
  const ocrBase64Image = await resizeBase64ImageForOcr(base64Image, config);
  const resizeDurationMs = Math.round(performance.now() - resizeStartedAt);
  const debug = {
    rawOcrTexts: [],
    detections: [],
    crops: [],
    candidates: [],
    errors: [],
  };
  const timing = {
    resizeMs: resizeDurationMs,
    roboflowMs: null,
    fullImageVisionMs: null,
    cropGenerationMs: 0,
    cropVisionMs: 0,
    cropVisionCalls: 0,
    optimizedTotalMs: null,
    legacyFullImageMs: null,
    legacyFullImageError: '',
    originalFallbackMs: null,
    originalFallbackUsed: false,
    originalFallbackError: '',
  };
  const attempts = [];

  let roboflowResult = { detections: [] };
  try {
    roboflowResult = await runRoboflowDetection(ocrBase64Image, config);
    timing.roboflowMs = roboflowResult.durationMs ?? null;
    debug.detections = roboflowResult.detections || [];
    if (roboflowResult.skipped) debug.roboflowSkipped = roboflowResult.reason;
  } catch (error) {
    debug.errors.push({ stage: 'roboflow', message: error.message });
  }

  let fullImageAttempt = null;
  try {
    fullImageAttempt = await runVisionAttempt({
      base64: ocrBase64Image,
      transform: 'full_image',
      config,
    });
    timing.fullImageVisionMs = fullImageAttempt.durationMs;
    attempts.push(fullImageAttempt);
  } catch (error) {
    debug.errors.push({ stage: 'vision_full_image', message: error.message });
  }

  const acceptedContainerClasses = config.containerClasses.map(normalizeClassName);
  let containerDetections = (roboflowResult.detections || []).filter((detection) =>
    acceptedContainerClasses.includes(normalizeClassName(detection.class))
  )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, config.maxContainerDetections || 2);

  if (!containerDetections.length && config.enableHeuristicContainerCrop) {
    try {
      containerDetections = (await buildHeuristicContainerDetections(ocrBase64Image))
        .slice(0, config.maxContainerDetections || 2);
      debug.heuristicContainerCrop = true;
    } catch (error) {
      debug.errors.push({ stage: 'heuristic_crop_detection', message: error.message });
    }
  }

  for (const detection of containerDetections) {
    try {
      const cropStartedAt = performance.now();
      const crop = await cropImageByDetection(ocrBase64Image, detection, config);
      debug.crops.push({
        detectionClass: detection.class,
        box: crop.box,
        image: crop.debugDataUrl,
      });

      const variations = await generateOcrImageVariations(crop.base64, config, detection.class);
      timing.cropGenerationMs += Math.round(performance.now() - cropStartedAt);

      const cropAttempts = await runWithConcurrency(
        variations,
        config.googleVisionConcurrency,
        async (variation) => {
          try {
            const attempt = await runVisionAttempt({
              base64: variation.base64,
              transform: variation.transform,
              detection,
              crop,
              config,
            });
            if (config.saveDebugCrops) {
              debug.crops.push({
                detectionClass: detection.class,
                transform: variation.transform,
                box: crop.box,
                image: variation.debugDataUrl,
              });
            }
            return attempt;
          } catch (error) {
            debug.errors.push({
              stage: 'vision_crop',
              transform: variation.transform,
              detectionClass: detection.class,
              message: error.message,
            });
            return null;
          }
        }
      );
      const validCropAttempts = cropAttempts.filter(Boolean);
      timing.cropVisionCalls += validCropAttempts.length;
      timing.cropVisionMs += validCropAttempts.reduce((sum, attempt) => sum + (attempt.durationMs || 0), 0);
      attempts.push(...validCropAttempts);
    } catch (error) {
      debug.errors.push({ stage: 'crop', detectionClass: detection.class, message: error.message });
    }
  }

  let containerResult = chooseBestContainerCandidate(attempts);
  let originalFallbackAttempt = null;
  if (!containerResult.containerCode && config.enableOriginalFallback) {
    try {
      originalFallbackAttempt = await runVisionAttempt({
        base64: base64Image,
        transform: 'full_image_original_fallback',
        config,
      });
      timing.originalFallbackMs = originalFallbackAttempt.durationMs;
      timing.originalFallbackUsed = true;
      attempts.push(originalFallbackAttempt);
      containerResult = chooseBestContainerCandidate(attempts);
    } catch (error) {
      timing.originalFallbackError = error.message;
      debug.errors.push({ stage: 'vision_original_fallback', message: error.message });
    }
  }
  timing.optimizedTotalMs = Math.round(performance.now() - pipelineStartedAt);
  if (legacyBenchmarkPromise) {
    const legacyBenchmark = await legacyBenchmarkPromise;
    timing.legacyFullImageMs = legacyBenchmark.durationMs ?? null;
    timing.legacyFullImageError = legacyBenchmark.error || '';
  }
  debug.rawOcrTexts = attempts.map((attempt) => ({
    rawText: attempt.rawText,
    normalizedText: attempt.normalizedText,
    spatialTexts: attempt.spatialTexts,
    confidence: attempt.confidence,
    transform: attempt.transform,
    detectionClass: attempt.detectionClass,
    durationMs: attempt.durationMs,
  }));
  debug.candidates = containerResult.alternatives;

  const fullImageText = fullImageAttempt?.rawText || originalFallbackAttempt?.rawText || '';
  const plateResult = normalizeBrazilianPlate(fullImageText);
  const fleetNumber = extractFleetNumber(fullImageText);

  return {
    containerCode: containerResult.containerCode,
    confidence: containerResult.confidence,
    isCheckDigitValid: containerResult.isCheckDigitValid,
    source: containerResult.source,
    transform: containerResult.transform,
    ambiguous: containerResult.ambiguous,
    ambiguityReason: containerResult.ambiguityReason,
    alternatives: containerResult.alternatives,
    timing: config.enableTimingDebug ? timing : null,
    plate: plateResult?.text || '',
    plateConfidence: plateResult ? Math.max(0, Math.min(0.99, plateResult.score / 110)) : 0,
    fleetNumber,
    debug,
  };
};
