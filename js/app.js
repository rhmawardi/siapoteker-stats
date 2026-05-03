// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
let config = {
  token: localStorage.getItem('ig_token') || '',
  accountId: localStorage.getItem('ig_account_id') || '',
  targetReach: parseInt(localStorage.getItem('ig_target_reach') || '50000'),
};
let currentFilter = 'all';
let currentSort = 'recent';
let allMedia = [];
let currentProfile = null;
let deferredPrompt = null;

// ════════════════════════════════════════════════
//  PWA INSTALL
// ════════════════════════════════════════════════
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('install-banner');
  banner.classList.add('show');
});

document.getElementById('btn-install-confirm').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('install-banner').classList.remove('show');
  if (outcome === 'accepted') showToast('✅ Aplikasi berhasil diinstall!');
});

document.getElementById('btn-dismiss').addEventListener('click', () => {
  document.getElementById('install-banner').classList.remove('show');
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').classList.remove('show');
  showToast('✅ Berhasil diinstall di layar utama!');
});

// ════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pageId = 'page-' + btn.dataset.page;
    document.getElementById(pageId).classList.add('active');
  });
});

// ════════════════════════════════════════════════
//  SETTINGS MODAL
// ════════════════════════════════════════════════
document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('input-token').value = config.token;
  document.getElementById('input-account-id').value = config.accountId;
  document.getElementById('input-target-reach').value = config.targetReach;
  document.getElementById('modal-settings').classList.add('open');
});
document.getElementById('modal-settings').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});
document.getElementById('btn-save-settings').addEventListener('click', () => {
  config.token = document.getElementById('input-token').value.trim();
  config.accountId = document.getElementById('input-account-id').value.trim();
  config.targetReach = parseInt(document.getElementById('input-target-reach').value) || 50000;
  localStorage.setItem('ig_token', config.token);
  localStorage.setItem('ig_account_id', config.accountId);
  localStorage.setItem('ig_target_reach', config.targetReach);
  document.getElementById('modal-settings').classList.remove('open');
  if (config.token && config.accountId) {
    showToast('⚡ Memuat data dari API...');
    loadAllData();
  } else {
    showToast('⚠️ Masukkan token dan account ID terlebih dahulu');
  }
});

