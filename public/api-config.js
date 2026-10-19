// Set this to the API base URL when the frontend and API are deployed separately.
// Example: 'https://api.shaochenyue.asia'
if (typeof window.VIDEO_API_BASE !== 'string') {
  window.VIDEO_API_BASE = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    ? ''
    : 'https://scy-video-search.cpolar.top';
}
