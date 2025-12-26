/**
 * Sharp Service - Image to Gaussian Splat conversion
 *
 * Calls the Sharp API endpoints (Vercel serverless functions) to convert
 * images into 3D Gaussian splats via Modal GPU inference.
 */

export interface SharpOptions {
  quality?: 'fast' | 'high'
}

export interface SharpResult {
  plyUrl: string
  filename: string
  sizeBytes: number
}

// Track active generations
const activeGenerations = new Map<
  string,
  {
    requestId: string
    imageUrl: string
    startTime: number
    photoId?: string
  }
>()

export const sharpService = {
  /**
   * Submit an image URL for Gaussian splat generation
   */
  async submit(imageUrl: string): Promise<string> {
    const response = await fetch('/api/sharp/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Sharp submit failed: ${text}`)
    }

    const json = await response.json()
    const requestId = json.request_id as string

    activeGenerations.set(requestId, {
      requestId,
      imageUrl,
      startTime: Date.now(),
    })

    console.log('[sharpService] Submitted:', requestId)
    return requestId
  },

  /**
   * Submit a file blob directly
   */
  async submitBlob(blob: Blob, filename: string): Promise<string> {
    const formData = new FormData()
    formData.append('file', blob, filename)

    const response = await fetch('/api/sharp/submit-file', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Sharp submit failed: ${text}`)
    }

    const json = await response.json()
    const requestId = json.request_id as string

    activeGenerations.set(requestId, {
      requestId,
      imageUrl: `blob:${filename}`,
      startTime: Date.now(),
    })

    console.log('[sharpService] Submitted blob:', requestId)
    return requestId
  },

  /**
   * Set photo ID for tracking
   */
  setPhotoId(requestId: string, photoId: string): void {
    const gen = activeGenerations.get(requestId)
    if (gen) gen.photoId = photoId
  },

  /**
   * Get photo ID
   */
  getPhotoId(requestId: string): string | undefined {
    return activeGenerations.get(requestId)?.photoId
  },

  /**
   * Wait for generation to complete
   */
  async waitForResult(
    requestId: string,
    timeoutMs = 3 * 60 * 1000,
    onProgress?: (msg: string) => void
  ): Promise<SharpResult> {
    const start = Date.now()
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    let attempt = 0

    while (Date.now() - start < timeoutMs) {
      attempt++
      const elapsed = Math.round((Date.now() - start) / 1000)

      try {
        const statusRes = await fetch(
          `/api/sharp/status?request_id=${encodeURIComponent(requestId)}`,
          { cache: 'no-store' }
        )

        if (statusRes.ok) {
          const status = await statusRes.json()

          if (onProgress) {
            if (status.status === 'pending' || status.status === 'processing') {
              onProgress(`Generating splat... (${elapsed}s)`)
            }
          }

          if (status.status === 'completed') {
            const resultRes = await fetch(
              `/api/sharp/result?request_id=${encodeURIComponent(requestId)}`
            )

            if (!resultRes.ok) {
              throw new Error('Failed to get result')
            }

            const result = await resultRes.json()
            activeGenerations.delete(requestId)

            return {
              plyUrl: result.ply_url,
              filename: result.filename,
              sizeBytes: result.size_bytes,
            }
          }

          if (status.status === 'failed') {
            activeGenerations.delete(requestId)
            throw new Error(status.error || 'Generation failed')
          }
        }
      } catch (err) {
        console.warn(`[sharpService] Poll ${attempt} failed, retrying...`)
      }

      const backoff = Math.min(5000, 1000 + attempt * 200)
      await sleep(backoff)
    }

    throw new Error('sharp_timeout')
  },

  /**
   * Generate splat from image URL
   */
  async generateSplat(
    imageUrl: string,
    onProgress?: (msg: string) => void
  ): Promise<SharpResult> {
    const requestId = await this.submit(imageUrl)
    return this.waitForResult(requestId, 3 * 60 * 1000, onProgress)
  },

  /**
   * Generate splat from blob
   */
  async generateSplatFromBlob(
    blob: Blob,
    filename: string,
    onProgress?: (msg: string) => void
  ): Promise<SharpResult> {
    const requestId = await this.submitBlob(blob, filename)
    return this.waitForResult(requestId, 3 * 60 * 1000, onProgress)
  },

  /**
   * Get active generation IDs
   */
  getActiveGenerations(): string[] {
    return Array.from(activeGenerations.keys())
  },

  /**
   * Clean up stale generations
   */
  cleanupStale(): void {
    const now = Date.now()
    const staleThreshold = 5 * 60 * 1000

    for (const [requestId, gen] of activeGenerations.entries()) {
      if (now - gen.startTime > staleThreshold) {
        activeGenerations.delete(requestId)
      }
    }
  },
}