// ════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════
function fmt(n) {
  if (n === undefined || n === null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('id-ID');
}
function pct(val, total) { return total ? ((val / total) * 100).toFixed(1) + '%' : '0%'; }
function deltaClass(val) { return val >= 0 ? 'delta-pos' : 'delta-neg'; }
function deltaSign(val) { return val >= 0 ? '▲ +' : '▼ '; }

function setApiStatus(status, msg = '') {
  const badge = document.getElementById('api-status-badge');
  const msgEl = document.getElementById('api-status-msg');
  badge.className = 'api-status ' + status;
  if (status === 'ok') badge.textContent = '● Terhubung';
  else if (status === 'err') badge.textContent = '● Error';
  else badge.textContent = '● Memuat...';
  msgEl.textContent = msg;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadTextFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════
//  INSTAGRAM GRAPH API CALLS
// ════════════════════════════════════════════════
const BASE = 'https://graph.instagram.com/v22.0';

async function igFetch(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('access_token', config.token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function fetchInsightMetrics(path, metricNames, params = {}) {
  const data = [];

  for (const metric of metricNames) {
    try {
      const res = await igFetch(path, { ...params, metric });
      data.push(...(res.data || []));
    } catch {
      // Some metrics are unavailable depending on API version/account/media type.
    }
  }

  return { data };
}

// Profile
async function fetchProfile() {
  const fields = 'id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url';
  return await igFetch(`/${config.accountId}`, { fields });
}

// Account insights (views, reach, follower growth)
async function fetchAccountInsights() {
  const since = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const data = (await fetchInsightMetrics(
    `/${config.accountId}/insights`,
    ['views', 'impressions', 'reach'],
    { period: 'day', since, until }
  )).data;

  // Request 2: follower_count berisi follower baru per hari, jadi perlu dijumlahkan.
  try {
    const followerData = await igFetch(`/${config.accountId}/insights`, {
      metric: 'follower_count',
      period: 'day',
      since,
      until,
    });
    data.push(...(followerData.data || []));
  } catch {}

  // Request 3: API versi baru kadang menyediakan breakdown follow/unfollow terpisah.
  try {
    const followData = await igFetch(`/${config.accountId}/insights`, {
      metric: 'follows_and_unfollows',
      period: 'day',
      metric_type: 'total_value',
      breakdown: 'follow_type',
      since,
      until,
    });
    data.push(...(followData.data || []));
  } catch {}

  return { data };
}
// Daily insights for chart
async function fetchDailyInsights() {
  const since = Math.floor((Date.now() - 7 * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  return await fetchInsightMetrics(`/${config.accountId}/insights`, ['views', 'impressions'], {
    period: 'day',
    since,
    until,
  });
}

// Audience demographics
async function fetchAudience() {
  const data = [];

  try {
    const legacy = await igFetch(`/${config.accountId}/insights`, {
      metric: 'audience_gender_age,audience_city',
      period: 'lifetime',
    });
    data.push(...(legacy.data || []));
  } catch {}

  const demographicRequests = [
    { metric: 'follower_demographics', breakdown: 'gender' },
    { metric: 'follower_demographics', breakdown: 'city' },
    { metric: 'follower_demographics', breakdown: 'age,gender' },
  ];

  for (const req of demographicRequests) {
    for (const breakdownParam of ['breakdown', 'breakdowns']) {
      try {
        const res = await igFetch(`/${config.accountId}/insights`, {
          metric: req.metric,
          period: 'lifetime',
          metric_type: 'total_value',
          [breakdownParam]: req.breakdown,
        });
        data.push(...(res.data || []));
        break;
      } catch {
        // Demographic metrics vary by API mode/version and account eligibility.
      }
    }
  }

  return { data };
}

// Media list with insights
async function fetchMedia() {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink';
  const data = await igFetch(`/${config.accountId}/media`, {
    fields,
    limit: 20,
  });
  return data.data || [];
}

// Per-media insights
async function fetchMediaInsights(mediaId, type) {
  const out = {};

  const applyMetrics = (res) => {
    (res.data || []).forEach(m => {
      const value = m.values?.[0]?.value ?? m.total_value?.value ?? m.value ?? 0;
      out[m.name] = readNumber(value);
    });
  };

  for (const metric of ['views,reach,total_interactions,saved,shares', 'views,reach', 'impressions,reach']) {
    try {
      applyMetrics(await igFetch(`/${mediaId}/insights`, { metric }));
    } catch {
      // If any metric in a grouped request is unsupported, try smaller requests below.
    }
  }

  const metricAliases = [
    ['reach'],
    ['views', 'impressions', 'plays', 'video_views'],
    ['saved', 'saves'],
    ['shares'],
    ['total_interactions', 'engagement'],
    ['likes'],
    ['comments'],
  ];

  for (const aliases of metricAliases) {
    if (aliases.some(name => out[name] !== undefined)) continue;

    for (const metric of aliases) {
      try {
        const res = await igFetch(`/${mediaId}/insights`, { metric });
        const item = (res.data || []).find(m => m.name === metric) || (res.data || [])[0];
        if (!item) continue;

        const value = item.values?.[0]?.value ?? item.total_value?.value ?? item.value ?? 0;
        out[metric] = readNumber(value);
        break;
      } catch {
        // Metric availability differs by media type and API version.
      }
    }
  }

  return out;
}

// ════════════════════════════════════════════════
//  RENDER FUNCTIONS
// ════════════════════════════════════════════════
function renderProfile(profile) {
  currentProfile = profile;
  document.getElementById('acct-name').textContent = profile.name || '@siapoteker';
  document.getElementById('acct-username').textContent = '@' + (profile.username || 'siapoteker');
  document.getElementById('acct-bio').textContent = (profile.biography || '').substring(0, 60) || 'Health/Medical · Indonesia';
  document.getElementById('stat-followers').textContent = fmt(profile.followers_count);
  document.getElementById('stat-following').textContent = fmt(profile.follows_count);
  document.getElementById('stat-posts').textContent = fmt(profile.media_count);
}

function readNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function readMetric(source, names, fallback = 0) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    if (source?.[name] !== undefined && source?.[name] !== null) return readNumber(source[name]);
  }
  return fallback;
}

function getMediaStats(media) {
  const likes = readMetric(media.insights, 'likes', media.like_count);
  const comments = readMetric(media.insights, 'comments', media.comments_count);
  const saves = readMetric(media.insights, ['saved', 'saves']);
  const shares = readMetric(media.insights, 'shares');
  const views = readMetric(media.insights, ['views', 'impressions', 'plays', 'video_views']);
  const reach = readMetric(media.insights, 'reach');
  const followers = readNumber(currentProfile?.followers_count);
  const totalInteractions = readMetric(media.insights, ['total_interactions', 'engagement']);
  const engagements = totalInteractions || likes + comments + saves + shares;
  const erReach = reach > 0 ? (engagements / reach) * 100 : 0;
  const erViews = views > 0 ? (engagements / views) * 100 : 0;
  const erFollowers = followers > 0 ? (engagements / followers) * 100 : 0;
  const er = erReach || erViews || erFollowers;

  return { likes, comments, saves, shares, views, reach, followers, engagements, er, erReach, erViews, erFollowers };
}

function calculateWeightedEngagement(mediaArr) {
  const totals = mediaArr.reduce((sum, media) => {
    const stats = getMediaStats(media);
    sum.engagements += stats.engagements;
    sum.reach += stats.reach;
    sum.views += stats.views;
    sum.saves += stats.saves;
    sum.shares += stats.shares;
    return sum;
  }, { engagements: 0, reach: 0, views: 0, saves: 0, shares: 0 });

  const followers = readNumber(currentProfile?.followers_count);
  const reachEr = totals.reach > 0 ? (totals.engagements / totals.reach) * 100 : 0;
  const viewsEr = totals.views > 0 ? (totals.engagements / totals.views) * 100 : 0;
  const followersEr = followers > 0 ? (totals.engagements / followers) * 100 : 0;
  const saveRate = totals.reach > 0 ? (totals.saves / totals.reach) * 100 : 0;
  const shareRate = totals.reach > 0 ? (totals.shares / totals.reach) * 100 : 0;
  const primary = reachEr || viewsEr || followersEr;
  const source = reachEr ? 'reach' : viewsEr ? 'views' : followersEr ? 'followers' : '';

  return { ...totals, followers, reachEr, viewsEr, followersEr, saveRate, shareRate, primary, source };
}

function formatRate(rate) {
  return rate > 0 && Number.isFinite(rate) ? rate.toFixed(2) + '%' : '—';
}

function getErClass(rate) {
  if (rate >= 5) return 'er-high';
  if (rate >= 2) return 'er-mid';
  return 'er-low';
}

function hasAnyMetric(source, names) {
  const list = Array.isArray(names) ? names : [names];
  return list.some(name => source?.[name] !== undefined && source?.[name] !== null);
}

function sumInsightValues(metric) {
  return (metric?.values || []).reduce((sum, item) => sum + readNumber(item.value), 0);
}

function readFollowBreakdown(metric) {
  let followers = null;

  const addFollowerValue = (value) => {
    const n = readNumber(value);
    if (n || value === 0) followers = (followers || 0) + n;
  };

  const walk = (node, label = '') => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(item => walk(item, label));
      return;
    }
    if (typeof node !== 'object') return;

    const labels = [label];
    if (Array.isArray(node.dimension_values)) labels.push(...node.dimension_values.map(String));
    const joined = labels.join(' ').toLowerCase();
    if (joined.includes('follow') && !joined.includes('unfollow') && !joined.includes('non')) {
      addFollowerValue(node.value);
    }

    for (const [key, value] of Object.entries(node)) {
      const keyLabel = String(key).toLowerCase();
      if (keyLabel.includes('follow') && !keyLabel.includes('unfollow') && !keyLabel.includes('non')) {
        addFollowerValue(value);
      }
      if (typeof value === 'object') walk(value, key);
    }
  };

  walk(metric?.total_value);
  walk(metric?.values);
  return followers;
}

function readFollowerSnapshotDelta(profile) {
  const current = readNumber(profile?.followers_count);
  if (!current) return null;

  const key = `ig_followers_snapshot_${config.accountId}`;
  const previous = JSON.parse(localStorage.getItem(key) || 'null');
  localStorage.setItem(key, JSON.stringify({ value: current, at: Date.now() }));

  if (!previous || !readNumber(previous.value)) return null;
  return current - readNumber(previous.value);
}

function renderKPIs(insights, profile = null) {
  const find = (name) => insights.find(d => d.name === name);
  const viewsMetric = find('views') || find('impressions');
  const reach = find('reach');
  const fc = find('follower_count');
  const follows = find('follows_and_unfollows');

  const viewsVal = sumInsightValues(viewsMetric);
  const reachVal = sumInsightValues(reach);
  let fcNew = sumInsightValues(fc);
  let fcSub = '7 hari terakhir';

  const followsNew = readFollowBreakdown(follows);
  if (followsNew !== null) {
    fcNew = followsNew;
    fcSub = '7 hari terakhir (follow)';
  }

  const snapshotDelta = readFollowerSnapshotDelta(profile);
  if (!fcNew && snapshotDelta !== null) {
    fcNew = snapshotDelta;
    fcSub = 'sejak update terakhir';
  }

  document.getElementById('kpi-impressions').textContent = fmt(viewsVal);
  document.getElementById('kpi-impressions-delta').textContent = viewsMetric?.name === 'views' ? 'dari account views' : 'fallback impressions';
  document.getElementById('kpi-reach').textContent = fmt(reachVal);
  document.getElementById('kpi-new-followers').textContent = (fcNew >= 0 ? '+' : '') + fmt(fcNew);
  document.getElementById('kpi-followers-sub').textContent = fcSub;

  // Reach bar
  const pctVal = Math.min(100, Math.round((reachVal / config.targetReach) * 100));
  document.getElementById('reach-pct').textContent = pctVal + '%';
  document.getElementById('reach-bar').style.width = pctVal + '%';
  document.getElementById('reach-target-lbl').textContent = 'Target: ' + fmt(config.targetReach);
}

function isWithinLastDays(dateLike, days) {
  const time = new Date(dateLike).getTime();
  if (!Number.isFinite(time)) return false;
  return time >= Date.now() - days * 86400000;
}

function renderOverviewViewsFromMedia(mediaArr) {
  const recentMedia = mediaArr.filter(m => isWithinLastDays(m.timestamp, 7));
  const viewsTotal = recentMedia.reduce((sum, media) => sum + getMediaStats(media).views, 0);

  if (viewsTotal > 0) {
    document.getElementById('kpi-impressions').textContent = fmt(viewsTotal);
    document.getElementById('kpi-impressions-delta').textContent = `dari ${recentMedia.length} konten terbaru`;
  }
}

function renderOverviewEngagement(mediaArr) {
  const weighted = calculateWeightedEngagement(mediaArr);

  if (!weighted.primary) {
    document.getElementById('kpi-engagement').textContent = '—';
    document.getElementById('kpi-engagement-sub').textContent = 'menunggu insight konten';
    document.getElementById('kpi-save-rate').textContent = '—';
    document.getElementById('kpi-save-rate-sub').textContent = 'menunggu reach konten';
    document.getElementById('kpi-share-rate').textContent = '—';
    document.getElementById('kpi-share-rate-sub').textContent = 'menunggu reach konten';
    document.getElementById('er-by-reach').textContent = '—';
    document.getElementById('er-by-views').textContent = '—';
    document.getElementById('er-by-followers').textContent = '—';
    return;
  }

  const sourceLabel = weighted.source === 'reach'
    ? 'Reach'
    : weighted.source === 'views'
      ? 'Views'
      : weighted.source === 'followers'
        ? 'Followers'
        : 'data tersedia';

  document.getElementById('kpi-engagement').textContent = formatRate(weighted.primary);
  document.getElementById('kpi-engagement-sub').textContent = `weighted ER by ${sourceLabel} dari ${mediaArr.length} konten`;
  document.getElementById('er-by-reach').textContent = formatRate(weighted.reachEr);
  document.getElementById('er-by-views').textContent = formatRate(weighted.viewsEr);
  document.getElementById('er-by-followers').textContent = formatRate(weighted.followersEr);
  document.getElementById('kpi-save-rate').textContent = formatRate(weighted.saveRate);
  document.getElementById('kpi-save-rate-sub').textContent = `${fmt(weighted.saves)} saves / ${fmt(weighted.reach)} reach`;
  document.getElementById('kpi-share-rate').textContent = formatRate(weighted.shareRate);
  document.getElementById('kpi-share-rate-sub').textContent = `${fmt(weighted.shares)} shares / ${fmt(weighted.reach)} reach`;
}

function buildLast7Days() {
  const days = [];
  const formatter = new Intl.DateTimeFormat('id-ID', { weekday: 'short' });

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    days.push({
      key: date.toISOString().slice(0, 10),
      label: formatter.format(date).replace('.', ''),
      value: 0,
    });
  }

  return days;
}

function readDemographicBreakdown(metric, desiredKeys) {
  const keys = Array.isArray(desiredKeys) ? desiredKeys : [desiredKeys];
  const out = {};
  const breakdowns = metric?.total_value?.breakdowns || [];

  breakdowns.forEach(breakdown => {
    const dimensionKeys = breakdown.dimension_keys || [];
    const keyIndexes = keys
      .map(key => dimensionKeys.findIndex(k => String(k).toLowerCase() === key))
      .filter(index => index >= 0);

    if (!keyIndexes.length) return;

    (breakdown.results || []).forEach(result => {
      const dimensionValues = result.dimension_values || [];
      const label = keyIndexes.map(index => dimensionValues[index]).filter(Boolean).join('.');
      if (!label) return;
      out[label] = (out[label] || 0) + readNumber(result.value);
    });
  });

  return out;
}

function renderAudienceEmpty() {
  document.getElementById('demo-female').style.width = '0%';
  document.getElementById('demo-female-pct').textContent = '—';
  document.getElementById('demo-male').style.width = '0%';
  document.getElementById('demo-male-pct').textContent = '—';
  document.getElementById('demo-cities').innerHTML = `
    <div class="demo-item">
      <span class="demo-label" style="width:100%;font-size:10px;color:var(--text3)">Data audiens belum tersedia</span>
    </div>
  `;
}

function renderAudience(insights) {
  const genderAge = insights.find(d => d.name === 'audience_gender_age');
  const city = insights.find(d => d.name === 'audience_city');
  const demographics = insights.filter(d => d.name === 'follower_demographics');

  let renderedGender = false;
  if (genderAge?.values?.[0]?.value) {
    const gd = genderAge.values[0].value;
    let f = 0, m = 0;
    for (const [k, v] of Object.entries(gd)) {
      if (k.startsWith('F.')) f += v;
      if (k.startsWith('M.')) m += v;
    }
    const total = f + m || 1;
    const fp = Math.round((f / total) * 100);
    const mp = 100 - fp;
    document.getElementById('demo-female').style.width = fp + '%';
    document.getElementById('demo-female-pct').textContent = fp + '%';
    document.getElementById('demo-male').style.width = mp + '%';
    document.getElementById('demo-male-pct').textContent = mp + '%';
    renderedGender = true;
  } else {
    const genderData = demographics.reduce((acc, metric) => {
      const values = readDemographicBreakdown(metric, 'gender');
      Object.entries(values).forEach(([key, value]) => {
        const normalized = key.toLowerCase();
        if (normalized === 'f' || normalized.includes('female') || normalized.includes('woman')) acc.f += value;
        if (normalized === 'm' || normalized.includes('male') || normalized.includes('man')) acc.m += value;
      });
      return acc;
    }, { f: 0, m: 0 });

    if (genderData.f || genderData.m) {
      const total = genderData.f + genderData.m || 1;
      const fp = Math.round((genderData.f / total) * 100);
      const mp = 100 - fp;
      document.getElementById('demo-female').style.width = fp + '%';
      document.getElementById('demo-female-pct').textContent = fp + '%';
      document.getElementById('demo-male').style.width = mp + '%';
      document.getElementById('demo-male-pct').textContent = mp + '%';
      renderedGender = true;
    }
  }

  let renderedCity = false;
  if (city?.values?.[0]?.value) {
    const cd = city.values[0].value;
    const sorted = Object.entries(cd).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
    document.getElementById('demo-cities').innerHTML = sorted.map(([name, val]) => `
      <div class="demo-item">
        <span class="demo-label" style="width:60px;font-size:10px">${name.split(',')[0]}</span>
        <div class="demo-bar-track"><div class="demo-bar-fill" style="width:${Math.round((val/total)*100)}%"></div></div>
        <span class="demo-pct">${Math.round((val/total)*100)}%</span>
      </div>
    `).join('');
    renderedCity = true;
  } else {
    const cityData = demographics.reduce((acc, metric) => {
      const values = readDemographicBreakdown(metric, 'city');
      Object.entries(values).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + value;
      });
      return acc;
    }, {});

    const sorted = Object.entries(cityData).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (sorted.length) {
      const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
      document.getElementById('demo-cities').innerHTML = sorted.map(([name, val]) => `
        <div class="demo-item">
          <span class="demo-label" style="width:60px;font-size:10px">${name.split(',')[0]}</span>
          <div class="demo-bar-track"><div class="demo-bar-fill" style="width:${Math.round((val/total)*100)}%"></div></div>
          <span class="demo-pct">${Math.round((val/total)*100)}%</span>
        </div>
      `).join('');
      renderedCity = true;
    }
  }

  if (!renderedGender && !renderedCity) {
    renderAudienceEmpty();
  }
}

