/* eslint-disable @typescript-eslint/no-require-imports -- Next.js CLI uses CommonJS. */
// Keep Auth.js redirects on the same port as this local preview. Values from
// .env files must not send login or callback navigation to another dev server.
const previewPort = process.argv[2] ?? process.env.PORT ?? '3025';
if (!/^\d+$/.test(previewPort) || Number(previewPort) < 1 || Number(previewPort) > 65535) {
  throw new Error('Preview port must be an integer from 1 to 65535.');
}
const origin = `http://localhost:${Number(previewPort)}`;
process.env.AUTH_URL = origin;
process.env.NEXTAUTH_URL = origin;
process.argv = [process.execPath, require.resolve('next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', String(Number(previewPort))];
require('next/dist/bin/next');
