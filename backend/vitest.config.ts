import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://schooltrack:schooltrack@127.0.0.1:5432/schooltrack_test",
      LOG_LEVEL: "silent"
    }
  }
});
