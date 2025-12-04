#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * StarRocks Operations Expert
 *
 * 负责执行各种线上运维操作，包括:
 * - 安装 Audit Log 插件
 * - 配置和管理系统组件
 * - 执行运维任务
 */

/* eslint-disable no-undef */

import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import https from 'node:https';

const execAsync = promisify(exec);

export class StarRocksOperateExpert {
  constructor() {
    this.name = 'StarRocks Operations Expert';
    this.description = 'StarRocks 运维专家，负责执行线上运维操作';
  }

  /**
   * 注册所有工具到 MCP Server
   */
  getTools() {
    return [
      {
        name: 'install_audit_log',
        description: `安装 StarRocks Audit Log 插件

**功能**:
- ✅ 检查 audit log 是否已安装
- ✅ 创建 audit log 数据库和表
- ✅ 下载并配置 AuditLoader 插件
- ✅ 安装插件到所有 FE 节点
- ✅ 验证安装是否成功

**安装步骤**:
1. 检查现有插件状态
2. 创建 starrocks_audit_db__ 数据库
3. 创建 starrocks_audit_tbl__ 审计日志表
4. 自动下载 AuditLoader 插件 (如果 auto_download=true)
5. 自动配置插件 (配置 FE 连接信息)
6. 安装插件到 FE 节点
7. 验证插件正常工作

**参数说明**:
- plugin_path: 插件文件路径 (可选，如不提供则自动下载)
- fe_host: FE 节点地址 (默认: 127.0.0.1)
- fe_port: FE Query 端口 (MySQL 协议, 默认: 9030)
- fe_http_port: FE HTTP 端口 (插件使用, 默认: 8030)
- install_user: 安装用户 (默认: root)
- install_password: 安装密码 (默认: '')
- auto_download: 自动下载插件 (默认: true)
- download_dir: 下载目录 (默认: /tmp/starrocks_audit)

**返回数据**:
- success: 是否安装成功
- message: 安装结果消息
- steps: 详细安装步骤
- plugin_info: 插件信息
- verification: 验证结果`,
        inputSchema: {
          type: 'object',
          properties: {
            plugin_path: {
              type: 'string',
              description: '插件文件路径 (auditloader.zip)',
            },
            fe_host: {
              type: 'string',
              description: 'FE 节点地址',
            },
            fe_port: {
              type: 'number',
              description: 'FE Query 端口 (MySQL 协议)',
              default: 9030,
            },
            fe_http_port: {
              type: 'number',
              description: 'FE HTTP 端口 (插件使用)',
              default: 8030,
            },
            install_user: {
              type: 'string',
              description: '安装用户',
              default: 'root',
            },
            install_password: {
              type: 'string',
              description: '安装密码',
            },
            auto_download: {
              type: 'boolean',
              description: '自动下载并安装插件',
              default: true,
            },
            download_dir: {
              type: 'string',
              description: '插件下载目录',
              default: '/tmp/starrocks_audit',
            },
          },
        },
      },
      {
        name: 'check_audit_log_status',
        description: `检查 Audit Log 插件状态

**功能**:
- ✅ 检查插件是否已安装
- ✅ 检查数据库和表是否存在
- ✅ 检查数据是否正在写入
- ✅ 获取最近的审计日志记录

**返回数据**:
- installed: 插件是否已安装
- plugin_info: 插件详细信息
- database_exists: 数据库是否存在
- table_exists: 表是否存在
- record_count: 记录总数
- latest_records: 最近的审计日志记录`,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'uninstall_audit_log',
        description: `卸载 Audit Log 插件

**功能**:
- ✅ 卸载 AuditLoader 插件
- ✅ 可选保留或删除审计日志数据

**参数说明**:
- keep_data: 是否保留审计日志数据库和表 (默认: true)

**返回数据**:
- success: 是否卸载成功
- message: 卸载结果消息`,
        inputSchema: {
          type: 'object',
          properties: {
            keep_data: {
              type: 'boolean',
              description: '是否保留审计日志数据库和表',
              default: true,
            },
          },
        },
      },
      {
        name: 'set_compact_threads',
        description: `调整存算分离架构下 BE/CN 节点的 Compact 工作线程数

**功能**:
- ✅ 查询当前所有 BE/CN 节点的 compact 线程配置
- ✅ 支持单个节点或批量调整线程数
- ✅ 自动验证参数合理性 (建议范围: CPU cores * 0.25 ~ 0.5)
- ✅ 支持预览模式，不实际执行修改

**适用场景**:
- Compaction 任务执行缓慢，需要增加线程数
- 系统负载过高，需要降低 compaction 线程数
- 集群扩容后，统一调整所有节点的线程配置

**参数说明**:
- be_id: BE/CN 节点 ID (可选，不指定则调整所有节点)
- thread_count: 目标线程数 (必填)
- dry_run: 预览模式，不实际执行 (默认: false)
- auto_validate: 自动验证合理性 (默认: true)

**返回数据**:
- success: 是否执行成功
- modified_nodes: 修改的节点列表
- current_config: 当前配置
- new_config: 新配置
- validation: 参数验证结果`,
        inputSchema: {
          type: 'object',
          properties: {
            be_id: {
              type: 'string',
              description: 'BE/CN 节点 ID (不指定则调整所有节点)',
            },
            thread_count: {
              type: 'number',
              description: '目标线程数',
            },
            dry_run: {
              type: 'boolean',
              description: '预览模式，不实际执行修改',
              default: false,
            },
            auto_validate: {
              type: 'boolean',
              description: '自动验证参数合理性',
              default: true,
            },
          },
          required: ['thread_count'],
        },
      },
    ];
  }

