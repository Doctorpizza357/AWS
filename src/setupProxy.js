const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api/bls',
    createProxyMiddleware({
      target: 'https://api.bls.gov',
      changeOrigin: true,
      pathRewrite: { '^/api/bls': '/publicAPI/v2/timeseries/data' },
    })
  );

  app.use(
    '/api/assistant',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: { '^/api/assistant': '/api/assistant' },
    })
  );
};
