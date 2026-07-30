module.exports = {
  apps: [
    {
      name: "backend",
      script: "server.js",
      cwd: "/www/wwwroot/Credenciamento/backend",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
