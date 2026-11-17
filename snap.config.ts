import type { SnapConfig } from '@metamask/snaps-cli';

const config: SnapConfig = {
  input: 'src/index.tsx',
  server: {
    port: 8081,
  },
  polyfills: {
    buffer: true,
  },
  stats: {
    buffer: false,
    builtIns: false,
  },
};

export default config;
