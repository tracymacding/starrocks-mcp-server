# 网络配置指南

## 问题说明

**问题**: 服务器绑定到 `localhost` 时，只能从本机访问，无法从外部网络访问。

**原因**:
- `localhost` (127.0.0.1) 是环回地址，仅本机可访问
- 外部客户端无法连接到 `localhost`

## 解决方案

### 1. 绑定地址说明

| 地址 | 含义 | 适用场景 |
|------|------|---------|
| `0.0.0.0` | 监听所有网络接口 | 生产环境，需要外部访问 |
| `127.0.0.1` 或 `localhost` | 仅本机访问 | 开发/测试，安全要求高 |
| 特定IP (如 `192.168.1.100`) | 绑定到指定网卡 | 多网卡服务器，精确控制 |

### 2. 配置方法

#### 方法 A: 环境变量（推荐）

编辑 `.env` 文件：

```bash
# 允许外部访问（生产环境）
API_HOST=0.0.0.0
API_PORT=80
API_KEY=your-secure-api-key-here  # ⚠️ 必须设置强密码！

# 仅本机访问（开发环境）
# API_HOST=127.0.0.1
# API_PORT=80
# API_KEY=demo-key
```

#### 方法 B: 启动时指定

```bash
# 允许外部访问
export API_HOST=0.0.0.0
export API_PORT=80
export API_KEY=your-secure-api-key
./start-central-server.sh

# 或直接在命令行
API_HOST=0.0.0.0 API_PORT=80 node index-expert-api-complete.js
```

### 3. 安全配置（重要！）

当绑定到 `0.0.0.0` 时，服务器会暴露在网络上，必须采取安全措施：

#### 3.1 强 API Key

```bash
# 生成安全的 API Key
openssl rand -hex 32

# 示例输出：
# a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

将生成的密钥设置到 `.env`:

```bash
API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

#### 3.2 防火墙配置

**仅允许特定 IP 访问**（强烈推荐）:

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow from 192.168.1.0/24 to any port 80 proto tcp
sudo ufw enable

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="3002" protocol="tcp" accept'
sudo firewall-cmd --reload

# 直接使用 iptables
sudo iptables -A INPUT -p tcp -s 192.168.1.0/24 --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j DROP
```

**允许所有 IP 访问**（不推荐，除非有其他安全措施）:

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --reload
```

#### 3.3 反向代理 + HTTPS（生产推荐）

使用 Nginx 作为反向代理，提供 HTTPS 和更精细的访问控制：

```nginx
# /etc/nginx/sites-available/starrocks-api
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # IP 白名单
    allow 192.168.1.0/24;  # 内网
    allow 1.2.3.4;         # 客户端公网 IP
    deny all;

    # 反向代理
    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 传递 API Key
        proxy_set_header X-API-Key $http_x_api_key;
    }

    # 限流
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20;
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/starrocks-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

使用反向代理时，服务器可以继续绑定到 `127.0.0.1`：

```bash
# .env
API_HOST=127.0.0.1  # 只允许 Nginx 访问
API_PORT=80
```

### 4. 验证配置

#### 4.1 本地测试

```bash
# 启动服务器
./start-central-server.sh

# 本地测试
curl -s http://localhost:80/health -H "X-API-Key: your-api-key" | jq
```

#### 4.2 远程测试

从其他机器测试：

```bash
# 替换 <server-ip> 为实际服务器 IP
curl -s http://<server-ip>:80/health -H "X-API-Key: your-api-key" | jq

# 示例
curl -s http://192.168.1.100:80/health -H "X-API-Key: demo-key" | jq
```

**期望输出**:

```json
{
  "status": "healthy",
  "service": "starrocks-central-api-complete",
  "version": "3.0.0",
  "experts": 11,
  "tools": 33
}
```

如果无法连接，检查：

1. ✅ 服务器是否绑定到 `0.0.0.0`
2. ✅ 防火墙规则是否正确
3. ✅ 网络是否连通 (`ping <server-ip>`)
4. ✅ API Key 是否正确

### 5. 常见部署场景

#### 场景 A: 开发环境（本机）

```bash
# .env
API_HOST=127.0.0.1  # 仅本机
API_PORT=80
API_KEY=demo-key
```

#### 场景 B: 内网生产环境

```bash
# .env
API_HOST=0.0.0.0    # 允许内网访问
API_PORT=80
API_KEY=<生成的强密钥>

