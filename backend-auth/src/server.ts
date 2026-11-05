import { networkInterfaces } from 'node:os';

import { createApp } from './app.js';
import { buildConfig, loadDotEnv } from './config.js';
import { createContext, sweepExpired } from './context.js';
import { log } from './lib/logger.js';

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .flatMap((iface) => (iface && iface.family === 'IPv4' && !iface.internal ? [iface.address] : []));
}

loadDotEnv();
const config = buildConfig(process.env);
const ctx = createContext(config);
const app = createApp(ctx);

// Limpieza periódica de códigos, refresh tokens, caché anti-replay y contadores de intentos.
setInterval(() => sweepExpired(ctx), 30_000).unref();

app.listen(config.port, config.host, () => {
  log('SERVER', `backend-auth escuchando en ${config.host}:${config.port}`);
  const addresses = lanAddresses();
  for (const address of addresses) log('SERVER', `  → http://${address}:${config.port}`);
  log('SERVER', 'Configura EXPO_PUBLIC_API_URL con la IP de tu PC en la red Wi-Fi (no localhost).');
  if (process.env.WSL_DISTRO_NAME) {
    log('SERVER', 'Detectado WSL: en modo NAT el teléfono no ve estas IPs; usa la IP Wi-Fi de Windows + netsh portproxy (ver README).');
  }
  if (config.devEnrollPage) log('SERVER', `Enrolamiento (solo dev): http://<IP>:${config.port}/mfa/enroll`);
  if (config.jwtSecretIsEphemeral) log('SERVER', 'JWT_SECRET vacío: se generó uno aleatorio (los tokens no sobreviven a un reinicio).');
  log('SERVER', `TTLs → access ${config.accessTtlSeconds}s · step-up ${config.stepUpTtlSeconds}s · elevated ${config.elevatedTtlSeconds}s · replay ${config.replayTtlSeconds}s`);
});
