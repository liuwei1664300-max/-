const fetch = require('node-fetch');

// 从环境变量读取飞书配置
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const BITABLE_APP_TOKEN = process.env.BITABLE_APP_TOKEN;
const TABLE_ID = process.env.TABLE_ID;

// 获取 tenant_access_token
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

// 获取表格所有行（最多200条，可根据需要调整）
async function getAllRecords(token) {
  const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${BITABLE_APP_TOKEN}/tables/${TABLE_ID}/records?page_size=200`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error('读取表格失败: ' + data.msg);
  return data.data.items || [];
}

// 主处理函数（GET 读取，DELETE 删除）
module.exports = async (req, res) => {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 获取 token
    const token = await getAccessToken();

    if (req.method === 'DELETE') {
      // 删除指定行
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

    // GET 请求：读取数据并组装
    const records = await getAllRecords(token);
    
    // 提取 A 和 C 固定值（取第一行的字段）
    const firstRecord = records.length > 0 ? records[0].fields : {};
    const headerA = firstRecord['活动头部(A)'] || '';
    const footerC = firstRecord['活动尾部(C)'] || '';

    // 遍历所有行，取 B 列非空的行
    const items = [];
    for (const record of records) {
      const bValue = record.fields['一次性文案(B)'];
      if (bValue && bValue.trim()) {
        items.push({
          record_id: record.record_id,
          combined: headerA + bValue + footerC
        });
      }
    }

    return res.json({
      header: headerA,
      footer: footerC,
      items: items
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
