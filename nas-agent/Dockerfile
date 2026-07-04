FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache docker-cli util-linux
COPY server.js /app/server.js

ENV PORT=5088
EXPOSE 5088

CMD ["node", "/app/server.js"]
