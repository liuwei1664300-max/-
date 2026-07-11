const fetch = require('node-fetch');

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const BITABLE_APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID = process.env.TABLE_ID;

async function getAccessToken() {
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error('飞书认证失败: ' + data.msg);
  return data.tenant_access_token;
}

async function getAllRecords(token) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${TABLE_ID}/records?page_size=200`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error('读取表格失败: ' + data.msg);
  return data.data.items || [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getAccessToken();

    if (req.method === 'DELETE') {
      const recordId = req.query.record_id;
      if (!recordId) return res.status(400).json({ error: '缺少 record_id' });
      const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${TABLE_ID}/records/${recordId}`;
      const resp = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (data.code !== 0) throw new Error('删除失败: ' + data.msg);
      return res.json({ success: true });
    }

    // GET：读取所有记录
    const records = await getAllRecords(token);
    
    // 取第一行的 A 和 C 作为固定头尾（第一行可能只有A和C，B可能为空）
    const firstRecord = records.length > 0 ? records[0].fields : {};
    const headerA = firstRecord['活动头部(A)'] || '';
    const footerC = firstRecord['活动尾部(C)'] || '';

    // 遍历所有行，只要 B 列字段存在（不严格检查非空）就加入，但至少要有内容
    const items = [];
    for (const record of records) {
      const bValue = record.fields['一次性文案(B)'];
      if (bValue !== undefined && bValue !== null) {  // 允许空字符串，但至少字段存在
        items.push({
          record_id: record.record_id,
          combined: headerA + bValue + footerC
        });
      }
    }

    return res.json({ header: headerA, footer: footerC, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
