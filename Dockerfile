FROM node:20-slim

# Install python for python runner
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "src/index.js"]