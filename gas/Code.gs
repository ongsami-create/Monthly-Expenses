// ========================================
// Monthly Expenses - Google Apps Script Backend
// 简易记账系统 (v1.0)
// 数据存储: PropertiesService (无 scope 要求, 永久保存)
//   - 单 property 9KB / 总 500KB
//   - 月度交易按 YYYY-MM 分片, 单月 50 笔 ≈ 7.5KB, 足够
// ========================================

const VERSION = '1.0.0';
const PROP_CATEGORIES = 'me_categories';
const PROP_TX_PREFIX = 'me_tx_';        // me_tx_2026-08
const PROP_TX_INDEX = 'me_tx_index';    // ['2026-07', '2026-08']
const PROP_META = 'me_meta';
const CACHE_TTL_SEC = 60;               // 1 分钟

// ==================== 工具 ====================

function cacheGet_(key) {
  try {
    const v = CacheService.getScriptCache().get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
function cachePut_(key, value, ttl) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), ttl || CACHE_TTL_SEC);
  } catch (e) {}
}
function cacheDel_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
}

function props_() { return PropertiesService.getScriptProperties(); }

function readProp(key, defaultValue) {
  const v = props_().getProperty(key);
  if (!v) return defaultValue;
  try { return JSON.parse(v); } catch (e) { return defaultValue; }
}
function writeProp(key, value) {
  props_().setProperty(key, JSON.stringify(value));
}

function now_() { return new Date().toISOString(); }
function txKey_(month) { return PROP_TX_PREFIX + month; }  // 'me_tx_2026-08'

// ==================== 类别 ====================

