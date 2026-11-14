import { encodeQR } from 'qr';

export function create(
  value: string,
  options: { errorCorrection?: 'low' | 'medium' | 'quartile' | 'high'; version?: number } = {}
) {
  const { errorCorrection, version } = options;
  const rawWithBorder = encodeQR(value, 'raw', {
    border: 1,
    ecc: errorCorrection,
    scale: 1,
    version,
  });
  const grid = rawWithBorder.slice(1, -1).map((row) => row.slice(1, -1));
  const finderLength = 7;
  const edgeLength = grid.length;
  return {
    edgeLength,
    finderLength,
    grid,
    value,
  };
}
