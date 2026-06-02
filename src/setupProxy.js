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

  app.use(
    '/api/scenarios',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: { '^/api/scenarios': '/api/scenarios' },
    })
  );

  app.use(
    '/api/resume',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: { '^/api/resume': '/api/resume' },
    })
  );

  app.use(
    '/api/interview',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: { '^/api/interview': '/api/interview' },
    })
  );

  app.use(
    '/api/tts',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: { '^/api/tts': '/api/tts' },
    })
  );
};
