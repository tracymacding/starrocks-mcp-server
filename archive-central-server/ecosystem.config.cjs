/**
 * PM2 配置文件 - Solution C 中心 API 服务器
 *
 * 使用方法:
 *   pm2 start ecosystem.config.cjs
 *   pm2 stop starrocks-api
 *   pm2 restart starrocks-api
 *   pm2 logs starrocks-api
 *   pm2 monit
 */

module.exports = {
  apps: [
    {
      name: 'starrocks-api',
      script: './index-expert-api.js',

      // 环境变量
      env: {
        NODE_ENV: 'production',
        API_PORT: 3002,
        API_KEY: 'demo-key',  // 生产环境请修改为强密码
      },

      // 实例配置
      instances: 1,
      exec_mode: 'fork',

      // 自动重启
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // 日志
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // 合并日志
      merge_logs: true,

      // 启动延迟
      min_uptime: '10s',
      max_restarts: 10,
    }
  ]
};