# 防火墙：仅允许内网
sudo ufw allow from 192.168.0.0/16 to any port 80
```

#### 场景 C: 公网部署（高安全）

```bash
# .env (服务器仅监听本地)
API_HOST=127.0.0.1
API_PORT=80
API_KEY=<生成的强密钥>

# Nginx 反向代理 + HTTPS + IP 白名单
# 参考上面的 Nginx 配置
```

#### 场景 D: 云服务器（AWS/阿里云）

```bash
# .env
API_HOST=0.0.0.0    # 监听所有接口
API_PORT=80
API_KEY=<生成的强密钥>

# 云服务商安全组配置：
# 1. 入站规则：TCP 80，仅允许特定 IP/IP 段
# 2. 出站规则：允许访问 StarRocks (9030) 和 Prometheus (9090)
```

### 6. 客户端配置

客户端 Thin MCP Server 需要配置中心 API 地址：

编辑 `~/.starrocks-mcp/.env`:

```bash
# 本地开发
CENTRAL_API_URL=http://localhost:80
CENTRAL_API_KEY=demo-key

# 远程服务器
CENTRAL_API_URL=http://192.168.1.100:80
CENTRAL_API_KEY=your-secure-api-key

# 通过域名（HTTPS）
CENTRAL_API_URL=https://api.yourdomain.com
CENTRAL_API_KEY=your-secure-api-key
```

### 7. 故障排查

#### 问题 1: 远程无法访问

```bash
# 1. 检查服务器监听地址
netstat -tlnp | grep 80
# 应该看到: 0.0.0.0:80 或 :::80

# 2. 检查防火墙
sudo ufw status
sudo iptables -L -n | grep 80

# 3. 测试网络连通性
ping <server-ip>
telnet <server-ip> 80

# 4. 检查服务器日志
journalctl -u starrocks-api -f
```

#### 问题 2: 安全警告

如果看到这个警告：

```
⚠️ 服务器监听所有网络接口，可从外部访问
- 请确保设置了强 API_KEY
- 建议配置防火墙规则
```

**立即执行**:

1. 设置强 API Key (至少 32 字符)
2. 配置防火墙规则
3. 考虑使用 HTTPS 反向代理

### 8. 最佳实践总结

✅ **推荐做法**:

1. 生产环境使用 Nginx + HTTPS 反向代理
2. 设置强 API Key（至少 32 字符随机）
3. 配置防火墙白名单（仅允许必要的 IP）
4. 定期轮换 API Key
5. 启用访问日志和监控
6. 使用非特权端口（> 1024）
7. 定期更新依赖和系统补丁

❌ **避免做法**:

1. 使用弱 API Key 或不设置 API Key
2. 绑定 `0.0.0.0` 但不配置防火墙
3. 使用 HTTP 传输敏感数据
4. 在公网直接暴露 Node.js 服务
5. 使用默认端口和默认密钥

### 9. 快速配置命令

**一键配置生产环境**:

```bash
cd /home/disk5/dingkai/github/gemini-cli/mcp-example

# 1. 生成 API Key
API_KEY=$(openssl rand -hex 32)
echo "API_KEY=$API_KEY" >> .env
echo "🔑 生成的 API Key: $API_KEY"

# 2. 配置网络
echo "API_HOST=0.0.0.0" >> .env
echo "API_PORT=80" >> .env

# 3. 配置防火墙（替换为你的客户端 IP 段）
sudo ufw allow from 192.168.1.0/24 to any port 80 proto tcp
sudo ufw enable

# 4. 启动服务
./start-central-server.sh
```

**客户端配置**:

```bash
mkdir -p ~/.starrocks-mcp
cat > ~/.starrocks-mcp/.env <<EOF
CENTRAL_API_URL=http://<server-ip>:80
CENTRAL_API_KEY=$API_KEY
EOF
```

---

## 总结

修改后的服务器默认绑定到 `0.0.0.0:80`，允许外部访问。你需要：

1. ✅ 设置强 API Key
2. ✅ 配置防火墙规则
3. ✅ 考虑使用 HTTPS 反向代理（生产环境）
4. ✅ 更新客户端配置中的 API URL

如有疑问，请参考上述场景示例！
