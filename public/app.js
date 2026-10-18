(function () {
  'use strict';

  // ---------- state ----------
  const state = {
    keyword: '',
    page: 1,
    results: [],
    loading: false,
    activeVideo: null,
    hasMore: false,
    homeMode: true,
  };

  // ---------- elements ----------
  const $ = (id) => document.getElementById(id);
  const searchForm = $('searchForm');
  const searchInput = $('searchInput');
  const historyBar = $('historyBar');
  const theater = $('theater');
  const stage = $('stage');
  const stageEmpty = $('stageEmpty');
  const activeTitle = $('activeTitle');
  const activeMeta = $('activeMeta');
  const activeCover = $('activeCover');
  const activeDescription = $('activeDescription');
  const videoUrlInput = $('videoUrl');
  const copyVideoUrlBtn = $('copyVideoUrl');
  const externalPlayerUrlInput = $('externalPlayerUrl');
  const saveExternalPlayerBtn = $('saveExternalPlayer');
  const playExternal = $('playExternal');
  const embedHint = $('embedHint');
  const videoControls = $('videoControls');
  const openOrigin = $('openOrigin');
  const closeTheaterBtn = $('closeTheater');
  const feedback = $('feedback');
  const resultsTitle = $('resultsTitle');
  const resultsCount = $('resultsCount');
  const resultsEl = $('results');
  const loadMoreBtn = $('loadMore');
  const progress = $('progress');
  const currentTimeEl = $('currentTime');
  const totalTimeEl = $('totalTime');
  const playBtn = $('playBtn');
  const back5 = $('back5');
  const fwd5 = $('fwd5');
  const prevFrame = $('prevFrame');
  const nextFrame = $('nextFrame');
  const fpsSelect = $('fpsSelect');
  const rateInput = $('rate');
  const rateVal = $('rateVal');
  const statRate = $('statRate');
  const loopBtn = $('loopBtn');
  const muteBtn = $('muteBtn');
  const volumeInput = $('volume');
  const fullBtn = $('fullBtn');
  const statFps = $('statFps');
  const statRes = $('statRes');
  const directUrl = $('directUrl');
  const playDirect = $('playDirect');

  const SOURCE_NAMES = { bilibili: 'B站', sample: '样片' };
  const API_BASE = String(window.VIDEO_API_BASE || '').replace(/\/$/, '');
  const EXTERNAL_PLAYER_KEY = 'videoSearchExternalPlayerUrl';
  let apiBase = API_BASE;

  let videoEl = null;
  let frameCallbackId = null;
  let measuredFps = 0;
  let fpsStart = -1;
  let fpsFrames = 0;
  let lastMediaTime = 0;

  // ---------- utils ----------
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function highlight(title, keyword) {
    const safe = escapeHTML(title);
    if (!keyword) return safe;
    const words = keyword.trim().split(/\s+/).filter(Boolean).map(escapeHTML);
    let out = safe;
    for (const w of words) {
      out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    }
    return out;
  }

  function formatPlays(n) {
    if (!n) return '';
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿播放';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万播放';
    return n + '播放';
  }

  function formatTime(t) {
    if (!isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function refreshIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function buildExternalPlayerUrl(playerUrl, videoUrl) {
    if (playerUrl.includes('{url}')) {
      return playerUrl.replace('{url}', encodeURIComponent(videoUrl));
    }
    const url = new URL(playerUrl);
    url.searchParams.set('url', videoUrl);
    return url.toString();
  }

  function getSavedExternalPlayerUrl() {
    const value = String(localStorage.getItem(EXTERNAL_PLAYER_KEY) || '').trim();
    try {
      return value ? new URL(value).toString() : '';
    } catch (_) {
      return '';
    }
  }

  function updateExternalPlayerLink(item) {
    const playerUrl = getSavedExternalPlayerUrl();
    if (!item || !item.url || !playerUrl) {
      playExternal.classList.add('hidden');
      return;
    }
    try {
      playExternal.href = buildExternalPlayerUrl(playerUrl, item.url);
      playExternal.classList.remove('hidden');
    } catch (_) {
      playExternal.classList.add('hidden');
    }
  }

  async function loadVideoDetails(item) {
    if (!item || item.source !== 'bilibili' || !item.id) return;
    try {
      const params = new URLSearchParams({ source: 'bilibili', id: item.id });
      const res = await fetch(apiBase + '/api/video?' + params.toString(), { cache: 'no-store' });
      const data = await res.json();
      if (state.activeVideo !== item || !res.ok || !data.ok) return;
      const details = data.video || {};
      if (details.description) {
        item.description = details.description;
        activeDescription.textContent = details.description;
        activeDescription.hidden = false;
      }
    } catch (_) {
      // Search results remain usable when the optional detail lookup fails.
    }
  }

  // ---------- feedback ----------
  function showNotices(notices) {
    feedback.innerHTML = '';
    (notices || []).forEach(text => {
      const div = document.createElement('div');
      div.className = 'notice';
      div.innerHTML = '<i data-lucide="info"></i><span></span>';
      div.querySelector('span').textContent = text;
      feedback.appendChild(div);
    });
    refreshIcons();
  }

  function showError(message) {
    feedback.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'notice error';
    div.innerHTML = '<i data-lucide="alert-triangle"></i><span></span>';
    div.querySelector('span').textContent = message;
    feedback.appendChild(div);
    refreshIcons();
  }

  function showLoading(show) {
    const existing = feedback.querySelector('.loading-row');
    if (show && !existing) {
      feedback.querySelectorAll('.notice').forEach(n => n.remove());
      const div = document.createElement('div');
      div.className = 'loading-row';
      div.innerHTML = '<div class="spinner"></div><span>正在搜索…</span>';
      feedback.appendChild(div);
    } else if (!show && existing) {
      existing.remove();
    }
  }

  // ---------- search ----------
  // Standalone mode: works when index.html is opened directly (file://) or
  // when the optional Node service is not running. Only built-in clips are
  // searchable then; Bilibili search needs `node server.js`.
  const LOCAL_SAMPLES = [
    { id: 'f24', source: 'sample', title: '24fps 帧率测试片', author: '本地生成', duration: '0:02', cover: 'samples/frame24.jpg', plays: 0, date: '', url: 'samples/frame24.mp4', playUrl: 'samples/frame24.mp4' },
    { id: 'f25', source: 'sample', title: '25fps 帧率测试片', author: '本地生成', duration: '0:02', cover: 'samples/frame25.jpg', plays: 0, date: '', url: 'samples/frame25.mp4', playUrl: 'samples/frame25.mp4' },
    { id: 'f30', source: 'sample', title: '30fps 帧率测试片', author: '本地生成', duration: '0:02', cover: 'samples/frame30.jpg', plays: 0, date: '', url: 'samples/frame30.mp4', playUrl: 'samples/frame30.mp4' },
    { id: 'f50', source: 'sample', title: '50fps 帧率测试片', author: '本地生成', duration: '0:02', cover: 'samples/frame50.jpg', plays: 0, date: '', url: 'samples/frame50.mp4', playUrl: 'samples/frame50.mp4' },
    { id: 'f60', source: 'sample', title: '60fps 高帧率测试片', author: '本地生成', duration: '0:02', cover: 'samples/frame60.jpg', plays: 0, date: '', url: 'samples/frame60.mp4', playUrl: 'samples/frame60.mp4' },
  ];

  let offlineMode = location.protocol === 'file:';
  let backendChecked = false;

  async function detectBackend() {
    if (backendChecked) return;
    backendChecked = true;
    try {
      const res = await fetch(apiBase + '/api/health', { cache: 'no-store' });
      const data = await res.json();
      offlineMode = data.ok !== true;
    } catch (_) {
      offlineMode = true;
    }
  }

  function searchLocal(keyword) {
    const snapshot = Array.isArray(window.HOT_SNAPSHOT) ? window.HOT_SNAPSHOT : [];
    if (!keyword) return snapshot.length ? snapshot.slice() : LOCAL_SAMPLES.slice();
    const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    return snapshot.concat(LOCAL_SAMPLES).filter(it => {
      const hay = (it.title + ' ' + it.author).toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }

  function finishLocalSearch() {
    state.results = searchLocal(state.keyword);
    state.hasMore = false;
    showNotices(state.keyword
      ? ['本地模式：仅可搜索内置样片与热门快照。在项目目录运行 node server.js 后刷新，可启用 B 站实时搜索。']
      : []);
    renderResults();
  }

  async function runSearch(append = false, home = false) {
    if (state.loading) return;
    state.loading = true;
    state.homeMode = home;
    if (home) state.keyword = loadHistory()[0] || '';
    if (!append) {
      state.page = 1;
      state.results = [];
      renderResults();
    }
    showLoading(true);
    loadMoreBtn.classList.add('hidden');
    await detectBackend();
    if (offlineMode) {
      finishLocalSearch();
      state.loading = false;
      showLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams({
        keyword: state.keyword,
        source: 'all',
        page: String(state.page),
      });
      const res = await fetch(apiBase + '/api/search?' + params.toString());
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '搜索失败，请稍后重试');
      state.results = append ? state.results.concat(data.results) : data.results;
      state.hasMore = !!data.hasMore;
      showNotices(data.notices);
      renderResults();
    } catch (err) {
      if (err instanceof TypeError) {
        offlineMode = true;
        finishLocalSearch();
      } else {
      showError(err.message || '网络错误，请确认本地服务正在运行');
      if (!append) {
        state.results = [];
        renderResults();
      }
      }
    } finally {
      state.loading = false;
      showLoading(false);
      loadMoreBtn.classList.toggle('hidden', !(state.hasMore && state.results.length));
    }
  }

  function renderResults() {
    const n = state.results.length;
    if (state.homeMode) {
      resultsTitle.textContent = state.keyword
        ? '根据「' + state.keyword + '」推荐'
        : '热门视频';
      resultsCount.textContent = state.keyword ? n + ' 个推荐' : n + ' 个视频';
    } else {
      resultsTitle.textContent = '搜索结果';
      resultsCount.textContent = state.keyword
        ? '关键词「' + state.keyword + '」· ' + n + ' 个结果'
        : n + ' 个视频';
    }
    if (!state.results.length) {
      resultsEl.innerHTML =
        '<div class="empty-state"><i data-lucide="search-x"></i><span>' +
        (state.keyword ? '没有找到相关视频，换个关键词试试' : '输入关键词开始搜索') +
        '</span></div>';
      refreshIcons();
      return;
    }
    resultsEl.innerHTML = state.results.map((item, i) => {
      const badge = item.source === 'bilibili' ? 'bili' : 'sp';
      const badgeText = SOURCE_NAMES[item.source] || item.source;
      return (
        '<article class="card" data-idx="' + i + '" tabindex="0" role="button">' +
          '<div class="thumb">' +
            '<img loading="lazy" src="' + escapeHTML(item.cover || '') + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
            (item.duration ? '<span class="dur">' + escapeHTML(item.duration) + '</span>' : '') +
            '<span class="src-badge ' + badge + '">' + badgeText + '</span>' +
          '</div>' +
          '<div class="card-body">' +
            '<h3>' + highlight(item.title, state.keyword) + '</h3>' +
            '<p class="card-meta">' +
              '<span class="author">' + escapeHTML(item.author || '') + '</span>' +
              '<span>' + escapeHTML([formatPlays(item.plays), item.date].filter(Boolean).join(' · ')) + '</span>' +
            '</p>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  resultsEl.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    openVideo(state.results[parseInt(card.dataset.idx, 10)]);
  });

  resultsEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    openVideo(state.results[parseInt(card.dataset.idx, 10)]);
  });

  // ---------- player ----------
  function destroyVideo() {
    if (videoEl) {
      if (frameCallbackId !== null && videoEl.cancelVideoFrameCallback) {
        videoEl.cancelVideoFrameCallback(frameCallbackId);
      }
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl.remove();
      videoEl = null;
    }
    stage.querySelector('iframe') && stage.querySelector('iframe').remove();
    stageEmpty.classList.add('hidden');
    frameCallbackId = null;
    measuredFps = 0;
    fpsStart = -1;
    fpsFrames = 0;
    lastMediaTime = 0;
    statFps.textContent = '--';
    statRes.textContent = '--';
  }

  function createVideoEl(src) {
    destroyVideo();
    videoEl = document.createElement('video');
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
    videoEl.src = src;
    videoEl.playbackRate = parseFloat(rateInput.value);
    videoEl.loop = loopBtn.getAttribute('aria-pressed') === 'true';
    videoEl.volume = parseFloat(volumeInput.value);
    videoEl.addEventListener('loadedmetadata', () => {
      totalTimeEl.textContent = formatTime(videoEl.duration);
      statRes.textContent = videoEl.videoWidth + '×' + videoEl.videoHeight;
    });
    videoEl.addEventListener('timeupdate', syncProgress);
    videoEl.addEventListener('play', () => setPlayIcon(true));
    videoEl.addEventListener('pause', () => setPlayIcon(false));
    videoEl.addEventListener('ended', () => setPlayIcon(false));
    videoEl.addEventListener('click', togglePlay);
    stage.appendChild(videoEl);
    startFpsMeter();
  }

  function startFpsMeter() {
    if (!videoEl || !videoEl.requestVideoFrameCallback) return;
    const onFrame = (_now, meta) => {
      // Source fps = presented frames / media-time span. This stays correct
      // when frames are dropped or playbackRate changes.
      if (meta.mediaTime < lastMediaTime) {
        fpsStart = -1;
        fpsFrames = 0;
      }
      if (fpsStart < 0) fpsStart = meta.mediaTime;
      fpsFrames++;
      lastMediaTime = meta.mediaTime;
      const span = meta.mediaTime - fpsStart;
      if (span > 0.5) {
        measuredFps = fpsFrames / span;
        statFps.textContent = measuredFps.toFixed(1) + ' fps';
      }
      frameCallbackId = videoEl.requestVideoFrameCallback(onFrame);
    };
    frameCallbackId = videoEl.requestVideoFrameCallback(onFrame);
  }

  function openVideo(item) {
    if (!item) return;
    state.activeVideo = item;
    theater.classList.remove('hidden');
    resultsEl.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    const idx = state.results.indexOf(item);
    if (idx >= 0) {
      const card = resultsEl.querySelector('.card[data-idx="' + idx + '"]');
      if (card) card.classList.add('active');
    }

    activeTitle.textContent = item.title || '未命名视频';
    activeMeta.textContent = [
      item.author,
      formatPlays(item.plays),
      item.date,
      item.duration,
    ].filter(Boolean).join(' · ');

    if (item.cover) {
      activeCover.src = item.cover;
      activeCover.hidden = false;
    } else {
      activeCover.removeAttribute('src');
      activeCover.hidden = true;
    }

    if (item.description) {
      activeDescription.textContent = item.description;
      activeDescription.hidden = false;
    } else {
      activeDescription.textContent = '';
      activeDescription.hidden = true;
    }

    videoUrlInput.value = item.url || '';
    updateExternalPlayerLink(item);
    loadVideoDetails(item);

    if (item.url) {
      openOrigin.href = item.url;
      openOrigin.classList.remove('hidden');
    } else {
      openOrigin.classList.add('hidden');
    }

    if (item.source === 'bilibili' && item.embed) {
      destroyVideo();
      const iframe = document.createElement('iframe');
      iframe.src = item.embed;
      iframe.title = item.title;
      iframe.allow = 'fullscreen';
      stage.appendChild(iframe);
      embedHint.classList.remove('hidden');
      videoControls.classList.add('hidden');
    } else if (item.playUrl) {
      createVideoEl(item.playUrl);
      embedHint.classList.add('hidden');
      videoControls.classList.remove('hidden');
    } else {
      destroyVideo();
      stageEmpty.classList.remove('hidden');
    }

    theater.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  closeTheaterBtn.addEventListener('click', () => {
    destroyVideo();
    theater.classList.add('hidden');
    state.activeVideo = null;
    activeTitle.textContent = '未选择视频';
    activeMeta.textContent = '支持 B 站嵌入播放与本地网页播放器';
    activeCover.removeAttribute('src');
    activeCover.hidden = true;
    activeDescription.textContent = '';
    activeDescription.hidden = true;
    videoUrlInput.value = '';
    playExternal.classList.add('hidden');
    openOrigin.classList.add('hidden');
    embedHint.classList.add('hidden');
    videoControls.classList.add('hidden');
    stageEmpty.classList.remove('hidden');
    resultsEl.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
  });

  copyVideoUrlBtn.addEventListener('click', async () => {
    const value = videoUrlInput.value;
    if (!value) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch (_) {
      videoUrlInput.select();
      copied = document.execCommand('copy');
    }
    if (copied) {
      copyVideoUrlBtn.innerHTML = '<i data-lucide="check"></i>';
      refreshIcons();
      setTimeout(() => {
        copyVideoUrlBtn.innerHTML = '<i data-lucide="copy"></i>';
        refreshIcons();
      }, 1200);
    }
  });

  saveExternalPlayerBtn.addEventListener('click', () => {
    const value = externalPlayerUrlInput.value.trim();
    if (!value) {
      localStorage.removeItem(EXTERNAL_PLAYER_KEY);
      updateExternalPlayerLink(state.activeVideo);
      saveExternalPlayerBtn.innerHTML = '<i data-lucide="check"></i>';
      refreshIcons();
      return;
    }
    try {
      const normalized = new URL(value).toString();
      localStorage.setItem(EXTERNAL_PLAYER_KEY, normalized);
      externalPlayerUrlInput.value = normalized;
      updateExternalPlayerLink(state.activeVideo);
      saveExternalPlayerBtn.innerHTML = '<i data-lucide="check"></i>';
    } catch (_) {
      saveExternalPlayerBtn.innerHTML = '<i data-lucide="x"></i>';
    }
    refreshIcons();
    setTimeout(() => {
      saveExternalPlayerBtn.innerHTML = '<i data-lucide="check"></i>';
      refreshIcons();
    }, 1200);
  });

  // ---------- video controls ----------
  function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }
  }

  function setPlayIcon(playing) {
    playBtn.innerHTML = playing ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
    refreshIcons();
  }

  function syncProgress() {
    if (!videoEl || !isFinite(videoEl.duration)) return;
    if (document.activeElement !== progress) {
      progress.value = String(Math.round((videoEl.currentTime / videoEl.duration) * 1000));
    }
    currentTimeEl.textContent = formatTime(videoEl.currentTime);
  }

  playBtn.addEventListener('click', togglePlay);

  progress.addEventListener('input', () => {
    if (!videoEl || !isFinite(videoEl.duration)) return;
    videoEl.currentTime = (progress.value / 1000) * videoEl.duration;
  });

  back5.addEventListener('click', () => {
    if (videoEl) videoEl.currentTime = Math.max(0, videoEl.currentTime - 5);
  });

  fwd5.addEventListener('click', () => {
    if (videoEl) videoEl.currentTime = Math.min(videoEl.duration || 0, videoEl.currentTime + 5);
  });

  function stepFrame(dir) {
    if (!videoEl) return;
    videoEl.pause();
    const fpsVal = fpsSelect.value === 'auto'
      ? (measuredFps > 0 ? measuredFps : 30)
      : parseFloat(fpsSelect.value);
    const step = 1 / Math.max(1, fpsVal);
    const target = videoEl.currentTime + dir * step;
    videoEl.currentTime = Math.max(0, Math.min((videoEl.duration || Infinity) - step, target));
  }

  prevFrame.addEventListener('click', () => stepFrame(-1));
  nextFrame.addEventListener('click', () => stepFrame(1));

  rateInput.addEventListener('input', () => {
    const r = parseFloat(rateInput.value);
    rateVal.textContent = r.toFixed(2) + 'x';
    statRate.textContent = r.toFixed(2) + 'x';
    if (videoEl) videoEl.playbackRate = r;
    localStorage.setItem('vs_rate', rateInput.value);
  });

  loopBtn.addEventListener('click', () => {
    const on = loopBtn.getAttribute('aria-pressed') !== 'true';
    loopBtn.setAttribute('aria-pressed', String(on));
    if (videoEl) videoEl.loop = on;
  });

  muteBtn.addEventListener('click', () => {
    const on = muteBtn.getAttribute('aria-pressed') !== 'true';
    muteBtn.setAttribute('aria-pressed', String(on));
    if (videoEl) videoEl.muted = on;
    muteBtn.innerHTML = on
      ? '<i data-lucide="volume-x"></i>静音'
      : '<i data-lucide="volume-2"></i>静音';
    refreshIcons();
  });

  volumeInput.addEventListener('input', () => {
    if (videoEl) {
      videoEl.volume = parseFloat(volumeInput.value);
      videoEl.muted = false;
      muteBtn.setAttribute('aria-pressed', 'false');
    }
  });

  fullBtn.addEventListener('click', () => {
    const target = videoEl || stage;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (target.requestFullscreen) {
      target.requestFullscreen();
    }
  });

  // direct link playback
  playDirect.addEventListener('click', () => {
    const url = directUrl.value.trim();
    if (!url) return;
    let host = url;
    try {
      host = new URL(url, location.href).hostname;
    } catch (_) { /* keep raw */ }
    openVideo({
      id: 'direct',
      source: 'sample',
      title: '直链视频',
      author: host,
      duration: '',
      cover: '',
      plays: 0,
      date: '',
      url: url,
      playUrl: url,
    });
  });

  directUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') playDirect.click();
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (theater.classList.contains('hidden') || !videoEl) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': e.preventDefault(); back5.click(); break;
      case 'ArrowRight': e.preventDefault(); fwd5.click(); break;
      case ',': e.preventDefault(); stepFrame(-1); break;
      case '.': e.preventDefault(); stepFrame(1); break;
      case 'ArrowUp':
        e.preventDefault();
        rateInput.value = String(Math.min(4, parseFloat(rateInput.value) + 0.25));
        rateInput.dispatchEvent(new Event('input'));
        break;
      case 'ArrowDown':
        e.preventDefault();
        rateInput.value = String(Math.max(0.25, parseFloat(rateInput.value) - 0.25));
        rateInput.dispatchEvent(new Event('input'));
        break;
      case 'm': muteBtn.click(); break;
      case 'l': loopBtn.click(); break;
      case 'f': fullBtn.click(); break;
    }
  });

  // ---------- search history ----------
  const HISTORY_KEY = 'vs_history';

  function loadHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value.filter(k => typeof k === 'string').slice(0, 10) : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(keyword) {
    if (!keyword) return;
    const list = loadHistory().filter(k => k !== keyword);
    list.unshift(keyword);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 10)));
    renderHistory();
  }

  function renderHistory() {
    const list = loadHistory();
    if (!list.length) {
      historyBar.innerHTML = '<span class="history-empty">暂无搜索记录</span>';
      return;
    }
    historyBar.innerHTML = list.map(k =>
      '<button type="button" class="history-chip" data-k="' + escapeHTML(k) + '">' + escapeHTML(k) + '</button>'
    ).join('') +
    '<button type="button" class="icon-btn" id="clearHistory" aria-label="清空搜索记录" title="清空搜索记录"><i data-lucide="trash-2"></i></button>';
    refreshIcons();
  }

  historyBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.history-chip');
    if (chip) {
      searchInput.value = chip.dataset.k;
      searchForm.requestSubmit();
      return;
    }
    if (e.target.closest('#clearHistory')) {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
    }
  });

  // ---------- search form ----------

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.keyword = searchInput.value.trim();
    saveHistory(state.keyword);
    runSearch(false, !state.keyword);
  });

  loadMoreBtn.addEventListener('click', () => {
    state.page += 1;
    runSearch(true);
  });

  // restore preferences
  const savedRate = localStorage.getItem('vs_rate');
  if (savedRate) {
    rateInput.value = savedRate;
    rateVal.textContent = parseFloat(savedRate).toFixed(2) + 'x';
    statRate.textContent = parseFloat(savedRate).toFixed(2) + 'x';
  }
  const savedExternalPlayerUrl = getSavedExternalPlayerUrl();
  if (savedExternalPlayerUrl) externalPlayerUrlInput.value = savedExternalPlayerUrl;
  // init
  refreshIcons();
  renderHistory();
  runSearch(false, true);
})();
