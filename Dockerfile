ARG NODE_VERSION=current
ARG ALPINE_VERSION=3.21

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS frontend-build

RUN apk add --no-cache python3 py3-setuptools make g++

ADD gyde-frontend /root/gyde-frontend/
WORKDIR /root/gyde-frontend
 
RUN npm install && \
    NODE_OPTIONS=--max_old_space_size=4096 npm run build

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION}

ADD gydesrv /root/gydesrv
COPY --from=frontend-build /root/gyde-frontend/build /root/gyde-frontend

ENV GYDE_HOST=0.0.0.0 \
    GYDE_TLS_PORT= \
    GYDE_STATIC_DIR=/root/gyde-frontend \
    GYDE_MONGO_CONNECTION='mongodb://host.docker.internal:27017' \
    GYDE_MOCK_USER='gydeuser' \
    NODE_TLS_REJECT_UNAUTHORIZED=0

ADD docker/gydesrv_plugin.js /root/gydesrv/gydesrv_plugin.js

WORKDIR /root/gydesrv
RUN npm install
ENTRYPOINT [ "node", "index.js" ]
