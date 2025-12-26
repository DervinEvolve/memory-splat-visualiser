/**
 * Splat Viewer - Fullscreen modal viewer for Gaussian splats
 *
 * Opens when user clicks a photo card, allows swiping between splats.
 */

import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'

export interface SplatInfo {
  id: string
  photoId: string
  plyUrl: string
}

export default class SplatViewer {
  splats: SplatInfo[] = []
  currentIndex: number = 0
  viewer: any = null
  isOpen: boolean = false
  container: HTMLElement | null = null
  onClose: (() => void) | null = null

  constructor() {
    this.createModal()
  }

  createModal() {
    // Create modal container
    this.container = document.createElement('div')
    this.container.id = 'splat-fullscreen-viewer'
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      background: #ffffff;
      z-index: 1000;
      display: none;
    `

    // Close button
    const closeBtn = document.createElement('button')
    closeBtn.innerHTML = '×'
    closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      width: 44px;
      height: 44px;
      border: none;
      background: rgba(0,0,0,0.1);
      border-radius: 50%;
      font-size: 28px;
      cursor: pointer;
      z-index: 1001;
      color: #333;
      display: flex;
      align-items: center;
      justify-content: center;
    `
    closeBtn.onclick = () => this.close()

    // Navigation buttons
    const prevBtn = document.createElement('button')
    prevBtn.innerHTML = '‹'
    prevBtn.style.cssText = `
      position: absolute;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 50px;
      height: 50px;
      border: none;
      background: rgba(0,0,0,0.1);
      border-radius: 50%;
      font-size: 32px;
      cursor: pointer;
      z-index: 1001;
      color: #333;
    `
    prevBtn.onclick = () => this.prev()

    const nextBtn = document.createElement('button')
    nextBtn.innerHTML = '›'
    nextBtn.style.cssText = `
      position: absolute;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 50px;
      height: 50px;
      border: none;
      background: rgba(0,0,0,0.1);
      border-radius: 50%;
      font-size: 32px;
      cursor: pointer;
      z-index: 1001;
      color: #333;
    `
    nextBtn.onclick = () => this.next()

    // Counter
    const counter = document.createElement('div')
    counter.id = 'splat-counter'
    counter.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      background: rgba(0,0,0,0.1);
      border-radius: 20px;
      font-size: 14px;
      color: #333;
      z-index: 1001;
    `

    this.container.appendChild(closeBtn)
    this.container.appendChild(prevBtn)
    this.container.appendChild(nextBtn)
    this.container.appendChild(counter)
    document.body.appendChild(this.container)

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return
      if (e.key === 'Escape') this.close()
      if (e.key === 'ArrowLeft') this.prev()
      if (e.key === 'ArrowRight') this.next()
    })
  }

  /**
   * Add a splat to the collection
   */
  addSplat(photoId: string, plyUrl: string) {
    this.splats.push({
      id: `splat-${this.splats.length}`,
      photoId,
      plyUrl
    })
    console.log(`[SplatViewer] Added splat for ${photoId}, total: ${this.splats.length}`)
  }

  /**
   * Open viewer at specific index or by photo ID
   */
  async open(indexOrPhotoId: number | string) {
    if (this.splats.length === 0) {
      console.warn('[SplatViewer] No splats to show')
      return
    }

    // Find index
    if (typeof indexOrPhotoId === 'string') {
      const idx = this.splats.findIndex(s => s.photoId === indexOrPhotoId)
      this.currentIndex = idx >= 0 ? idx : 0
    } else {
      this.currentIndex = Math.max(0, Math.min(indexOrPhotoId, this.splats.length - 1))
    }

    this.isOpen = true
    this.container!.style.display = 'block'

    await this.loadCurrentSplat()
    this.updateCounter()
  }

  /**
   * Close viewer
   */
  close() {
    this.isOpen = false
    this.container!.style.display = 'none'

    // Dispose viewer
    if (this.viewer) {
      try {
        this.viewer.dispose()
      } catch (e) {}
      this.viewer = null
    }

    if (this.onClose) this.onClose()
  }

  /**
   * Navigate to previous splat
   */
  async prev() {
    if (this.splats.length <= 1) return
    this.currentIndex = (this.currentIndex - 1 + this.splats.length) % this.splats.length
    await this.loadCurrentSplat()
    this.updateCounter()
  }

  /**
   * Navigate to next splat
   */
  async next() {
    if (this.splats.length <= 1) return
    this.currentIndex = (this.currentIndex + 1) % this.splats.length
    await this.loadCurrentSplat()
    this.updateCounter()
  }

  /**
   * Load the current splat
   */
  async loadCurrentSplat() {
    const splat = this.splats[this.currentIndex]
    if (!splat) return

    // Dispose previous viewer
    if (this.viewer) {
      try {
        this.viewer.dispose()
      } catch (e) {}
      this.viewer = null
    }

    console.log(`[SplatViewer] Loading: ${splat.plyUrl}`)

    // Create new viewer
    this.viewer = new GaussianSplats3D.Viewer({
      selfDrivenMode: true,
      useBuiltInControls: true,
      rootElement: this.container,
      cameraUp: [0, 1, 0],
      initialCameraPosition: [0, 0, 4],
      initialCameraLookAt: [0, 0, 0],
      dynamicScene: false,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
      antialiased: true,
      focalAdjustment: 1.0,
    })

    try {
      await this.viewer.addSplatScene(splat.plyUrl, {
        splatAlphaRemovalThreshold: 5,
        showLoadingUI: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      })
      console.log(`[SplatViewer] Loaded: ${splat.photoId}`)
    } catch (err) {
      console.error(`[SplatViewer] Failed to load:`, err)
    }
  }

  updateCounter() {
    const counter = document.getElementById('splat-counter')
    if (counter) {
      counter.textContent = `${this.currentIndex + 1} / ${this.splats.length}`
    }
  }

  /**
   * Get splat count
   */
  getSplatCount(): number {
    return this.splats.length
  }

  /**
   * Check if a photo has a splat
   */
  hasSplat(photoId: string): boolean {
    return this.splats.some(s => s.photoId === photoId)
  }
}
