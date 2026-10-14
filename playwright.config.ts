import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',fullyParallel:true,timeout:30000,retries:process.env.CI?1:0,use:{baseURL:'http://localhost:4173',trace:'retain-on-failure'},
 webServer:[
  {command:'npm start',url:'http://localhost:4173',reuseExistingServer:false,env:{PORT:'4173',APP_URL:'http://localhost:4173',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',NODE_ENV:'test'}},
  // Pages-Smoke: echter build:pages-Output, serviert wie auf GitHub Pages unter /vave.log/.
  {command:'npm run build:pages && node scripts/serve-pages.mjs',url:'http://localhost:4174/vave.log/',reuseExistingServer:false,timeout:180000,env:{PAGES_BASE:'/vave.log/',PAGES_PORT:'4174',APP_URL:'http://localhost:4174/vave.log',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}},
 ],
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']},testIgnore:/pages\.spec\.ts/},{name:'mobile',use:{...devices['iPhone 13'],browserName:'chromium'},testIgnore:/pages\.spec\.ts/},{name:'pages',testMatch:/pages\.spec\.ts/,use:{...devices['Desktop Chrome'],baseURL:'http://localhost:4174'}}],
 reporter:process.env.CI? [['list'],['html',{open:'never'}]]:'list'});
