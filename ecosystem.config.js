module.exports = {
  apps: [
    {
      name: 'my-wallet-api',
      exec_mode: 'cluster',
      instances: '1',
      script: 'dist/src/main.js',
      args: '--max-old-space-size=4096'
    }
]
};
