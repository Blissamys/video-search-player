// Shared by the Node API, the browser and the offline snapshot generator.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecommendationPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // This is title keyword filtering, not a classification of video contents.
  // Keep complete phrases: single characters such as 性 / 血 / 杀 overblock normal titles.
  const BLOCKED_TITLE_TERMS = Object.freeze({
    sexual: ['成人', '色情', '情色', '成人视频', '成人片', '成人影片', '成人网红', '成人向', '成人内容', '成人用品', '性用品', '女优', '男优', '三级片', '黄色视频', '黄色网站', '淫秽', '淫乱', '裸聊', '裸体', '裸照', '露点', '约炮', '一夜情', '做爱', '性交', '性爱', '性行为', '性虐', '性侵', '强奸', '猥亵', '卖淫', '嫖娼', '援交', '乱伦', '恋童', '擦边', '性暗示', 'porn', 'hentai', 'nsfw', 'r18'],
    violence: ['暴力', '血腥', '虐杀', '屠杀', '虐待', '肢解', '斩首', '砍头', '割喉', '断肢', '碎尸', '杀人', '凶杀', '谋杀', '枪杀', '枪击', '捅人', '捅死', '砍人', '砍死', '殴打', '打架', '斗殴', '霸凌', '家暴', '酷刑', '虐猫', '虐狗', '虐童', '处决', '尸体', '尸检', '尸块', '自杀', '自残'],
    gambling: ['赌博', '赌钱', '赌局', '赌场', '百家乐', '老虎机', '博彩', '赌球', '赌马'],
    drugs: ['吸毒', '贩毒', '制毒', '毒品', '海洛因', '冰毒', '大麻', '可卡因'],
    disturbing: ['恐怖', '惊悚', '鬼片', '灵异', '招魂', '恐吓', '开盒', '网暴'],
  });

  function normalizeTitle(value) {
    return value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}\p{Cf}]/gu, '');
  }
  const terms = Object.values(BLOCKED_TITLE_TERMS).flat().map(normalizeTitle);

  function isTitleAllowed(title) {
    if (typeof title !== 'string' || !title.trim()) return false;
    const value = normalizeTitle(title);
    const withoutMarkup = normalizeTitle(title.replace(/<[^>]*>/g, ''));
    if (/18\s*(?:禁|[+＋])/u.test(title.normalize('NFKC'))) return false;
    // Cards display literal brackets, so check visible contents as well as words
    // separated by formatting tags. Neither representation may bypass the list.
    return !!value && !terms.some(term => value.includes(term) || withoutMarkup.includes(term));
  }

  function eligibleVideos(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter(item => {
      if (!item || item.source !== 'bilibili' || !isTitleAllowed(item.title)) return false;
      const key = item.id || item.url;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function filterSearchResults(items) {
    // Search keeps upstream ranking, source types and page size; only titles
    // failing the shared content rules are removed.
    return (Array.isArray(items) ? items : []).filter(item => item && isTitleAllowed(item.title));
  }

  function chooseRecommendations(items, random = Math.random) {
    const pool = eligibleVideos(items);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 9);
  }

  const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function clockParts(date = new Date()) {
    const parts = Object.fromEntries(dateFormat.formatToParts(date).map(part => [part.type, part.value]));
    return {
      date: parts.year + '/' + parts.month + '/' + parts.day + ' ' + parts.weekday,
      time: timeFormat.format(date),
      day: parts.year + '-' + parts.month + '-' + parts.day,
    };
  }

  return { BLOCKED_TITLE_TERMS, isTitleAllowed, eligibleVideos, filterSearchResults, chooseRecommendations, clockParts };
});
