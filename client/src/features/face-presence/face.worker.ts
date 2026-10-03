import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { framePresence } from './policy';

let detector: FaceDetector | null = null;
type Input =
  | { type: 'init'; baseUrl: string }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number };
self.onmessage = async (event: MessageEvent<Input>) => {
  const data = event.data;
  try {
    if (data.type === 'init') {
      const vision = await FilesetResolver.forVisionTasks(
        `${data.baseUrl}/face/wasm`,
        true,
      );
      detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${data.baseUrl}/face/blaze_face_short_range.tflite`,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
      self.postMessage({ type: 'ready' });
    } else {
      try {
        if (!detector) throw new Error('Not ready');
        const result = detector.detectForVideo(data.bitmap, data.timestamp);
        // Only presence booleans leave the worker. No landmarks/images persist.
        self.postMessage({
          type: 'result',
          ...framePresence(result.detections.length),
        });
      } finally {
        data.bitmap.close();
      }
    }
  } catch {
    self.postMessage({ type: 'error' });
  }
};