function getCategories() {
  try {
    const cached = cacheGet_('categories');
    if (cached) return { success: true, categories: cached, source: 'cache' };

    const cats = readProp(PROP_CATEGORIES, []);
    cachePut_('categories', cats, CACHE_TTL_SEC);
    return { success: true, categories: cats, source: 'storage' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function saveCategories(categories) {
  try {
    if (!Array.isArray(categories)) {
      return { success: false, message: 'categories 必须是数组' };
    }
    // 简单校验
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      if (!c.id || !c.name) return { success: false, message: '类别 id 和 name 必填 (index=' + i + ')' };
      if (c.type !== 'income' && c.type !== 'expense') return { success: false, message: 'type 必须是 income 或 expense' };
    }
    writeProp(PROP_CATEGORIES, categories);
    cachePut_('categories', categories, CACHE_TTL_SEC);
    return { success: true, count: categories.length, savedAt: now_() };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 交易 ====================

function getMonthFromDate_(dateStr) {
  if (!dateStr) return null;
  // dateStr: 'YYYY-MM-DD' or ISO
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

function updateTxIndex_(month) {
  if (!month) return;
  const idx = readProp(PROP_TX_INDEX, []);
  if (idx.indexOf(month) < 0) {
    idx.push(month);
    idx.sort();
    writeProp(PROP_TX_INDEX, idx);
  }
}

function getTransactions(month) {
  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { success: false, message: 'month 必填, 格式 YYYY-MM' };
    }
    const cacheKey = 'tx_' + month;
    const cached = cacheGet_(cacheKey);
    if (cached) return { success: true, transactions: cached, month: month, source: 'cache' };

    const txs = readProp(txKey_(month), []);
    cachePut_(cacheKey, txs, CACHE_TTL_SEC);
    return { success: true, transactions: txs, month: month, source: 'storage' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function getAllTransactions() {
  try {
    const cached = cacheGet_('all_transactions');
    if (cached) return { success: true, transactions: cached, source: 'cache' };

    const idx = readProp(PROP_TX_INDEX, []);
    const all = [];
    idx.forEach(function(month) {
      const txs = readProp(txKey_(month), []);
      all.push.apply(all, txs);
    });
    // 按日期倒序
    all.sort(function(a, b) {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return db - da;
    });
    cachePut_('all_transactions', all, CACHE_TTL_SEC);
    return { success: true, transactions: all, source: 'storage' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function addTransaction(tx) {
  try {
    if (!tx || !tx.date || !tx.categoryId || typeof tx.amount !== 'number') {
      return { success: false, message: 'date / categoryId / amount (number) 必填' };
    }
    if (tx.type !== 'income' && tx.type !== 'expense') {
      return { success: false, message: 'type 必须是 income 或 expense' };
    }
    const month = getMonthFromDate_(tx.date);
    if (!month) return { success: false, message: 'date 格式错误' };

    const newTx = {
      id: tx.id || ('tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      date: tx.date,
      type: tx.type,
      categoryId: tx.categoryId,
      amount: Number(tx.amount),
      description: tx.description || '',
      createdAt: now_(),
      updatedAt: now_()
    };

    const txs = readProp(txKey_(month), []);
    txs.push(newTx);
    // 按日期排序
    txs.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    writeProp(txKey_(month), txs);
    updateTxIndex_(month);
    cachePut_('tx_' + month, txs, CACHE_TTL_SEC);
    cacheDel_('all_transactions');

    return { success: true, transaction: newTx, month: month };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function updateTransaction(tx) {
  try {
    if (!tx || !tx.id) return { success: false, message: 'id 必填' };
    if (!tx.date || !tx.categoryId || typeof tx.amount !== 'number') {
      return { success: false, message: 'date / categoryId / amount (number) 必填' };
    }

    // 找原交易所在月份
    const idx = readProp(PROP_TX_INDEX, []);
    let oldMonth = null;
    for (let i = 0; i < idx.length; i++) {
      const txs = readProp(txKey_(idx[i]), []);
      const found = txs.find(function(t) { return t.id === tx.id; });
      if (found) { oldMonth = idx[i]; break; }
    }
    if (!oldMonth) return { success: false, message: '交易不存在: ' + tx.id };

    const newMonth = getMonthFromDate_(tx.date);
    const oldTxs = readProp(txKey_(oldMonth), []);
    const newTxs = oldTxs.filter(function(t) { return t.id !== tx.id; });

    const updatedTx = {
      id: tx.id,
      date: tx.date,
      type: tx.type || 'expense',
      categoryId: tx.categoryId,
      amount: Number(tx.amount),
      description: tx.description || '',
      createdAt: tx.createdAt || now_(),
      updatedAt: now_()
    };

    if (oldMonth === newMonth) {
      newTxs.push(updatedTx);
      newTxs.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      writeProp(txKey_(oldMonth), newTxs);
      cachePut_('tx_' + oldMonth, newTxs, CACHE_TTL_SEC);
    } else {
      // 跨月移动
      writeProp(txKey_(oldMonth), newTxs);
      const targetTxs = readProp(txKey_(newMonth), []);
      targetTxs.push(updatedTx);
      targetTxs.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      writeProp(txKey_(newMonth), targetTxs);
      updateTxIndex_(newMonth);
      cachePut_('tx_' + oldMonth, newTxs, CACHE_TTL_SEC);
      cachePut_('tx_' + newMonth, targetTxs, CACHE_TTL_SEC);
    }
    cacheDel_('all_transactions');

    return { success: true, transaction: updatedTx };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function deleteTransaction(id) {
  try {
    if (!id) return { success: false, message: 'id 必填' };
    const idx = readProp(PROP_TX_INDEX, []);
    let month = null;
    for (let i = 0; i < idx.length; i++) {
      const txs = readProp(txKey_(idx[i]), []);
      if (txs.find(function(t) { return t.id === id; })) { month = idx[i]; break; }
    }
    if (!month) return { success: false, message: '交易不存在: ' + id };

    const txs = readProp(txKey_(month), []);
    const newTxs = txs.filter(function(t) { return t.id !== id; });
    writeProp(txKey_(month), newTxs);
    cachePut_('tx_' + month, newTxs, CACHE_TTL_SEC);
    cacheDel_('all_transactions');

    return { success: true, deleted: id, month: month };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 统计 ====================

function computeMonthStats_(month, txs, categories) {
  const stats = {
    month: month,
    income: 0,
    expense: 0,
    profit: 0,
    count: txs.length,
    byCategory: {},   // { categoryId: { amount, count, type } }
    byDay: {}         // { 'YYYY-MM-DD': { income, expense } }
  };
  txs.forEach(function(tx) {
    stats[tx.type] = (stats[tx.type] || 0) + tx.amount;
    if (!stats.byCategory[tx.categoryId]) {
      stats.byCategory[tx.categoryId] = { amount: 0, count: 0, type: tx.type };
    }
    stats.byCategory[tx.categoryId].amount += tx.amount;
    stats.byCategory[tx.categoryId].count += 1;

    const day = tx.date.slice(0, 10);
    if (!stats.byDay[day]) stats.byDay[day] = { income: 0, expense: 0 };
    stats.byDay[day][tx.type] += tx.amount;
  });
  stats.profit = stats.income - stats.expense;
  return stats;
}

function getMonthlyStats(month) {
  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { success: false, message: 'month 必填, 格式 YYYY-MM' };
    }
    const cacheKey = 'stats_' + month;
    const cached = cacheGet_(cacheKey);
    if (cached) return { success: true, stats: cached, source: 'cache' };

    const txsResult = getTransactions(month);
    if (!txsResult.success) return txsResult;
    const catsResult = getCategories();
    if (!catsResult.success) return catsResult;

    const stats = computeMonthStats_(month, txsResult.transactions, catsResult.categories);
    cachePut_(cacheKey, stats, CACHE_TTL_SEC);
    return { success: true, stats: stats, source: 'storage' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function getYearlyStats(year) {
  try {
    if (!year || !/^\d{4}$/.test(String(year))) {
      return { success: false, message: 'year 必填, 格式 YYYY' };
    }
    const cacheKey = 'yearly_' + year;
    const cached = cacheGet_(cacheKey);
    if (cached) return { success: true, year: Number(year), months: cached, source: 'cache' };

    const idx = readProp(PROP_TX_INDEX, []);
    const months = [];
    idx.forEach(function(m) {
      if (m.indexOf(String(year)) === 0) {
        const txs = readProp(txKey_(m), []);
        const s = computeMonthStats_(m, txs, []);
        months.push({
          month: m,
          income: s.income,
          expense: s.expense,
          profit: s.profit,
          count: s.count
        });
      }
    });
    months.sort(function(a, b) { return a.month.localeCompare(b.month); });
    cachePut_(cacheKey, months, CACHE_TTL_SEC);
    return { success: true, year: Number(year), months: months, source: 'storage' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 一站式 API (前端主入口) ====================

function getDashboard(month) {
  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { success: false, message: 'month 必填, 格式 YYYY-MM' };
    }
    const cacheKey = 'dashboard_' + month;
    const cached = cacheGet_(cacheKey);
    if (cached) return Object.assign({ source: 'cache' }, cached);

    const txs = getTransactions(month);
    const cats = getCategories();
    if (!txs.success) return txs;
    if (!cats.success) return cats;

    const stats = computeMonthStats_(month, txs.transactions, cats.categories);
    const result = {
      success: true,
      month: month,
      categories: cats.categories,
      transactions: txs.transactions,
      stats: stats,
      source: 'storage'
    };
    cachePut_(cacheKey, result, CACHE_TTL_SEC);
    return result;
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 健康检查 ====================

function ping() {
  try {
    const cats = readProp(PROP_CATEGORIES, []);
    const idx = readProp(PROP_TX_INDEX, []);
    return {
      success: true,
      message: 'Monthly Expenses API is running',
      timestamp: now_(),
      version: VERSION,
      stats: {
        categories: cats.length,
        months: idx.length
      }
    };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 调试 ====================

function clearAllData() {
  try {
    const props = props_().getProperties();
    const toDelete = Object.keys(props).filter(function(k) {
      return k.indexOf('me_') === 0;
    });
    if (toDelete.length) props_().deleteAllProperties();

    const cache = CacheService.getScriptCache();
    cache.remove('categories');
    cache.remove('all_transactions');
    return { success: true, cleared: toDelete.length };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function listAllProperties() {
  try {
    const props = props_().getProperties();
    const result = { keys: Object.keys(props), data: {} };
    Object.keys(props).forEach(function(k) {
      try {
        const v = JSON.parse(props[k]);
        if (Array.isArray(v)) result.data[k] = '[array ' + v.length + ']';
        else if (typeof v === 'object') result.data[k] = '[object]';
        else result.data[k] = v;
      } catch (e) {
        result.data[k] = '[string ' + props[k].length + ']';
      }
    });
    return result;
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 入口 ====================

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || 'ping';
    const month = params.month;
    const year = params.year;
    const nocache = params.nocache === '1';
    let result;

    if (nocache) {
      cacheDel_('categories');
      cacheDel_('all_transactions');
      cacheDel_('tx_' + month);
      cacheDel_('stats_' + month);
      cacheDel_('yearly_' + year);
      cacheDel_('dashboard_' + month);
    }

    switch (action) {
      case 'ping':
        result = ping();
        break;
      case 'getCategories':
        result = getCategories();
        break;
      case 'getTransactions':
        result = getTransactions(month);
        break;
      case 'getAllTransactions':
        result = getAllTransactions();
        break;
      case 'getMonthlyStats':
        result = getMonthlyStats(month);
        break;
      case 'getYearlyStats':
        result = getYearlyStats(year);
        break;
      case 'getDashboard':
        result = getDashboard(month);
        break;
      case 'debug':
        result = listAllProperties();
        break;
      case 'clearAll':
        result = clearAllData();
        break;
      default:
        result = { success: false, message: '未知 action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (parseErr) { body = {}; }
    }
    // 支持两种方式: URL query string (?action=xxx) 或 body JSON ({action: 'xxx', ...})
    const action = params.action || body.action;
    let result;

    switch (action) {
      case 'saveCategories':
        result = saveCategories(body.categories || []);
        break;
      case 'addTransaction':
        result = addTransaction(body);
        break;
      case 'updateTransaction':
        result = updateTransaction(body);
        break;
      case 'deleteTransaction':
        result = deleteTransaction(body.id);
        break;
      default:
        result = { success: false, message: '未知 POST action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
