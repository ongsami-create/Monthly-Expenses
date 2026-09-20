// ========================================
// Monthly Expenses - Google Apps Script Backend
// 简易记账系统 (v1.2)
// 数据存储: PropertiesService (无 scope 要求, 永久保存)
//   - 单 property 9KB / 总 500KB
//   - 月度交易按 YYYY-MM 分片
// v1.2: 加 Account + 4 种 category type (income/expense/asset/procurement)
// ========================================

const VERSION = '1.2.0';
const PROP_CATEGORIES = 'me_categories';
const PROP_ACCOUNTS = 'me_accounts';
const PROP_TX_PREFIX = 'me_tx_';        // me_tx_2026-08
const PROP_TX_INDEX = 'me_tx_index';    // ['2026-07', '2026-08']
const PROP_META = 'me_meta';
const CACHE_TTL_SEC = 60;               // v1.6: 60s (前端已有 localStorage cache, GAS cache 负责 cold start + 翻月份; forceRefresh 用 nocache=1 bypass)

const VALID_CAT_TYPES = ['income', 'expense', 'asset', 'procurement'];
const VALID_ACC_TYPES = ['company', 'personal'];

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
function txKey_(month) { return PROP_TX_PREFIX + month; }

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
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      if (!c.id || !c.name) return { success: false, message: '类别 id 和 name 必填 (index=' + i + ')' };
      if (VALID_CAT_TYPES.indexOf(c.type) < 0) return { success: false, message: 'type 必须是 ' + VALID_CAT_TYPES.join('/') + ' (index=' + i + ', got ' + c.type + ')' };
    }
    writeProp(PROP_CATEGORIES, categories);
    cachePut_('categories', categories, CACHE_TTL_SEC);
    return { success: true, count: categories.length, savedAt: now_() };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 账户 (v1.2 新增) ====================

