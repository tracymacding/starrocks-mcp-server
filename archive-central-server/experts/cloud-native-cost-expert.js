/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks 云原生成本分析专家模块
 * 负责：存算分离架构下的对象存储成本分析（存储成本 + API 调用成本）
 */

/* eslint-disable no-undef, @typescript-eslint/no-unused-vars */

import { detectArchitectureType } from './common-utils.js';

class StarRocksCloudNativeCostExpert {
  constructor() {
    this.name = 'cloud_native_cost';
    this.version = '1.0.0';
    this.description =
      'StarRocks 云原生成本分析专家 - 负责存算分离架构下的对象存储成本分析';

    // Prometheus 配置
    this.prometheusConfig = {
      host: '127.0.0.1',
      port: 9092,
      protocol: 'http',
    };

    // 对象存储成本配置 (可配置多个云厂商)
    this.storagePricing = {
      // AWS S3 定价 (美国东部)
      aws_s3: {
        name: 'AWS S3 Standard',
        storage: {
          price_per_gb_month: 0.023, // $0.023/GB/月
          currency: 'USD',
        },
        api: {
          put_price_per_1000: 0.005, // PUT/POST 请求 $0.005/1000次
          get_price_per_1000: 0.0004, // GET 请求 $0.0004/1000次
          list_price_per_1000: 0.005, // LIST 请求 $0.005/1000次
          delete_price_per_1000: 0, // DELETE 免费
          currency: 'USD',
        },
        data_transfer: {
          out_price_per_gb: 0.09, // 数据传出 $0.09/GB (前 10TB)
          in_price_per_gb: 0, // 数据传入免费
          currency: 'USD',
        },
      },

      // 阿里云 OSS 定价 (中国大陆)
      aliyun_oss: {
        name: '阿里云 OSS 标准存储',
        storage: {
          price_per_gb_month: 0.12, // ¥0.12/GB/月
          currency: 'CNY',
        },
        api: {
          put_price_per_10000: 0.01, // PUT/POST 请求 ¥0.01/万次
          get_price_per_10000: 0.01, // GET 请求 ¥0.01/万次
          list_price_per_10000: 0.1, // LIST 请求 ¥0.1/万次
          delete_price_per_10000: 0, // DELETE 免费
          currency: 'CNY',
        },
        data_transfer: {
          out_price_per_gb: 0.5, // 数据传出 ¥0.5/GB
          in_price_per_gb: 0, // 数据传入免费
          currency: 'CNY',
        },
      },

      // 腾讯云 COS 定价
      tencent_cos: {
        name: '腾讯云 COS 标准存储',
        storage: {
          price_per_gb_month: 0.118, // ¥0.118/GB/月
          currency: 'CNY',
        },
        api: {
          put_price_per_10000: 0.01, // PUT/POST 请求 ¥0.01/万次
          get_price_per_10000: 0.01, // GET 请求 ¥0.01/万次
          list_price_per_10000: 0.1, // LIST 请求 ¥0.1/万次
          delete_price_per_10000: 0, // DELETE 免费
          currency: 'CNY',
        },
        data_transfer: {
          out_price_per_gb: 0.5, // 数据传出 ¥0.5/GB
          in_price_per_gb: 0, // 数据传入免费
          currency: 'CNY',
        },
      },
    };

    // 成本分析规则
    this.rules = {
      cost_alert: {
        daily_cost_high: 100, // 日成本 > 100 元为高
        monthly_cost_high: 3000, // 月成本 > 3000 元为高
        storage_waste_threshold: 0.2, // 存储浪费 > 20% 需优化
      },
      api_efficiency: {
        get_put_ratio_healthy: 10, // GET/PUT 比例 > 10 为健康
        list_ratio_warning: 0.1, // LIST 请求占比 > 10% 为警告
      },
      cost_optimization: {
        cache_hit_ratio_target: 80, // 缓存命中率目标 80%
        min_cache_savings: 100, // 最小缓存节省成本 100 元/月
      },
    };

    // 专业术语
    this.terminology = {
      object_storage:
        '云上对象存储服务 (如 AWS S3, 阿里云 OSS, 腾讯云 COS)，用于存储 StarRocks Shared-Data 架构的数据',
      storage_cost: '对象存储空间占用产生的成本，按 GB/月计费',
      api_cost:
        'API 调用产生的成本，包括 PUT (写入), GET (读取), LIST (列举), DELETE (删除) 等操作',
      data_transfer_cost: '数据传输成本，主要是数据从对象存储传出的费用',
      total_cost_ownership:
        'TCO 总拥有成本，包括存储、API 调用、数据传输等所有成本',
    };
  }

