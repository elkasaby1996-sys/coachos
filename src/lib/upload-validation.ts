export const MEDICAL_DOCUMENT_MAX_FILE_BYTES = 15 * 1024 * 1024;

const MEDICAL_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function validateMedicalDocumentFile(file: File) {
  if (!MEDICAL_DOCUMENT_MIME_TYPES.has(file.type)) {
    throw new Error("Please upload a PDF, JPG, PNG, WebP, HEIC, or HEIF file.");
  }

  if (file.size > MEDICAL_DOCUMENT_MAX_FILE_BYTES) {
    throw new Error("Please upload a document smaller than 15 MB.");
  }
}
