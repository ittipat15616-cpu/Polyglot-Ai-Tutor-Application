import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function getFirebaseStorageUrlAsync(localPath: string): Promise<string> {
    // Clean path, remove leading slash if any
    const cleanPath = localPath.startsWith('/') ? localPath.substring(1) : localPath;
    const storageRef = ref(storage, cleanPath);
    try {
      return await getDownloadURL(storageRef);
    } catch (e) {
      console.error('Failed to get download URL for', cleanPath, e);
      // Fallback to the old REST method if SDK fails (e.g., missing object)
      const bucket = "polyglot-ai-tuto.firebasestorage.app";
      const encodedPath = encodeURIComponent(cleanPath);
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&v=20260814_2`;
    }
}

export function getFirebaseStorageUrl(localPath: string): string {
    const bucket = "polyglot-ai-tuto.firebasestorage.app";
    // Clean path, remove leading slash if any
    const cleanPath = localPath.startsWith('/') ? localPath.substring(1) : localPath;
    
    // Encode the entire path so that slashes become %2F, as required by Firebase Storage REST API
    const encodedPath = encodeURIComponent(cleanPath);
    
    // Add a cache buster query parameter to bypass browser cache for recently updated images
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&v=20260814_2`;
}
