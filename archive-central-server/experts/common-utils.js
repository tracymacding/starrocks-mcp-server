/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 专家系统公共工具函数
 * 提供跨专家模块共享的通用功能
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

/**
 * 检测 StarRocks 集群架构类型
 * 通过查询 FE 配置中的 run_mode 来判断是存算分离还是存算一体
 *
 * @param {Connection} connection - MySQL 连接对象
 * @returns {Promise<Object>} 架构信息对象
 *   - type: 'shared_data' | 'shared_nothing'
 *   - description: 架构描述
 *   - run_mode: 配置中的 run_mode 值
 *   - compute_nodes_count: Compute Node 数量（仅 shared_data）
 *   - note: 额外说明（可选）
 */
async function detectArchitectureType(connection) {
  try {
    // 查询 run_mode 配置
    const [config] = await connection.query(`
      ADMIN SHOW FRONTEND CONFIG LIKE 'run_mode';
    `);

    if (config && config.length > 0) {
      const runMode = config[0].Value || config[0].value;

      if (runMode === 'shared_data') {
        // 存算分离架构，可以进一步查询 Compute Nodes 信息
        try {
          const [computeNodes] = await connection.query('SHOW COMPUTE NODES;');
          return {
            type: 'shared_data',
            description: '存算分离架构 (Shared-Data)',
            run_mode: runMode,
            compute_nodes_count: computeNodes ? computeNodes.length : 0,
          };
        } catch (cnError) {
          return {
            type: 'shared_data',
            description: '存算分离架构 (Shared-Data)',
            run_mode: runMode,
          };
        }
      } else if (runMode === 'shared_nothing') {
        return {
          type: 'shared_nothing',
          description: '存算一体架构 (Shared-Nothing)',
          run_mode: runMode,
        };
      } else {
        // run_mode 值异常，默认为存算一体
        return {
          type: 'shared_nothing',
          description: '存算一体架构 (Shared-Nothing)',
          run_mode: runMode,
          note: `未知的 run_mode 值: ${runMode}，默认判断为存算一体`,
        };
      }
    }

    // 如果查询结果为空，默认为存算一体
    return {
      type: 'shared_nothing',
      description: '存算一体架构 (Shared-Nothing)',
      note: 'run_mode 配置查询结果为空，默认判断为存算一体',
    };
  } catch (error) {
    // 如果查询失败（权限不足或版本不支持），尝试回退方法
    console.error('查询 run_mode 失败:', error.message);

    // 回退：尝试查询 COMPUTE NODES
    try {
      const [computeNodes] = await connection.query('SHOW COMPUTE NODES;');
      if (computeNodes && computeNodes.length > 0) {
        return {
          type: 'shared_data',
          description: '存算分离架构 (Shared-Data)',
          compute_nodes_count: computeNodes.length,
          note: '通过 COMPUTE NODES 回退检测',
        };
      }
    } catch (cnError) {
      // Ignore
    }

    // 默认判断为存算一体
    return {
      type: 'shared_nothing',
      description: '存算一体架构 (Shared-Nothing)',
      note: `检测失败: ${error.message}，默认判断为存算一体`,
    };
  }
}

/**
 * 解析存储大小字符串为 GB
 * 支持格式: "1.23 GB", "500 MB", "1.5 TB", "1024 KB", "0.00 Bytes"
 *
 * @param {string} sizeStr - 大小字符串
 * @returns {number} 大小（GB）
 */
function parseStorageSize(sizeStr) {
  if (!sizeStr || sizeStr === '0.00 Bytes') return 0;

  const str = String(sizeStr).trim();
  const match = str.match(/^([\d.]+)\s*([KMGT]?B|Bytes)?$/i);

  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  // 转换为 GB
  const units = {
    B: 1 / 1024 ** 3,
    BYTES: 1 / 1024 ** 3,
    KB: 1 / 1024 ** 2,
    MB: 1 / 1024,
    GB: 1,
    TB: 1024,
  };

  return value * (units[unit] || 0);
}