function getPostingTimeZoneInfo() {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const offsetHours = -new Date().getTimezoneOffset() / 60;

  if (browserZone.includes('Jakarta') || browserZone.includes('Pontianak') || offsetHours === 7) {
    return { timeZone: 'Asia/Jakarta', label: 'WIB' };
  }
  if (browserZone.includes('Makassar') || browserZone.includes('Ujung_Pandang') || browserZone.includes('Singapore') || offsetHours === 8) {
    return { timeZone: 'Asia/Makassar', label: 'WITA' };
  }
  if (browserZone.includes('Jayapura') || offsetHours === 9) {
    return { timeZone: 'Asia/Jayapura', label: 'WIT' };
  }

  return { timeZone: browserZone || 'Asia/Jakarta', label: 'WIB' };
}

function getPostTimeParts(timestamp, timeZone) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const weekday = parts.find(p => p.type === 'weekday')?.value;
    const hourValue = parts.find(p => p.type === 'hour')?.value;
    const dayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    return {
      dayIndex: dayMap[weekday] ?? 0,
      hour: Number(hourValue) % 24,
    };
  } catch {
    const jsDay = date.getDay();
    return {
      dayIndex: jsDay === 0 ? 6 : jsDay - 1,
      hour: date.getHours(),
    };
  }
}

