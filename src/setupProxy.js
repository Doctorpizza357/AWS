const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api/bls',
    createProxyMiddleware({
      target: 'https://api.bls.gov',
      changeOrigin: true,
      pathRewrite: { '^/api/bls': '/publicAPI/v1/timeseries/data' },
    })
  );
};
