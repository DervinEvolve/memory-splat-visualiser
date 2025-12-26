/**
 * Photo Service - Load and manage user photos with album support
 *
 * Handles file uploads, organizes by albums for performance,
 * stores in IndexedDB for persistence, and tracks splat generation status.
 */

export interface Photo {
  id: string
  name: string
  blob: Blob
  url: string
  timestamp: number
  albumId: string
  splatUrl?: string
  splatStatus?: 'pending' | 'processing' | 'ready' | 'failed'
}

export interface Album {
  id: string
  name: string
  photoCount: number
  coverUrl?: string
  createdAt: number
}

// In-memory stores
const photos: Photo[] = []
const albums: Album[] = []
let currentAlbumId: string | null = null
let onPhotosChangedCallback: ((photos: Photo[]) => void) | null = null
let onAlbumsChangedCallback: ((albums: Album[]) => void) | null = null

// IndexedDB
const DB_NAME = 'memory-splat-db'
const DB_VERSION = 2
const PHOTOS_STORE = 'photos'
const ALBUMS_STORE = 'albums'

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        const store = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' })
        store.createIndex('albumId', 'albumId', { unique: false })
      }
      if (!db.objectStoreNames.contains(ALBUMS_STORE)) {
        db.createObjectStore(ALBUMS_STORE, { keyPath: 'id' })
      }
    }
  })
}

async function savePhotoToDB(photo: Photo): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS_STORE, 'readwrite')
    const store = tx.objectStore(PHOTOS_STORE)

    const photoData = {
      id: photo.id,
      name: photo.name,
      blob: photo.blob,
      timestamp: photo.timestamp,
      albumId: photo.albumId,
      splatUrl: photo.splatUrl,
      splatStatus: photo.splatStatus,
    }

    const request = store.put(photoData)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function saveAlbumToDB(album: Album): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUMS_STORE, 'readwrite')
    const store = tx.objectStore(ALBUMS_STORE)
    const request = store.put(album)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function loadPhotosFromDB(albumId?: string): Promise<Photo[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS_STORE, 'readonly')
    const store = tx.objectStore(PHOTOS_STORE)

    let request: IDBRequest

    if (albumId) {
      const index = store.index('albumId')
      request = index.getAll(albumId)
    } else {
      request = store.getAll()
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const storedPhotos = request.result.map((data: any) => ({
        ...data,
        url: URL.createObjectURL(data.blob),
      }))
      resolve(storedPhotos)
    }
  })
}

async function loadAlbumsFromDB(): Promise<Album[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUMS_STORE, 'readonly')
    const store = tx.objectStore(ALBUMS_STORE)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * Initialize the photo service
 */
export async function initPhotoService(): Promise<{ photos: Photo[]; albums: Album[] }> {
  const storedAlbums = await loadAlbumsFromDB()
  albums.length = 0
  albums.push(...storedAlbums)

  // Create default album if none exist
  if (albums.length === 0) {
    const defaultAlbum: Album = {
      id: 'default',
      name: 'All Memories',
      photoCount: 0,
      createdAt: Date.now(),
    }
    albums.push(defaultAlbum)
    await saveAlbumToDB(defaultAlbum)
  }

  // Load photos from first album
  currentAlbumId = albums[0].id
  const storedPhotos = await loadPhotosFromDB(currentAlbumId)
  photos.length = 0
  photos.push(...storedPhotos)

  return { photos, albums }
}

/**
 * Create a new album
 */
export async function createAlbum(name: string): Promise<Album> {
  const album: Album = {
    id: `album-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    photoCount: 0,
    createdAt: Date.now(),
  }

  albums.push(album)
  await saveAlbumToDB(album)

  if (onAlbumsChangedCallback) {
    onAlbumsChangedCallback([...albums])
  }

  return album
}

/**
 * Switch to a different album
 */
export async function switchAlbum(albumId: string): Promise<Photo[]> {
  currentAlbumId = albumId
  const storedPhotos = await loadPhotosFromDB(albumId)

  photos.length = 0
  photos.push(...storedPhotos)

  if (onPhotosChangedCallback) {
    onPhotosChangedCallback([...photos])
  }

  return photos
}

/**
 * Add photos from file input
 */
export async function addPhotosFromFiles(
  files: FileList,
  albumId?: string
): Promise<Photo[]> {
  const targetAlbumId = albumId || currentAlbumId || 'default'
  const newPhotos: Photo[] = []

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue

    const photo: Photo = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name,
      blob: file,
      url: URL.createObjectURL(file),
      timestamp: Date.now(),
      albumId: targetAlbumId,
      splatStatus: 'pending',
    }

    photos.push(photo)
    newPhotos.push(photo)
    await savePhotoToDB(photo)
  }

  // Update album photo count
  const album = albums.find(a => a.id === targetAlbumId)
  if (album) {
    album.photoCount += newPhotos.length
    if (!album.coverUrl && newPhotos.length > 0) {
      album.coverUrl = newPhotos[0].url
    }
    await saveAlbumToDB(album)
  }

  if (onPhotosChangedCallback) {
    onPhotosChangedCallback([...photos])
  }

  return newPhotos
}

/**
 * Get all photos in current album
 */
export function getPhotos(): Photo[] {
  return [...photos]
}

/**
 * Get photo URLs for visualization
 */
export function getPhotoUrls(): string[] {
  return photos.map(p => p.url)
}

/**
 * Get all albums
 */
export function getAlbums(): Album[] {
  return [...albums]
}

/**
 * Get current album ID
 */
export function getCurrentAlbumId(): string | null {
  return currentAlbumId
}

/**
 * Update a photo's splat status
 */
export async function updatePhotoSplatStatus(
  photoId: string,
  status: Photo['splatStatus'],
  splatUrl?: string
): Promise<void> {
  const photo = photos.find(p => p.id === photoId)
  if (!photo) return

  photo.splatStatus = status
  if (splatUrl) {
    photo.splatUrl = splatUrl
  }

  await savePhotoToDB(photo)

  if (onPhotosChangedCallback) {
    onPhotosChangedCallback([...photos])
  }
}

/**
 * Get photo by ID
 */
export function getPhotoById(photoId: string): Photo | undefined {
  return photos.find(p => p.id === photoId)
}

/**
 * Subscribe to photo changes
 */
export function onPhotosChanged(callback: (photos: Photo[]) => void): void {
  onPhotosChangedCallback = callback
}

/**
 * Subscribe to album changes
 */
export function onAlbumsChanged(callback: (albums: Album[]) => void): void {
  onAlbumsChangedCallback = callback
}

/**
 * Get demo photos for initial state
 */
export function getDemoPhotoUrls(): string[] {
  return new Array(30).fill(0).map((_, i) => `/covers/image_${i}.jpg`)
}