function renderHeatmap(mediaArr = []) {
  const hm = document.getElementById('heatmap');
  const hourWrap = document.getElementById('heatmap-hours');
  const summary = document.getElementById('best-hour-summary');
  const zone = getPostingTimeZoneInfo();
  const hours = [6, 9, 12, 15, 18, 21];
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const scores = Array.from({ length: hours.length }, () => Array(7).fill(0));

  mediaArr.forEach(media => {
    const postTime = getPostTimeParts(media.timestamp, zone.timeZone);
    if (!postTime) return;

    const nearestHourIndex = hours.reduce((best, current, index) => (
      Math.abs(current - postTime.hour) < Math.abs(hours[best] - postTime.hour) ? index : best
    ), 0);
    const stats = getMediaStats(media);
    const score = stats.er || stats.views || stats.likes || 0;
    scores[nearestHourIndex][postTime.dayIndex] += score;
  });

  if (!mediaArr.length || !scores.flat().some(Boolean)) {
    const fallback = [0,1,2,3,2,1,0, 1,2,3,4,3,2,1, 1,3,4,3,2,1,0, 0,1,2,3,4,3,2, 1,2,3,3,2,1,0, 0,1,2,3,4,3,2];
    const fallbackHours = [6, 9, 12, 15, 18, 21];
    hourWrap.innerHTML = fallbackHours.map(h => `<div class="heat-hour-label">${String(h).padStart(2, '0')}</div>`).join('');
    hm.innerHTML = fallback.map((l, i) => `<div class="heat-cell ${l > 0 ? 'h' + l : ''}">${String(fallbackHours[Math.floor(i / 7)]).padStart(2, '0')}</div>`).join('');
    summary.textContent = `18:00-21:00 ${zone.label}`;
    return;
  }

  const flatScores = scores.flat();
  const max = Math.max(...flatScores, 1);
  let bestScore = -1;
  let bestHour = hours[0];
  let bestDay = days[0];

  hourWrap.innerHTML = hours.map(h => `<div class="heat-hour-label">${String(h).padStart(2, '0')}</div>`).join('');
  hm.innerHTML = scores.map((row, rowIndex) => row.map((score, dayIndex) => {
    if (score > bestScore) {
      bestScore = score;
      bestHour = hours[rowIndex];
      bestDay = days[dayIndex];
    }
    const level = Math.ceil((score / max) * 4);
    const label = String(hours[rowIndex]).padStart(2, '0');
    return `<div class="heat-cell ${level > 0 ? 'h' + level : ''}" title="${days[dayIndex]} ${label}:00 ${zone.label}">${label}</div>`;
  }).join('')).join('');

  summary.textContent = `${bestDay} ${String(bestHour).padStart(2, '0')}:00 ${zone.label}`;
}

function renderMedia(mediaArr) {
  allMedia = mediaArr;
  filterAndRenderMedia();
}

