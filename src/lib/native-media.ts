import { Capacitor } from '@capacitor/core';

/**
 * Ensure camera and photo library permissions are granted.
 * Must be called before any Camera.getPhoto() call.
 */
async function ensureCameraPermissions(source: 'camera' | 'photos' | 'prompt'): Promise<void> {
  const { Camera } = await import('@capacitor/camera');
  const status = await Camera.checkPermissions();

  const needsCamera = source === 'camera' || source === 'prompt';
  const needsPhotos = source === 'photos' || source === 'prompt';

  const cameraGranted = status.camera === 'granted';
  const photosGranted = status.photos === 'granted' || status.photos === 'limited';

  if ((needsCamera && !cameraGranted) || (needsPhotos && !photosGranted)) {
    const requested = await Camera.requestPermissions({
      permissions: [
        ...(needsCamera && !cameraGranted ? ['camera' as const] : []),
        ...(needsPhotos && !photosGranted ? ['photos' as const] : []),
      ],
    });

    if (needsCamera && requested.camera === 'denied') {
      throw new Error('Camera permission denied. Please enable it in your device Settings.');
    }
    // On iOS 14+, 'limited' is a valid granted state for photos
    if (needsPhotos && requested.photos === 'denied') {
      throw new Error('Photo library permission denied. Please enable it in your device Settings.');
    }
  }
}

/**
 * Pick a photo from the gallery using native Camera plugin on iOS/Android.
 * Returns a Blob ready for upload.
 * On web, returns null so callers can fall back to <input type="file">.
 */
export async function pickImageFromGallery(): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) return null;

  await ensureCameraPermissions('photos');
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Photos,
    resultType: CameraResultType.Uri,
    quality: 85,
  });

  if (!photo.webPath) throw new Error('No image selected');
  const response = await fetch(photo.webPath);
  return response.blob();
}

/**
 * Capture a photo using the native camera on iOS/Android.
 * Returns a Blob ready for upload.
 * On web, returns null so callers can fall back to getUserMedia.
 */
export async function capturePhotoFromCamera(): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) return null;

  await ensureCameraPermissions('camera');
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 85,
    width: 640,
    height: 480,
  });

  if (!photo.webPath) throw new Error('No photo captured');
  const response = await fetch(photo.webPath);
  return response.blob();
}

/**
 * Prompt user to choose camera or gallery (native only).
 * Returns a Blob or null (web fallback).
 */
export async function pickOrCaptureImage(): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) return null;

  await ensureCameraPermissions('prompt');
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  // Use DataUrl as fallback — Uri can fail on some iOS versions when
  // the user selects from the gallery via the prompt action sheet.
  const photo = await Camera.getPhoto({
    source: CameraSource.Prompt,
    resultType: CameraResultType.DataUrl,
    quality: 85,
  });

  if (photo.dataUrl) {
    const response = await fetch(photo.dataUrl);
    return response.blob();
  }

  // Fallback for webPath (shouldn't happen with DataUrl but just in case)
  if (photo.webPath) {
    const response = await fetch(photo.webPath);
    return response.blob();
  }

  throw new Error('No image selected');
}
