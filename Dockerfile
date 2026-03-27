# Packbee API Server
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY server.js auth.js embeddings.js ./
COPY site/ ./site/

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 3011

# Environment
ENV PORT=3011
ENV NODE_ENV=production

# Start server
CMD ["node", "server.js"]
