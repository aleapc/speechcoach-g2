import { createServer } from 'vite';

const server = await createServer({
  root: 'D:/dev/speechcoach-g2',
  server: { port: 5180, strictPort: true },
});
await server.listen();
server.printUrls();
