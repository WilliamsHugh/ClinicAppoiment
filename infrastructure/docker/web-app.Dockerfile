FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
ARG APP_PATH
COPY ${APP_PATH}/package.json ${APP_PATH}/package.json
RUN npm install
COPY ${APP_PATH} ${APP_PATH}
WORKDIR /app/${APP_PATH}
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

