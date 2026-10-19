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

  let currentURL = '';
  let objectURL = '';
  let frameCallbackId = null;
  let measuredFps = 0;
  let fpsStart = -1;
  let fpsFrames = 0;
  let lastMediaTime = -1;

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

  function loadSource(src, title, host, keepObjectURL) {
    if (!keepObjectURL) releaseObjectURL();
    currentURL = src;
    resetUI();
    videoTitle.textContent = title || '未命名视频';
    videoHost.textContent = host || '--';
    video.src = src;
    video.load();
    stageEmpty.classList.add('hidden');
    startFrameMeter();
  }

  function normalizeInputURL(value) {
    if (!value) throw new Error('请先输入视频直链');
    const url = new URL(value, location.href);
    if (!['http:', 'https:', 'blob:'].includes(url.protocol)) {
      throw new Error('仅支持 http、https 或浏览器生成的视频地址');
    }
    return url.toString();
  }

  function isBilibiliPageURL(value) {
    try {
      const url = new URL(value, location.href);
      const isBilibiliHost = /(^|\.)bilibili\.com$/.test(url.hostname);
      const isShortLinkHost = /(^|\.)b23\.tv$/.test(url.hostname);
      return (isBilibiliHost && /^\/video\//.test(url.pathname)) || isShortLinkHost;
    } catch (_) {
      return false;
    }
  }

  function showBilibiliPageNotice() {
    showNotice('这是 B 站视频网页链接，不是 mp4/webm 视频直链。请粘贴视频文件地址，或选择本机视频。', true);
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
  });

  video.addEventListener('timeupdate', () => {
    if (!isFinite(video.duration) || video.duration <= 0) return;
    if (document.activeElement !== progress) {
      progress.value = String(Math.round((video.currentTime / video.duration) * 1000));
    }
    currentTimeEl.textContent = formatTime(video.currentTime);
  });

  video.addEventListener('play', () => setPlayIcon(true));
  video.addEventListener('pause', () => setPlayIcon(false));
  video.addEventListener('ended', () => setPlayIcon(false));

  video.addEventListener('error', () => {
    if (!video.src) return;
    resetUI();
    stageEmpty.classList.remove('hidden');
    showNotice('这个地址无法播放。请确认它是 mp4/webm 视频直链，且来源允许访问。', true);
  });

  sourceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    clearFeedback();
    if (isBilibiliPageURL(sourceInput.value.trim())) {
      showBilibiliPageNotice();
      return;
    }
    try {
      const url = normalizeInputURL(sourceInput.value.trim());
      const title = fileNameFromURL(url);
      updateLocation(url, title);
      loadSource(url, title, new URL(url).hostname, false);
    } catch (error) {
      showNotice(error.message || '视频网址格式不正确', true);
    }
  });

  localFile.addEventListener('change', () => {
    const file = localFile.files && localFile.files[0];
    if (!file) return;
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
    if (isBilibiliPageURL(initialURL)) {
      sourceInput.value = initialURL;
      showBilibiliPageNotice();
    } else {
      try {
        const normalized = normalizeInputURL(initialURL);
        sourceInput.value = normalized;
        loadSource(normalized, initialTitle || fileNameFromURL(normalized), new URL(normalized).hostname, false);
      } catch (_) {
        showNotice('链接中的视频网址无效。', true);
      }
    }
  }

  refreshIcons();
})();
