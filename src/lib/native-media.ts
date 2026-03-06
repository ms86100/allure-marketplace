import { Capacitor } from '@capacitor/core';

/**
 * Pick a photo from the gallery using native Camera plugin on iOS/Android.
 * Returns a Blob ready for upload.
 * On web, returns null so callers can fall back to <input type="file">.
 */
export async function pickImageFromGallery(): Promise<Blob | null> {
  if (!Capacitor.isNativePlatform()) return null;

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

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Prompt,
    resultType: CameraResultType.Uri,
    quality: 85,
  });

  if (!photo.webPath) throw new Error('No image selected');
  const response = await fetch(photo.webPath);
  return response.blob();
}