function getAccounts() {
  try {
    const cached = cacheGet_('accounts');
    if (cached) return { success: true, accounts: cached, source: 'cache' };
    const accs = readProp(PROP_ACCOUNTS, []);
    cachePut_('accounts', accs, CACHE_TTL_SEC);
    return { success: true, accounts: accs, source: 'storage' };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function saveAccounts(accounts) {
  try {
    if (!Array.isArray(accounts)) {
      return { success: false, message: 'accounts 必须是数组' };
    }
    for (let i = 0; i < accounts.length; i++) {
      const a = accounts[i];
      if (!a.id) return { success: false, message: '账户 id 必填 (index=' + i + ')' };
      if (!a.name) return { success: false, message: '账户 name 必填 (index=' + i + ')' };
      if (VALID_ACC_TYPES.indexOf(a.type) < 0) return { success: false, message: '账户 type 必须是 company/personal (index=' + i + ')' };

      // 数据迁移 + 规范化 (v1.3): 旧单值 phone/address 转数组
      if (typeof a.phone === 'string' && a.phone.trim() && !Array.isArray(a.phones)) {
        a.phones = [a.phone];
      }
      if (typeof a.address === 'string' && a.address.trim() && !Array.isArray(a.addresses)) {
        a.addresses = [a.address];
      }
      if (!Array.isArray(a.phones)) a.phones = [];
      if (!Array.isArray(a.addresses)) a.addresses = [];
      // 过滤空字符串
      a.phones = a.phones.filter(function(p) { return typeof p === 'string' && p.trim(); });
      a.addresses = a.addresses.filter(function(s) { return typeof s === 'string' && s.trim(); });
    }
    writeProp(PROP_ACCOUNTS, accounts);
    cachePut_('accounts', accounts, CACHE_TTL_SEC);
    return { success: true, count: accounts.length, savedAt: now_() };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== 交易 ====================

function getMonthFromDate_(dateStr) {
  if (!dateStr) return null;
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
    const month = getMonthFromDate_(tx.date);
    if (!month) return { success: false, message: 'date 格式错误' };

    const newTx = {
      id: tx.id || ('tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      date: tx.date,
      accountId: tx.accountId || '',
      categoryId: tx.categoryId,
      amount: Number(tx.amount),
      description: tx.description || '',
      createdAt: now_(),
      updatedAt: now_()
    };

    const txs = readProp(txKey_(month), []);
    txs.push(newTx);
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

    const idx = readProp(PROP_TX_INDEX, []);
    let oldMonth = null;
    let oldTx = null;
    for (let i = 0; i < idx.length; i++) {
      const txs = readProp(txKey_(idx[i]), []);
      const found = txs.find(function(t) { return t.id === tx.id; });
      if (found) { oldMonth = idx[i]; oldTx = found; break; }
    }
    if (!oldMonth) return { success: false, message: '交易不存在: ' + tx.id };

    // 容许缺失字段, fallback 到原 tx
    const date = tx.date || oldTx.date;
    const categoryId = tx.categoryId || oldTx.categoryId;
    const amount = (typeof tx.amount === 'number') ? tx.amount : oldTx.amount;
    const description = (tx.description !== undefined) ? tx.description : oldTx.description;
    const accountId = (tx.accountId !== undefined) ? tx.accountId : (oldTx.accountId || '');

    if (!date || !categoryId || typeof amount !== 'number') {
      return { success: false, message: 'date / categoryId / amount (number) 必填' };
    }

    const newMonth = getMonthFromDate_(date);
    const oldTxs = readProp(txKey_(oldMonth), []);
    const newTxs = oldTxs.filter(function(t) { return t.id !== tx.id; });

    const updatedTx = {
      id: tx.id,
      date: date,
      accountId: accountId,
      categoryId: categoryId,
      amount: Number(amount),
      description: description || '',
      createdAt: oldTx.createdAt || now_(),
      updatedAt: now_()
    };

    if (oldMonth === newMonth) {
      newTxs.push(updatedTx);
      newTxs.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      writeProp(txKey_(oldMonth), newTxs);
      cachePut_('tx_' + oldMonth, newTxs, CACHE_TTL_SEC);
    } else {
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
  const catMap = {};
  if (Array.isArray(categories)) {
    categories.forEach(function(c) { catMap[c.id] = c; });
  }
  const stats = {
    month: month,
    income: 0,
    expense: 0,
    asset: 0,
    procurement: 0,
    profit: 0,           // income - expense
    count: txs.length,
    byCategory: {},
    byAccount: {},       // v1.2: 按账户统计
    byDay: {}
  };
  txs.forEach(function(tx) {
    const cat = catMap[tx.categoryId];
    const type = cat ? cat.type : 'expense';
    if (VALID_CAT_TYPES.indexOf(type) >= 0) {
      stats[type] = (stats[type] || 0) + tx.amount;
    } else {
      stats.expense = (stats.expense || 0) + tx.amount;
    }
    if (!stats.byCategory[tx.categoryId]) {
      stats.byCategory[tx.categoryId] = { amount: 0, count: 0, type: type };
    }
    stats.byCategory[tx.categoryId].amount += tx.amount;
    stats.byCategory[tx.categoryId].count += 1;

    // 按账户统计
    const accId = tx.accountId || '__none__';
    if (!stats.byAccount[accId]) {
      stats.byAccount[accId] = { income: 0, expense: 0, asset: 0, procurement: 0, count: 0 };
    }
    stats.byAccount[accId][type] = (stats.byAccount[accId][type] || 0) + tx.amount;
    stats.byAccount[accId].count += 1;

    const day = tx.date.slice(0, 10);
    if (!stats.byDay[day]) stats.byDay[day] = { income: 0, expense: 0, asset: 0, procurement: 0 };
    if (VALID_CAT_TYPES.indexOf(type) >= 0) {
      stats.byDay[day][type] = (stats.byDay[day][type] || 0) + tx.amount;
    }
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
          asset: s.asset,
          procurement: s.procurement,
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
    const accs = getAccounts();
    if (!txs.success) return txs;
    if (!cats.success) return cats;
    if (!accs.success) return accs;

    const stats = computeMonthStats_(month, txs.transactions, cats.categories);
    const result = {
      success: true,
      month: month,
      categories: cats.categories,
      accounts: accs.accounts,
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
    const accs = readProp(PROP_ACCOUNTS, []);
    const idx = readProp(PROP_TX_INDEX, []);
    return {
      success: true,
      message: 'Monthly Expenses API is running',
      timestamp: now_(),
      version: VERSION,
      stats: {
        categories: cats.length,
        accounts: accs.length,
        months: idx.length
      }
    };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== RMB 流水 (v1.5: 银行月结单式记账) ====================
// 数据结构 (跟 transaction 平行, 但独立模块):
//   - me_rmb_opening: 期初余额 (RMB, 默认 0)
//   - me_rmb_tx_<YYYY-MM>: 月度流水数组, 按 date ASC 排序
//   - me_rmb_tx_index: ['2026-07', '2026-08']
// 每条 tx: { id, date, type: 'in'|'out', project, amount, note, createdAt, updatedAt }

const PROP_RMB_OPENING = 'me_rmb_opening';
const PROP_RMB_TX_PREFIX = 'me_rmb_tx_';
const PROP_RMB_TX_INDEX = 'me_rmb_tx_index';

function getRmbOpeningBalance() {
  try {
    const v = props_().getProperty(PROP_RMB_OPENING);
    return { success: true, openingBalance: v ? Number(v) : 0 };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function setRmbOpeningBalance(amount) {
  try {
    const v = Number(amount);
    if (isNaN(v)) return { success: false, message: '金额必须是数字' };
    props_().setProperty(PROP_RMB_OPENING, String(v));
    cachePut_('rmb_opening', v, CACHE_TTL_SEC);
    return { success: true, openingBalance: v };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getRmbMonthFromDate_(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function getRmbTransactions(month) {
  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { success: false, message: 'month 必填 YYYY-MM' };
    }
    const cacheKey = 'rmb_tx_' + month;
    const cached = cacheGet_(cacheKey);
    if (cached) return { success: true, transactions: cached, month: month, source: 'cache' };
    const txs = readProp(PROP_RMB_TX_PREFIX + month, []);
    cachePut_(cacheKey, txs, CACHE_TTL_SEC);
    return { success: true, transactions: txs, month: month, source: 'storage' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getAllRmbTransactions() {
  try {
    const cached = cacheGet_('all_rmb_tx');
    if (cached) return { success: true, transactions: cached, source: 'cache' };

    const idx = readProp(PROP_RMB_TX_INDEX, []);
    const all = [];
    idx.forEach(function(m) {
      const txs = readProp(PROP_RMB_TX_PREFIX + m, []);
      all.push.apply(all, txs);
    });
    // 银行月结单顺序: 日期 ASC
    all.sort(function(a, b) {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return da - db;
    });
    cachePut_('all_rmb_tx', all, CACHE_TTL_SEC);
    return { success: true, transactions: all, source: 'storage' };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function addRmbTransaction(tx) {
  try {
    if (!tx || !tx.date || !tx.project || typeof tx.amount !== 'number') {
      return { success: false, message: 'date / project / amount (number) 必填' };
    }
    if (tx.type !== 'in' && tx.type !== 'out') {
      return { success: false, message: 'type 必须是 in 或 out' };
    }
    const month = getRmbMonthFromDate_(tx.date);
    if (!month) return { success: false, message: 'date 格式错误' };

    const newTx = {
      id: tx.id || ('rmb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      date: tx.date,
      type: tx.type,
      project: String(tx.project).trim(),
      amount: Number(tx.amount),
      note: tx.note || '',
      createdAt: now_(),
      updatedAt: now_()
    };

    const txs = readProp(PROP_RMB_TX_PREFIX + month, []);
    txs.push(newTx);
    txs.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    writeProp(PROP_RMB_TX_PREFIX + month, txs);

    const idx = readProp(PROP_RMB_TX_INDEX, []);
    if (idx.indexOf(month) < 0) { idx.push(month); idx.sort(); writeProp(PROP_RMB_TX_INDEX, idx); }

    cachePut_('rmb_tx_' + month, txs, CACHE_TTL_SEC);
    cacheDel_('all_rmb_tx');

    return { success: true, transaction: newTx, month: month };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updateRmbTransaction(tx) {
  try {
    if (!tx || !tx.id) return { success: false, message: 'id 必填' };

    const idx = readProp(PROP_RMB_TX_INDEX, []);
    let oldMonth = null, oldTx = null;
    for (let i = 0; i < idx.length; i++) {
      const txs = readProp(PROP_RMB_TX_PREFIX + idx[i], []);
      const found = txs.find(function(t) { return t.id === tx.id; });
      if (found) { oldMonth = idx[i]; oldTx = found; break; }
    }
    if (!oldMonth) return { success: false, message: '流水不存在: ' + tx.id };

    const date = tx.date || oldTx.date;
    const project = tx.project || oldTx.project;
    const amount = (typeof tx.amount === 'number') ? tx.amount : oldTx.amount;
    const note = (tx.note !== undefined) ? tx.note : oldTx.note;
    const type = tx.type || oldTx.type;

    if (!date || !project || typeof amount !== 'number') {
      return { success: false, message: 'date / project / amount (number) 必填' };
    }
    if (type !== 'in' && type !== 'out') {
      return { success: false, message: 'type 必须是 in 或 out' };
    }

    const newMonth = getRmbMonthFromDate_(date);
    const oldTxs = readProp(PROP_RMB_TX_PREFIX + oldMonth, []);
    const newTxs = oldTxs.filter(function(t) { return t.id !== tx.id; });

    const updatedTx = {
      id: tx.id,
      date: date,
      type: type,
      project: String(project).trim(),
      amount: Number(amount),
      note: note || '',
      createdAt: oldTx.createdAt || now_(),
      updatedAt: now_()
    };

    if (oldMonth === newMonth) {
      newTxs.push(updatedTx);
      newTxs.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      writeProp(PROP_RMB_TX_PREFIX + oldMonth, newTxs);
      cachePut_('rmb_tx_' + oldMonth, newTxs, CACHE_TTL_SEC);
    } else {
      writeProp(PROP_RMB_TX_PREFIX + oldMonth, newTxs);
      const targetTxs = readProp(PROP_RMB_TX_PREFIX + newMonth, []);
      targetTxs.push(updatedTx);
      targetTxs.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      writeProp(PROP_RMB_TX_PREFIX + newMonth, targetTxs);
      const newIdx = readProp(PROP_RMB_TX_INDEX, []);
      if (newIdx.indexOf(newMonth) < 0) { newIdx.push(newMonth); newIdx.sort(); writeProp(PROP_RMB_TX_INDEX, newIdx); }
      cachePut_('rmb_tx_' + oldMonth, newTxs, CACHE_TTL_SEC);
      cachePut_('rmb_tx_' + newMonth, targetTxs, CACHE_TTL_SEC);
    }
    cacheDel_('all_rmb_tx');

    return { success: true, transaction: updatedTx };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function deleteRmbTransaction(id) {
  try {
    if (!id) return { success: false, message: 'id 必填' };
    const idx = readProp(PROP_RMB_TX_INDEX, []);
    let month = null;
    for (let i = 0; i < idx.length; i++) {
      const txs = readProp(PROP_RMB_TX_PREFIX + idx[i], []);
      if (txs.find(function(t) { return t.id === id; })) { month = idx[i]; break; }
    }
    if (!month) return { success: false, message: '流水不存在: ' + id };

    const txs = readProp(PROP_RMB_TX_PREFIX + month, []);
    const newTxs = txs.filter(function(t) { return t.id !== id; });
    writeProp(PROP_RMB_TX_PREFIX + month, newTxs);
    cachePut_('rmb_tx_' + month, newTxs, CACHE_TTL_SEC);
    cacheDel_('all_rmb_tx');

    return { success: true, deleted: id, month: month };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function getRmbMonthlyStats(month) {
  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return { success: false, message: 'month 必填 YYYY-MM' };
    }
    const cacheKey = 'rmb_stats_' + month;
    const cached = cacheGet_(cacheKey);
    if (cached) return { success: true, stats: cached, source: 'cache' };

    const txsResult = getRmbTransactions(month);
    if (!txsResult.success) return txsResult;
    const ob = readProp(PROP_RMB_OPENING, '0');
    const openingBalance = Number(ob) || 0;

    let inTotal = 0, outTotal = 0;
    const txs = txsResult.transactions || [];
    txs.forEach(function(tx) {
      if (tx.type === 'in') inTotal += tx.amount;
      else if (tx.type === 'out') outTotal += tx.amount;
    });
    const endBalance = openingBalance + inTotal - outTotal;

    const stats = {
      month: month,
      openingBalance: openingBalance,
      inTotal: inTotal,
      outTotal: outTotal,
      endBalance: endBalance,
      count: txs.length
    };
    cachePut_(cacheKey, stats, CACHE_TTL_SEC);
    return { success: true, stats: stats, source: 'storage' };
  } catch (e) { return { success: false, message: e.toString() }; }
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
    cache.remove('accounts');
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
      cacheDel_('accounts');
      cacheDel_('all_transactions');
      cacheDel_('all_rmb_tx');
      cacheDel_('rmb_opening');
      cacheDel_('tx_' + month);
      cacheDel_('rmb_tx_' + month);
      cacheDel_('stats_' + month);
      cacheDel_('rmb_stats_' + month);
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
      case 'getAccounts':
        result = getAccounts();
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
      case 'getRmbOpening':
        result = getRmbOpeningBalance();
        break;
      case 'getRmbTransactions':
        result = getRmbTransactions(month);
        break;
      case 'getAllRmbTransactions':
        result = getAllRmbTransactions();
        break;
      case 'getRmbMonthlyStats':
        result = getRmbMonthlyStats(month);
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
    const action = params.action || body.action;
    let result;

    switch (action) {
      case 'saveCategories':
        result = saveCategories(body.categories || []);
        break;
      case 'saveAccounts':
        result = saveAccounts(body.accounts || []);
        break;
      case 'setRmbOpening':
        result = setRmbOpeningBalance(body.openingBalance);
        break;
      case 'addRmbTransaction':
        result = addRmbTransaction(body);
        break;
      case 'updateRmbTransaction':
        result = updateRmbTransaction(body);
        break;
      case 'deleteRmbTransaction':
        result = deleteRmbTransaction(body.id);
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
