# syntax=docker/dockerfile:1
FROM node:20-slim

WORKDIR /app

# OpenSSL is required for Prisma to connect to PostgreSQL
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Expose port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/index.js"]
