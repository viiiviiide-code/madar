// اجرا با: pm2 start ecosystem.config.js
// نیازی به تعریف JWT_SECRET اینجا نیست — سرور خودش فایل server/.env را می‌خواند.
module.exports = {
  apps: [
    {
      name: "madar-api",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
