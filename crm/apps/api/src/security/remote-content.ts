import { ApiError } from "../api/errors.js";

const remoteLoadPatterns = [
  /<\s*(?:audio|embed|frame|iframe|img|input|link|object|script|source|track|video)\b[^>]*(?:href|src|srcset)\s*=\s*["']?\s*(?:https?:)?\/\//i,
  /(?:background|background-image|content)\s*:\s*[^;]*url\(\s*["']?\s*(?:https?:)?\/\//i,
  /url\(\s*["']?\s*(?:https?:)?\/\//i,
  /!\[[^\]]*]\(\s*(?:https?:)?\/\//i,
];

export function containsRemoteLoadVector(value: string) {
  return remoteLoadPatterns.some((pattern) => pattern.test(value));
}

export function assertNoRemoteLoadVectors(value: string | null | undefined, fieldName = "campo") {
  if (value && containsRemoteLoadVector(value)) {
    throw new ApiError("VALIDATION_ERROR", `${fieldName} contem recurso remoto carregavel bloqueado por seguranca.`);
  }
}

export function rejectRemoteLoadVectorsMessage(fieldName: string) {
  return `${fieldName} nao pode conter recursos remotos carregaveis como imagens, iframes, scripts, CSS url() ou markdown image.`;
}
