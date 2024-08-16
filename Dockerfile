# Define the Python and Node.js version arguments
ARG PYTHON_VERSION=3.12
ARG NODE_VERSION=21
ARG LINUX_OS=alpine

# First stage: Build environment with Python, Node.js, and make
FROM nikolaik/python-nodejs:python$PYTHON_VERSION-nodejs${NODE_VERSION}-alpine as builder

# Install make and other necessary build dependencies
RUN apk add --no-cache make build-base

# Set the working directory
WORKDIR /usr/src/app

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=cache,target=/root/.npm \
    npm i --omit=dev

# Copy the rest of your source files
COPY . .

# Second stage: Runtime environment with only Node.js
FROM node:${NODE_VERSION}-alpine as runtime

# Use production node environment
ENV NODE_ENV production
ENV configFile=config/config.json

# Copy built assets from the builder stage
WORKDIR /app
COPY --from=builder /usr/src/app .

# Create necessary directories and files, and set appropriate permissions
RUN mkdir -p /app/config /app/budgets && \
    touch /app/setup.log /app/simplefin.log && \
    chown -R node:node /app/config /app/budgets /app/*.log

# Run the application as a non-root user
USER node

# Run the application based on the mode
CMD if [ "$APP_MODE" = "setup" ]; then \
      node app.js --setup; \
    else \
      node app.js; \
    fi
