import { cp, mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const target = new URL('../client/public/face/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(
  new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),
  new URL('wasm/', target),
  { recursive: true },
);
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const modelPath = new URL('blaze_face_short_range.tflite', target);
let data;
const expectedHash =
  'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f';
const valid = (bytes) =>
  bytes.length >= 100000 &&
  bytes.length <= 2000000 &&
  createHash('sha256').update(bytes).digest('hex') === expectedHash;
try {
  const cached = await readFile(modelPath);
  if (valid(cached)) data = cached;
} catch {
  /* First local setup. */
}
if (!data) {
  const response = await fetch(modelUrl, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Face model download failed');
  data = Buffer.from(await response.arrayBuffer());
  if (!valid(data)) throw new Error('Face model integrity check failed');
  const temporary = new URL('blaze_face_short_range.download', target);
  await writeFile(temporary, data);
  await rename(temporary, modelPath);
}
if (data.length < 100000 || data.length > 2000000)
  throw new Error('Unexpected model size');
const sha256 = createHash('sha256').update(data).digest('hex');
if (sha256 !== expectedHash) throw new Error('Face model checksum mismatch');
await writeFile(
  new URL('manifest.json', target),
  JSON.stringify(
    {
      modelUrl,
      sha256,
      packageVersion: JSON.parse(
        await readFile(
          new URL(
            '../node_modules/@mediapipe/tasks-vision/package.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ).version,
    },
    null,
    2,
  ),
);
console.info(`Local face assets prepared; model SHA-256 ${sha256}`);
