'use strict';

const { handleSearch } = require('../lib/search-core');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: '仅支持 GET 请求' });
  }

  try {
    const url = new URL(req.url, 'https://shaochenyue.asia');
    return res.status(200).json(await handleSearch(url.searchParams));
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || '搜索失败' });
  }
};
