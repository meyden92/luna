const TS_PACKET_BYTES = 188;
const TS_SYNC_BYTE = 0x47;
const TS_PACKETS_TO_CHECK = 5;
const TYPESCRIPT_EXTENSIONS = ['.ts', '.mts', '.cts'];

/** True when every one of the first few 188-byte packets starts with the sync byte (and at least one full packet exists). */
function isMpegTransportStream(bytes: Uint8Array): boolean {
  if (bytes.byteLength < TS_PACKET_BYTES) return false;
  const packets = Math.min(TS_PACKETS_TO_CHECK, Math.floor(bytes.byteLength / TS_PACKET_BYTES));
  for (let i = 0; i < packets; i++) {
    if (bytes[i * TS_PACKET_BYTES] !== TS_SYNC_BYTE) return false;
  }
  return true;
}

/**
 * Corrects the declared type of an upload from its bytes. Browsers and ShareX label every `.ts` file
 * `video/mp2t`, so TypeScript source would otherwise be stored (and previewed) as video. A `video/mp2t`
 * upload stays video only if it really is an MPEG transport stream; otherwise it becomes `text/plain`
 * for TypeScript files and `application/octet-stream` for anything else. Other types pass through.
 * Both upload routes call this once, before the type is used for scrubbing, moderation or storage.
 */
export function resolveUploadContentType(declared: string, fileName: string, bytes: Uint8Array): string {
  if (declared !== 'video/mp2t' || isMpegTransportStream(bytes)) return declared;
  const lowerName = fileName.toLowerCase();
  return TYPESCRIPT_EXTENSIONS.some((ext) => lowerName.endsWith(ext)) ? 'text/plain' : 'application/octet-stream';
}
