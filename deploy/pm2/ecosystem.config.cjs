// pm2 process list for the two Node services. Paths assume the code lives in /var/www/mashkoor (see deploy/README.md).
//   pm2 start /var/www/mashkoor/mashkoor-dashboard/deploy/pm2/ecosystem.config.cjs && pm2 save
// Each service reads its own env file from its own folder:
//   dashboard/backend/.env          (API — loaded by the app itself)
//   website/.env.production         (website — loaded by Next.js)
module.exports = {
  apps: [
    {
      name: "mashkoor-api",
      cwd: "/var/www/mashkoor/mashkoor-dashboard/backend",
      script: "dist/main.js",
      exec_mode: "fork",
      instances: 1,
      // The API runs its scheduled jobs in-process (payment-link expiry, reminders, seat-hold release), so run exactly ONE copy.
      autorestart: true,
      max_memory_restart: "700M",
      kill_timeout: 10000,
      env: { NODE_ENV: "production" },
      time: true,
    },
    // {
    //   name: "mashkoor-website",
    //   cwd: "/var/www/mashkoor/mashkoor-website",
    //   script: "node_modules/next/dist/bin/next",
    //   args: "start -p 3000 -H 127.0.0.1",
    //   exec_mode: "fork",
    //   instances: 1,
    //   autorestart: true,
    //   max_memory_restart: "600M",
    //   kill_timeout: 10000,
    //   env: { NODE_ENV: "production" },
    //   time: true,
    // },
  ],
};
