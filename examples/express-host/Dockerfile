FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "examples/express-host/src/server.ts"]
