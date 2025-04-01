# CDN MCP API 文檔

這個文檔描述了 CDN Model Context Protocol (MCP) 服務器的 API。這個服務器提供了一系列工具，用於管理多個 CDN 提供商、設定智能調度策略、收集性能數據，以及自動優化 CDN 調度。

## 安裝與設置

### 依賴項

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.3",
    "zod": "^3.24.1"
  }
}
```

### 構建與運行

```bash
# 安裝依賴
npm install

# 構建項目
npm run build

# 運行服務器
npm start
```

## API 概述

CDN MCP 服務器提供了以下幾類 API：

1. **CDN 管理 API** - 用於創建和管理網站以及 CDN 配置
2. **調度策略 API** - 用於配置和優化 CDN 調度策略
3. **分析 API** - 用於收集和查詢 CDN 性能和成本數據

## CDN 管理 API

### 創建網站 (`create-cdn-site`)

使用指定的域名和 CDN 提供商創建新網站。

**參數：**

| 參數 | 類型 | 描述 | 必填 |
|------|------|------|------|
| domain | string | 網站的域名 | 是 |
| name | string | 網站名稱 | 否 |
| description | string | 網站描述 | 否 |
| cdnProviders | string[] | 要使用的 CDN 提供商 ID 列表 | 否 |

**範例請求：**

```javascript
const result = await client.callTool('create-cdn-site', {
  domain: 'example.com',
  name: 'Example Website',
  description: 'Multi-CDN example website',
  cdnProviders: ['cloudflare', 'fastly']
});
```

**範例回應：**

```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890",
    "domain": "example.com",
    "name": "Example Website",
    "description": "Multi-CDN example website",
    "created_at": "2025-04-01T08:30:00.000Z",
    "updated_at": "2025-04-01T08:30:00.000Z",
    "cdn_providers": ["cloudflare", "fastly"],
    "status": "active"
  },
  "message": "Site created successfully"
}
```

### 添加 DNS 記錄 (`add-dns-record`)

為指定的網站添加 DNS 記錄。

**參數：**

| 參數 | 類型 | 描述 | 必填 |
|------|------|------|------|
| siteId | string | 網站 ID | 是 |
| name | string | 記錄名稱 | 是 |
| type | enum | 記錄類型 ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS') | 是 |
| ttl | number | TTL (秒) | 否 |
| values | string[] | 記錄值數組 | 是 |

**範例請求：**

```javascript
const result = await client.callTool('add-dns-record', {
  siteId: 'a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890',
  name: 'www',
  type: 'CNAME',
  ttl: 3600,
  values: ['example.com']
});
```

**範例回應：**

```json
{
  "success": true,
  "data": {
    "id": "d4c3b2a1-f6e5-0987-b2a1-d4c3e5f67890",
    "site_id": "a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890",
    "name": "www",
    "type": "CNAME",
    "ttl": 3600,
    "values": ["example.com"],
    "created_at": "2025-04-01T08:35:00.000Z",
    "updated_at": "2025-04-01T08:35:00.000Z"
  },
  "message": "DNS record added successfully"
}
```

### 更新域名設置 (`update-domain-settings`)

更新域名的 CDN 和安全設置。

**參數：**

| 參數 | 類型 | 描述 | 必填 |
|------|------|------|------|
| domain | string | 域名 | 是 |
| settings | object | 設置對象 | 否 |

**設置對象結構：**

```javascript
{
  cdn_settings: {
    enable_cache: boolean,
    cache_ttl: number,
    query_string_handling: 'ignore' | 'include' | 'exclude'
  },
  security_settings: {
    enable_waf: boolean,
    block_bad_bots: boolean,
    enable_rate_limiting: boolean
  }
}
```

**範例請求：**

```javascript
const result = await client.callTool('update-domain-settings', {
  domain: 'example.com',
  settings: {
    cdn_settings: {
      enable_cache: true,
      cache_ttl: 3600,
      query_string_handling: 'ignore'
    },
    security_settings: {
      enable_waf: true,
      block_bad_bots: true
    }
  }
});
```

**範例回應：**

```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890",
    "domain": "example.com",
    "name": "Example Website",
    "updated_at": "2025-04-01T08:40:00.000Z",
    "settings": {
      "cdn_settings": {
        "enable_cache": true,
        "cache_ttl": 3600,
        "query_string_handling": "ignore"
      },
      "security_settings": {
        "enable_waf": true,
        "block_bad_bots": true
      }
    }
  },
  "message": "Domain settings updated successfully"
}
```

## 調度策略 API

### 更新調度策略 (`update-dispatch-strategy`)

更新 CDN 調度策略配置。

**參數：**

| 參數 | 類型 | 描述 | 必填 |
|------|------|------|------|
| strategyType | enum | 策略類型 ('geo', 'performance', 'cost', 'availability', 'hybrid') | 是 |
| settings | object | 策略設置 | 否 |

**設置對象結構：**

```javascript
{
  weights: {
    performance: number, // 0-100
    cost: number, // 0-100
    reliability: number // 0-100
  },
  geo_rules: [
    {
      region: string,
      preferred_cdn: string
    }
  ],
  fallback_cdn: string
}
```

**範例請求：**

```javascript
const result = await client.callTool('update-dispatch-strategy', {
  strategyType: 'hybrid',
  settings: {
    weights: {
      performance: 60,
      cost: 20,
      reliability: 20
    },
    fallback_cdn: 'cloudflare'
  }
});
```

**範例回應：**

```json
{
  "success": true,
  "data": {
    "strategyType": "hybrid",
    "lastUpdated": "2025-04-01T08:45:00.000Z",
    "settings": {
      "weights": {
        "performance": 60,
        "cost": 20,
        "reliability": 20
      },
      "geo_rules": [],
      "fallback_cdn": "cloudflare"
    }
  },
  "message": "Dispatch strategy updated successfully"
}
```

### 獲取當前策略 (`get-current-strategy`)

獲取當前的 CDN 調度策略配置。

**範例請求：**

```javascript
const result = await client.callTool('get-current-strategy', {});
```

**範例回應：**

```json
{
  "success": true,
  "data": {
    "strategyType": "hybrid",
    "lastUpdated": "2025-04-01T08:45:00.000Z",
    "settings": {
      "weights": {
        "performance": 60,
        "cost": 20,
        "reliability": 20
      },
      "geo_rules": [
        {
          "region": "us-east",
          "preferred_cdn": "cloudflare"
        },
        {
          "region": "eu-west",
          "preferred_cdn": "fastly"
        }
      ],
      "fallback_cdn": "cloudflare"
    }
  },
  "message": "Current strategy retrieved successfully"
}
```

### 優化策略 (`optimize-strategy`)

根據收集的性能數據自動優化 CDN 調度策略。

**範例請求：**

```javascript
const result = await client.callTool('optimize-strategy', {});
```

**範例回應：**

```json
{
  "success": true,
  "data": {
    "strategyType": "hybrid",
    "lastUpdated": "2025-04-01T08:50:00.000Z",
    "settings": {
      "weights": {
        "performance": 50,
        "cost": 20,
        "reliability": 30
      },
      "geo_rules": [
        {
          "region": "us-east",
          "preferred_cdn": "cloudflare"
        },
        {
          "region": "us-west",
          "preferred_cdn": "fastly"
        },
        {
          "region": "eu-west",
          "preferred_cdn": "cloudflare"
        },
        {
          "region": "ap-southeast",
          "preferred_cdn": "akamai"
        }
      ],
      "fallback_cdn": "cloudflare"
    }
  },
  "message": "Strategy optimized successfully based on performance data"
}
```

## 分析 API

### 獲取性能數據 (`get-performance-data`)

獲取 CDN 性能數據。

**參數：**

| 參數 | 類型 | 描述 | 必填 |
|------|------|------|------|
| timeRange | enum | 時間範圍 ('1h', '6h', '24h', '7d', '30d') | 否 |
| cdn | string | CDN 提供商 ID | 否 |
| region | string | 地區 | 否 |

**範例請求：**

```javascript
const result = await client.callTool('get-performance-data', {
  timeRange: '24h',
  cdn: 'cloudflare',
  region: 'us-east'
});
```

**範例回應：**

```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2025-04-01T07:00:00.000Z",
      "cdnId": "cloudflare",
      "cdnName": "Cloudflare",
      "region": "us-east",
      "latency": 45.3,
      "availability": 99.97,
      "requestCount": 2345,
      "success": 2344,
      "errors": 1
    },
    {
      "timestamp": "2025-04-01T07:15:00.000Z",
      "cdnId": "cloudflare",
      "cdnName": "Cloudflare",
      "region": "us-east",
      "latency": 44.8,
      "availability": 99.99,
      "requestCount": 2156,
      "success": 2156,
      "errors": 0
    }
  ],
  "message": "Performance data retrieved successfully"
}
```

### 獲取成本數據 (`get-cost-data`)

獲取 CDN 成本數據。

**參數：**

| 參數 | 類型 | 描述 | 必填 |
|------|------|------|------|
| timeRange | enum | 時間範圍 ('1h', '6h', '24h', '7d', '30d') | 否 |
| cdn | string | CDN 提供商 ID | 否 |

**範例請求：**

```javascript
const result = await client.callTool('get-cost-data', {
  timeRange: '24h'
});
```

**範例回應：**

```json
{
  "success": true,
  "data": [
    {
      "cdnId": "cloudflare",
      "cdnName": "Cloudflare",
      "traffic": 45.6,
      "costPerTB": 0.02,
      "cost": 0.912,
      "timeRange": "24h"
    },
    {
      "cdnId": "fastly",
      "cdnName": "Fastly",
      "traffic": 32.3,
      "costPerTB": 0.018,
      "cost": 0.5814,
      "timeRange": "24h"
    }
  ],
  "message": "Cost data retrieved successfully"
}
```

## 示例工作流程

以下是一個使用 CDN MCP API 的典型工作流程：

1. 創建一個網站並配置 CDN 提供商
2. 添加必要的 DNS 記錄
3. 更新域名設置
4. 收集性能數據並分析
5. 自動優化調度策略
6. 定期監控性能和成本指標

### 客戶端示例代碼

```javascript
// 初始化 MCP 客戶端
const client = new MCPClient();
await client.connect(transport);

