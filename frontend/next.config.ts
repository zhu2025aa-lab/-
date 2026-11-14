import path from 'path';
import type { NextConfig } from 'next';

const cuerQrCodeShimPath = path.resolve(__dirname, 'src/lib/cuer-qrcode-shim.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /cuer[\\/]_dist[\\/]QrCode\.js$/,
        cuerQrCodeShimPath
      )
    );
    config.resolve.alias = {
      ...config.resolve.alias,
      'cuer/QrCode': cuerQrCodeShimPath,
      [path.resolve(__dirname, 'node_modules/cuer/_dist/QrCode.js')]: cuerQrCodeShimPath,
      '@base-org/account': false,
      '@coinbase/cdp-sdk': false,
      '@x402/core/client': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

export default nextConfig;
