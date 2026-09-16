FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/clinic-management-web/package.json apps/clinic-management-web/package.json
RUN npm install

FROM deps AS build
COPY apps/clinic-management-web apps/clinic-management-web
RUN npm run build -w @clinic/clinic-management-web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/clinic-management-web/.next/standalone ./
COPY --from=build /app/apps/clinic-management-web/.next/static ./apps/clinic-management-web/.next/static
COPY --from=build /app/apps/clinic-management-web/public ./apps/clinic-management-web/public
EXPOSE 5174
CMD ["node", "apps/clinic-management-web/server.js"]
