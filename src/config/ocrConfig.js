const env = import.meta.env || {};

const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanFromEnv = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const listFromEnv = (value, fallback) => {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const OCR_CONFIG = {
  googleVisionApiKey: env.VITE_GOOGLE_VISION_API_KEY || '',
  roboflowApiKey: env.VITE_ROBOFLOW_API_KEY || '',
  roboflowModel: env.VITE_ROBOFLOW_MODEL || '',
  roboflowVersion: env.VITE_ROBOFLOW_VERSION || '',
  cropMarginRatio: numberFromEnv(env.VITE_OCR_CROP_MARGIN_RATIO, 0.18),
  minDetectionConfidence: numberFromEnv(env.VITE_OCR_MIN_DETECTION_CONFIDENCE, 0.2),
  maxContainerDetections: numberFromEnv(env.VITE_OCR_MAX_CONTAINER_DETECTIONS, 5),
  maxOcrVariationsPerDetection: numberFromEnv(env.VITE_OCR_MAX_VARIATIONS, 8),
  enableHeuristicContainerCrop: booleanFromEnv(env.VITE_OCR_ENABLE_HEURISTIC_CONTAINER_CROP, true),
  requireFreightContainerCategory: booleanFromEnv(env.VITE_OCR_REQUIRE_CONTAINER_U, true),
  enableRotations: booleanFromEnv(env.VITE_OCR_ENABLE_ROTATIONS, true),
  enableThreshold: booleanFromEnv(env.VITE_OCR_ENABLE_THRESHOLD, true),
  enableContrast: booleanFromEnv(env.VITE_OCR_ENABLE_CONTRAST, true),
  enableSharpen: booleanFromEnv(env.VITE_OCR_ENABLE_SHARPEN, true),
  enableDebug: booleanFromEnv(env.VITE_OCR_DEBUG, false),
  saveDebugCrops: booleanFromEnv(env.VITE_OCR_SAVE_DEBUG_CROPS, false),
  containerClasses: listFromEnv(env.VITE_ROBOFLOW_CONTAINER_CLASSES, [
    'container_code',
    'container_code_vertical',
    'container',
    'container-code',
    'codigo_container',
    'codigo-container',
    'cod_container',
  ]),
  plateClasses: ['truck_plate'],
};
