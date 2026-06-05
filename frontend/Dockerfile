# Production-Image für die OtakuPulse-App (Next.js 16 + Payload).
#
# Build-Strategie: "build-on-start". Der `next build` läuft beim Container-START
# (CMD), NICHT beim Image-Build — denn Payload initialisiert dabei die DB und
# braucht eine erreichbare Postgres-Instanz. Über docker-compose wartet die App
# via depends_on/healthcheck, bis die DB bereit ist. NEXT_PUBLIC_*-Variablen
# werden so aus der Laufzeit-Env in den Client-Bundle eingebacken.
FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Abhängigkeiten zuerst (Layer-Caching). --include=dev erzwingt die
# devDependencies (tailwind, typescript), die `next build` benötigt.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Quellcode.
COPY . .

EXPOSE 3000

# Beim Start: produktiv bauen, dann servieren (DB ist via compose dann bereit).
CMD ["sh", "-lc", "npm run build && npm run start"]
