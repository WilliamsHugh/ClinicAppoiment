FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
ARG APP_PATH
COPY ${APP_PATH}/package.json ${APP_PATH}/package.json
RUN npm install

FROM deps AS build
ARG APP_PATH
COPY ${APP_PATH} ${APP_PATH}
RUN npm run build -w ./${APP_PATH}

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG APP_PATH
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/${APP_PATH}/dist ./dist
COPY --from=build /app/${APP_PATH}/package.json ./package.json
CMD ["node", "dist/index.js"]

