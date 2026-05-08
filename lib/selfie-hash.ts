"use client"

async function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error("Could not load selfie image"))
    el.src = dataUrl
  })
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Could not read selfie image"))
    reader.readAsDataURL(file)
  })
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL("image/jpeg", quality)
}

/**
 * Resize/compress selfie for mobile upload reliability.
 * Returns a JPEG data URL that targets ~0.9MB and max dimension 960px.
 */
export async function optimizeSelfieUpload(
  file: File,
  opts?: { maxDimension?: number; maxBytes?: number }
): Promise<string> {
  const maxDimension = opts?.maxDimension ?? 960
  const maxBytes = opts?.maxBytes ?? 900_000
  const srcDataUrl = await fileToDataUrl(file)
  const img = await dataUrlToImage(srcDataUrl)

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
  let targetW = Math.max(1, Math.round(img.width * scale))
  let targetH = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas not supported")

  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = targetW
    canvas.height = targetH
    ctx.clearRect(0, 0, targetW, targetH)
    ctx.drawImage(img, 0, 0, targetW, targetH)

    const qualities = [0.86, 0.78, 0.7, 0.62]
    for (const quality of qualities) {
      const out = canvasToJpegDataUrl(canvas, quality)
      const approxBytes = Math.ceil((out.length * 3) / 4)
      if (approxBytes <= maxBytes) return out
    }

    targetW = Math.max(320, Math.round(targetW * 0.82))
    targetH = Math.max(320, Math.round(targetH * 0.82))
  }

  canvas.width = targetW
  canvas.height = targetH
  ctx.clearRect(0, 0, targetW, targetH)
  ctx.drawImage(img, 0, 0, targetW, targetH)
  return canvasToJpegDataUrl(canvas, 0.58)
}

export async function imageDataUrlToHash(dataUrl: string): Promise<string> {
  const img = await dataUrlToImage(dataUrl)

  const canvas = document.createElement("canvas")
  canvas.width = 9
  canvas.height = 8
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas not supported")
  ctx.drawImage(img, 0, 0, 9, 8)
  const px = ctx.getImageData(0, 0, 9, 8).data

  let bits = ""
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const idxA = (y * 9 + x) * 4
      const idxB = (y * 9 + (x + 1)) * 4
      const grayA = px[idxA] * 0.299 + px[idxA + 1] * 0.587 + px[idxA + 2] * 0.114
      const grayB = px[idxB] * 0.299 + px[idxB + 1] * 0.587 + px[idxB + 2] * 0.114
      bits += grayA > grayB ? "1" : "0"
    }
  }

  let hex = ""
  for (let i = 0; i < bits.length; i += 4) {
    const chunk = bits.slice(i, i + 4)
    hex += Number.parseInt(chunk, 2).toString(16)
  }
  return hex
}

export function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let dist = Math.abs(a.length - b.length) * 4
  for (let i = 0; i < len; i += 1) {
    const x = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)
    dist += x.toString(2).split("1").length - 1
  }
  return dist
}

export async function validateSelfieQuality(dataUrl: string): Promise<void> {
  const AnyWindow = window as unknown as {
    FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
      detect: (img: CanvasImageSource) => Promise<Array<{ boundingBox: { width: number; height: number } }>>
    }
  }
  if (!AnyWindow.FaceDetector) return

  const img = await dataUrlToImage(dataUrl)
  const detector = new AnyWindow.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
  const faces = await detector.detect(img)
  if (!faces.length) {
    throw new Error("No clear face detected. Keep face visible, no hat/covering.")
  }
  const face = faces[0]
  const faceArea = face.boundingBox.width * face.boundingBox.height
  const imgArea = img.width * img.height
  if (faceArea / imgArea < 0.12) {
    throw new Error("Face is too small. Move closer and keep full face visible.")
  }
}
