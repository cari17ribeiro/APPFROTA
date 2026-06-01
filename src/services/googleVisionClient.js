const getAverageConfidence = (response) => {
  const pages = response?.fullTextAnnotation?.pages || [];
  const confidences = [];

  pages.forEach((page) => {
    (page.blocks || []).forEach((block) => {
      if (typeof block.confidence === 'number') confidences.push(block.confidence);
      (block.paragraphs || []).forEach((paragraph) => {
        if (typeof paragraph.confidence === 'number') confidences.push(paragraph.confidence);
        (paragraph.words || []).forEach((word) => {
          if (typeof word.confidence === 'number') confidences.push(word.confidence);
        });
      });
    });
  });

  if (!confidences.length) return 0;
  return confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;
};

export const runGoogleVisionOcr = async (base64Image, apiKey) => {
  if (!apiKey) throw new Error('Google Vision API key não configurada');

  const startedAt = performance.now();
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error('Falha API Vision');

  const data = await response.json();
  const visionResponse = data.responses?.[0] || {};
  const textAnnotations = visionResponse.textAnnotations || [];
  const rawText = textAnnotations[0]?.description || visionResponse.fullTextAnnotation?.text || '';

  return {
    rawText,
    textAnnotations,
    fullTextAnnotation: visionResponse.fullTextAnnotation || null,
    confidence: getAverageConfidence(visionResponse),
    durationMs: Math.round(performance.now() - startedAt),
    provider: 'google_vision',
  };
};
