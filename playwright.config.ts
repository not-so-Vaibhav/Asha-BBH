import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',outputDir:'/private/tmp/asha-sakhi-playwright-results',fullyParallel:false,reporter:'list',
 use:{...devices['Desktop Chrome'],baseURL:process.env.ASHA_BASE_URL??'http://127.0.0.1:4173',viewport:{width:390,height:844}},
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:30_000},
});
