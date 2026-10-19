(function () {
  'use strict';
  const clock = document.getElementById('headerClock');
  if (!clock) return;
  function updateClock() {
    const now = new Date();
    const parts = window.RecommendationPolicy.clockParts(now);
    document.getElementById('headerDate').textContent = parts.date;
    document.getElementById('headerTime').textContent = parts.time;
    clock.dateTime = now.toISOString();
  }
  updateClock();
  setInterval(updateClock, 1000);
  window.addEventListener('pageshow', updateClock);
  document.addEventListener('visibilitychange', updateClock);
})();
