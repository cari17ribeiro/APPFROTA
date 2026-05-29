import { OCR_CONFIG } from '../config/ocrConfig.js';
import {
  buildHeuristicContainerDetections,
  cropImageByDetection,
  generateOcrImageVariations,
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

const getBoxFromAnnotation = (annotation) => {
  const vertices = annotation.boundingPoly?.vertices || [];
  const xs = vertices.map((vertex) => vertex.x ?? 0);
  const ys = vertices.map((vertex) => vertex.y ?? 0);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    text: String(annotation.description || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
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

const extractSpatialTextsFromAnnotations = (textAnnotations = []) => {
  const boxes = textAnnotations
    .slice(1)
    .map(getBoxFromAnnotation)
    .filter((box) => box.text && box.text.length <= 12);

  if (!boxes.length) return [];

  const xTolerance = Math.max(12, median(boxes.map((box) => box.width)) * 1.8);
  const yTolerance = Math.max(12, median(boxes.map((box) => box.height)) * 1.4);
  const verticalTexts = clusterBoxes(boxes, 'centerX', xTolerance)
    .map((cluster) => ({
      kind: 'vision_column',
      text: cluster.items
        .sort((a, b) => a.centerY - b.centerY)
        .map((box) => box.text)
        .join(''),
      size: cluster.items.length,
    }));

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
    spatialTexts: extractSpatialTextsFromAnnotations(ocr.textAnnotations),
    transform,
    detectionClass: detection?.class || '',
    detectionConfidence: detection?.confidence || 0,
    boundingBox: detection || null,
    cropBox: crop?.box || null,
    requireFreightContainerCategory: config.requireFreightContainerCategory,
  };
};

export const runHybridOcrPipeline = async (base64Image, customConfig = {}) => {
  const config = { ...OCR_CONFIG, ...customConfig };
  const debug = {
    rawOcrTexts: [],
    detections: [],
    crops: [],
    candidates: [],
    errors: [],
  };
  const attempts = [];

  let roboflowResult = { detections: [] };
  try {
    roboflowResult = await runRoboflowDetection(base64Image, config);
    debug.detections = roboflowResult.detections || [];
    if (roboflowResult.skipped) debug.roboflowSkipped = roboflowResult.reason;
  } catch (error) {
    debug.errors.push({ stage: 'roboflow', message: error.message });
  }

  let fullImageAttempt = null;
  try {
    fullImageAttempt = await runVisionAttempt({
      base64: base64Image,
      transform: 'full_image',
      config,
    });
    attempts.push(fullImageAttempt);
  } catch (error) {
    debug.errors.push({ stage: 'vision_full_image', message: error.message });
  }

  let containerDetections = (roboflowResult.detections || []).filter((detection) =>
    config.containerClasses.includes(detection.class)
  )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, config.maxContainerDetections || 2);

  if (!containerDetections.length && config.enableHeuristicContainerCrop) {
    try {
      containerDetections = (await buildHeuristicContainerDetections(base64Image))
        .slice(0, config.maxContainerDetections || 2);
      debug.heuristicContainerCrop = true;
    } catch (error) {
      debug.errors.push({ stage: 'heuristic_crop_detection', message: error.message });
    }
  }

  for (const detection of containerDetections) {
    try {
      const crop = await cropImageByDetection(base64Image, detection, config);
      debug.crops.push({
        detectionClass: detection.class,
        box: crop.box,
        image: crop.debugDataUrl,
      });

      const variations = await generateOcrImageVariations(crop.base64, config, detection.class);

      for (const variation of variations) {
        try {
          const attempt = await runVisionAttempt({
            base64: variation.base64,
            transform: variation.transform,
            detection,
            crop,
            config,
          });
          attempts.push(attempt);
          if (config.saveDebugCrops) {
            debug.crops.push({
              detectionClass: detection.class,
              transform: variation.transform,
              box: crop.box,
              image: variation.debugDataUrl,
            });
          }
        } catch (error) {
          debug.errors.push({
            stage: 'vision_crop',
            transform: variation.transform,
            detectionClass: detection.class,
            message: error.message,
          });
        }
      }
    } catch (error) {
      debug.errors.push({ stage: 'crop', detectionClass: detection.class, message: error.message });
    }
  }

  const containerResult = chooseBestContainerCandidate(attempts);
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

  const plateResult = normalizeBrazilianPlate(fullImageAttempt?.rawText || '');
  const fleetNumber = extractFleetNumber(fullImageAttempt?.rawText || '');

  return {
    containerCode: containerResult.containerCode,
    confidence: containerResult.confidence,
    isCheckDigitValid: containerResult.isCheckDigitValid,
    source: containerResult.source,
    transform: containerResult.transform,
    ambiguous: containerResult.ambiguous,
    ambiguityReason: containerResult.ambiguityReason,
    alternatives: containerResult.alternatives,
    plate: plateResult?.text || '',
    plateConfidence: plateResult ? Math.max(0, Math.min(0.99, plateResult.score / 110)) : 0,
    fleetNumber,
    debug,
  };
};
