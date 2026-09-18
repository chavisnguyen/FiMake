FROM node:lts-alpine

WORKDIR /app

# pnpm via corepack (repo uses pnpm + pnpm-lock.yaml)
COPY package.json pnpm-lock.yaml tsconfig.json tsdown.config.ts ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

# Build application
COPY src ./src
RUN pnpm build

# Remove dev dependencies
RUN pnpm prune --prod

# Default start
CMD ["node","dist/index.js"]

# Expose port (override with PORT in env)
EXPOSE 10101
