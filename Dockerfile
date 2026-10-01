FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# 构建阶段：把词典数据烘焙进镜像，作为持久磁盘的初始种子
RUN npm run dictionary:setup
RUN mkdir -p /app/build-data \
    && cp data/ecdict.sqlite /app/build-data/ecdict.sqlite \
    && cp data/seed-dictionary.json /app/build-data/seed-dictionary.json \
    && rm -rf data

RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=4173
ENV DATA_DIR=/app/data
ENV SEED_DIR=/app/build-data

EXPOSE 4173

CMD ["node", "server/entrypoint.mjs"]
