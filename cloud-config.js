/**
 * cloud-config.js — 云端配置（默认值，无需修改）
 * 仓库 / 分支 / 路径固定不变；每台设备只需在首页弹窗或 cloud-setup.html 填一个 Token 即可连接。
 * 真正的 token 由用户填写并存入 localStorage（键 '百合_cloud_cfg'），不写在此文件。
 */
window.BAIHE_CLOUD = {
  owner: 'chenhaijun20260824',
  repo: 'rose-massage-data',
  branch: 'main',
  path: 'data',
  token: ''  // 留空：实际 token 来自 localStorage
};