// 創建網站
const site = await client.callTool('create-cdn-site', {
  domain: 'example.com',
  name: 'Example Website',
  cdnProviders: ['cloudflare', 'fastly', 'akamai']
});

// 添加 DNS 記錄
await client.callTool('add-dns-record', {
  siteId: site.data.id,
  name: 'www',
  type: 'CNAME',
  values: ['example.com']
});

// 更新域名設置
await client.callTool('update-domain-settings', {
  domain: 'example.com',
  settings: {
    cdn_settings: {
      enable_cache: true,
      cache_ttl: 3600
    }
  }
});

// 設置初始調度策略
await client.callTool('update-dispatch-strategy', {
  strategyType: 'hybrid',
  settings: {
    weights: {
      performance: 60,
      cost: 20,
      reliability: 20
    }
  }
});

// 週期性任務：收集性能數據並優化調度策略
setInterval(async () => {
  // 獲取性能數據
  const performanceData = await client.callTool('get-performance-data', {
    timeRange: '1h'
  });
  
  // 自動優化調度策略
  await client.callTool('optimize-strategy', {});
  
  console.log('Strategy optimized based on recent performance data');
}, 3600000); // 每小時執行一次
```

## 實現注意事項

1. 這個 MCP 服務器目前使用模擬數據來代替真實的 API 調用。在生產環境中，應該實現真實的 API 與 Mlytics API 集成。

2. 數據存儲使用本地文件系統。在生產環境中，應考慮使用更可靠的數據庫解決方案。

3. 對於大規模部署，考慮添加身份驗證和授權機制。

4. 性能優化策略可以進一步細化，加入更複雜的算法來處理不同場景下的調度需求。