/**
 * 格式化大小（GB）为可读字符串
 *
 * @param {number} sizeGB - 大小（GB）
 * @param {number} decimals - 小数位数，默认 2
 * @returns {string} 格式化后的字符串
 */
function formatSize(sizeGB, decimals = 2) {
  if (sizeGB === 0) return '0 GB';

  if (sizeGB >= 1024) {
    return `${(sizeGB / 1024).toFixed(decimals)} TB`;
  } else if (sizeGB >= 1) {
    return `${sizeGB.toFixed(decimals)} GB`;
  } else if (sizeGB >= 1 / 1024) {
    return `${(sizeGB * 1024).toFixed(decimals)} MB`;
  } else {
    return `${(sizeGB * 1024 * 1024).toFixed(decimals)} KB`;
  }
}

/**
 * 计算数组的统计信息
 *
 * @param {number[]} values - 数值数组
 * @returns {Object} 统计信息
 *   - mean: 平均值
 *   - min: 最小值
 *   - max: 最大值
 *   - stdDev: 标准差
 *   - variance: 方差
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return {
      mean: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      variance: 0,
    };
  }

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean: parseFloat(mean.toFixed(2)),
    min: parseFloat(min.toFixed(2)),
    max: parseFloat(max.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    variance: parseFloat(variance.toFixed(2)),
  };
}

/**
 * 判断值是否在阈值范围内
 *
 * @param {number} value - 要检查的值
 * @param {Object} thresholds - 阈值配置
 * @param {number} thresholds.warning - 警告阈值
 * @param {number} thresholds.critical - 严重阈值
 * @returns {string} 'normal' | 'warning' | 'critical'
 */
function checkThreshold(value, thresholds) {
  if (thresholds.critical !== undefined && value >= thresholds.critical) {
    return 'critical';
  }
  if (thresholds.warning !== undefined && value >= thresholds.warning) {
    return 'warning';
  }
  return 'normal';
}

/**
 * 格式化时间戳为可读字符串
 *
 * @param {string|Date} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 估算时间到满盈（用于磁盘空间、缓存容量等）
 *
 * @param {number} availableGB - 可用空间（GB）
 * @param {number} usageRate - 使用速率（GB/小时），可选
 * @returns {string} 估算的时间描述
 */
function estimateTimeToFull(availableGB, usageRate = null) {
  if (availableGB < 1) return '不足1小时';
  if (availableGB < 5) return '2-4小时';
  if (availableGB < 10) return '4-8小时';
  if (availableGB < 50) return '1-2天';
  if (availableGB < 100) return '2-5天';

  if (usageRate && usageRate > 0) {
    const hoursRemaining = availableGB / usageRate;
    if (hoursRemaining < 24) {
      return `约 ${Math.round(hoursRemaining)} 小时`;
    } else {
      return `约 ${Math.round(hoursRemaining / 24)} 天`;
    }
  }

  return '超过一周';
}

/**
 * 深度合并对象（用于配置合并）
 *
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (
        source[key] instanceof Object &&
        !Array.isArray(source[key]) &&
        target[key] instanceof Object &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * 安全地获取嵌套属性值
 *
 * @param {Object} obj - 对象
 * @param {string} path - 属性路径，如 'a.b.c'
 * @param {*} defaultValue - 默认值
 * @returns {*} 属性值或默认值
 */
function safeGet(obj, path, defaultValue = undefined) {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (
      result === null ||
      result === undefined ||
      !Object.prototype.hasOwnProperty.call(result, key)
    ) {
      return defaultValue;
    }
    result = result[key];
  }

  return result;
}

// 导出所有工具函数
export {
  detectArchitectureType,
  parseStorageSize,
  formatSize,
  calculateStats,
  checkThreshold,
  formatTimestamp,
  estimateTimeToFull,
  deepMerge,
  safeGet,
};
