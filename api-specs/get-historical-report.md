# API Specification: DNS Query Usage Historical Report

## Overview
This API provides historical usage data for DNS queries, allowing clients to retrieve and analyze DNS query patterns across specified time periods.

## Endpoint
```
GET https://api-v2.mlytics.com/analytics/v2/historicalReport/diagram/usage/
```

## Authentication
- **Type**: Bearer Token Authentication
- **Header**: `Authorization: Bearer {JWT_TOKEN}`
- **Note**: JWT token must be obtained through Mlytics Portal login

## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| org_id | string | Yes | Organization ID for which data is being requested |
| usage_type | string | Yes | Type of usage data to retrieve (e.g., `dns_query_usage_sum`) |
| convert_milli_timestamp | boolean | No | When `true`, timestamps in response will be in milliseconds. Default: `false` |
| start_time | number | Yes | UNIX timestamp (seconds) for the start of the requested time period |
| end_time | number | Yes | UNIX timestamp (seconds) for the end of the requested time period |

## Response Format

### Success Response (200 OK)
```json
{
  "meta": {
    "status": "success",
    "message": null,
    "code": 200
  },
  "data": {
    "query": {
      "compare_start_time": [timestamp],
      "start_time": [timestamp],
      "usage_type": [
        "dns_query_usage_sum"
      ],
      "end_time": [timestamp],
      "compare_end_time": [timestamp]
    },
    "diagrams": {
      "dns_query_usage_sum": {
        "labels": [
          [timestamp1],
          [timestamp2],
          ...
        ],
        "datasets": [
          [value1],
          [value2],
          ...
        ],
        "compare_result": {
          "comparable": true,
          "reason": null,
          "result": {
            "compare_percentage": [percentage],
            "compare_value": [value]
          }
        }
      }
    }
  }
}
```

### Error Response
```json
{
  "message": "Error message"
}
```

Common error codes:
- `401 Unauthorized`: Invalid or expired JWT token
- `403 Forbidden`: Insufficient permissions to access requested data
- `404 Not Found`: Requested resource not found
- `405 Method Not Allowed`: Invalid HTTP method (only GET is supported)

## Data Structure Details

### Query Object
- `start_time`: Requested period start timestamp
- `end_time`: Requested period end timestamp
- `compare_start_time`: Previous comparable period start timestamp (automatically calculated)
- `compare_end_time`: Previous comparable period end timestamp (automatically calculated)
- `usage_type`: Array of requested usage metrics

### Diagrams Object
For each requested `usage_type`, the response includes:

- `labels`: Array of timestamps representing data points (in milliseconds if `convert_milli_timestamp=true`)
- `datasets`: Array of corresponding values for each timestamp
- `compare_result`: Comparison with previous time period
  - `comparable`: Boolean indicating if comparison was possible
  - `compare_percentage`: Percentage change from previous period
  - `compare_value`: Absolute value change from previous period

## Usage Examples

### Example 1: Last 7 Days DNS Query Usage
```
GET https://api-v2.mlytics.com/analytics/v2/historicalReport/diagram/usage/?org_id=1001642588942&usage_type=dns_query_usage_sum&convert_milli_timestamp=true&start_time=1743264000&end_time=1743955199
```

### Example 2: Last 14 Days DNS Query Usage
```
GET https://api-v2.mlytics.com/analytics/v2/historicalReport/diagram/usage/?org_id=1001642588942&usage_type=dns_query_usage_sum&convert_milli_timestamp=true&start_time=1742659200&end_time=1743955199
```

### Example 3: Last 30 Days DNS Query Usage
```
GET https://api-v2.mlytics.com/analytics/v2/historicalReport/diagram/usage/?org_id=1001642588942&usage_type=dns_query_usage_sum&convert_milli_timestamp=true&start_time=1741276800&end_time=1743955199
```

## Notes
- Data points with zero values represent days with no recorded DNS queries or missing data
- The API automatically calculates a previous comparable time period of equal length for trending comparisons
- Timestamps are provided in UNIX format (seconds since epoch) unless `convert_milli_timestamp=true` is specified
- The response includes both raw data and calculated comparison metrics for visualization and analysis

## Rate Limiting
- Standard Mlytics API rate limits apply (60 requests per minute per account)
- Excessive requests may be throttled with a 429 Too Many Requests response