  /**
   * 查询 Prometheus 即时数据
   */
  async queryPrometheusInstant(query) {
    const url = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}/api/v1/query`;

    const params = new URLSearchParams({
      query: query,
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(
          `Prometheus API 请求失败: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(
          `Prometheus 查询失败: ${data.error || 'unknown error'}`,
        );
      }

      return data.data;
    } catch (error) {
      console.error('查询 Prometheus 失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询 Prometheus 范围数据
   */
  async queryPrometheusRange(query, start, end, step = '1m') {
    const url = `${this.prometheusConfig.protocol}://${this.prometheusConfig.host}:${this.prometheusConfig.port}/api/v1/query_range`;

    const params = new URLSearchParams({
      query: query,
      start: start,
      end: end,
      step: step,
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(
          `Prometheus API 请求失败: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(
          `Prometheus 查询失败: ${data.error || 'unknown error'}`,
        );
      }

      return data.data;
    } catch (error) {
      console.error('查询 Prometheus 失败:', error.message);
      throw error;
    }
  }

  /**
   * 综合成本分析
   */
  async analyzeCost(
    connection,
    timeRange = '24h',
    cloudProvider = 'aliyun_oss',
  ) {
    try {
      // 1. 检测架构类型
      const archInfo = await detectArchitectureType(connection);

      if (archInfo.type !== 'shared_data') {
        return {
          status: 'not_applicable',
          message: '当前集群为存算一体架构，不适用于云原生成本分析',
          architecture_type: archInfo.type,
        };
      }

      // 2. 获取云厂商定价配置
      const pricing = this.storagePricing[cloudProvider];
      if (!pricing) {
        throw new Error(`不支持的云厂商: ${cloudProvider}`);
      }

      // 3. 收集成本相关数据
      const costData = await this.collectCostData(connection, timeRange);

      // 4. 计算成本
      const costAnalysis = this.calculateCost(costData, pricing, timeRange);

      // 5. 生成优化建议
      const recommendations = this.generateCostRecommendations(
        costAnalysis,
        costData,
      );

      return {
        status: 'success',
        expert: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        architecture_type: archInfo.type,
        cloud_provider: cloudProvider,
        pricing_info: {
          name: pricing.name,
          currency: pricing.storage.currency,
        },
        time_range: timeRange,
        cost_analysis: costAnalysis,
        recommendations: recommendations,
        raw_data: costData,
      };
    } catch (error) {
      return {
        status: 'error',
        message: `成本分析失败: ${error.message}`,
      };
    }
  }

  /**
   * 收集成本相关数据
   */
  async collectCostData(connection, timeRange) {
    const now = Math.floor(Date.now() / 1000);
    let startTime;
    let step = '5m';

    // 解析时间范围
    const rangeMatch = timeRange.match(/^(\d+)([hd])$/);
    if (rangeMatch) {
      const value = parseInt(rangeMatch[1]);
      const unit = rangeMatch[2];

      switch (unit) {
        case 'h':
          startTime = now - value * 3600;
          step = value > 6 ? '5m' : '1m';
          break;
        case 'd':
          startTime = now - value * 86400;
          step = '1h';
          break;
        default:
          startTime = now - 86400; // 默认 24 小时
      }
    } else {
      startTime = now - 86400;
    }

    const data = {
      time_range_seconds: now - startTime,
      storage: {
        total_size_bytes: 0,
        total_size_gb: 0,
        table_count: 0,
        partition_count: 0,
      },
      api_calls: {
        get_count: 0,
        put_count: 0,
        put_single_count: 0,
        put_multi_count: 0,
        list_count: 0,
        delete_count: 0,
        total_count: 0,
      },
      data_transfer: {
        bytes_out: 0,
        bytes_in: 0,
        gb_out: 0,
        gb_in: 0,
      },
      cache_metrics: {
        hit_count: 0,
        miss_count: 0,
        hit_ratio: 0,
      },
    };

    try {
      // 1. 查询存储空间使用量 (使用 partitions_meta 获取对象存储实际占用)
      try {
        // 查询所有云原生表的分区存储信息
        const [partitions] = await connection.query(`
          SELECT
            DB_NAME,
            TABLE_NAME,
            PARTITION_NAME,
            DATA_SIZE,
            STORAGE_SIZE
          FROM information_schema.partitions_meta
          WHERE DB_NAME NOT IN ('information_schema', 'sys', '_statistics_')
          ORDER BY STORAGE_SIZE DESC
          LIMIT 1000
        `);

        if (partitions && partitions.length > 0) {
          let totalStorageBytes = 0;
          const uniqueTables = new Set();

          // 解析存储大小 (支持数字或字符串格式)
          const parseStorageSize = (size) => {
            if (!size) return 0;

            // 如果是数字类型，直接返回 (已经是字节数)
            if (typeof size === 'number') {
              return size;
            }

            // 如果是字符串，解析 "1.23 GB" 格式
            const str = String(size).trim();
            const parts = str.split(/\s+/);

            if (parts.length >= 2) {
              const value = parseFloat(parts[0]);
              const unit = parts[1].toUpperCase();

              if (unit.startsWith('KB')) return value * 1024;
              if (unit.startsWith('MB')) return value * 1024 ** 2;
              if (unit.startsWith('GB')) return value * 1024 ** 3;
              if (unit.startsWith('TB')) return value * 1024 ** 4;
              if (unit.startsWith('BYTES')) return value;
            }
            return 0;
          };

          partitions.forEach((partition) => {
            // 使用 STORAGE_SIZE (对象存储实际占用，可能是数字或字符串)
            const storageBytes = parseStorageSize(partition.STORAGE_SIZE);
            totalStorageBytes += storageBytes;

            // 统计唯一表
            const tableKey = `${partition.DB_NAME}.${partition.TABLE_NAME}`;
            uniqueTables.add(tableKey);
          });

          data.storage.total_size_bytes = totalStorageBytes;
          data.storage.total_size_gb = totalStorageBytes / 1024 ** 3;
          data.storage.table_count = uniqueTables.size;
          data.storage.partition_count = partitions.length;
        }
      } catch (error) {
        console.error('查询存储使用量失败:', error.message);
      }

      // 2. 查询 API 调用次数 (从 Prometheus - 使用更准确的指标)
      try {
        // GET 请求次数 (使用 fslib_read_io_size_count 统计实际 S3 读取次数)
        const getReadQuery = `sum(increase(fslib_read_io_size_count{fstype="s3"}[${timeRange}]))`;
        const getReadData = await this.queryPrometheusInstant(getReadQuery);
        if (getReadData.result && getReadData.result.length > 0) {
          data.api_calls.get_count =
            parseFloat(getReadData.result[0].value[1]) || 0;
        }

        // 缓存命中次数
        const getHitQuery = `sum(increase(fslib_open_cache_hits{fstype="s3"}[${timeRange}]))`;
        const getHitData = await this.queryPrometheusInstant(getHitQuery);
        if (getHitData.result && getHitData.result.length > 0) {
          data.cache_metrics.hit_count =
            parseFloat(getHitData.result[0].value[1]) || 0;
        }

        data.cache_metrics.miss_count = data.api_calls.get_count;
        const totalRequests =
          data.cache_metrics.hit_count + data.cache_metrics.miss_count;
        if (totalRequests > 0) {
          data.cache_metrics.hit_ratio =
            (data.cache_metrics.hit_count / totalRequests) * 100;
        }

        // PUT 请求次数 - 使用真实的上传指标
        // Single upload (小文件)
        const putSingleQuery = `sum(increase(fslib_s3_single_upload_size_count{fstype="s3"}[${timeRange}]))`;
        const putSingleData = await this.queryPrometheusInstant(putSingleQuery);
        if (putSingleData.result && putSingleData.result.length > 0) {
          data.api_calls.put_single_count =
            parseFloat(putSingleData.result[0].value[1]) || 0;
        }

        // Multi upload (大文件分片上传)
        const putMultiQuery = `sum(increase(fslib_s3_multi_upload_size_count{fstype="s3"}[${timeRange}]))`;
        const putMultiData = await this.queryPrometheusInstant(putMultiQuery);
        if (putMultiData.result && putMultiData.result.length > 0) {
          data.api_calls.put_multi_count =
            parseFloat(putMultiData.result[0].value[1]) || 0;
        }

        // 总 PUT 次数
        data.api_calls.put_count =
          data.api_calls.put_single_count + data.api_calls.put_multi_count;

        // LIST 请求次数 - 从 fslib_list_latency_count 指标获取
        const listQuery = `sum(increase(fslib_list_latency_count{fstype="s3"}[${timeRange}]))`;
        const listData = await this.queryPrometheusInstant(listQuery);
        if (listData.result && listData.result.length > 0) {
          data.api_calls.list_count =
            parseFloat(listData.result[0].value[1]) || 0;
        }

        // DELETE 请求次数 - 从 fslib_fs_delete_files 指标获取
        const deleteQuery = `sum(increase(fslib_fs_delete_files{fstype="s3"}[${timeRange}]))`;
        const deleteData = await this.queryPrometheusInstant(deleteQuery);
        if (deleteData.result && deleteData.result.length > 0) {
          data.api_calls.delete_count =
            parseFloat(deleteData.result[0].value[1]) || 0;
        }

        data.api_calls.total_count =
          data.api_calls.get_count +
          data.api_calls.put_count +
          data.api_calls.list_count +
          data.api_calls.delete_count;
      } catch (error) {
        console.error('查询 API 调用次数失败:', error.message);
      }

      // 3. 计算数据传输量
      try {
        // 数据读取量 (GET 请求)
        const readSizeQuery = `sum(increase(fslib_read_io_size_sum{fstype="s3"}[${timeRange}]))`;
        const readSizeData = await this.queryPrometheusInstant(readSizeQuery);
        if (readSizeData.result && readSizeData.result.length > 0) {
          data.data_transfer.bytes_out =
            parseFloat(readSizeData.result[0].value[1]) || 0;
          data.data_transfer.gb_out = data.data_transfer.bytes_out / 1024 ** 3;
        }

        // 数据写入量 (PUT 请求 - 通常不计费但统计)
        const writeSizeQuery = `sum(increase(fslib_write_io_size_sum{fstype="s3"}[${timeRange}]))`;
        const writeSizeData = await this.queryPrometheusInstant(writeSizeQuery);
        if (writeSizeData.result && writeSizeData.result.length > 0) {
          data.data_transfer.bytes_in =
            parseFloat(writeSizeData.result[0].value[1]) || 0;
          data.data_transfer.gb_in = data.data_transfer.bytes_in / 1024 ** 3;
        }
      } catch (error) {
        console.error('查询数据传输量失败:', error.message);

        // 如果无法获取实际传输量，使用估算
        // 假设平均对象大小 1MB
        data.data_transfer.bytes_out =
          data.api_calls.get_count * 1 * 1024 * 1024;
        data.data_transfer.gb_out = data.data_transfer.bytes_out / 1024 ** 3;
      }
    } catch (error) {
      console.error('收集成本数据失败:', error.message);
    }

    return data;
  }

  /**
   * 计算成本
   */
  calculateCost(costData, pricing, timeRange) {
    const analysis = {
      storage_cost: {
        total_gb: costData.storage.total_size_gb,
        price_per_gb_month: pricing.storage.price_per_gb_month,
        currency: pricing.storage.currency,
        daily_cost: 0,
        monthly_cost: 0,
        annual_cost: 0,
      },
      api_cost: {
        get_count: costData.api_calls.get_count,
        put_count: costData.api_calls.put_count,
        list_count: costData.api_calls.list_count,
        delete_count: costData.api_calls.delete_count,
        total_count: costData.api_calls.total_count,
        get_cost: 0,
        put_cost: 0,
        list_cost: 0,
        delete_cost: 0,
        total_api_cost: 0,
        currency: pricing.api.currency || pricing.storage.currency,
      },
      data_transfer_cost: {
        gb_out: costData.data_transfer.gb_out,
        gb_in: costData.data_transfer.gb_in,
        out_cost: 0,
        in_cost: 0,
        total_transfer_cost: 0,
        currency: pricing.data_transfer.currency || pricing.storage.currency,
      },
      total_cost: {
        daily_cost: 0,
        monthly_cost: 0,
        annual_cost: 0,
        currency: pricing.storage.currency,
      },
      cache_savings: {
        hit_ratio: costData.cache_metrics.hit_ratio,
        saved_get_requests: costData.cache_metrics.hit_count,
        saved_api_cost: 0,
        saved_transfer_cost: 0,
        total_savings: 0,
        currency: pricing.storage.currency,
      },
      time_period: timeRange,
    };

    // 1. 计算存储成本
    analysis.storage_cost.monthly_cost =
      costData.storage.total_size_gb * pricing.storage.price_per_gb_month;
    analysis.storage_cost.daily_cost = analysis.storage_cost.monthly_cost / 30;
    analysis.storage_cost.annual_cost = analysis.storage_cost.monthly_cost * 12;

    // 2. 计算 API 调用成本
    if (pricing.api.get_price_per_1000 !== undefined) {
      // AWS S3 风格 (按 1000 次计费)
      analysis.api_cost.get_cost =
        (costData.api_calls.get_count / 1000) * pricing.api.get_price_per_1000;
      analysis.api_cost.put_cost =
        (costData.api_calls.put_count / 1000) * pricing.api.put_price_per_1000;
      analysis.api_cost.list_cost =
        (costData.api_calls.list_count / 1000) *
        pricing.api.list_price_per_1000;
      analysis.api_cost.delete_cost =
        (costData.api_calls.delete_count / 1000) *
        pricing.api.delete_price_per_1000;
    } else if (pricing.api.get_price_per_10000 !== undefined) {
      // 阿里云/腾讯云风格 (按万次计费)
      analysis.api_cost.get_cost =
        (costData.api_calls.get_count / 10000) *
        pricing.api.get_price_per_10000;
      analysis.api_cost.put_cost =
        (costData.api_calls.put_count / 10000) *
        pricing.api.put_price_per_10000;
      analysis.api_cost.list_cost =
        (costData.api_calls.list_count / 10000) *
        pricing.api.list_price_per_10000;
      analysis.api_cost.delete_cost =
        (costData.api_calls.delete_count / 10000) *
        pricing.api.delete_price_per_10000;
    }

    analysis.api_cost.total_api_cost =
      analysis.api_cost.get_cost +
      analysis.api_cost.put_cost +
      analysis.api_cost.list_cost +
      analysis.api_cost.delete_cost;

    // 3. 计算数据传输成本
    analysis.data_transfer_cost.out_cost =
      costData.data_transfer.gb_out * pricing.data_transfer.out_price_per_gb;
    analysis.data_transfer_cost.in_cost =
      costData.data_transfer.gb_in * pricing.data_transfer.in_price_per_gb;
    analysis.data_transfer_cost.total_transfer_cost =
      analysis.data_transfer_cost.out_cost +
      analysis.data_transfer_cost.in_cost;

    // 4. 计算缓存节省的成本
    if (costData.cache_metrics.hit_count > 0) {
      // 节省的 GET 请求成本
      if (pricing.api.get_price_per_1000 !== undefined) {
        analysis.cache_savings.saved_api_cost =
          (costData.cache_metrics.hit_count / 1000) *
          pricing.api.get_price_per_1000;
      } else if (pricing.api.get_price_per_10000 !== undefined) {
        analysis.cache_savings.saved_api_cost =
          (costData.cache_metrics.hit_count / 10000) *
          pricing.api.get_price_per_10000;
      }

      // 节省的数据传输成本
      const savedTransferGB = (costData.cache_metrics.hit_count * 1) / 1024; // 假设 1MB/对象
      analysis.cache_savings.saved_transfer_cost =
        savedTransferGB * pricing.data_transfer.out_price_per_gb;

      analysis.cache_savings.total_savings =
        analysis.cache_savings.saved_api_cost +
        analysis.cache_savings.saved_transfer_cost;
    }

    // 5. 根据时间范围推算总成本
    const timeRangeMatch = timeRange.match(/^(\d+)([hd])$/);
    let periodHours = 24; // 默认 24 小时

    if (timeRangeMatch) {
      const value = parseInt(timeRangeMatch[1]);
      const unit = timeRangeMatch[2];
      periodHours = unit === 'h' ? value : value * 24;
    }

    // 将时间段内的 API 和传输成本推算到月
    const monthlyMultiplier = (30 * 24) / periodHours;
    const monthlyApiCost = analysis.api_cost.total_api_cost * monthlyMultiplier;
    const monthlyTransferCost =
      analysis.data_transfer_cost.total_transfer_cost * monthlyMultiplier;

    analysis.total_cost.monthly_cost =
      analysis.storage_cost.monthly_cost + monthlyApiCost + monthlyTransferCost;
    analysis.total_cost.daily_cost = analysis.total_cost.monthly_cost / 30;
    analysis.total_cost.annual_cost = analysis.total_cost.monthly_cost * 12;

    // 推算缓存月度节省
    analysis.cache_savings.monthly_savings =
      analysis.cache_savings.total_savings * monthlyMultiplier;

    return analysis;
  }

  /**
   * 生成成本优化建议
   */
  generateCostRecommendations(costAnalysis, costData) {
    const recommendations = [];

    // 1. 存储成本优化
    if (costAnalysis.storage_cost.monthly_cost > 1000) {
      recommendations.push({
        category: 'storage_optimization',
        priority: 'MEDIUM',
        title: '存储成本较高，建议优化',
        current_cost: `${costAnalysis.storage_cost.monthly_cost.toFixed(2)} ${costAnalysis.storage_cost.currency}/月`,
        actions: [
          {
            action: '数据生命周期管理',
            description: '将冷数据迁移到低频存储或归档存储',
            potential_savings: '30-50%',
          },
          {
            action: '数据压缩优化',
            description: '启用或优化数据压缩算法',
            potential_savings: '20-40%',
          },
          {
            action: '清理历史数据',
            description: '定期清理不再使用的历史分区数据',
            potential_savings: '视数据情况而定',
          },
        ],
      });
    }

    // 2. API 调用成本优化
    const apiCostRatio =
      costAnalysis.api_cost.total_api_cost /
      (costAnalysis.total_cost.monthly_cost / 30);
    if (apiCostRatio > 0.3) {
      recommendations.push({
        category: 'api_cost_optimization',
        priority: 'HIGH',
        title: 'API 调用成本占比过高',
        current_cost: `API 成本占总成本 ${(apiCostRatio * 100).toFixed(1)}%`,
        actions: [
          {
            action: '提升缓存命中率',
            description: `当前命中率 ${costAnalysis.cache_savings.hit_ratio.toFixed(1)}%，目标 ${this.rules.cost_optimization.cache_hit_ratio_target}%`,
            current_savings: `已节省 ${costAnalysis.cache_savings.monthly_savings.toFixed(2)} ${costAnalysis.cache_savings.currency}/月`,
            potential_additional_savings:
              this.estimateAdditionalCacheSavings(costAnalysis),
          },
          {
            action: '增加 Data Cache 容量',
            description: '为 Compute Node 分配更多本地磁盘缓存',
          },
          {
            action: '优化查询模式',
            description: '减少全表扫描，避免重复查询',
          },
        ],
      });
    }

    // 3. 缓存优化建议
    if (
      costAnalysis.cache_savings.hit_ratio <
      this.rules.cost_optimization.cache_hit_ratio_target
    ) {
      const potentialSavings =
        this.estimateAdditionalCacheSavings(costAnalysis);

      recommendations.push({
        category: 'cache_optimization',
        priority: potentialSavings > 100 ? 'HIGH' : 'MEDIUM',
        title: '缓存命中率有提升空间',
        current_status: `命中率 ${costAnalysis.cache_savings.hit_ratio.toFixed(1)}%，已节省 ${costAnalysis.cache_savings.monthly_savings.toFixed(2)} ${costAnalysis.cache_savings.currency}/月`,
        actions: [
          {
            action: '提升到目标命中率',
            description: `从 ${costAnalysis.cache_savings.hit_ratio.toFixed(1)}% 提升到 ${this.rules.cost_optimization.cache_hit_ratio_target}%`,
            potential_savings: `预计额外节省 ${potentialSavings.toFixed(2)} ${costAnalysis.cache_savings.currency}/月`,
          },
        ],
      });
    }

    // 4. 数据传输成本优化
    if (costAnalysis.data_transfer_cost.total_transfer_cost > 100) {
      recommendations.push({
        category: 'data_transfer_optimization',
        priority: 'MEDIUM',
        title: '数据传输成本优化',
        current_cost: `${costAnalysis.data_transfer_cost.total_transfer_cost.toFixed(2)} ${costAnalysis.data_transfer_cost.currency}`,
        actions: [
          {
            action: '提高缓存命中率',
            description: '减少从对象存储读取数据的次数',
          },
          {
            action: '区域优化',
            description: '确保 Compute Node 与对象存储在同一区域',
          },
        ],
      });
    }

    // 5. 总体成本建议
    if (costAnalysis.total_cost.monthly_cost > 3000) {
      recommendations.push({
        category: 'overall_cost',
        priority: 'HIGH',
        title: '总体成本较高，建议综合优化',
        cost_breakdown: {
          storage: `${costAnalysis.storage_cost.monthly_cost.toFixed(2)} ${costAnalysis.storage_cost.currency} (${((costAnalysis.storage_cost.monthly_cost / costAnalysis.total_cost.monthly_cost) * 100).toFixed(1)}%)`,
          api: `${((costAnalysis.api_cost.total_api_cost * (30 * 24)) / 24).toFixed(2)} ${costAnalysis.api_cost.currency} (推算)`,
          transfer: `${((costAnalysis.data_transfer_cost.total_transfer_cost * (30 * 24)) / 24).toFixed(2)} ${costAnalysis.data_transfer_cost.currency} (推算)`,
        },
        actions: [
          {
            action: '定期成本审查',
            description: '每周/每月审查成本趋势，及时发现异常',
          },
          {
            action: '设置成本告警',
            description: '在 Grafana 或云厂商控制台设置成本告警',
          },
        ],
      });
    }

    return recommendations;
  }

  /**
   * 估算提升缓存命中率后的额外节省
   */
  estimateAdditionalCacheSavings(costAnalysis) {
    const currentHitRatio = costAnalysis.cache_savings.hit_ratio;
    const targetHitRatio = this.rules.cost_optimization.cache_hit_ratio_target;

    if (currentHitRatio >= targetHitRatio) {
      return 0;
    }

    // 计算如果达到目标命中率，能额外节省多少
    const totalRequests =
      costAnalysis.cache_savings.saved_get_requests / (currentHitRatio / 100);
    const targetHits = (totalRequests * targetHitRatio) / 100;
    const additionalHits =
      targetHits - costAnalysis.cache_savings.saved_get_requests;

    // 估算额外节省
    const additionalSavings =
      (additionalHits / costAnalysis.cache_savings.saved_get_requests) *
      costAnalysis.cache_savings.monthly_savings;

    return additionalSavings;
  }

  /**
   * 获取此专家提供的 MCP 工具处理器
   */
  getToolHandlers() {
    return {
      analyze_cloud_cost: async (args, context) => {
        console.log(
          '🎯 云原生成本分析接收参数:',
          JSON.stringify(args, null, 2),
        );

        const connection = context.connection;
        const timeRange = args.time_range || '24h';
        const cloudProvider = args.cloud_provider || 'aliyun_oss';

        const result = await this.analyzeCost(
          connection,
          timeRange,
          cloudProvider,
        );

        const report = this.formatCostReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    };
  }

  /**
   * 格式化成本分析报告
   */
  formatCostReport(result) {
    let report = '💰 StarRocks 云原生成本分析报告\n';
    report += '========================================\n\n';

    if (result.status === 'not_applicable') {
      report += `ℹ️  ${result.message}\n`;
      return report;
    }

    if (result.status === 'error') {
      report += `❌ ${result.message}\n`;
      return report;
    }

    const analysis = result.cost_analysis;

    // 基本信息
    report += `☁️  **云厂商**: ${result.pricing_info.name}\n`;
    report += `⏰ **分析周期**: ${result.time_range}\n`;
    report += `💱 **货币单位**: ${result.pricing_info.currency}\n\n`;

    // 成本概览
    report += '📊 **成本概览**:\n';
    report += `   月度总成本: ${analysis.total_cost.monthly_cost.toFixed(2)} ${analysis.total_cost.currency}\n`;
    report += `   日均成本: ${analysis.total_cost.daily_cost.toFixed(2)} ${analysis.total_cost.currency}\n`;
    report += `   年度成本 (预估): ${analysis.total_cost.annual_cost.toFixed(2)} ${analysis.total_cost.currency}\n\n`;

    // 成本明细
    report += '💾 **存储成本**:\n';
    report += `   存储空间: ${analysis.storage_cost.total_gb.toFixed(2)} GB\n`;

    // 显示表和分区数量
    if (result.raw_data.storage.table_count > 0) {
      report += `   云原生表数: ${result.raw_data.storage.table_count} 个\n`;
    }
    if (result.raw_data.storage.partition_count > 0) {
      report += `   分区数: ${result.raw_data.storage.partition_count} 个\n`;
    }

    report += `   月度成本: ${analysis.storage_cost.monthly_cost.toFixed(2)} ${analysis.storage_cost.currency}\n`;
    report += `   占比: ${((analysis.storage_cost.monthly_cost / analysis.total_cost.monthly_cost) * 100).toFixed(1)}%\n\n`;

    report += `🔄 **API 调用成本** (基于 ${result.time_range} 推算):\n`;
    report += `   GET 请求: ${analysis.api_cost.get_count.toLocaleString()} 次 (${analysis.api_cost.get_cost.toFixed(4)} ${analysis.api_cost.currency})\n`;
    report += `   PUT 请求: ${analysis.api_cost.put_count.toLocaleString()} 次 (${analysis.api_cost.put_cost.toFixed(4)} ${analysis.api_cost.currency})\n`;

    // 显示 PUT 详情
    if (
      result.raw_data.api_calls.put_single_count > 0 ||
      result.raw_data.api_calls.put_multi_count > 0
    ) {
      report += `     - Single Upload: ${result.raw_data.api_calls.put_single_count.toLocaleString()} 次\n`;
      report += `     - Multi Upload: ${result.raw_data.api_calls.put_multi_count.toLocaleString()} 次\n`;
    }

    report += `   LIST 请求: ${analysis.api_cost.list_count.toLocaleString()} 次 (${analysis.api_cost.list_cost.toFixed(4)} ${analysis.api_cost.currency})\n`;
    report += `   DELETE 请求: ${analysis.api_cost.delete_count.toLocaleString()} 次 (${analysis.api_cost.delete_cost.toFixed(4)} ${analysis.api_cost.currency})\n`;
    report += `   总计: ${analysis.api_cost.total_count.toLocaleString()} 次 (${analysis.api_cost.total_api_cost.toFixed(4)} ${analysis.api_cost.currency})\n\n`;

    report += '📤 **数据传输成本**:\n';
    report += `   数据传出: ${analysis.data_transfer_cost.gb_out.toFixed(2)} GB (${analysis.data_transfer_cost.out_cost.toFixed(2)} ${analysis.data_transfer_cost.currency})\n\n`;

    // 缓存节省
    report += '💚 **缓存节省成本**:\n';
    report += `   缓存命中率: ${analysis.cache_savings.hit_ratio.toFixed(2)}%\n`;
    report += `   节省请求: ${analysis.cache_savings.saved_get_requests.toLocaleString()} 次\n`;
    report += `   月度节省: ${analysis.cache_savings.monthly_savings.toFixed(2)} ${analysis.cache_savings.currency}\n`;
    report += `   年度节省 (预估): ${(analysis.cache_savings.monthly_savings * 12).toFixed(2)} ${analysis.cache_savings.currency}\n\n`;

    // 优化建议
    if (result.recommendations && result.recommendations.length > 0) {
      report += '💡 **优化建议**:\n';
      result.recommendations.forEach((rec, index) => {
        const priorityEmoji =
          rec.priority === 'HIGH'
            ? '🔴'
            : rec.priority === 'MEDIUM'
              ? '🟡'
              : '🔵';
        report += `\n  ${index + 1}. ${priorityEmoji} [${rec.priority}] ${rec.title}\n`;

        if (rec.current_cost) {
          report += `     当前成本: ${rec.current_cost}\n`;
        }
        if (rec.current_status) {
          report += `     当前状态: ${rec.current_status}\n`;
        }

        if (rec.actions) {
          report += '     建议行动:\n';
          rec.actions.forEach((action) => {
            report += `       • ${action.action}\n`;
            if (action.description) {
              report += `         ${action.description}\n`;
            }
            if (action.potential_savings) {
              report += `         💰 预计节省: ${action.potential_savings}\n`;
            }
          });
        }
      });
    }

    report += '\n';
    report += '📝 **数据说明**:\n';
    report += `   • 存储空间: 从 information_schema.partitions_meta 查询 STORAGE_SIZE (对象存储实际占用)\n`;
    report += `   • GET 请求: 从 fslib_read_io_size_count 指标获取 (${result.time_range})\n`;
    report += `   • PUT 请求: 从 fslib_s3_single/multi_upload_size_count 指标获取\n`;
    report += `   • LIST 请求: 从 fslib_list_latency_count 指标获取\n`;
    report += `   • DELETE 请求: 从 fslib_fs_delete_files 指标获取\n`;
    report += `   • 数据传输量: 从 fslib_read/write_io_size_sum 指标获取\n`;
    report += `   • 月度成本: 基于观测周期线性推算\n`;

    return report;
  }

  /**
   * 获取此专家提供的 MCP 工具定义
   */
  getTools() {
    return [
      {
        name: 'analyze_cloud_cost',
        description: `💰 **云原生成本分析** (存算分离架构)

**功能**: 分析 StarRocks Shared-Data 架构下的对象存储成本，包括存储成本、API 调用成本和数据传输成本。

**成本分析内容**:
- ✅ 存储空间成本 (按 GB/月计费)
- ✅ API 调用成本 (GET, PUT, LIST, DELETE)
- ✅ 数据传输成本 (数据传出费用)
- ✅ 缓存节省成本计算
- ✅ 月度/年度成本预估
- ✅ 成本优化建议

**支持的云厂商**:
- aws_s3: AWS S3 Standard (美国东部)
- aliyun_oss: 阿里云 OSS 标准存储 (默认)
- tencent_cos: 腾讯云 COS 标准存储

**适用场景**:
- 定期成本审查和优化
- 评估存算分离架构的 TCO
- 缓存策略成本效益分析
- 云厂商成本对比

**成本优化建议**:
- 提升缓存命中率降低 API 调用
- 数据生命周期管理
- 存储压缩优化
- 清理历史数据

**前置条件**:
- ✅ 存算分离架构 (Shared-Data)
- ✅ Prometheus 监控系统已部署
- ✅ fslib_open_cache_* 指标可用

**时间范围参数**:
- "24h": 24 小时 (默认)
- "7d": 7 天
- "30d": 30 天

**注意**:
- 成本数据基于云厂商公开定价
- API 调用次数基于 Prometheus 指标推算
- 建议定期分析成本趋势`,
        inputSchema: {
          type: 'object',
          properties: {
            time_range: {
              type: 'string',
              description:
                '分析时间范围，格式: 数字+单位(h/d)，如 "24h", "7d", "30d"',
              default: '24h',
            },
            cloud_provider: {
              type: 'string',
              enum: ['aws_s3', 'aliyun_oss', 'tencent_cos'],
              description: '云厂商类型',
              default: 'aliyun_oss',
            },
          },
          required: [],
        },
      },
    ];
  }
}

export { StarRocksCloudNativeCostExpert };
