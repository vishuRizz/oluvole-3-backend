module.exports = {
  apps: [
    {
      name: 'server',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',

      //
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      kill_timeout: 10000,
      wait_ready: false,
      listen_timeout: 3000,

      shutdown_with_message: false,

      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },

      error_file: '/root/.pm2/logs/server-error.log',
      out_file: '/root/.pm2/logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      merge_logs: true,

      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
    },
  ],
};
