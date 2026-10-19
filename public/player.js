(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const video = $('video');
  const stageEmpty = $('stageEmpty');
  const sourceForm = $('sourceForm');
  const sourceInput = $('sourceInput');
  const localFile = $('localFile');
  const shareButton = $('shareButton');
  const videoTitle = $('videoTitle');
  const videoHost = $('videoHost');
  const videoDuration = $('videoDuration');
  const feedback = $('feedback');
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
  const partPicker = $('partPicker');
  const partSelect = $('partSelect');
  const originalLink = $('originalLink');
  const retryResolve = $('retryResolve');
  const submitLabel = $('sourceSubmitLabel');
  const apiBase = String(window.VIDEO_API_BASE || '').replace(/\/$/, '');

  let currentURL = '';
  let objectURL = '';
  let frameCallbackId = null;
  let measuredFps = 0;
  let fpsStart = -1;
  let fpsFrames = 0;
  let lastMediaTime = -1;
  let sourceVersion = 0;
  let resolveController = null;
  let activeBili = null;
  let pendingResume = null;
  let autoRefreshUsed = false;
  let wasPlaying = false;

  function refreshIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function formatTime(value) {
    if (!isFinite(value) || value < 0) return '0:00';
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return hours
      ? hours + ':' + String(minutes).padStart(2, '0') + ':' + seconds
      : minutes + ':' + seconds;
  }

  function clearFeedback() {
    feedback.innerHTML = '';
  }

  function showNotice(message, isError) {
    clearFeedback();
    const div = document.createElement('div');
    div.className = 'notice' + (isError ? ' error' : '');
    div.innerHTML = '<i data-lucide="' + (isError ? 'alert-triangle' : 'info') + '"></i><span></span>';
    div.querySelector('span').textContent = message;
    feedback.appendChild(div);
    refreshIcons();
  }

  function stopFrameMeter() {
    if (frameCallbackId !== null && video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(frameCallbackId);
    }
    frameCallbackId = null;
    measuredFps = 0;
    fpsStart = -1;
    fpsFrames = 0;
    lastMediaTime = -1;
    statFps.textContent = '--';
  }

  function startFrameMeter() {
    stopFrameMeter();
    if (!video.requestVideoFrameCallback) return;

    const onFrame = (_now, meta) => {
      if (video.seeking) {
        frameCallbackId = video.requestVideoFrameCallback(onFrame);
        return;
      }
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
      frameCallbackId = video.requestVideoFrameCallback(onFrame);
    };
    frameCallbackId = video.requestVideoFrameCallback(onFrame);
  }

  function releaseObjectURL() {
    if (objectURL) {
      URL.revokeObjectURL(objectURL);
      objectURL = '';
    }
  }

  function resetUI() {
    stopFrameMeter();
    progress.value = '0';
    currentTimeEl.textContent = '0:00';
    totalTimeEl.textContent = '0:00';
    statRes.textContent = '--';
    statFps.textContent = '--';
    videoDuration.textContent = '--:--';
  }

  function loadSource(src, title, host, keepObjectURL, shareURL) {
    if (!keepObjectURL) releaseObjectURL();
    currentURL = shareURL || src;
    resetUI();
    videoTitle.textContent = title || '未命名视频';
    videoHost.textContent = host || '--';
    video.src = src;
    video.load();
    video.playbackRate = parseFloat(rateInput.value);
    video.volume = parseFloat(volumeInput.value);
    video.loop = loopBtn.getAttribute('aria-pressed') === 'true';
    video.muted = muteBtn.getAttribute('aria-pressed') === 'true';
    stageEmpty.classList.add('hidden');
    startFrameMeter();
  }

  function normalizeInputURL(value) {
    if (!value) throw new Error('请先输入 B 站链接或视频直链');
    const url = new URL(value, location.href);
    if (!['http:', 'https:', 'blob:'].includes(url.protocol)) {
      throw new Error('仅支持 http、https 或浏览器生成的视频地址');
    }
    return url.toString();
  }

  function isBilibiliInput(value) {
    if (/^(BV[0-9a-zA-Z]{10}|av[1-9][0-9]*)$/i.test(value)) return true;
    try {
      const match = value.match(/https?:\/\/[^\s<>【】「」（）]+/i);
      const url = new URL(match ? match[0] : value);
      const isBilibiliHost = /(^|\.)bilibili\.com$/.test(url.hostname);
      const isShortLinkHost = /(^|\.)b23\.tv$/.test(url.hostname);
      return isBilibiliHost || isShortLinkHost;
    } catch (_) {
      return false;
    }
  }

  function cancelSource() {
    sourceVersion++;
    if (resolveController) resolveController.abort();
    resolveController = null;
    sourceForm.setAttribute('aria-busy', 'false');
    submitLabel.textContent = '解析 / 播放';
    activeBili = null;
    pendingResume = null;
    wasPlaying = false;
    video.pause();
    video.removeAttribute('src');
    video.load();
    releaseObjectURL();
    currentURL = '';
    partPicker.classList.add('hidden');
    originalLink.classList.add('hidden');
    retryResolve.classList.add('hidden');
    resetUI();
    setPlayIcon(false);
    stageEmpty.classList.remove('hidden');
    return sourceVersion;
  }

  function setOriginalLink(value) {
    try {
      const match = value.match(/https?:\/\/[^\s<>【】「」（）]+/i);
      const raw = /^(BV[0-9a-zA-Z]{10}|av[1-9][0-9]*)$/i.test(value)
        ? 'https://www.bilibili.com/video/' + value : (match ? match[0] : value);
      const url = new URL(raw);
      if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'b23.tv', 'www.b23.tv'].includes(url.hostname)
        || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return;
      originalLink.href = url.href;
      originalLink.classList.remove('hidden');
    } catch (_) { /* Invalid input has no source-page link. */ }
  }

  async function openInput(value, title, options = {}) {
    value = String(value || '').trim();
    const version = cancelSource();
    clearFeedback();
    if (!options.refresh) autoRefreshUsed = false;
    if (!isBilibiliInput(value)) {
      try {
        const url = normalizeInputURL(value);
        const name = title || fileNameFromURL(url);
        updateLocation(url, name);
        loadSource(url, name, new URL(url).hostname, false);
      } catch (error) { showNotice(error.message || '视频网址格式不正确', true); }
      return;
    }
    setOriginalLink(value);
    retryResolve.classList.remove('hidden');
    videoTitle.textContent = '正在解析 B 站视频…';
    videoHost.textContent = 'B站';
    if (location.protocol === 'file:' || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      showNotice('B 站解析需要本机服务。请启动项目后，通过 http://localhost:3000/player/ 打开播放器。', true);
      return;
    }
    const controller = new AbortController();
    resolveController = controller;
    sourceForm.setAttribute('aria-busy', 'true');
    submitLabel.textContent = '解析中…';
    showNotice(options.refresh ? '播放地址失效，正在重新解析…' : '正在获取视频信息和当前播放地址…');
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(apiBase + '/api/resolve?' + new URLSearchParams({ url: value }), {
        cache: 'no-store', signal: controller.signal,
      });
      const data = await response.json();
      if (version !== sourceVersion) return;
      if (!response.ok || !data.ok) throw new Error(data.error || '解析失败，请稍后重试');
      const info = data.video;
      if (!info || !data.playUrl) throw new Error('解析服务没有返回有效播放地址');
      const mediaURL = new URL(data.playUrl, apiBase ? apiBase + '/' : location.origin);
      if (mediaURL.origin !== location.origin) throw new Error('本地解析需要使用同源服务，请清空 VIDEO_API_BASE 配置后重试');
      activeBili = info;
      pendingResume = options.resume || null;
      sourceInput.value = info.url;
      updateLocation(info.url, info.title);
      partSelect.replaceChildren();
      for (const part of info.pages || []) {
        const option = document.createElement('option');
        option.value = String(part.page);
        option.textContent = 'P' + part.page + ' · ' + part.title;
        partSelect.appendChild(option);
      }
      partSelect.value = String(info.page);
      partPicker.classList.toggle('hidden', (info.pages || []).length <= 1);
      setOriginalLink(info.url);
      loadSource(mediaURL.href, info.title, ['B站', info.author, info.quality].filter(Boolean).join(' · '), false, info.url);
      showNotice('已解析，点击播放即可观看。画质：' + info.quality);
    } catch (error) {
      if (version !== sourceVersion) return;
      videoTitle.textContent = '解析失败';
      showNotice(controller.signal.aborted ? '解析超时，请检查网络后重试。' : (error.message || '无法连接本地解析服务'), true);
    } finally {
      clearTimeout(timer);
      if (version === sourceVersion) {
        resolveController = null;
        sourceForm.setAttribute('aria-busy', 'false');
        submitLabel.textContent = '解析 / 播放';
      }
    }
  }

  function fileNameFromURL(value) {
    try {
      const url = new URL(value);
      const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
      return name || url.hostname;
    } catch (_) {
      return '直链视频';
    }
  }

  function updateLocation(url, title) {
    const params = new URLSearchParams();
    if (url) params.set('url', url);
    if (title) params.set('title', title);
    history.replaceState(null, '', location.pathname + '?' + params.toString());
  }

  function setPlayIcon(playing) {
    playBtn.innerHTML = playing ? '<i data-lucide="pause"></i>' : '<i data-lucide="play"></i>';
    refreshIcons();
  }

  function togglePlay() {
    if (!video.src) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  video.addEventListener('loadedmetadata', () => {
    totalTimeEl.textContent = formatTime(video.duration);
    videoDuration.textContent = formatTime(video.duration);
    statRes.textContent = video.videoWidth + '×' + video.videoHeight;
    if (pendingResume) {
      const resume = pendingResume;
      pendingResume = null;
      video.currentTime = Math.max(0, Math.min(resume.time, video.duration || 0));
      if (resume.playing) video.play().catch(() => {});
    }
  });

  video.addEventListener('timeupdate', () => {
    if (!isFinite(video.duration) || video.duration <= 0) return;
    if (document.activeElement !== progress) {
      progress.value = String(Math.round((video.currentTime / video.duration) * 1000));
    }
    currentTimeEl.textContent = formatTime(video.currentTime);
  });

  function resetFrameWindow() {
    fpsStart = -1;
    fpsFrames = 0;
    lastMediaTime = -1;
    statFps.textContent = '--';
  }
  // A seek is a discontinuity, not elapsed playback time. Retain the last stable
  // measured rate for auto frame stepping while collecting a new measurement.
  video.addEventListener('seeking', resetFrameWindow);
  video.addEventListener('seeked', resetFrameWindow);

  video.addEventListener('play', () => { wasPlaying = true; setPlayIcon(true); });
  video.addEventListener('pause', () => { if (!video.error) wasPlaying = false; setPlayIcon(false); });
  video.addEventListener('ended', () => setPlayIcon(false));

  video.addEventListener('error', () => {
    if (!video.getAttribute('src')) return;
    if (activeBili && !autoRefreshUsed) {
      autoRefreshUsed = true;
      openInput(currentURL, '', { refresh: true, resume: { time: video.currentTime || 0, playing: wasPlaying } });
      return;
    }
    resetUI();
    stageEmpty.classList.remove('hidden');
    showNotice(activeBili
      ? '视频流暂时无法播放，请点击重新解析，或在 B 站打开。'
      : '这个地址无法播放。请确认它是 mp4/webm 视频直链，且来源允许访问。', true);
  });

  sourceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    openInput(sourceInput.value);
  });

  partSelect.addEventListener('change', () => {
    if (!activeBili) return;
    const url = new URL(activeBili.url);
    url.searchParams.set('p', partSelect.value);
    openInput(url.href);
  });

  retryResolve.addEventListener('click', () => {
    const value = currentURL || sourceInput.value;
    openInput(value, '', { resume: { time: video.currentTime || 0, playing: wasPlaying } });
  });

  localFile.addEventListener('change', () => {
    const file = localFile.files && localFile.files[0];
    if (!file) return;
    cancelSource();
    clearFeedback();
    objectURL = URL.createObjectURL(file);
    sourceInput.value = '';
    videoTitle.textContent = file.name;
    videoHost.textContent = '本机文件';
    updateLocation('', file.name);
    loadSource(objectURL, file.name, '本机文件', true);
  });

  shareButton.addEventListener('click', async () => {
    if (!currentURL || currentURL.startsWith('blob:')) {
      showNotice('本地文件不能生成分享链接，请使用视频直链。', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      showNotice('本页链接已复制');
    } catch (_) {
      showNotice('复制失败，请手动复制地址栏链接。', true);
    }
  });

  playBtn.addEventListener('click', togglePlay);

  progress.addEventListener('input', () => {
    if (!video.src || !isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = (progress.value / 1000) * video.duration;
  });

  back5.addEventListener('click', () => {
    if (video.src) video.currentTime = Math.max(0, video.currentTime - 5);
  });

  fwd5.addEventListener('click', () => {
    if (video.src && isFinite(video.duration)) {
      video.currentTime = Math.min(video.duration, video.currentTime + 5);
    }
  });

  function stepFrame(direction) {
    if (!video.src) return;
    video.pause();
    const selected = fpsSelect.value === 'auto'
      ? (measuredFps > 0 ? measuredFps : 30)
      : parseFloat(fpsSelect.value);
    const step = 1 / Math.max(1, selected);
    const target = video.currentTime + direction * step;
    video.currentTime = Math.max(0, Math.min((video.duration || Infinity) - step, target));
  }

  prevFrame.addEventListener('click', () => stepFrame(-1));
  nextFrame.addEventListener('click', () => stepFrame(1));

  rateInput.addEventListener('input', () => {
    const rate = parseFloat(rateInput.value);
    video.playbackRate = rate;
    rateVal.textContent = rate.toFixed(2) + 'x';
    statRate.textContent = rate.toFixed(2) + 'x';
    localStorage.setItem('vp_rate', rateInput.value);
  });

  loopBtn.addEventListener('click', () => {
    const on = loopBtn.getAttribute('aria-pressed') !== 'true';
    loopBtn.setAttribute('aria-pressed', String(on));
    video.loop = on;
  });

  muteBtn.addEventListener('click', () => {
    const on = muteBtn.getAttribute('aria-pressed') !== 'true';
    muteBtn.setAttribute('aria-pressed', String(on));
    video.muted = on;
    muteBtn.innerHTML = on
      ? '<i data-lucide="volume-x"></i>静音'
      : '<i data-lucide="volume-2"></i>静音';
    refreshIcons();
  });

  volumeInput.addEventListener('input', () => {
    video.volume = parseFloat(volumeInput.value);
    video.muted = false;
    muteBtn.setAttribute('aria-pressed', 'false');
  });

  fullBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (video.requestFullscreen) {
      video.controls = true;
      video.requestFullscreen().catch(() => {
        video.controls = false;
      });
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) video.controls = false;
  });

  video.addEventListener('click', togglePlay);

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    switch (event.key) {
      case ' ': event.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': event.preventDefault(); back5.click(); break;
      case 'ArrowRight': event.preventDefault(); fwd5.click(); break;
      case ',': event.preventDefault(); stepFrame(-1); break;
      case '.': event.preventDefault(); stepFrame(1); break;
      case 'ArrowUp':
        event.preventDefault();
        rateInput.value = String(Math.min(4, parseFloat(rateInput.value) + 0.25));
        rateInput.dispatchEvent(new Event('input'));
        break;
      case 'ArrowDown':
        event.preventDefault();
        rateInput.value = String(Math.max(0.25, parseFloat(rateInput.value) - 0.25));
        rateInput.dispatchEvent(new Event('input'));
        break;
      case 'm': muteBtn.click(); break;
      case 'l': loopBtn.click(); break;
      case 'f': fullBtn.click(); break;
    }
  });

  const initialRate = localStorage.getItem('vp_rate');
  if (initialRate) {
    rateInput.value = initialRate;
    video.playbackRate = parseFloat(initialRate);
    rateVal.textContent = parseFloat(initialRate).toFixed(2) + 'x';
    statRate.textContent = parseFloat(initialRate).toFixed(2) + 'x';
  }

  const params = new URLSearchParams(location.search);
  const initialURL = params.get('url') || '';
  const initialTitle = params.get('title') || '';
  if (initialURL) {
    sourceInput.value = initialURL;
    openInput(initialURL, initialTitle);
  }

  refreshIcons();
})();
