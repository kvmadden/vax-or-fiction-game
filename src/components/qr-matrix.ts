import QRCode from 'qrcode';

/** One canonical QR encoder, shared by preflight and the projected lobby. */
export function generateQrMatrix(text: string): boolean[][] {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, column) => Boolean(modules.get(row, column))));
}