function filterAndRenderMedia() {
  let filtered = currentFilter === 'all' ? allMedia : allMedia.filter(m => m.media_type === currentFilter);
  const container = document.getElementById('content-list');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Belum ada konten</div><div class="empty-desc">Tidak ada konten yang sesuai filter.</div></div>`;
    return;
  }
  const benchmarks = getContentBenchmarks(filtered);

  filtered.sort((a, b) => {
    const av = getMediaStats(a);
    const bv = getMediaStats(b);

    if (currentSort === 'views') return bv.views - av.views;
    if (currentSort === 'likes') return bv.likes - av.likes;
    if (currentSort === 'er') return bv.er - av.er;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  container.innerHTML = filtered.map((m, i) => {
    const rank = i < 3 ? `<span class="content-rank rank-${i+1}">${['🥇','🥈','🥉'][i]}</span>` : '';
    const typeIcon = { IMAGE: '🖼️', VIDEO: '🎬', CAROUSEL_ALBUM: '📷' }[m.media_type] || '📄';
    const typeLabel = { IMAGE: 'FOTO', VIDEO: 'VIDEO', CAROUSEL_ALBUM: 'SLIDE' }[m.media_type] || '';
    const hasInsights = !!m.insights && Object.keys(m.insights).length > 0;
    const stats = getMediaStats(m);
    const health = calculateContentHealth(m, benchmarks);
    const anomaly = getAnomalyBadge(m, benchmarks);
    const { likes, comments, reach, views } = stats;
    const saves = hasInsights && hasAnyMetric(m.insights, ['saved', 'saves']) ? readMetric(m.insights, ['saved', 'saves']) : null;
    const shares = hasInsights && hasAnyMetric(m.insights, 'shares') ? readMetric(m.insights, 'shares') : null;
    const caption = (m.caption || 'Tanpa caption').substring(0, 100);
    const date = new Date(m.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

    const savesDisplay = saves !== null ? fmt(saves) : '—';
    const sharesDisplay = shares !== null ? fmt(shares) : '—';

    return `
      <div class="content-card" onclick="window.open('${m.permalink}','_blank')">
        ${rank}
        ${anomaly ? `<span class="anomaly-badge ${anomaly.cls}">${anomaly.label}</span>` : ''}
        <div class="content-thumb">
          ${typeIcon}
          <span class="content-type-badge">${typeLabel}</span>
        </div>
        <div class="content-info">
          <div class="content-caption">${caption}</div>
          <div class="content-meta">
            <span class="content-metric"><span class="ico">❤️</span>${fmt(likes)}</span>
            <span class="content-metric"><span class="ico">💬</span>${fmt(comments)}</span>
            <span class="content-metric"><span class="ico">🔖</span>${savesDisplay}</span>
            <span class="content-metric"><span class="ico">🔗</span>${sharesDisplay}</span>
            ${reach ? `<span class="content-metric"><span class="ico">📡</span>${fmt(reach)}</span>` : ''}
            ${views ? `<span class="content-metric"><span class="ico">▶️</span>${fmt(views)}</span>` : ''}
            <span class="content-metric" style="margin-left:auto;color:var(--text3)">${date}</span>
          </div>
          <div class="health-row">
            <span class="health-label">Health Score</span>
            <div class="health-track"><div class="health-fill ${health.cls}" style="width:${health.score}%"></div></div>
            <span class="health-score ${health.cls}">${health.score} · ${health.label}</span>
          </div>
          <div class="content-er-row">
            <span class="content-er-badge ${getErClass(stats.erReach)}">Reach ${formatRate(stats.erReach)}</span>
            <span class="content-er-badge ${getErClass(stats.erViews)}">Views ${formatRate(stats.erViews)}</span>
            <span class="content-er-badge ${getErClass(stats.erFollowers)}">Followers ${formatRate(stats.erFollowers)}</span>
            <span class="content-er-label">${hasInsights ? `Engagement ${fmt(stats.engagements)}` : 'Insight terbatas'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getMediaPerformanceScore(media) {
  const stats = getMediaStats(media);
  return stats.erReach || stats.erViews || stats.erFollowers || 0;
}

function createInsightGroup(label) {
  return {
    label,
    count: 0,
    score: 0,
    engagements: 0,
    reach: 0,
    views: 0,
    saves: 0,
    shares: 0,
  };
}

function addToInsightGroup(group, media) {
  const stats = getMediaStats(media);
  group.count += 1;
  group.score += getMediaPerformanceScore(media);
  group.engagements += stats.engagements;
  group.reach += stats.reach;
  group.views += stats.views;
  group.saves += stats.saves;
  group.shares += stats.shares;
}

function rankInsightGroups(groups) {
  return Object.values(groups)
    .filter(group => group.count > 0)
    .map(group => ({
      ...group,
      avgScore: group.score / group.count,
      weightedEr: group.reach > 0
        ? (group.engagements / group.reach) * 100
        : group.views > 0
          ? (group.engagements / group.views) * 100
          : group.avgScore,
    }))
    .sort((a, b) => b.weightedEr - a.weightedEr || b.avgScore - a.avgScore || b.count - a.count);
}

function detectContentType(caption = '') {
  const text = caption.toLowerCase();
  const rules = [
    { label: 'Edukasi Obat', pattern: /obat|antibiotik|paracetamol|generik|paten|herbal|kimia|interaksi/ },
    { label: 'Tips & Cara Pakai', pattern: /tips|cara|panduan|langkah|benar|aturan|minum|pakai|gunakan/ },
    { label: 'Mitos vs Fakta', pattern: /mitos|fakta|vs|versus|bedanya|mana yang lebih/ },
    { label: 'Peringatan Kesehatan', pattern: /jangan|wajib|bahaya|hati-hati|waspada|efek samping|risiko/ },
    { label: 'Tanya Jawab', pattern: /\?|boleh|nggak|apakah|kenapa|jawaban|jawabannya/ },
  ];

  return rules.find(rule => rule.pattern.test(text))?.label || 'Konten Umum';
}

function detectCta(caption = '') {
  const text = caption.toLowerCase();
  const rules = [
    { label: 'Simpan', pattern: /simpan|save|bookmark/ },
    { label: 'Bagikan', pattern: /share|bagikan|kirim|sebarkan/ },
    { label: 'Komentar', pattern: /komen|komentar|jawab|ceritakan|tulis|pendapat/ },
    { label: 'Tag Teman', pattern: /tag|mention|teman/ },
    { label: 'Follow', pattern: /follow|ikuti/ },
    { label: 'Baca/Swipe', pattern: /baca|swipe|geser|lihat slide|thread/ },
  ];

  return rules.find(rule => rule.pattern.test(text))?.label || 'Tanpa CTA eksplisit';
}

function detectCaptionHook(caption = '') {
  const clean = caption.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const text = clean.toLowerCase();
  const firstLine = clean.split(/\n|[.!?]/).find(Boolean) || clean;

  if (/^\d+|^\p{Emoji}/u.test(caption.trim()) || /\b\d+\b/.test(firstLine)) return 'Angka/Listicle';
  if (/\?/.test(firstLine) || /^(boleh|apakah|kenapa|gimana|bagaimana|mana)\b/.test(text)) return 'Pertanyaan';
  if (/^(jangan|wajib|awas|hati-hati|waspada)\b/.test(text)) return 'Peringatan';
  if (/mitos|fakta|vs|versus|bedanya/.test(text)) return 'Mitos vs Fakta';
  if (/^(cara|tips|panduan|kenali|ketahui)\b/.test(text)) return 'Edukasi Langsung';
  return 'Naratif/Umum';
}

function summarizeCaption(caption = '') {
  const clean = caption.replace(/\s+/g, ' ').trim() || 'Tanpa caption';
  return clean.length > 70 ? clean.slice(0, 67) + '...' : clean;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getAnalyzedMedia(mediaArr) {
  return mediaArr.map(media => {
    const stats = getMediaStats(media);
    const distribution = stats.reach || stats.views || stats.followers || 0;
    const saveShareRate = distribution > 0 ? ((stats.saves + stats.shares) / distribution) * 100 : 0;
    return {
      media,
      stats,
      score: getMediaPerformanceScore(media),
      distribution,
      saveShareRate,
      caption: summarizeCaption(media.caption || ''),
    };
  });
}

function normalizeToBenchmark(value, benchmark) {
  if (!benchmark) return value > 0 ? 60 : 0;
  return Math.min(100, (value / (benchmark * 2)) * 100);
}

function getContentBenchmarks(mediaArr) {
  const analyzed = getAnalyzedMedia(mediaArr);
  return {
    analyzed,
    medianScore: median(analyzed.map(item => item.score)),
    medianDistribution: median(analyzed.map(item => item.distribution)),
    medianSaveShareRate: median(analyzed.map(item => item.saveShareRate)),
  };
}

function calculateContentHealth(media, benchmarks) {
  const item = getAnalyzedMedia([media])[0];
  const cta = detectCta(media.caption || '');
  const erScore = normalizeToBenchmark(item.score, benchmarks.medianScore);
  const distributionScore = normalizeToBenchmark(item.distribution, benchmarks.medianDistribution);
  const saveShareScore = normalizeToBenchmark(item.saveShareRate, benchmarks.medianSaveShareRate);
  const ctaScore = cta === 'Tanpa CTA eksplisit' ? 35 : 100;
  const score = Math.round((erScore * 0.35) + (distributionScore * 0.25) + (saveShareScore * 0.25) + (ctaScore * 0.15));
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Needs Work' : 'Low Signal';
  const cls = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'work' : 'low';

  return { score, label, cls };
}

function getAnomalyBadge(media, benchmarks) {
  const item = getAnalyzedMedia([media])[0];
  const highEr = item.score > benchmarks.medianScore;
  const lowEr = item.score < benchmarks.medianScore;
  const highDistribution = item.distribution > benchmarks.medianDistribution;
  const lowDistribution = item.distribution < benchmarks.medianDistribution;
  const saveMagnet = item.saveShareRate > benchmarks.medianSaveShareRate && item.saveShareRate > 0;

  if (highEr && highDistribution) return { label: 'Viral candidate', cls: 'viral' };
  if (highEr && lowDistribution) return { label: 'Hidden gem', cls: 'gem' };
  if (lowEr && highDistribution) return { label: 'Needs hook fix', cls: 'fix' };
  if (saveMagnet) return { label: 'Save magnet', cls: 'save' };
  return null;
}

function buildContentMatrix(benchmarks) {
  return benchmarks.analyzed.reduce((matrix, item) => {
    const highDistribution = benchmarks.medianDistribution
      ? item.distribution >= benchmarks.medianDistribution
      : item.distribution > 0;
    const highEr = benchmarks.medianScore
      ? item.score >= benchmarks.medianScore
      : item.score > 0;
    const reachKey = highDistribution ? 'highReach' : 'lowReach';
    const erKey = highEr ? 'highEr' : 'lowEr';
    matrix[`${reachKey}_${erKey}`] += 1;
    return matrix;
  }, {
    highReach_highEr: 0,
    highReach_lowEr: 0,
    lowReach_highEr: 0,
    lowReach_lowEr: 0,
  });
}

function buildReportRows(mediaArr = allMedia) {
  const weighted = calculateWeightedEngagement(mediaArr);
  const summary = [
    ['Report Date', new Date().toLocaleString('id-ID')],
    ['Account', currentProfile?.username ? '@' + currentProfile.username : '@siapoteker'],
    ['Followers', readNumber(currentProfile?.followers_count)],
    ['Media Count', mediaArr.length],
    ['Total Reach', weighted.reach],
    ['Total Views', weighted.views],
    ['Total Engagements', weighted.engagements],
    ['Weighted ER', formatRate(weighted.primary)],
    ['ER by Reach', formatRate(weighted.reachEr)],
    ['ER by Views', formatRate(weighted.viewsEr)],
    ['ER by Followers', formatRate(weighted.followersEr)],
    ['Save Rate', formatRate(weighted.saveRate)],
    ['Share Rate', formatRate(weighted.shareRate)],
  ];

  const media = mediaArr.map(item => {
    const stats = getMediaStats(item);
    const health = calculateContentHealth(item, getContentBenchmarks(mediaArr));
    return {
      date: new Date(item.timestamp).toLocaleDateString('id-ID'),
      type: item.media_type,
      caption: summarizeCaption(item.caption || ''),
      likes: stats.likes,
      comments: stats.comments,
      saves: stats.saves,
      shares: stats.shares,
      reach: stats.reach,
      views: stats.views,
      engagements: stats.engagements,
      erReach: formatRate(stats.erReach),
      erViews: formatRate(stats.erViews),
      erFollowers: formatRate(stats.erFollowers),
      health: `${health.score} ${health.label}`,
      permalink: item.permalink || '',
    };
  });

  return { summary, media, weighted };
}

function exportReportCsv() {
  const mediaArr = allMedia.length ? allMedia : [];
  if (!mediaArr.length) {
    showToast('⚠️ Belum ada data konten untuk diexport');
    return;
  }

  const report = buildReportRows(mediaArr);
  const lines = [];
  lines.push('Summary');
  report.summary.forEach(row => lines.push(row.map(csvCell).join(',')));
  lines.push('');
  lines.push('Content Performance');
  lines.push([
    'Date', 'Type', 'Caption', 'Likes', 'Comments', 'Saves', 'Shares', 'Reach', 'Views',
    'Engagements', 'ER by Reach', 'ER by Views', 'ER by Followers', 'Health Score', 'Permalink'
  ].map(csvCell).join(','));
  report.media.forEach(row => {
    lines.push([
      row.date, row.type, row.caption, row.likes, row.comments, row.saves, row.shares,
      row.reach, row.views, row.engagements, row.erReach, row.erViews, row.erFollowers,
      row.health, row.permalink,
    ].map(csvCell).join(','));
  });

  downloadTextFile(`siapoteker-report-${todayStamp()}.csv`, lines.join('\r\n'), 'text/csv;charset=utf-8');
  showToast('✅ CSV report berhasil dibuat');
}

function exportReportPdf() {
  const mediaArr = allMedia.length ? allMedia : [];
  if (!mediaArr.length) {
    showToast('⚠️ Belum ada data konten untuk diexport');
    return;
  }

  const report = buildReportRows(mediaArr);
  const topRows = report.media.slice(0, 12);
  const win = window.open('', '_blank');
  if (!win) {
    showToast('⚠️ Pop-up diblokir. Izinkan pop-up untuk export PDF.');
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8" />
      <title>SiApoteker IG Analytics Report</title>
      <style>
        body { font-family: Arial, sans-serif; color: #14202b; margin: 32px; }
        h1 { margin: 0; font-size: 24px; }
        .muted { color: #637083; font-size: 12px; margin-top: 4px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 22px 0; }
        .card { border: 1px solid #d8e0ea; border-radius: 10px; padding: 12px; }
        .label { font-size: 11px; color: #637083; margin-bottom: 6px; }
        .value { font-size: 20px; font-weight: 800; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border-bottom: 1px solid #e6ecf2; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f5f8fb; color: #405064; }
        .caption { max-width: 220px; }
        @media print { body { margin: 18mm; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <button class="no-print" onclick="window.print()" style="float:right;padding:8px 12px">Print / Save PDF</button>
      <h1>SiApoteker IG Analytics Report</h1>
      <div class="muted">Generated ${escapeHtml(new Date().toLocaleString('id-ID'))} · ${escapeHtml(currentProfile?.username ? '@' + currentProfile.username : '@siapoteker')}</div>
      <div class="grid">
        <div class="card"><div class="label">Weighted ER</div><div class="value">${formatRate(report.weighted.primary)}</div></div>
        <div class="card"><div class="label">Total Reach</div><div class="value">${fmt(report.weighted.reach)}</div></div>
        <div class="card"><div class="label">Save Rate</div><div class="value">${formatRate(report.weighted.saveRate)}</div></div>
        <div class="card"><div class="label">Share Rate</div><div class="value">${formatRate(report.weighted.shareRate)}</div></div>
      </div>
      <h2>Content Performance</h2>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Caption</th><th>Reach</th><th>Views</th><th>Eng.</th><th>ER Reach</th><th>Health</th></tr></thead>
        <tbody>
          ${topRows.map(row => `
            <tr>
              <td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.type)}</td><td class="caption">${escapeHtml(row.caption)}</td>
              <td>${escapeHtml(fmt(row.reach))}</td><td>${escapeHtml(fmt(row.views))}</td><td>${escapeHtml(fmt(row.engagements))}</td>
              <td>${escapeHtml(row.erReach)}</td><td>${escapeHtml(row.health)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  showToast('✅ PDF report siap dicetak');
}

function setExecutiveSummary(status, title, desc, points = {}) {
  const statusEl = document.getElementById('exec-status');
  document.getElementById('exec-title').textContent = title;
  document.getElementById('exec-desc').textContent = desc;
  document.getElementById('exec-format').textContent = points.format || '—';
  document.getElementById('exec-momentum').textContent = points.momentum || '—';
  document.getElementById('exec-action').textContent = points.action || '—';
  statusEl.textContent = status.label;
  statusEl.className = 'exec-status ' + (status.cls || '');
}

function renderExecutiveSummary(mediaArr = []) {
  if (!mediaArr.length) {
    setExecutiveSummary(
      { label: 'No Data', cls: 'warn' },
      'Belum ada konten untuk dianalisis',
      'Hubungkan API atau refresh data untuk melihat ringkasan performa dan rekomendasi utama.',
      { action: 'Muat data konten' }
    );
    return;
  }

  const weighted = calculateWeightedEngagement(mediaArr);
  const benchmarks = getContentBenchmarks(mediaArr);
  const matrix = buildContentMatrix(benchmarks);
  const formatLabels = { IMAGE: 'Foto', VIDEO: 'Video', CAROUSEL_ALBUM: 'Carousel' };
  const bestFormat = buildGroupedInsight(mediaArr, media => formatLabels[media.media_type] || media.media_type)[0];
  const bestType = buildGroupedInsight(mediaArr, media => detectContentType(media.caption || ''))[0];
  const bestCta = buildGroupedInsight(mediaArr, media => detectCta(media.caption || ''))[0];
  const bestSlot = buildGroupedInsight(mediaArr, getPostingSlot)[0];
  const hiddenGem = benchmarks.analyzed
    .filter(item => item.score > benchmarks.medianScore && item.distribution < benchmarks.medianDistribution)
    .sort((a, b) => b.score - a.score)[0];
  const underperforming = benchmarks.analyzed
    .filter(item => item.distribution > benchmarks.medianDistribution && item.score < benchmarks.medianScore)
    .sort((a, b) => b.distribution - a.distribution)[0];

  const status = weighted.primary >= 5
    ? { label: 'Strong', cls: '' }
    : weighted.primary >= 2
      ? { label: 'Watch', cls: 'warn' }
      : { label: 'Fix', cls: 'hot' };
  const title = `${bestFormat?.label || 'Konten'} ${bestType ? '+ ' + bestType : ''} sedang paling menjanjikan`;
  const issue = underperforming
    ? `Ada ${matrix.highReach_lowEr} konten reach tinggi dengan ER rendah yang perlu diperbaiki hook/CTA-nya.`
    : hiddenGem
      ? `Ada hidden gem yang layak dipush ulang karena ER-nya di atas median.`
      : `Belum ada anomali besar; lanjutkan eksperimen terukur.`;
  const desc = `Weighted ER saat ini ${formatRate(weighted.primary)} dari ${mediaArr.length} konten. ${issue}`;
  const ctaText = bestCta?.label && bestCta.label !== 'Tanpa CTA eksplisit' ? bestCta.label : 'CTA ringan';

  setExecutiveSummary(status, title, desc, {
    format: bestFormat ? `${bestFormat.label} · ${formatRate(bestFormat.weightedEr)}` : 'Belum cukup data',
    momentum: bestSlot ? bestSlot.label : `${matrix.highReach_highEr} winner`,
    action: bestType ? `${bestType.label} + ${ctaText}` : hiddenGem ? 'Push hidden gem' : 'Uji format baru',
  });
}

function getPostingSlot(media) {
  const zone = getPostingTimeZoneInfo();
  const parts = getPostTimeParts(media.timestamp, zone.timeZone);
  if (!parts) return null;

  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const hour = parts.hour;
  const slot = hour < 6
    ? '00:00-06:00'
    : hour < 11
      ? '06:00-11:00'
      : hour < 15
        ? '11:00-15:00'
        : hour < 18
          ? '15:00-18:00'
          : hour < 22
            ? '18:00-22:00'
            : '22:00-24:00';

  return `${days[parts.dayIndex]} ${slot} ${zone.label}`;
}

function buildGroupedInsight(mediaArr, getLabel) {
  const groups = {};

  mediaArr.forEach(media => {
    const label = getLabel(media);
    if (!label) return;
    if (!groups[label]) groups[label] = createInsightGroup(label);
    addToInsightGroup(groups[label], media);
  });

  return rankInsightGroups(groups);
}

function renderInsights(profile, insightsData, mediaArr) {
  const container = document.getElementById('insights-list');
  const insights = [];

  // Engagement rate check
  if (mediaArr.length > 0) {
    const weighted = calculateWeightedEngagement(mediaArr);
    const er = weighted.primary;
    const sourceLabel = weighted.source === 'reach'
      ? 'Reach'
      : weighted.source === 'views'
        ? 'Views'
        : weighted.source === 'followers'
          ? 'Followers'
          : 'data tersedia';

    if (er > 3) {
      insights.push({ icon: '🔥', cls: 'teal', title: `Weighted ER Bagus: ${formatRate(er)}`, desc: `Angka utama memakai ER by ${sourceLabel}: total engagement dibagi total ${sourceLabel.toLowerCase()}. Ini lebih stabil daripada rata-rata sederhana per konten.` });
    } else {
      insights.push({ icon: '⚠️', cls: 'amber', title: `Weighted ER Perlu Ditingkatkan: ${formatRate(er)}`, desc: `Pantau ER by Reach, Views, dan Followers untuk melihat apakah masalahnya ada di distribusi konten atau kualitas interaksi.` });
    }
  }

  if (mediaArr.length > 0) {
    const benchmarks = getContentBenchmarks(mediaArr);
    const matrix = buildContentMatrix(benchmarks);
    const formatLabels = { IMAGE: 'Foto', VIDEO: 'Video', CAROUSEL_ALBUM: 'Carousel' };
    const bestFormat = buildGroupedInsight(mediaArr, media => formatLabels[media.media_type] || media.media_type)[0];
    if (bestFormat) {
      insights.push({ icon: '🏆', cls: 'purple', title: `Format Terbaik: ${bestFormat.label}`, desc: `${bestFormat.count} konten ${bestFormat.label} menghasilkan weighted ER ${formatRate(bestFormat.weightedEr)} dengan ${fmt(bestFormat.engagements)} engagement. Prioritaskan format ini untuk topik penting.` });
    }

    const bestSlot = buildGroupedInsight(mediaArr, getPostingSlot)[0];
    if (bestSlot) {
      insights.push({ icon: '🕐', cls: 'amber', title: `Jam Terbaik: ${bestSlot.label}`, desc: `Slot ini punya weighted ER ${formatRate(bestSlot.weightedEr)} dari ${bestSlot.count} konten. Gunakan sebagai kandidat jadwal utama, lalu validasi dengan beberapa posting berikutnya.` });
    }

    const bestType = buildGroupedInsight(mediaArr, media => detectContentType(media.caption || ''))[0];
    if (bestType) {
      insights.push({ icon: '💊', cls: 'teal', title: `Tipe Konten Terbaik: ${bestType.label}`, desc: `Kategori ini mencatat weighted ER ${formatRate(bestType.weightedEr)}, ${fmt(bestType.saves)} save, dan ${fmt(bestType.shares)} share. Ini sinyal topik yang layak dibuat seri.` });
    }

    const bestCta = buildGroupedInsight(mediaArr, media => detectCta(media.caption || ''))[0];
    if (bestCta) {
      const actionHint = bestCta.label === 'Tanpa CTA eksplisit'
        ? 'Caption tanpa CTA eksplisit sedang unggul; uji CTA ringan agar performa tidak turun.'
        : `CTA "${bestCta.label}" paling efektif di sampel ini; pakai lebih konsisten pada konten sejenis.`;
      insights.push({ icon: '🎯', cls: 'rose', title: `CTA Paling Efektif: ${bestCta.label}`, desc: `${actionHint} Weighted ER ${formatRate(bestCta.weightedEr)} dari ${bestCta.count} konten.` });
    }

    const hiddenGem = benchmarks.analyzed
      .filter(item => item.score > benchmarks.medianScore && item.distribution < benchmarks.medianDistribution)
      .sort((a, b) => b.score - a.score || b.stats.saves + b.stats.shares - (a.stats.saves + a.stats.shares))[0];
    if (hiddenGem) {
      insights.push({ icon: '💎', cls: 'teal', title: 'Hidden Gem Terdeteksi', desc: `"${hiddenGem.caption}" punya ER ${formatRate(hiddenGem.score)} di atas median, tapi distribusinya baru ${fmt(hiddenGem.distribution)}. Layak diangkat ulang lewat Story, repost, atau dibuat versi carousel lanjutan.` });
    }

    const underperforming = benchmarks.analyzed
      .filter(item => item.distribution > benchmarks.medianDistribution && item.score < benchmarks.medianScore)
      .sort((a, b) => b.distribution - a.distribution || a.score - b.score)[0];
    if (underperforming) {
      insights.push({ icon: '📉', cls: 'amber', title: 'Underperforming: Reach Tinggi, ER Rendah', desc: `"${underperforming.caption}" sudah mendapat distribusi ${fmt(underperforming.distribution)}, tapi ER hanya ${formatRate(underperforming.score)}. Evaluasi hook awal, visual pertama, dan CTA agar reach berikutnya berubah jadi interaksi.` });
    }

    const bestHook = buildGroupedInsight(mediaArr, media => detectCaptionHook(media.caption || ''))[0];
    if (bestHook) {
      insights.push({ icon: '🧲', cls: 'purple', title: `Hook Caption Terbaik: ${bestHook.label}`, desc: `Pola hook ini menghasilkan weighted ER ${formatRate(bestHook.weightedEr)} dari ${bestHook.count} konten. Gunakan pola pembuka ini untuk topik bernilai tinggi.` });
    }

    let bestComboInsight = null;
    if (bestFormat && bestSlot && bestType && bestCta) {
      const ctaText = bestCta.label === 'Tanpa CTA eksplisit'
        ? 'CTA ringan seperti "Simpan untuk cek lagi"'
        : `CTA "${bestCta.label}"`;
      insights.push({ icon: '📝', cls: 'green', title: 'Rekomendasi Posting Berikutnya', desc: `Buat ${bestFormat.label} bertema ${bestType.label}, posting di ${bestSlot.label}, dan pakai ${ctaText}. Kombinasi ini mengikuti pola performa terbaik dari konten aktual.` });
      bestComboInsight = {
        html: `
          <div class="insight-card combo-card">
            <div class="combo-kicker">Best Combo</div>
            <div class="combo-title">${bestFormat.label} + ${bestType.label}</div>
            <div class="combo-row"><span>Jadwal</span><strong>${bestSlot.label}</strong></div>
            <div class="combo-row"><span>CTA</span><strong>${ctaText}</strong></div>
            <div class="combo-note">Kombinasi ini mengikuti pola weighted ER terbaik dari konten aktual.</div>
          </div>
        `,
      };
    }

    insights.push({
      html: `
        <div class="insight-card matrix-card">
          <div class="matrix-head">
            <div>
              <div class="insight-title">Content Matrix</div>
              <div class="insight-desc">Peta performa berdasarkan reach/distribusi dan ER relatif terhadap median konten.</div>
            </div>
          </div>
          <div class="matrix-grid">
            <div class="matrix-cell winner"><strong>${matrix.highReach_highEr}</strong><span>Winner</span><small>High Reach · High ER</small></div>
            <div class="matrix-cell fix"><strong>${matrix.highReach_lowEr}</strong><span>Needs Hook Fix</span><small>High Reach · Low ER</small></div>
            <div class="matrix-cell gem"><strong>${matrix.lowReach_highEr}</strong><span>Hidden Gem</span><small>Low Reach · High ER</small></div>
            <div class="matrix-cell learn"><strong>${matrix.lowReach_lowEr}</strong><span>Learn/Archive</span><small>Low Reach · Low ER</small></div>
          </div>
        </div>
      `,
    });
    if (bestComboInsight) insights.push(bestComboInsight);
  }

  container.innerHTML = insights.map(i => i.html || `
    <div class="insight-card">
      <div class="insight-icon ${i.cls}">${i.icon}</div>
      <div class="insight-text">
        <div class="insight-title">${i.title}</div>
        <div class="insight-desc">${i.desc}</div>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════
//  LOAD ALL DATA
// ════════════════════════════════════════════════
let isLoading = false;

async function loadAllData() {
  if (isLoading) return;
  if (!config.token || !config.accountId) {
    // Open settings
    document.getElementById('input-token').value = config.token;
    document.getElementById('input-account-id').value = config.accountId;
    document.getElementById('modal-settings').classList.add('open');
    return;
  }

  isLoading = true;
  setApiStatus('loading', 'Menghubungkan ke API...');

  try {
    // Parallel fetch
    const [profile, insightsRaw, dailyRaw, audienceRaw, mediaList] = await Promise.all([
      fetchProfile(),
      fetchAccountInsights().catch(() => ({ data: [] })),
      fetchDailyInsights().catch(() => ({ data: [] })),
      fetchAudience().catch(() => ({ data: [] })),
      fetchMedia().catch(() => []),
    ]);

    // Fetch per-media insights for loaded content; grouped requests keep this lighter.
    const mediaSample = mediaList.slice(0, 20);
    await Promise.all(mediaSample.map(async m => {
      m.insights = await fetchMediaInsights(m.id, m.media_type);
    }));

    // Render
    renderProfile(profile);
    renderKPIs(insightsRaw.data || [], profile);
    renderOverviewViewsFromMedia(mediaList);
    renderAudience(audienceRaw.data || []);
    renderHeatmap(mediaList);
    renderMedia(mediaList);
    renderOverviewEngagement(mediaList);
    renderExecutiveSummary(mediaList);
    renderInsights(profile, insightsRaw.data || [], mediaList);

    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString('id-ID');
    setApiStatus('ok', 'Data berhasil dimuat');
    showToast('✅ Data berhasil diperbarui!');

  } catch (err) {
    setApiStatus('err', err.message);
    showToast('❌ Gagal memuat: ' + err.message);
    renderDemoData();
  } finally {
    isLoading = false;
  }
}

// ════════════════════════════════════════════════
//  DEMO DATA (fallback when no token)
// ════════════════════════════════════════════════
function renderDemoData() {
  currentProfile = { followers_count: 24800 };
  document.getElementById('stat-followers').textContent = '24.8K';
  document.getElementById('stat-following').textContent = '312';
  document.getElementById('stat-posts').textContent = '187';
  document.getElementById('kpi-impressions').textContent = '186K';
  document.getElementById('kpi-reach').textContent = '72K';
  document.getElementById('kpi-engagement').textContent = '4.2%';
  document.getElementById('kpi-new-followers').textContent = '+284';
  document.getElementById('reach-pct').textContent = '72%';
  document.getElementById('reach-bar').style.width = '72%';
  document.getElementById('reach-target-lbl').textContent = 'Target: 100K';
  document.getElementById('last-updated').textContent = new Date().toLocaleTimeString('id-ID');

  // Demo demographics
  document.getElementById('demo-female').style.width = '68%';
  document.getElementById('demo-female-pct').textContent = '68%';
  document.getElementById('demo-male').style.width = '32%';
  document.getElementById('demo-male-pct').textContent = '32%';
  document.getElementById('demo-cities').innerHTML = [
    ['Jakarta', 38], ['Surabaya', 22], ['Bandung', 15]
  ].map(([name, p]) => `
    <div class="demo-item">
      <span class="demo-label" style="width:60px;font-size:10px">${name}</span>
      <div class="demo-bar-track"><div class="demo-bar-fill" style="width:${p}%"></div></div>
      <span class="demo-pct">${p}%</span>
    </div>
  `).join('');

  // Demo media
  const demoMedia = [
    { id: '1', caption: '💊 Kenali obat generik vs paten — mana yang lebih baik? Thread lengkap untuk pasien dan keluarga!', media_type: 'IMAGE', like_count: 842, comments_count: 67, timestamp: new Date(Date.now() - 86400000).toISOString(), permalink: '#', insights: { reach: 12400, views: 18800, saved: 310, shares: 84 } },
    { id: '2', caption: '🧪 5 interaksi obat yang WAJIB kamu tahu sebelum minum obat bersamaan. Simpan post ini!', media_type: 'CAROUSEL_ALBUM', like_count: 1204, comments_count: 134, timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), permalink: '#', insights: { reach: 18900, views: 27600, saved: 620, shares: 146 } },
    { id: '3', caption: '📹 Cara benar minum antibiotik — jangan berhenti di tengah jalan!', media_type: 'VIDEO', like_count: 678, comments_count: 45, timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), permalink: '#', insights: { reach: 9800, saved: 189, shares: 52, views: 4200 } },
    { id: '4', caption: 'Boleh nggak minum paracetamol setiap hari? Ini jawabannya dari Apoteker!', media_type: 'IMAGE', like_count: 512, comments_count: 38, timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), permalink: '#', insights: { reach: 7600, views: 10900, saved: 98, shares: 31 } },
    { id: '5', caption: 'Obat herbal vs kimia — mitos dan fakta yang perlu kamu ketahui. Share ke yang perlu tahu!', media_type: 'CAROUSEL_ALBUM', like_count: 934, comments_count: 88, timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), permalink: '#', insights: { reach: 14200, views: 20100, saved: 445, shares: 103 } },
  ];
  renderHeatmap(demoMedia);
  renderMedia(demoMedia);
  renderOverviewEngagement(demoMedia);
  renderExecutiveSummary(demoMedia);

  // Demo insights
  renderInsights(
    { followers_count: 24800 },
    [],
    demoMedia
  );

  setApiStatus('err', 'Mode demo — konfigurasi API untuk data real');
}

// ════════════════════════════════════════════════
//  TABS (content filter)
// ════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    filterAndRenderMedia();
  });
});

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    filterAndRenderMedia();
  });
});

// ════════════════════════════════════════════════
//  REFRESH
// ════════════════════════════════════════════════
document.getElementById('btn-refresh-content').addEventListener('click', () => {
  const btn = document.getElementById('btn-refresh-content');
  btn.classList.add('spinning');
  loadAllData().finally(() => btn.classList.remove('spinning'));
});

document.getElementById('btn-export-csv').addEventListener('click', exportReportCsv);
document.getElementById('btn-export-pdf').addEventListener('click', exportReportPdf);

// ════════════════════════════════════════════════
//  AUTO REFRESH (5 minutes)
// ════════════════════════════════════════════════
setInterval(() => {
  if (config.token && config.accountId) loadAllData();
}, 5 * 60 * 1000);

// ════════════════════════════════════════════════
//  LOADING SCREEN
// ════════════════════════════════════════════════
function hideLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if (ls) {
    ls.classList.add('hidden');
    setTimeout(() => ls.remove(), 700);
  }
}

// Show loading for at least 2 seconds, then hide
const loadStart = Date.now();
const MIN_LOAD_TIME = 2200;

function originalHideLoading() {
  const elapsed = Date.now() - loadStart;
  const remaining = Math.max(0, MIN_LOAD_TIME - elapsed);
  setTimeout(hideLoadingScreen, remaining);
}

// ════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════
if (config.token && config.accountId) {
  loadAllData().finally(() => {
    originalHideLoading();
  });
} else {
  renderDemoData();
  originalHideLoading();
  setTimeout(() => {
    document.getElementById('input-token').value = '';
    document.getElementById('input-account-id').value = '';
    document.getElementById('modal-settings').classList.add('open');
  }, 800);
}


// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.warn);
}
