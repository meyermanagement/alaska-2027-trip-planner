/**
 * What the app is willing to keep for a family, and what it isn't.
 *
 * The bucket the file lands in already refuses anything outside this list, but
 * the client checks first so the picker can say why in words rather than by
 * failing after the upload has already started.
 */
export const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
]);

// Twenty-five megabytes: enough for a two-page PDF passport scan or a photo
// straight off a phone, small enough that a family member on hotel wifi still
// has a chance. Matches the bucket's own file_size_limit.
export const MAX_BYTES = 25 * 1024 * 1024;

export const ACCEPT_ATTR =
  "image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf";

export function extForMime(mime) {
  const lower = (mime || "").toLowerCase();
  if (lower.includes("jpeg")) return "jpg";
  if (lower.includes("png")) return "png";
  if (lower.includes("heic")) return "heic";
  if (lower.includes("heif")) return "heif";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("pdf")) return "pdf";
  return "bin";
}

export function humanBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMime(mime) {
  return (mime || "").toLowerCase().startsWith("image/");
}

export function isPdfMime(mime) {
  return (mime || "").toLowerCase() === "application/pdf";
}

/**
 * Say what will happen before it happens. Returns an error string when the file
 * is too big or the wrong kind, and null when it is fine to upload.
 */
export function refuseFile(file) {
  if (!file) return "Nothing chosen yet.";
  if (!ACCEPTED_MIME.has(file.type)) {
    return "That is not a kind the app keeps. Try a photo or a PDF.";
  }
  if (file.size > MAX_BYTES) {
    return "That file is over 25 MB. Try a smaller scan or a PDF.";
  }
  return null;
}