  /**
   * 获取工具处理器 (MCP Server 使用)
   */
  getToolHandlers() {
    return {
      install_audit_log: async (args) => {
        const result = await this.installAuditLog(args);
        const report = this.formatReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
          ],
          isError: !result.success,
        };
      },
      check_audit_log_status: async () => {
        const result = await this.checkAuditLogStatus({});
        const report = this.formatStatusReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
          ],
        };
      },
      uninstall_audit_log: async (args) => {
        const result = await this.uninstallAuditLog(args);
        const report = this.formatUninstallReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
          ],
          isError: !result.success,
        };
      },
      set_compact_threads: async (args, context) => {
        const result = await this.setCompactThreads(context.connection, args);
        const report = this.formatCompactThreadsReport(result);

        return {
          content: [
            {
              type: 'text',
              text: report,
            },
          ],
          isError: !result.success,
        };
      },
    };
  }

  /**
   * 获取数据库连接
   */
  async getConnection(host, port, user, password) {
    try {
      const connection = await mysql.createConnection({
        host: host || process.env.STARROCKS_FE_HOST || '127.0.0.1',
        port: port || parseInt(process.env.STARROCKS_FE_PORT || '9030'),
        user: user || process.env.STARROCKS_USER || 'root',
        password: password || process.env.STARROCKS_PASSWORD || '',
        connectTimeout: 10000,
      });
      return connection;
    } catch (error) {
      throw new Error(`连接数据库失败: ${error.message}`);
    }
  }

  /**
   * 检查插件是否已安装
   */
  async checkPluginInstalled(connection) {
    try {
      const [plugins] = await connection.query('SHOW PLUGINS');
      const auditPlugin = plugins.find(
        (p) => p.Name === 'AuditLoader' || p.Name === 'auditloader',
      );
      return auditPlugin || null;
    } catch (error) {
      console.error('检查插件状态失败:', error.message);
      return null;
    }
  }

  /**
   * 创建审计日志数据库和表
   */
  async createAuditDatabase(connection) {
    const steps = [];

    try {
      // 创建数据库
      await connection.query(
        'CREATE DATABASE IF NOT EXISTS starrocks_audit_db__',
      );
      steps.push({
        step: 'create_database',
        success: true,
        message: '创建数据库 starrocks_audit_db__',
      });

      // 创建审计日志表
      const createTableSQL = `
CREATE TABLE IF NOT EXISTS starrocks_audit_db__.starrocks_audit_tbl__ (
  \`queryId\` VARCHAR(64) COMMENT "查询的唯一ID",
  \`timestamp\` DATETIME NOT NULL COMMENT "查询开始时间",
  \`queryType\` VARCHAR(12) COMMENT "查询类型（query, slow_query, connection）",
  \`clientIp\` VARCHAR(32) COMMENT "客户端IP",
  \`user\` VARCHAR(64) COMMENT "查询用户名",
  \`authorizedUser\` VARCHAR(64) COMMENT "用户唯一标识，既user_identity",
  \`resourceGroup\` VARCHAR(64) COMMENT "资源组名",
  \`catalog\` VARCHAR(32) COMMENT "数据目录名",
  \`db\` VARCHAR(96) COMMENT "查询所在数据库",
  \`state\` VARCHAR(8) COMMENT "查询状态（EOF，ERR，OK）",
  \`errorCode\` VARCHAR(512) COMMENT "错误码",
  \`queryTime\` BIGINT COMMENT "查询执行时间（毫秒）",
  \`scanBytes\` BIGINT COMMENT "查询扫描的字节数",
  \`scanRows\` BIGINT COMMENT "查询扫描的记录行数",
  \`returnRows\` BIGINT COMMENT "查询返回的结果行数",
  \`cpuCostNs\` BIGINT COMMENT "查询CPU耗时（纳秒）",
  \`memCostBytes\` BIGINT COMMENT "查询消耗内存（字节）",
  \`stmtId\` INT COMMENT "SQL语句增量ID",
  \`isQuery\` TINYINT COMMENT "SQL是否为查询（1或0）",
  \`feIp\` VARCHAR(128) COMMENT "执行该语句的FE IP",
  \`stmt\` VARCHAR(1048576) COMMENT "SQL原始语句",
  \`digest\` VARCHAR(32) COMMENT "慢SQL指纹",
  \`planCpuCosts\` DOUBLE COMMENT "查询规划阶段CPU占用（纳秒）",
  \`planMemCosts\` DOUBLE COMMENT "查询规划阶段内存占用（字节）",
  \`pendingTimeMs\` BIGINT COMMENT "查询在队列中等待的时间（毫秒）",
  \`candidateMVs\` VARCHAR(65533) NULL COMMENT "候选MV列表",
  \`hitMvs\` VARCHAR(65533) NULL COMMENT "命中MV列表",
  \`warehouse\` VARCHAR(128) NULL COMMENT "仓库名称"
) ENGINE = OLAP
DUPLICATE KEY (\`queryId\`, \`timestamp\`, \`queryType\`)
COMMENT "审计日志表"
PARTITION BY RANGE (\`timestamp\`) ()
DISTRIBUTED BY HASH (\`queryId\`) BUCKETS 3
PROPERTIES (
  "dynamic_partition.time_unit" = "DAY",
  "dynamic_partition.start" = "-30",
  "dynamic_partition.end" = "3",
  "dynamic_partition.prefix" = "p",
  "dynamic_partition.buckets" = "3",
  "dynamic_partition.enable" = "true",
  "replication_num" = "3"
)`;

      await connection.query(createTableSQL);
      steps.push({
        step: 'create_table',
        success: true,
        message: '创建审计日志表 starrocks_audit_tbl__',
      });

      return { success: true, steps };
    } catch (error) {
      steps.push({
        step: 'create_database_table',
        success: false,
        error: error.message,
      });
      return { success: false, steps, error: error.message };
    }
  }

  /**
   * 下载 AuditLoader 插件
   */
  async downloadAuditLoaderPlugin(downloadDir) {
    const pluginUrl = 'https://releases.starrocks.io/resources/auditloader.zip';
    const downloadPath = path.join(downloadDir, 'auditloader.zip');

    // 创建下载目录
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const downloadFile = (url, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('下载失败: 重定向次数过多'));
          return;
        }

        const file = fs.createWriteStream(downloadPath);

        https
          .get(
            url,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; StarRocks-MCP/1.0)',
              },
            },
            (response) => {
              // 处理重定向
              if (
                response.statusCode === 301 ||
                response.statusCode === 302 ||
                response.statusCode === 307 ||
                response.statusCode === 308
              ) {
                file.close();
                fs.unlink(downloadPath, () => {});
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                  downloadFile(redirectUrl, redirectCount + 1);
                } else {
                  reject(new Error('下载失败: 重定向但没有提供 location'));
                }
                return;
              }

              if (response.statusCode !== 200) {
                file.close();
                fs.unlink(downloadPath, () => {});
                reject(new Error(`下载失败: HTTP ${response.statusCode}`));
                return;
              }

              response.pipe(file);

              file.on('finish', () => {
                file.close();
                resolve(downloadPath);
              });
            },
          )
          .on('error', (err) => {
            file.close();
            fs.unlink(downloadPath, () => {});
            reject(new Error(`下载失败: ${err.message}`));
          });

        file.on('error', (err) => {
          fs.unlink(downloadPath, () => {});
          reject(new Error(`写入文件失败: ${err.message}`));
        });
      };

      downloadFile(pluginUrl);
    });
  }

  /**
   * 配置 AuditLoader 插件
   */
  async configureAuditLoaderPlugin(
    downloadDir,
    fe_host,
    fe_http_port,
    install_user,
    install_password,
  ) {
    const pluginZipPath = path.join(downloadDir, 'auditloader.zip');
    const extractDir = path.join(downloadDir, 'auditloader_extracted');

    try {
      // 1. 解压插件
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });

      await execAsync(`unzip -q -o "${pluginZipPath}" -d "${extractDir}"`);

      // 2. 准备配置文件路径
      const pluginConfPath = path.join(extractDir, 'plugin.conf');

      // 3. 更新配置
      const config = {
        frontend_host_port: `${fe_host || '127.0.0.1'}:${fe_http_port}`,
        database: 'starrocks_audit_db__',
        table: 'starrocks_audit_tbl__',
        user: install_user,
        password: install_password || '',
      };

      // 生成新的配置内容
      let newConfig = '';
      for (const [key, value] of Object.entries(config)) {
        newConfig += `${key}=${value}\n`;
      }

      // 写入配置文件
      fs.writeFileSync(pluginConfPath, newConfig, 'utf-8');

      // 4. 重新打包
      const configuredZipPath = path.join(
        downloadDir,
        'auditloader_configured.zip',
      );
      if (fs.existsSync(configuredZipPath)) {
        fs.unlinkSync(configuredZipPath);
      }

      // 进入目录并打包
      await execAsync(
        `cd "${extractDir}" && zip -q "${configuredZipPath}" auditloader.jar plugin.conf plugin.properties`,
      );

      return configuredZipPath;
    } catch (error) {
      throw new Error(`配置插件失败: ${error.message}`);
    }
  }

  /**
   * 安装 Audit Log 插件
   */
  async installAuditLog(args = {}) {
    const {
      plugin_path,
      fe_host,
      fe_port = 9030,
      fe_http_port = 8030,
      install_user = 'root',
      install_password = '',
      auto_download = true, // 默认自动下载插件
      download_dir = '/tmp/starrocks_audit', // 下载目录
    } = args;

    const steps = [];
    let connection;
    let finalPluginPath = plugin_path;

    try {
      // 1. 连接数据库
      connection = await this.getConnection(
        fe_host,
        fe_port,
        install_user,
        install_password,
      );
      steps.push({
        step: 'connect',
        success: true,
        message: `连接到 FE: ${fe_host}:${fe_port}`,
      });

      // 2. 检查插件是否已安装
      const existingPlugin = await this.checkPluginInstalled(connection);
      if (existingPlugin) {
        steps.push({
          step: 'check_existing',
          success: true,
          message: '插件已安装',
          plugin_info: existingPlugin,
        });
        return {
          success: true,
          message: 'Audit Log 插件已安装，无需重复安装',
          already_installed: true,
          plugin_info: existingPlugin,
          steps,
        };
      }
      steps.push({
        step: 'check_existing',
        success: true,
        message: '插件未安装，开始安装流程',
      });

      // 3. 创建数据库和表
      const dbResult = await this.createAuditDatabase(connection);
      steps.push(...dbResult.steps);
      if (!dbResult.success) {
        return {
          success: false,
          message: '创建审计日志数据库失败',
          error: dbResult.error,
          steps,
        };
      }

      // 4. 下载和配置插件 (如果启用自动下载且没有提供路径)
      if (auto_download && !plugin_path) {
        try {
          // 4.1 下载插件
          steps.push({
            step: 'download_plugin',
            success: false,
            message: '正在下载 AuditLoader 插件...',
          });

          const downloadedPath =
            await this.downloadAuditLoaderPlugin(download_dir);

          steps[steps.length - 1].success = true;
          steps[steps.length - 1].message = `插件下载成功: ${downloadedPath}`;

          // 4.2 配置插件
          steps.push({
            step: 'configure_plugin',
            success: false,
            message: '正在配置插件...',
          });

          finalPluginPath = await this.configureAuditLoaderPlugin(
            download_dir,
            fe_host,
            fe_http_port,
            install_user,
            install_password,
          );

          steps[steps.length - 1].success = true;
          steps[steps.length - 1].message = `插件配置成功: ${finalPluginPath}`;
        } catch (error) {
          steps[steps.length - 1].success = false;
          steps[steps.length - 1].error = error.message;
          return {
            success: false,
            message: `下载或配置插件失败: ${error.message}`,
            steps,
          };
        }
      }

      // 5. 验证插件文件存在 (如果提供了路径或自动下载完成)
      if (finalPluginPath) {
        if (!fs.existsSync(finalPluginPath)) {
          steps.push({
            step: 'verify_plugin_file',
            success: false,
            message: `插件文件不存在: ${finalPluginPath}`,
          });
          return {
            success: false,
            message: `插件文件不存在: ${finalPluginPath}`,
            steps,
          };
        }
        steps.push({
          step: 'verify_plugin_file',
          success: true,
          message: '插件文件已验证',
        });
      }

      // 6. 安装插件 (如果有插件文件)
      if (finalPluginPath) {
        try {
          const absolutePath = path.resolve(finalPluginPath);
          const installSQL = `INSTALL PLUGIN FROM "${absolutePath}"`;
          await connection.query(installSQL);
          steps.push({
            step: 'install_plugin',
            success: true,
            message: '插件安装成功',
          });
        } catch (error) {
          steps.push({
            step: 'install_plugin',
            success: false,
            error: error.message,
          });
          return {
            success: false,
            message: `插件安装失败: ${error.message}`,
            steps,
          };
        }
      }

      // 7. 验证安装
      const installedPlugin = await this.checkPluginInstalled(connection);
      if (installedPlugin) {
        steps.push({
          step: 'verify_installation',
          success: true,
          message: '插件安装验证成功',
          plugin_info: installedPlugin,
        });
      } else {
        steps.push({
          step: 'verify_installation',
          success: false,
          message: '插件安装验证失败，请检查 fe.log',
        });
      }

      // 根据是否安装了插件生成不同的消息和成功状态
      let finalMessage;
      let isSuccess;
      const nextSteps = [];

      if (installedPlugin) {
        // 插件安装成功
        isSuccess = true;
        finalMessage = 'Audit Log 插件安装完成';
        nextSteps.push(
          '等待几分钟让审计日志开始写入',
          '执行 check_audit_log_status 验证数据是否正在写入',
          '查询审计日志: SELECT * FROM starrocks_audit_db__.starrocks_audit_tbl__ LIMIT 10',
        );
      } else if (finalPluginPath) {
        // 提供了插件路径或自动下载完成，但安装失败
        isSuccess = false;
        finalMessage = 'Audit Log 插件安装失败';
        nextSteps.push(
          '检查 fe.log 日志查看插件安装失败原因',
          '确认插件文件路径是否正确',
          '确认所有 FE 节点都有该插件文件',
          '数据库和表已创建，修复问题后可重新安装插件',
        );
      } else {
        // 只创建了数据库和表，没有下载或安装插件
        isSuccess = false;
        finalMessage =
          'Audit Log 数据库和表已创建，但插件未安装。审计日志功能无法使用。';
        nextSteps.push(
          '提示: 默认情况下工具会自动下载并安装插件',
          '如果自动下载失败，可以:',
          '',
          '方法 1: 重新运行工具 (自动下载)',
          '  install_audit_log {}',
          '',
          '方法 2: 手动提供插件路径',
          '  install_audit_log { "plugin_path": "/path/to/auditloader.zip" }',
          '',
          '方法 3: 禁用自动下载',
          '  install_audit_log { "auto_download": false }',
        );
      }

      return {
        success: isSuccess,
        message: finalMessage,
        plugin_info: installedPlugin,
        steps,
        next_steps: nextSteps,
        partial_install: !installedPlugin, // 标记是否为部分安装
      };
    } catch (error) {
      return {
        success: false,
        message: `安装失败: ${error.message}`,
        error: error.stack,
        steps,
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * 检查 Audit Log 状态
   */
  async checkAuditLogStatus() {
    let connection;

    try {
      connection = await this.getConnection();

      // 1. 检查插件状态
      const plugin = await this.checkPluginInstalled(connection);

      // 2. 检查数据库是否存在
      const [databases] = await connection.query(
        "SHOW DATABASES LIKE 'starrocks_audit_db__'",
      );
      const databaseExists = databases && databases.length > 0;

      // 3. 检查表是否存在
      let tableExists = false;
      let recordCount = 0;
      let latestRecords = [];

      if (databaseExists) {
        try {
          const [tables] = await connection.query(
            "SHOW TABLES FROM starrocks_audit_db__ LIKE 'starrocks_audit_tbl__'",
          );
          tableExists = tables && tables.length > 0;

          if (tableExists) {
            // 获取记录总数
            const [countResult] = await connection.query(
              'SELECT COUNT(*) as count FROM starrocks_audit_db__.starrocks_audit_tbl__',
            );
            recordCount = countResult[0].count;

            // 获取最近的记录
            const [records] = await connection.query(`
              SELECT queryId, timestamp, queryType, user, db, state, queryTime, stmt
              FROM starrocks_audit_db__.starrocks_audit_tbl__
              ORDER BY timestamp DESC
              LIMIT 5
            `);
            latestRecords = records;
          }
        } catch (error) {
          console.error('检查表状态失败:', error.message);
        }
      }

      // 4. 检查审计日志是否启用
      let auditLogEnabled = false;
      try {
        const [variables] = await connection.query(
          "SHOW VARIABLES LIKE 'enable_audit_log'",
        );
        if (variables && variables.length > 0) {
          auditLogEnabled =
            variables[0].Value === 'true' || variables[0].Value === '1';
        }
      } catch (error) {
        console.error('检查审计日志配置失败:', error.message);
      }

      return {
        installed: !!plugin,
        plugin_info: plugin || { status: 'Not installed' },
        database_exists: databaseExists,
        table_exists: tableExists,
        audit_log_enabled: auditLogEnabled,
        record_count: recordCount,
        latest_records: latestRecords,
        status:
          plugin && databaseExists && tableExists && recordCount > 0
            ? 'WORKING'
            : 'NOT_WORKING',
        message:
          plugin && databaseExists && tableExists && recordCount > 0
            ? '✅ Audit Log 正常工作'
            : '❌ Audit Log 未正常工作，请检查配置',
      };
    } catch (error) {
      return {
        success: false,
        message: `检查状态失败: ${error.message}`,
        error: error.stack,
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * 卸载 Audit Log 插件
   */
  async uninstallAuditLog(args) {
    const { keep_data = true } = args;
    const steps = [];
    let connection;

    try {
      connection = await this.getConnection();

      // 1. 检查插件是否存在
      const plugin = await this.checkPluginInstalled(connection);
      if (!plugin) {
        return {
          success: true,
          message: '插件未安装，无需卸载',
          steps,
        };
      }

      // 2. 卸载插件
      try {
        await connection.query('UNINSTALL PLUGIN AuditLoader');
        steps.push({
          step: 'uninstall_plugin',
          success: true,
          message: '插件卸载成功',
        });
      } catch (error) {
        steps.push({
          step: 'uninstall_plugin',
          success: false,
          error: error.message,
        });
        return {
          success: false,
          message: `卸载插件失败: ${error.message}`,
          steps,
        };
      }

      // 3. 删除数据 (如果需要)
      if (!keep_data) {
        try {
          await connection.query(
            'DROP DATABASE IF EXISTS starrocks_audit_db__',
          );
          steps.push({
            step: 'drop_database',
            success: true,
            message: '已删除审计日志数据库',
          });
        } catch (error) {
          steps.push({
            step: 'drop_database',
            success: false,
            error: error.message,
          });
        }
      } else {
        steps.push({
          step: 'keep_data',
          success: true,
          message: '保留审计日志数据库',
        });
      }

      return {
        success: true,
        message: 'Audit Log 插件卸载完成',
        data_kept: keep_data,
        steps,
      };
    } catch (error) {
      return {
        success: false,
        message: `卸载失败: ${error.message}`,
        error: error.stack,
        steps,
      };
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * 格式化报告
   */
  formatReport(data) {
    let report = '';

    // 处理已安装的情况
    if (data.already_installed) {
      report += '✅ Audit Log 插件已安装\n\n';
      report += `**插件信息**:\n`;
      report += `- 名称: ${data.plugin_info.Name}\n`;
      report += `- 状态: ${data.plugin_info.Status}\n`;
      report += `- 类型: ${data.plugin_info.Type}\n`;
      return report;
    }

    // 处理完全失败的情况（没有步骤信息）
    if (data.success === false && (!data.steps || data.steps.length === 0)) {
      return `❌ 操作失败: ${data.message}\n\n${data.error || ''}`;
    }

    // 显示整体状态
    const statusIcon = data.success ? '✅' : '⚠️';
    const statusText = data.success
      ? '成功'
      : data.partial_install
        ? '部分完成'
        : '失败';
    report += `${statusIcon} **安装状态**: ${statusText}\n`;
    report += `**结果**: ${data.message}\n\n`;

    // 显示安装步骤
    if (data.steps && data.steps.length > 0) {
      report += '📋 **执行步骤**:\n\n';
      for (const step of data.steps) {
        const icon = step.success ? '✅' : '❌';
        report += `${icon} ${step.message || step.step}\n`;
        if (step.error) {
          report += `   错误: ${step.error}\n`;
        }
      }
      report += '\n';
    }

    // 显示下一步操作
    if (data.next_steps && data.next_steps.length > 0) {
      report += '📝 **下一步操作**:\n\n';
      for (const step of data.next_steps) {
        if (step === '') {
          report += '\n';
        } else {
          report += `${step}\n`;
        }
      }
    }

    return report;
  }

  /**
   * 格式化状态报告
   */
  formatStatusReport(data) {
    let report = '📊 **Audit Log 状态检查报告**\n\n';

    // 整体状态
    const statusIcon = data.status === 'WORKING' ? '✅' : '❌';
    report += `${statusIcon} **整体状态**: ${data.status}\n\n`;

    // 插件状态
    report += '**插件信息**:\n';
    if (data.installed && data.plugin_info.Name) {
      report += `- ✅ 插件已安装\n`;
      report += `- 名称: ${data.plugin_info.Name}\n`;
      report += `- 状态: ${data.plugin_info.Status}\n`;
      report += `- 类型: ${data.plugin_info.Type}\n`;
    } else {
      report += `- ❌ 插件未安装\n`;
    }
    report += '\n';

    // 数据库和表状态
    report += '**数据库状态**:\n';
    report += `- 数据库存在: ${data.database_exists ? '✅' : '❌'}\n`;
    report += `- 表存在: ${data.table_exists ? '✅' : '❌'}\n`;
    report += `- 审计日志启用: ${data.audit_log_enabled ? '✅' : '❌'}\n`;
    report += `- 记录总数: ${data.record_count}\n`;
    report += '\n';

    // 最近的记录
    if (data.latest_records && data.latest_records.length > 0) {
      report += `**最近 ${data.latest_records.length} 条审计日志**:\n`;
      for (const record of data.latest_records) {
        const stmt = record.stmt ? record.stmt.substring(0, 60) + '...' : '';
        report += `- ${record.timestamp} | ${record.user}@${record.db} | ${record.queryTime}ms | ${stmt}\n`;
      }
    } else {
      report += '**最近的审计日志**: 无数据\n';
    }

    report += '\n';
    report += data.message;

    return report;
  }

  /**
   * 格式化卸载报告
   */
  formatUninstallReport(data) {
    if (!data.success) {
      return `❌ 卸载失败: ${data.message}\n\n${data.error || ''}`;
    }

    let report = '✅ **Audit Log 插件卸载报告**\n\n';

    report += '📋 **卸载步骤**:\n\n';
    for (const step of data.steps || []) {
      const icon = step.success ? '✅' : '❌';
      report += `${icon} ${step.message || step.step}\n`;
      if (step.error) {
        report += `   错误: ${step.error}\n`;
      }
    }

    report += '\n';
    if (data.data_kept) {
      report += '💾 **数据已保留**: 审计日志数据库和表未删除\n';
      report +=
        '   如需删除数据，请运行: DROP DATABASE starrocks_audit_db__;\n';
    } else {
      report += '🗑️ **数据已删除**: 审计日志数据库和表已删除\n';
    }

    return report;
  }

  /**
   * 设置 Compact 线程数
   */
  async setCompactThreads(connection, args) {
    const {
      be_id = null,
      thread_count,
      dry_run = false,
      auto_validate = true,
    } = args;

    try {
      console.error('🔧 开始调整 Compact 线程配置...');

      // 1. 查询当前所有节点的配置
      // 先获取基本配置
      const configQuery = `
        SELECT BE_ID, value as current_threads
        FROM information_schema.be_configs
        WHERE name = 'compact_threads'
        ${be_id ? `AND BE_ID = ${be_id}` : ''}
        ORDER BY BE_ID
      `;

      const [configRows] = await connection.query(configQuery);

      if (!configRows || configRows.length === 0) {
        return {
          success: false,
          message: be_id
            ? `未找到 BE_ID=${be_id} 的节点`
            : '未找到任何 BE/CN 节点',
        };
      }

      // 获取节点详细信息 (使用 SHOW BACKENDS)
      const [backends] = await connection.query('SHOW BACKENDS');
      const backendMap = new Map();
      backends.forEach((be) => {
        // 确保 key 是 Number 类型
        const beId = parseInt(be.BackendId);
        backendMap.set(beId, {
          host: be.IP,
          cpu_cores: parseInt(be.CpuCores) || 0,
        });
      });

      const currentConfig = configRows.map((config) => {
        const beId = parseInt(config.BE_ID);
        const beInfo = backendMap.get(beId) || {};
        return {
          BE_ID: config.BE_ID,
          current_threads: config.current_threads,
          host: beInfo.host || 'unknown',
          cpu_cores: beInfo.cpu_cores || 0,
        };
      });

      console.error(`   → 找到 ${currentConfig.length} 个节点`);

      // 2. 验证参数合理性
      const validation = {
        passed: true,
        warnings: [],
        recommendations: [],
      };

      if (auto_validate) {
        for (const node of currentConfig) {
          const cpuCores = parseInt(node.cpu_cores) || 0;
          const recommendedMin = Math.floor(cpuCores * 0.25);
          const recommendedMax = Math.ceil(cpuCores * 0.5);

          if (cpuCores > 0) {
            if (thread_count < recommendedMin) {
              validation.warnings.push(
                `节点 ${node.BE_ID} (${node.host}): 线程数 ${thread_count} 低于推荐最小值 ${recommendedMin} (CPU ${cpuCores} × 0.25)`,
              );
            } else if (thread_count > recommendedMax) {
              validation.warnings.push(
                `节点 ${node.BE_ID} (${node.host}): 线程数 ${thread_count} 高于推荐最大值 ${recommendedMax} (CPU ${cpuCores} × 0.5)`,
              );
            }

            validation.recommendations.push({
              be_id: node.BE_ID,
              host: node.host,
              cpu_cores: cpuCores,
              current_threads: parseInt(node.current_threads),
              recommended_range: `${recommendedMin}-${recommendedMax}`,
              target_threads: thread_count,
            });
          }
        }

        if (validation.warnings.length > 0) {
          console.error('   ⚠️  发现参数验证警告:');
          validation.warnings.forEach((w) => console.error(`      ${w}`));
        }
      }

      // 3. 执行修改 (或预览)
      const modifications = [];

      if (dry_run) {
        console.error('   🔍 [预览模式] 不会实际执行修改');

        for (const node of currentConfig) {
          modifications.push({
            be_id: node.BE_ID,
            host: node.host,
            current_threads: parseInt(node.current_threads),
            new_threads: thread_count,
            will_change: parseInt(node.current_threads) !== thread_count,
            action: 'preview',
          });
        }
      } else {
        console.error('   ✅ 开始执行修改...');

        for (const node of currentConfig) {
          const currentThreads = parseInt(node.current_threads);

          if (currentThreads === thread_count) {
            console.error(
              `   → 节点 ${node.BE_ID} (${node.host}): 已经是 ${thread_count} 线程，跳过`,
            );
            modifications.push({
              be_id: node.BE_ID,
              host: node.host,
              current_threads: currentThreads,
              new_threads: thread_count,
              will_change: false,
              action: 'skipped',
              message: '已经是目标值',
            });
            continue;
          }

          try {
            // 使用 UPDATE be_configs 修改配置
            const updateQuery = `
              UPDATE information_schema.be_configs
              SET value = '${thread_count}'
              WHERE BE_ID = ${node.BE_ID} AND name = 'compact_threads'
            `;
            await connection.query(updateQuery);

            console.error(
              `   ✅ 节点 ${node.BE_ID} (${node.host}): ${currentThreads} → ${thread_count} 线程`,
            );

            modifications.push({
              be_id: node.BE_ID,
              host: node.host,
              current_threads: currentThreads,
              new_threads: thread_count,
              will_change: true,
              action: 'modified',
              success: true,
            });
          } catch (error) {
            console.error(
              `   ❌ 节点 ${node.BE_ID} (${node.host}): 修改失败 - ${error.message}`,
            );

            modifications.push({
              be_id: node.BE_ID,
              host: node.host,
              current_threads: currentThreads,
              new_threads: thread_count,
              will_change: true,
              action: 'failed',
              success: false,
              error: error.message,
            });
          }
        }
      }

      // 4. 统计结果
      const modifiedCount = modifications.filter(
        (m) => m.action === 'modified',
      ).length;
      const failedCount = modifications.filter(
        (m) => m.action === 'failed',
      ).length;
      const skippedCount = modifications.filter(
        (m) => m.action === 'skipped',
      ).length;

      return {
        success: dry_run || failedCount === 0,
        dry_run,
        message: dry_run
          ? `预览模式: 将修改 ${modifications.filter((m) => m.will_change).length} 个节点`
          : `成功修改 ${modifiedCount} 个节点${failedCount > 0 ? `, ${failedCount} 个失败` : ''}${skippedCount > 0 ? `, ${skippedCount} 个跳过` : ''}`,
        target_thread_count: thread_count,
        total_nodes: currentConfig.length,
        modified_count: modifiedCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        modifications,
        validation,
      };
    } catch (error) {
      console.error(`❌ 调整 Compact 线程失败: ${error.message}`);
      return {
        success: false,
        message: `调整失败: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * 格式化 Compact 线程调整报告
   */
  formatCompactThreadsReport(data) {
    let report = '# 🔧 Compact 线程配置调整报告\n\n';

    if (!data.success) {
      report += `## ❌ 执行失败\n\n`;
      report += `**错误信息**: ${data.message}\n`;
      return report;
    }

    // 基本信息
    report += `## 📊 执行摘要\n\n`;
    report += `- **模式**: ${data.dry_run ? '🔍 预览模式 (未实际修改)' : '✅ 执行模式'}\n`;
    report += `- **目标线程数**: ${data.target_thread_count}\n`;
    report += `- **总节点数**: ${data.total_nodes}\n`;

    if (!data.dry_run) {
      report += `- **修改成功**: ${data.modified_count} 个节点\n`;
      if (data.failed_count > 0) {
        report += `- **修改失败**: ${data.failed_count} 个节点\n`;
      }
      if (data.skipped_count > 0) {
        report += `- **跳过**: ${data.skipped_count} 个节点 (已经是目标值)\n`;
      }
    }

    report += '\n';

    // 验证警告
    if (
      data.validation &&
      data.validation.warnings &&
      data.validation.warnings.length > 0
    ) {
      report += `## ⚠️ 参数验证警告\n\n`;
      data.validation.warnings.forEach((warning) => {
        report += `- ${warning}\n`;
      });
      report += '\n';
    }

    // 节点详情
    report += `## 📋 节点修改详情\n\n`;
    report += '| BE_ID | 主机 | 当前线程 | 目标线程 | 状态 |\n';
    report += '|-------|------|----------|----------|------|\n';

    for (const mod of data.modifications) {
      const status =
        mod.action === 'modified'
          ? '✅ 已修改'
          : mod.action === 'failed'
            ? `❌ 失败`
            : mod.action === 'skipped'
              ? '⏭️ 跳过'
              : '🔍 预览';

      report += `| ${mod.be_id} | ${mod.host || 'N/A'} | ${mod.current_threads} | ${mod.new_threads} | ${status} |\n`;
    }

    report += '\n';

    // 推荐配置
    if (
      data.validation &&
      data.validation.recommendations &&
      data.validation.recommendations.length > 0
    ) {
      report += `## 💡 配置建议\n\n`;
      report += '| BE_ID | 主机 | CPU核数 | 当前线程 | 推荐范围 | 目标线程 |\n';
      report += '|-------|------|---------|----------|----------|----------|\n';

      for (const rec of data.validation.recommendations) {
        report += `| ${rec.be_id} | ${rec.host} | ${rec.cpu_cores} | ${rec.current_threads} | ${rec.recommended_range} | ${rec.target_threads} |\n`;
      }

      report += '\n';
    }

    // 验证命令
    if (!data.dry_run && data.modified_count > 0) {
      report += `## ✅ 验证配置\n\n`;
      report += '执行以下 SQL 验证配置是否生效:\n\n';
      report += '```sql\n';
      report += `SELECT BE_ID, value as compact_threads\n`;
      report += `FROM information_schema.be_configs\n`;
      report += `WHERE name = 'compact_threads'\n`;
      report += `ORDER BY BE_ID;\n`;
      report += '```\n';
    }

    return report;
  }
}

// 导出专家实例
export default new StarRocksOperateExpert();
