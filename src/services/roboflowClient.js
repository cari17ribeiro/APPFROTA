export const normalizeRoboflowDetections = (predictions = []) =>
  predictions
    .map((prediction) => ({
      class: prediction.class,
      confidence: Number(prediction.confidence || 0),
      x: Number(prediction.x),
      y: Number(prediction.y),
      width: Number(prediction.width),
      height: Number(prediction.height),
      raw: prediction,
    }))
    .filter((prediction) =>
      prediction.class &&
      Number.isFinite(prediction.x) &&
      Number.isFinite(prediction.y) &&
      Number.isFinite(prediction.width) &&
      Number.isFinite(prediction.height)
    );

export const runRoboflowDetection = async (base64Image, config) => {
  if (!config.roboflowApiKey || !config.roboflowModel || !config.roboflowVersion) {
    return { detections: [], skipped: true, reason: 'roboflow_not_configured' };
  }

  const startedAt = performance.now();
  const endpoint = `https://detect.roboflow.com/${config.roboflowModel}/${config.roboflowVersion}?api_key=${config.roboflowApiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: base64Image,
  });

  if (!response.ok) throw new Error('Falha API Roboflow');

  const data = await response.json();
  return {
    detections: normalizeRoboflowDetections(data.predictions || []).filter(
      (detection) => detection.confidence >= config.minDetectionConfidence
    ),
    raw: data,
    durationMs: Math.round(performance.now() - startedAt),
  };
};
