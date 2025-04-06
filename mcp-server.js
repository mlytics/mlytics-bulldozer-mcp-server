// Mlytics CDN MCP Server - Clean Implementation
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { automatedLogin, getStoredJwt, getValidJwt, getAuthHeaders } from './mcp-auth.js';

// In ES modules, __dirname is not defined, so we need to create it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data storage paths
const dataDir = path.join(os.homedir(), '.mlytics-mcp-server');
const sitesFile = path.join(dataDir, 'sites.json');
const dnsRecordsFile = path.join(dataDir, 'dns_records.json');
const strategyFile = path.join(dataDir, 'strategy.json');
const historicalReportsFile = path.join(dataDir, 'historical_reports.json');
const capacityForecastsFile = path.join(dataDir, 'capacity_forecasts.json');

// Ensure data directory exists
const ensureDataDirExists = async () => {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    // Silently handle error
  }
};

// Helper to load data from file or return default
const loadDataOrDefault = async (filePath, defaultData) => {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return defaultData;
  }
};

// Helper to save data to file
const saveData = async (filePath, data) => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

// Mock CDN providers
const CDN_PROVIDERS = [
  { id: 'cloudflare', name: 'Cloudflare', status: 'active' },
  { id: 'akamai', name: 'Akamai', status: 'active' },
  { id: 'fastly', name: 'Fastly', status: 'active' },
  { id: 'cloudfront', name: 'AWS CloudFront', status: 'active' },
  { id: 'mlytics', name: 'Mlytics', status: 'active' }
];

// Mock regions
const REGIONS = [
  'us-east', 'us-west', 'eu-west', 'eu-central', 'ap-northeast', 
  'ap-southeast', 'sa-east', 'af-south', 'au-southeast'
];

// Utility function to generate mock historical report data
const generateMockHistoricalReport = (orgId, usageType, startTime, endTime, convertMilliTimestamp = false) => {
  const startDate = new Date(startTime * 1000);
  const endDate = new Date(endTime * 1000);
  const timeDiffMs = endDate.getTime() - startDate.getTime();
  const dayDiffCount = Math.max(1, Math.floor(timeDiffMs / (24 * 60 * 60 * 1000)));
  
  // Calculate previous comparable period
  const prevStartTime = startTime - (endTime - startTime);
  const prevEndTime = startTime;
  
  // Generate data points (one per day by default)
  const labels = [];
  const datasets = [];
  
  // Get appropriate timestamp format
  const getTimestamp = (date) => {
    return convertMilliTimestamp ? date.getTime() : Math.floor(date.getTime() / 1000);
  };
  
  // Add data points
  for (let i = 0; i < dayDiffCount; i++) {
    const pointDate = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
    const timestamp = getTimestamp(pointDate);
    
    // Generate a value following a pattern (higher on weekdays, lower on weekends)
    const dayOfWeek = pointDate.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Base value between 2000-4000 on weekdays, 500-1500 on weekends
    const baseValue = isWeekend ? 
      Math.floor(Math.random() * 1000) + 500 : 
      Math.floor(Math.random() * 2000) + 2000;
    
    // Add some seasonal variation (sine wave)
    const seasonalFactor = 1 + 0.2 * Math.sin(i / 7 * Math.PI);
    
    // Calculate final value with some noise
    const value = Math.floor(baseValue * seasonalFactor * (0.9 + Math.random() * 0.2));
    
    labels.push(timestamp);
    datasets.push(value);
  }
  
  // Calculate comparison metrics
  const currentSum = datasets.reduce((sum, val) => sum + val, 0);
  
  // Generate previous period data (not returned but used for comparison)
  const prevDatasets = [];
  for (let i = 0; i < dayDiffCount; i++) {
    const pointDate = new Date(prevStartTime * 1000 + (i * 24 * 60 * 60 * 1000));
    
    // Similar logic as above but with slight variation
    const dayOfWeek = pointDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    const baseValue = isWeekend ? 
      Math.floor(Math.random() * 900) + 400 : 
      Math.floor(Math.random() * 1800) + 1800;
    
    const seasonalFactor = 1 + 0.2 * Math.sin(i / 7 * Math.PI);
    const value = Math.floor(baseValue * seasonalFactor * (0.9 + Math.random() * 0.2));
    
    prevDatasets.push(value);
  }
  
  const prevSum = prevDatasets.reduce((sum, val) => sum + val, 0);
  const compareValue = currentSum - prevSum;
  const comparePercentage = prevSum === 0 ? 100 : (compareValue / prevSum * 100);
  
  // Build the response according to the API spec
  return {
    meta: {
      status: "success",
      message: null,
      code: 200
    },
    data: {
      query: {
        compare_start_time: getTimestamp(new Date(prevStartTime * 1000)),
        start_time: getTimestamp(startDate),
        usage_type: [usageType],
        end_time: getTimestamp(endDate),
        compare_end_time: getTimestamp(new Date(prevEndTime * 1000))
      },
      diagrams: {
        [usageType]: {
          labels,
          datasets,
          compare_result: {
            comparable: true,
            reason: null,
            result: {
              compare_percentage: parseFloat(comparePercentage.toFixed(2)),
              compare_value: compareValue
            }
          }
        }
      }
    }
  };
};

// Utility function to generate capacity forecast data
const generateCapacityForecast = (
  orgId, 
  usageType, 
  historicalDays = 90, 
  forecastDays = 90,
  growthRate = 0.05, // 5% monthly growth rate
  includeSeasonality = true,
  confidenceInterval = 0.95,
  thresholdWarning = 0.7, // 70% capacity warning
  thresholdCritical = 0.9 // 90% capacity critical
) => {
  // Generate timestamps and data for historical period
  const now = new Date();
  const historicalStart = new Date(now);
  historicalStart.setDate(now.getDate() - historicalDays);
  
  const forecastEnd = new Date(now);
  forecastEnd.setDate(now.getDate() + forecastDays);
  
  // Store timestamps and values for the whole timeline
  const timelineLabels = [];
  const timelineValues = [];
  const confidenceLower = [];
  const confidenceUpper = [];
  const thresholdWarningValues = [];
  const thresholdCriticalValues = [];
  
  // Generate historical data
  for (let i = 0; i < historicalDays; i++) {
    const currentDate = new Date(historicalStart);
    currentDate.setDate(historicalStart.getDate() + i);
    timelineLabels.push(currentDate.toISOString());
    
    // Generate daily basis with some growth trend
    const trendFactor = 1 + (growthRate / 30) * i; // Daily compound growth
    
    // Base value varies by usage type
    let baseValue;
    switch (usageType) {
      case 'dns_query_usage_sum':
        baseValue = 100000;
        break;
      case 'cdn_request_sum':
        baseValue = 500000;
        break;
      case 'cdn_traffic_sum':
        baseValue = 10000; // In GB
        break;
      default:
        baseValue = 100000;
    }
    
    // Add weekly patterns (weekday/weekend variation)
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayFactor = isWeekend ? 0.6 : 1.1; // 40% less on weekends, 10% more on weekdays
    
    // Add monthly seasonality if enabled
    let seasonalFactor = 1;
    if (includeSeasonality) {
      // Monthly cycle (higher at month start, lower at month end)
      const dayOfMonth = currentDate.getDate();
      const monthLength = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const monthProgress = dayOfMonth / monthLength;
      
      // Yearly cycle (higher in Q4, lower in Q1)
      const month = currentDate.getMonth();
      const yearFactor = 1 + 0.2 * Math.sin((month / 12) * 2 * Math.PI + Math.PI/2);
      
      seasonalFactor = (1 - 0.1 * Math.sin(monthProgress * 2 * Math.PI)) * yearFactor;
    }
    
    // Add some random variation (daily noise)
    const noiseFactor = 0.9 + Math.random() * 0.2; // ±10% random noise
    
    // Calculate final value
    const value = Math.floor(baseValue * trendFactor * dayFactor * seasonalFactor * noiseFactor);
    
    timelineValues.push(value);
    
    // No confidence intervals for historical data
    confidenceLower.push(null);
    confidenceUpper.push(null);
    
    // Calculate threshold values based on capacity
    const capacity = getCapacityForUsageType(usageType);
    thresholdWarningValues.push(capacity * thresholdWarning);
    thresholdCriticalValues.push(capacity * thresholdCritical);
  }
  
  // Generate forecast data
  const lastHistoricalValue = timelineValues[timelineValues.length - 1];
  
  // Extract patterns from historical data for forecasting
  const patterns = analyzeHistoricalPatterns(timelineValues, historicalDays);
  
  for (let i = 0; i < forecastDays; i++) {
    const forecastDate = new Date(now);
    forecastDate.setDate(now.getDate() + i);
    timelineLabels.push(forecastDate.toISOString());
    
    // Base growth trend
    const trendFactor = 1 + (growthRate / 30) * i; // Daily compound growth from now
    
    // Apply patterns from historical data
    const dayOfWeek = forecastDate.getDay();
    const weekPattern = patterns.weekdayPatterns[dayOfWeek];
    
    // Apply seasonal patterns if enabled
    let seasonalFactor = 1;
    if (includeSeasonality) {
      const month = forecastDate.getMonth();
      const monthPattern = patterns.monthlyPatterns[month];
      seasonalFactor = monthPattern;
    }
    
    // Calculate forecasted value
    const forecastedValue = Math.floor(lastHistoricalValue * trendFactor * weekPattern * seasonalFactor);
    timelineValues.push(forecastedValue);
    
    // Calculate confidence intervals
    const dayFromNow = i + 1;
    const varianceFactor = (1 - confidenceInterval) * (dayFromNow / forecastDays) * 0.5;
    confidenceLower.push(Math.floor(forecastedValue * (1 - varianceFactor)));
    confidenceUpper.push(Math.floor(forecastedValue * (1 + varianceFactor)));
    
    // Calculate threshold values based on capacity
    const capacity = getCapacityForUsageType(usageType);
    thresholdWarningValues.push(capacity * thresholdWarning);
    thresholdCriticalValues.push(capacity * thresholdCritical);
  }
  
  // Find capacity breach points
  const warningBreachDate = findCapacityBreachDate(
    timelineLabels.slice(historicalDays), 
    timelineValues.slice(historicalDays), 
    thresholdWarningValues[0]
  );
  
  const criticalBreachDate = findCapacityBreachDate(
    timelineLabels.slice(historicalDays), 
    timelineValues.slice(historicalDays), 
    thresholdCriticalValues[0]
  );
  
  // Calculate overall growth metrics
  const growthMetrics = calculateGrowthMetrics(timelineValues, historicalDays, forecastDays);
  
  return {
    meta: {
      status: "success",
      message: null,
      code: 200
    },
    data: {
      query: {
        org_id: orgId,
        usage_type: usageType,
        historical_days: historicalDays,
        forecast_days: forecastDays,
        generated_at: new Date().toISOString()
      },
      forecast: {
        timeline: {
          labels: timelineLabels,
          values: timelineValues,
          confidence_lower: confidenceLower,
          confidence_upper: confidenceUpper,
          threshold_warning: thresholdWarningValues,
          threshold_critical: thresholdCriticalValues,
          historical_end_index: historicalDays - 1
        },
        capacity: {
          current: getCapacityForUsageType(usageType),
          current_usage_percent: (timelineValues[historicalDays - 1] / getCapacityForUsageType(usageType) * 100).toFixed(2),
          warning_breach_date: warningBreachDate,
          critical_breach_date: criticalBreachDate,
          recommended_increase: calculateRecommendedIncrease(
            timelineValues, 
            historicalDays, 
            forecastDays, 
            getCapacityForUsageType(usageType),
            thresholdWarning
          )
        },
        growth_metrics: growthMetrics,
        recommendations: generateRecommendations(
          usageType, 
          growthMetrics,
          warningBreachDate,
          criticalBreachDate
        )
      }
    }
  };
};

// Helper function to get estimated capacity based on usage type
const getCapacityForUsageType = (usageType) => {
  switch (usageType) {
    case 'dns_query_usage_sum':
      return 500000; // 500K DNS queries per day
    case 'cdn_request_sum':
      return 2000000; // 2M requests per day
    case 'cdn_traffic_sum':
      return 50000; // 50TB per day
    default:
      return 1000000;
  }
};

// Helper function to analyze patterns in historical data
const analyzeHistoricalPatterns = (historicalValues, historicalDays) => {
  // Calculate weekday patterns
  const weekdayPatterns = Array(7).fill(0).map(() => ({count: 0, sum: 0}));
  
  // Group data by day of week
  for (let i = 0; i < historicalDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (historicalDays - i));
    const dayOfWeek = date.getDay();
    
    weekdayPatterns[dayOfWeek].count++;
    weekdayPatterns[dayOfWeek].sum += historicalValues[i];
  }
  
  // Calculate average for each day of week
  const weekdayAverages = weekdayPatterns.map(day => 
    day.count > 0 ? day.sum / day.count : 1
  );
  
  // Normalize to make the average weekday factor = 1
  const weekdayAvg = weekdayAverages.reduce((sum, val) => sum + val, 0) / 7;
  const normalizedWeekdayPatterns = weekdayAverages.map(val => val / weekdayAvg);
  
  // Calculate monthly patterns (simplified)
  const monthlyPatterns = Array(12).fill(0).map((_, i) => {
    // Sample monthly pattern with Q4 spike, summer lull
    if (i >= 9) { // Q4 (Oct-Dec)
      return 1.2 + (i - 9) * 0.1; // Increasing through Q4
    } else if (i >= 5 && i <= 7) { // Summer months
      return 0.9; // 10% below average
    } else {
      return 1.0; // Average
    }
  });
  
  return {
    weekdayPatterns: normalizedWeekdayPatterns,
    monthlyPatterns: monthlyPatterns
  };
};

// Helper function to find the date when capacity will be breached
const findCapacityBreachDate = (forecastDates, forecastValues, thresholdValue) => {
  for (let i = 0; i < forecastDates.length; i++) {
    if (forecastValues[i] >= thresholdValue) {
      return forecastDates[i];
    }
  }
  return null; // No breach within forecast period
};

// Helper function to calculate growth metrics
const calculateGrowthMetrics = (timelineValues, historicalDays, forecastDays) => {
  const now = historicalDays - 1; // Index of current day
  const last30DaysStart = Math.max(0, now - 30);
  const next30DaysEnd = Math.min(timelineValues.length - 1, now + 30);
  const next90DaysEnd = Math.min(timelineValues.length - 1, now + 90);
  
  // Calculate average daily values for different periods
  const past30DaysAvg = timelineValues.slice(last30DaysStart, now + 1)
    .reduce((sum, val) => sum + val, 0) / (now - last30DaysStart + 1);
    
  const next30DaysAvg = timelineValues.slice(now + 1, next30DaysEnd + 1)
    .reduce((sum, val) => sum + val, 0) / (next30DaysEnd - now);
    
  const next90DaysAvg = timelineValues.slice(now + 1, next90DaysEnd + 1)
    .reduce((sum, val) => sum + val, 0) / (next90DaysEnd - now);
  
  // Calculate growth percentages
  const next30DaysGrowth = (next30DaysAvg / past30DaysAvg - 1) * 100;
  const next90DaysGrowth = (next90DaysAvg / past30DaysAvg - 1) * 100;
  
  // Peak values
  const next30DaysPeak = Math.max(...timelineValues.slice(now + 1, next30DaysEnd + 1));
  const next90DaysPeak = Math.max(...timelineValues.slice(now + 1, next90DaysEnd + 1));
  
  return {
    current_value: timelineValues[now],
    past_30_days_avg: Math.floor(past30DaysAvg),
    next_30_days_avg: Math.floor(next30DaysAvg),
    next_90_days_avg: Math.floor(next90DaysAvg),
    next_30_days_growth_pct: next30DaysGrowth.toFixed(2),
    next_90_days_growth_pct: next90DaysGrowth.toFixed(2),
    next_30_days_peak: next30DaysPeak,
    next_90_days_peak: next90DaysPeak
  };
};

// Helper function to calculate recommended capacity increase
const calculateRecommendedIncrease = (
  timelineValues, 
  historicalDays, 
  forecastDays,
  currentCapacity,
  safetyThreshold
) => {
  const now = historicalDays - 1;
  const forecastEnd = Math.min(timelineValues.length - 1, historicalDays + forecastDays - 1);
  
  // Get peak value in forecast period
  const forecastPeak = Math.max(...timelineValues.slice(now + 1, forecastEnd + 1));
  
  // Calculate safe capacity needed (peak + 30% buffer)
  const safeCapacity = forecastPeak / safetyThreshold;
  
  // Calculate increase needed
  const increaseNeeded = Math.max(0, safeCapacity - currentCapacity);
  const increasePercent = (increaseNeeded / currentCapacity * 100).toFixed(1);
  
  // Round to reasonable increment based on capacity magnitude
  const capacityMagnitude = Math.floor(Math.log10(currentCapacity));
  const roundingFactor = Math.pow(10, capacityMagnitude - 1);
  const roundedIncrease = Math.ceil(increaseNeeded / roundingFactor) * roundingFactor;
  
  return {
    increase_amount: roundedIncrease,
    increase_percent: increasePercent,
    new_capacity: currentCapacity + roundedIncrease
  };
};

// Helper function to generate textual recommendations
const generateRecommendations = (
  usageType,
  growthMetrics,
  warningBreachDate,
  criticalBreachDate
) => {
  const recommendations = [];
  
  // Capacity recommendations
  if (criticalBreachDate) {
    const criticalDate = new Date(criticalBreachDate);
    recommendations.push({
      type: 'critical',
      title: 'Critical Capacity Breach Imminent',
      message: `Your ${usageType} is projected to reach critical capacity threshold on ${criticalDate.toDateString()}. Immediate capacity planning is required.`
    });
  } else if (warningBreachDate) {
    const warningDate = new Date(warningBreachDate);
    recommendations.push({
      type: 'warning',
      title: 'Capacity Warning Threshold Approaching',
      message: `Your ${usageType} is projected to reach warning capacity threshold on ${warningDate.toDateString()}. Begin capacity planning soon.`
    });
  } else {
    recommendations.push({
      type: 'info',
      title: 'Capacity Adequate',
      message: `Your current capacity for ${usageType} appears sufficient for the forecast period.`
    });
  }
  
  // Growth pattern recommendations
  const next30Growth = parseFloat(growthMetrics.next_30_days_growth_pct);
  const next90Growth = parseFloat(growthMetrics.next_90_days_growth_pct);
  
  if (next30Growth > 20) {
    recommendations.push({
      type: 'warning',
      title: 'Rapid Growth Detected',
      message: `You're experiencing rapid growth (${next30Growth.toFixed(1)}% in next 30 days). Consider adding CDN capacity soon.`
    });
  }
  
  if (next90Growth > 50) {
    recommendations.push({
      type: 'info',
      title: 'Sustained Growth Trend',
      message: 'Long-term growth trend indicates need for strategic capacity planning.'
    });
  }
  
  // Usage pattern recommendations
  switch (usageType) {
    case 'dns_query_usage_sum':
      recommendations.push({
        type: 'optimization',
        title: 'DNS Query Optimization',
        message: 'Consider increasing DNS TTL values to reduce query frequency, or implementing DNS caching at edge locations.'
      });
      break;
    case 'cdn_request_sum':
      recommendations.push({
        type: 'optimization',
        title: 'Request Optimization',
        message: 'Evaluate implementing client-side caching headers to reduce repeat requests, or consolidate assets to reduce request count.'
      });
      break;
    case 'cdn_traffic_sum':
      recommendations.push({
        type: 'optimization',
        title: 'Traffic Optimization',
        message: 'Consider implementing image/video compression, adaptive bitrate streaming, or evaluating large assets for optimization.'
      });
      break;
  }
  
  return recommendations;
};

// Schema definitions for tool requests
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  headless: z.boolean().optional().default(true),
});

const ShowCreditInfoSchema = z.object({
  // No parameters needed as it uses the stored JWT
});

const CreateSiteSchema = z.object({
  domain: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  cdnProviders: z.array(z.string()).optional(),
  apiKey: z.string().optional(),
});

const AddDnsRecordSchema = z.object({
  siteId: z.string(),
  name: z.string(),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']),
  ttl: z.number().optional(),
  values: z.array(z.string()),
  proxied: z.boolean().optional(),
  apiKey: z.string().optional(),
});

const UpdateDomainSchema = z.object({
  domain: z.string(),
  settings: z.object({
    cdn_settings: z.object({
      enable_cache: z.boolean().optional(),
      cache_ttl: z.number().optional(),
      query_string_handling: z.enum(['ignore', 'include', 'exclude']).optional(),
    }).optional(),
    security_settings: z.object({
      enable_waf: z.boolean().optional(),
      block_bad_bots: z.boolean().optional(),
      enable_rate_limiting: z.boolean().optional(),
    }).optional(),
  }).optional(),
  apiKey: z.string().optional(),
});

const CheckSiteStatusSchema = z.object({
  domain: z.string(),
  apiKey: z.string().optional(),
});

const ListDnsRecordsSchema = z.object({
  siteId: z.string(),
  apiKey: z.string().optional(),
});

const QueryCdnEdgeReportSchema = z.object({
  domain: z.string(),
  start_time: z.number(),
  end_time: z.number(),
  interval: z.number().optional(),
  apiKey: z.string().optional(),
});

const GetHistoricalReportSchema = z.object({
  org_id: z.string(),
  usage_type: z.string(),
  start_time: z.number(),
  end_time: z.number(),
  convert_milli_timestamp: z.boolean().optional().default(false),
  apiKey: z.string().optional(),
});

const QueryGuideSchema = z.object({
  keyword: z.string().optional(),
  section: z.string().optional(),
  format: z.enum(['text', 'markdown', 'html', 'json']).optional().default('text')
});

const CapacityForecastSchema = z.object({
  org_id: z.string(),
  usage_type: z.enum(['dns_query_usage_sum', 'cdn_request_sum', 'cdn_traffic_sum']),
  historical_days: z.number().optional().default(90),
  forecast_days: z.number().optional().default(90),
  growth_rate: z.number().optional().default(0.05), // Default 5% monthly growth rate
  include_seasonality: z.boolean().optional().default(true),
  confidence_interval: z.number().min(0).max(0.99).optional().default(0.95), // 95% confidence interval
  threshold_warning: z.number().optional().default(0.7), // 70% capacity warning
  threshold_critical: z.number().optional().default(0.9), // 90% capacity critical
  apiKey: z.string().optional(),
});

// Initialize MCP Server
const server = new Server(
  {
    name: 'mlytics-cdn-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {}
    }
  }
);

// Set up the list of available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'automated-login',
        description: 'Automate login to Mlytics Portal and extract JWT token for API calls',
        inputSchema: {
          type: 'object',
          properties: {
            email: { 
              type: 'string',
              description: 'User email for Mlytics Portal login' 
            },
            password: { 
              type: 'string',
              description: 'User password for Mlytics Portal login' 
            },
            headless: { 
              type: 'boolean',
              description: 'Whether to run the browser in headless mode (default: true)' 
            }
          },
          required: ['email', 'password']
        }
      },
      {
        name: 'show-credit-info',
        description: 'Show current credit usage information for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'create-cdn-site',
        description: 'Create a new CDN site with specified domain and CDN providers',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            cdnProviders: { 
              type: 'array',
              items: { type: 'string' }
            },
            apiKey: { type: 'string' }
          },
          required: ['domain']
        }
      },
      {
        name: 'add-dns-record',
        description: 'Add a DNS record to a site',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string' },
            name: { type: 'string' },
            type: { 
              type: 'string',
              enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']
            },
            ttl: { type: 'number' },
            values: {
              type: 'array',
              items: { type: 'string' }
            },
            proxied: { type: 'boolean' },
            apiKey: { type: 'string' }
          },
          required: ['siteId', 'name', 'type', 'values']
        }
      },
      {
        name: 'update-domain-settings',
        description: 'Update domain settings including CDN and security configurations',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            settings: {
              type: 'object',
              properties: {
                cdn_settings: {
                  type: 'object',
                  properties: {
                    enable_cache: { type: 'boolean' },
                    cache_ttl: { type: 'number' },
                    query_string_handling: { 
                      type: 'string',
                      enum: ['ignore', 'include', 'exclude']
                    }
                  }
                },
                security_settings: {
                  type: 'object',
                  properties: {
                    enable_waf: { type: 'boolean' },
                    block_bad_bots: { type: 'boolean' },
                    enable_rate_limiting: { type: 'boolean' }
                  }
                }
              }
            },
            apiKey: { type: 'string' }
          },
          required: ['domain']
        }
      },
      {
        name: 'list-cdn-providers',
        description: 'List all available CDN providers',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list-sites',
        description: 'List all CDN sites',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'check-site-status',
        description: 'Check the status of a specific domain in Mlytics CDN',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            apiKey: { type: 'string' }
          },
          required: ['domain']
        }
      },
      {
        name: 'list-dns-records',
        description: 'List all DNS records for a specific site',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string' },
            apiKey: { type: 'string' }
          },
          required: ['siteId']
        }
      },
      {
        name: 'query-cdn-edge-report',
        description: 'Query CDN edge performance reports for a domain',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            start_time: { type: 'number' },
            end_time: { type: 'number' },
            interval: { type: 'number' },
            apiKey: { type: 'string' }
          },
          required: ['domain', 'start_time', 'end_time']
        }
      },
      {
        name: 'get-historical-reports',
        description: 'Retrieve historical usage data for DNS queries across specified time periods',
        inputSchema: {
          type: 'object',
          properties: {
            org_id: { 
              type: 'string',
              description: 'Organization ID for which data is being requested'
            },
            usage_type: { 
              type: 'string',
              description: 'Type of usage data to retrieve (e.g., dns_query_usage_sum)'
            },
            start_time: { 
              type: 'number',
              description: 'UNIX timestamp (seconds) for the start of the requested time period'
            },
            end_time: { 
              type: 'number',
              description: 'UNIX timestamp (seconds) for the end of the requested time period'
            },
            convert_milli_timestamp: { 
              type: 'boolean',
              description: 'When true, timestamps in response will be in milliseconds. Default: false'
            },
            apiKey: { type: 'string' }
          },
          required: ['org_id', 'usage_type', 'start_time', 'end_time']
        }
      },
      {
        name: 'query-guide',
        description: 'Query information from the Guide.md documentation with customizable output format',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { 
              type: 'string',
              description: 'Keyword to search for in the guide (optional)'
            },
            section: { 
              type: 'string',
              description: 'Specific section to retrieve from the guide (optional)'
            },
            format: { 
              type: 'string',
              enum: ['text', 'markdown', 'html', 'json'],
              description: 'Output format: text, markdown, html, or json (default: text)'
            }
          }
        }
      },
      {
        name: 'capacity-forecast',
        description: 'Generate capacity planning forecasts with historical analysis, projections, and recommendations',
        inputSchema: {
          type: 'object',
          properties: {
            org_id: { 
              type: 'string',
              description: 'Organization ID for which data is being requested'
            },
            usage_type: { 
              type: 'string',
              enum: ['dns_query_usage_sum', 'cdn_request_sum', 'cdn_traffic_sum'],
              description: 'Type of usage data to forecast'
            },
            historical_days: { 
              type: 'number',
              description: 'Number of days of historical data to analyze (default: 90)'
            },
            forecast_days: { 
              type: 'number',
              description: 'Number of days to forecast into the future (default: 90)'
            },
            growth_rate: { 
              type: 'number',
              description: 'Monthly growth rate assumption as decimal (default: 0.05 for 5%)'
            },
            include_seasonality: { 
              type: 'boolean',
              description: 'Whether to include seasonal patterns in forecast (default: true)'
            },
            confidence_interval: { 
              type: 'number',
              description: 'Confidence interval for forecast (0-0.99, default: 0.95 for 95%)'
            },
            threshold_warning: { 
              type: 'number',
              description: 'Capacity threshold for warnings as decimal (default: 0.7 for 70%)'
            },
            threshold_critical: { 
              type: 'number',
              description: 'Capacity threshold for critical alerts as decimal (default: 0.9 for 90%)'
            },
            apiKey: { type: 'string' }
          },
          required: ['org_id', 'usage_type']
        }
      }
    ]
  };
});

// Handle prompts/list method
server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
  // Return an empty list of prompts or your actual prompts if you have any
  return {
    prompts: [],
    pagination: {
      hasMore: false
    }
  };
});

// Helper for creating text responses
const createTextResponse = (text) => {
  return {
    content: [{ type: 'text', text }]
  };
};

// Helper to read API key from credentials file or use provided key
const getApiKey = async (providedKey) => {
  // If a key is provided, use it
  if (providedKey) {
    console.log('Using provided API key');
    return providedKey;
  }
  
  try {
    // Use absolute path instead of relative path
    const credPath = path.join(process.cwd(), 'cred');
    console.log(`Reading API key from: ${credPath}`);
    const apiKeyContent = await fs.readFile(credPath, 'utf-8');
    const apiKey = apiKeyContent.split('\n').filter(line => !line.startsWith('//'))[0].trim();
    if (!apiKey) {
      throw new Error('API key not found in credentials file');
    }
    console.log('API key successfully read');
    return apiKey;
  } catch (error) {
    console.error(`Error reading API key: ${error.message}`);
    throw new Error(`Failed to read API key from credentials file: ${error.message}`);
  }
};

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  await ensureDataDirExists();
  
  try {
    if (name === 'automated-login') {
      // Handle the automated login tool
      const credentials = LoginSchema.parse(args);
      try {
        const authData = await automatedLogin(credentials);
        
        // Return the success response with token info including the JWT
        return createTextResponse(JSON.stringify({
          success: true,
          data: {
            email: authData.email,
            loggedInAt: authData.timestamp,
            tokenStored: true,
            jwt: authData.jwt // Including the actual JWT token
          },
          message: 'Successfully logged in and stored JWT token'
        }));
      } catch (error) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Login failed: ${error.message}`
        }));
      }
    }
    else if (name === 'show-credit-info') {
      // Handle the show credit info tool
      ShowCreditInfoSchema.parse(args);
      
      try {
        // Get stored JWT token
        const jwt = await getStoredJwt();
        
        if (!jwt) {
          return createTextResponse(JSON.stringify({
            success: false,
            message: 'No authentication token found. Please login first using the automated-login tool.'
          }));
        }
        
        // Call the Mlytics API to get credit info
        const response = await fetch('https://api-v2.mlytics.com/billing/v2/customers/credit/', {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${jwt}`
          }
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          // Format the credit info for better display
          const creditData = responseData.data;
          
          // Calculate percentages
          const usagePercentage = (creditData.used / creditData.limit * 100).toFixed(2);
          const remainingPercentage = (100 - usagePercentage).toFixed(2);
          
          // Add formatted data
          creditData.usagePercentage = parseFloat(usagePercentage);
          creditData.remainingCredit = creditData.limit - creditData.used;
          creditData.remainingPercentage = parseFloat(remainingPercentage);
          
          return createTextResponse(JSON.stringify({
            success: true,
            data: creditData,
            meta: responseData.meta,
            message: 'Credit information retrieved successfully'
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (error) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Error retrieving credit info: ${error.message}`
        }));
      }
    }
    else if (name === 'create-cdn-site') {
      const { domain, name: siteName, description, cdnProviders, apiKey: providedApiKey } = CreateSiteSchema.parse(args);
      
      // Read API key from credentials file or use provided key
      let apiKey;
      try {
        apiKey = await getApiKey(providedApiKey);
      } catch (error) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: error.message
        }));
      }
      
      // Call the real Mlytics API
      try {
        const response = await fetch('https://openapi2.mlytics.com/api/v2/mdns/zone/', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            domain_name: domain
          })
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          // Save site data locally as well
          const newSite = {
            id: responseData.data.id,
            domain,
            name: siteName || domain,
            description: description || '',
            created_at: responseData.data.created_at,
            updated_at: responseData.data.created_at,
            cdn_providers: cdnProviders || ['mlytics'],
            status: 'active',
            api_response: responseData
          };
          
          const sites = await loadDataOrDefault(sitesFile, []);
          sites.push(newSite);
          await saveData(sitesFile, sites);
          
          return createTextResponse(JSON.stringify({
            success: true,
            data: newSite,
            message: 'Site created successfully via Mlytics API'
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`,
        }));
      }
    }
    else if (name === 'add-dns-record') {
      const { siteId, name: recordName, type, ttl, values, proxied, apiKey: providedApiKey } = AddDnsRecordSchema.parse(args);
      
      try {
        // Get API key from provided key or credentials file
        const apiKey = await getApiKey(providedApiKey);
        
        // Prepare the request payload
        const detail = values.map(value => ({ value }));
        
        const payload = {
          type,
          name: recordName,
          ttl: ttl || 3600,
          proxied: proxied !== undefined ? proxied : false,
          detail
        };
        
        // Call the Mlytics API to create a DNS record
        const response = await fetch(`https://openapi2.mlytics.com/api/v2/mdns/zone/${siteId}/rrset/`, {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          // Save DNS record data locally as well
          const newRecord = {
            id: responseData.data.rrsets[0].id,
            site_id: siteId,
            name: recordName,
            type,
            ttl: ttl || 3600,
            proxied: proxied !== undefined ? proxied : false,
            values,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            api_response: responseData
          };
          
          const dnsRecords = await loadDataOrDefault(dnsRecordsFile, []);
          dnsRecords.push(newRecord);
          await saveData(dnsRecordsFile, dnsRecords);
          
          return createTextResponse(JSON.stringify({
            success: true,
            data: newRecord,
            message: 'DNS record added successfully via Mlytics API'
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`
        }));
      }
    }
    else if (name === 'update-domain-settings') {
      const { domain, settings, apiKey: providedApiKey } = UpdateDomainSchema.parse(args);
      
      // Check if domain exists
      const sites = await loadDataOrDefault(sitesFile, []);
      const site = sites.find(s => s.domain === domain);
      
      if (!site) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Site with domain ${domain} not found`
        }));
      }
      
      // Update site settings
      site.settings = settings;
      site.updated_at = new Date().toISOString();
      await saveData(sitesFile, sites);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: {
          id: site.id,
          domain,
          name: site.name,
          updated_at: site.updated_at,
          settings
        },
        message: 'Domain settings updated successfully'
      }));
    }
    else if (name === 'list-cdn-providers') {
      return createTextResponse(JSON.stringify({
        success: true,
        data: CDN_PROVIDERS,
        message: 'CDN providers retrieved successfully'
      }));
    }
    else if (name === 'list-sites') {
      const sites = await loadDataOrDefault(sitesFile, []);
      
      return createTextResponse(JSON.stringify({
        success: true,
        data: sites,
        message: 'Sites retrieved successfully'
      }));
    }
    else if (name === 'check-site-status') {
      const { domain, apiKey: providedApiKey } = CheckSiteStatusSchema.parse(args);
      
      try {
        // Get API key from provided key or credentials file
        const apiKey = await getApiKey(providedApiKey);
        
        // Call the Mlytics API to list all sites
        const response = await fetch('https://openapi2.mlytics.com/api/v2/mdns/zone/all/', {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey
          }
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          // Find the site with the specified domain
          const site = responseData.data.find(site => site.domain_name === domain);
          
          if (site) {
            // Map zone_status to a human-readable status
            const statusMap = {
              0: 'Pending',
              1: 'Active',
              2: 'Error',
              3: 'Suspended'
            };
            
            const readableStatus = statusMap[site.zone_status] || 'Unknown';
            
            return createTextResponse(JSON.stringify({
              success: true,
              data: {
                id: site.id,
                domain: site.domain_name,
                status: readableStatus,
                zone_status: site.zone_status,
                raw: site
              },
              message: `Site '${domain}' found with status: ${readableStatus}`
            }));
          } else {
            return createTextResponse(JSON.stringify({
              success: false,
              message: `Site '${domain}' not found in Mlytics CDN`,
              data: {
                available_sites: responseData.data.map(site => site.domain_name)
              }
            }));
          }
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`
        }));
      }
    }
    else if (name === 'list-dns-records') {
      const { siteId, apiKey: providedApiKey } = ListDnsRecordsSchema.parse(args);
      
      try {
        // Get API key from provided key or credentials file
        const apiKey = await getApiKey(providedApiKey);
        
        // Call the Mlytics API to list all DNS records for the site
        const response = await fetch(`https://openapi2.mlytics.com/api/v2/mdns/zone/${siteId}/rrset/`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey
          }
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          return createTextResponse(JSON.stringify({
            success: true,
            data: responseData.data,
            meta: responseData.meta,
            message: `DNS records for site ${siteId} retrieved successfully`
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`
        }));
      }
    }
    else if (name === 'query-cdn-edge-report') {
      const { domain, start_time, end_time, interval, apiKey: providedApiKey } = QueryCdnEdgeReportSchema.parse(args);
      
      try {
        // Get API key from provided key or credentials file
        const apiKey = await getApiKey(providedApiKey);
        
        // Build the query URL with parameters
        const queryParams = new URLSearchParams({
          domain,
          start_time: start_time.toString(),
          end_time: end_time.toString()
        });
        
        // Add optional interval parameter if provided
        if (interval) {
          queryParams.append('interval', interval.toString());
        }
        
        // Call the Mlytics API to get CDN edge report
        const response = await fetch(`https://openapi2.mlytics.com/api/v2/analytics/cdnReport/report/edge?${queryParams}`, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'apikey': apiKey
          }
        });
        
        const responseData = await response.json();
        
        if (responseData.meta && responseData.meta.status === 'success') {
          return createTextResponse(JSON.stringify({
            success: true,
            data: responseData.data,
            meta: responseData.meta,
            message: `CDN edge report for domain ${domain} retrieved successfully`
          }));
        } else {
          return createTextResponse(JSON.stringify({
            success: false,
            message: `API Error: ${responseData.meta ? responseData.meta.message : 'Unknown error'}`,
            data: responseData
          }));
        }
      } catch (apiError) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `API Error: ${apiError.message}`
        }));
      }
    }
    else if (name === 'get-historical-reports') {
      const { org_id, usage_type, start_time, end_time, convert_milli_timestamp, apiKey: providedApiKey } = GetHistoricalReportSchema.parse(args);
      
      try {
        // First try to get authentication headers with JWT token
        let headers;
        try {
          const jwt = await getStoredJwt();
          if (jwt) {
            headers = {
              'accept': 'application/json',
              'Authorization': `Bearer ${jwt}`
            };
          }
        } catch (authError) {
          console.error('Failed to get JWT token:', authError.message);
        }
        
        // If we couldn't get JWT token, try to use API key
        if (!headers) {
          try {
            const apiKey = await getApiKey(providedApiKey);
            headers = {
              'accept': 'application/json',
              'apikey': apiKey
            };
          } catch (apiKeyError) {
            console.error('Failed to get API key:', apiKeyError.message);
          }
        }
        
        // If we have authentication, call the actual API
        if (headers) {
          // Build the query URL with parameters
          const queryParams = new URLSearchParams({
            org_id,
            usage_type,
            start_time: start_time.toString(),
            end_time: end_time.toString()
          });
          
          if (convert_milli_timestamp !== undefined) {
            queryParams.append('convert_milli_timestamp', convert_milli_timestamp.toString());
          }
          
          // Call the Mlytics API to get historical report
          try {
            const response = await fetch(`https://api-v2.mlytics.com/analytics/v2/historicalReport/diagram/usage/?${queryParams}`, {
              method: 'GET',
              headers
            });
            
            const responseData = await response.json();
            
            if (responseData.meta && responseData.meta.status === 'success') {
              // Save report to local storage for later reference
              const reports = await loadDataOrDefault(historicalReportsFile, []);
              const reportEntry = {
                id: crypto.randomUUID(),
                org_id,
                usage_type,
                start_time,
                end_time,
                convert_milli_timestamp,
                timestamp: new Date().toISOString(),
                response: responseData
              };
              
              reports.push(reportEntry);
              await saveData(historicalReportsFile, reports);
              
              return createTextResponse(JSON.stringify({
                success: true,
                data: responseData.data,
                meta: responseData.meta,
                message: `Historical usage data retrieved successfully for ${usage_type}`
              }));
            } else {
              // Fall back to mock data if API call fails
              console.error('API call failed, using mock data');
              const mockData = generateMockHistoricalReport(org_id, usage_type, start_time, end_time, convert_milli_timestamp);
              
              // Save mock report
              const reports = await loadDataOrDefault(historicalReportsFile, []);
              const reportEntry = {
                id: crypto.randomUUID(),
                org_id,
                usage_type,
                start_time,
                end_time,
                convert_milli_timestamp,
                timestamp: new Date().toISOString(),
                is_mock: true,
                response: mockData
              };
              
              reports.push(reportEntry);
              await saveData(historicalReportsFile, reports);
              
              return createTextResponse(JSON.stringify({
                success: true,
                data: mockData.data,
                meta: mockData.meta,
                is_mock: true,
                message: `Historical usage data (mock) retrieved successfully for ${usage_type}`
              }));
            }
          } catch (fetchError) {
            console.error('Fetch error:', fetchError.message);
            // Fall back to mock data if fetch fails
            const mockData = generateMockHistoricalReport(org_id, usage_type, start_time, end_time, convert_milli_timestamp);
            
            return createTextResponse(JSON.stringify({
              success: true,
              data: mockData.data,
              meta: mockData.meta,
              is_mock: true,
              message: `Historical usage data (mock) retrieved successfully for ${usage_type}`
            }));
          }
        } else {
          // If no authentication available, use mock data
          const mockData = generateMockHistoricalReport(org_id, usage_type, start_time, end_time, convert_milli_timestamp);
          
          // Save mock report
          const reports = await loadDataOrDefault(historicalReportsFile, []);
          const reportEntry = {
            id: crypto.randomUUID(),
            org_id,
            usage_type,
            start_time,
            end_time,
            convert_milli_timestamp,
            timestamp: new Date().toISOString(),
            is_mock: true,
            response: mockData
          };
          
          reports.push(reportEntry);
          await saveData(historicalReportsFile, reports);
          
          return createTextResponse(JSON.stringify({
            success: true,
            data: mockData.data,
            meta: mockData.meta,
            is_mock: true,
            message: `Historical usage data (mock) retrieved successfully for ${usage_type}`
          }));
        }
      } catch (error) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Error retrieving historical report: ${error.message}`
        }));
      }
    }
    else if (name === 'query-guide') {
      const { keyword, section, format } = QueryGuideSchema.parse(args);
      
      try {
        // Read the Guide.md file - try multiple possible locations
        const possiblePaths = [
          path.join(process.cwd(), 'Guide.md'),
          path.join(process.cwd(), 'guide.md'),
          path.join(process.cwd(), 'GUIDE.md'),
          path.join(__dirname, 'Guide.md'),
          path.join(__dirname, 'guide.md'),
          path.join(__dirname, 'GUIDE.md'),
          '/Users/okis.chuang/Documents/dev/mlytics-mcp-server/Guide.md'
        ];
        
        let guideContent = null;
        let readError = null;
        
        // Try each path until we find the file
        for (const guidePath of possiblePaths) {
          try {
            console.error(`Trying to read from path: ${guidePath}`);
            guideContent = await fs.readFile(guidePath, 'utf-8');
            console.error(`Successfully read Guide.md from ${guidePath}`);
            break; // Exit loop if successful
          } catch (err) {
            console.error(`Error reading from ${guidePath}: ${err.message}`);
            readError = err;
            // Continue to next path
          }
        }
        
        // If we couldn't find the file, create a simple mock guide
        if (!guideContent) {
          console.error('Could not find Guide.md in any location - using mock data');
          
          // Generate mock guide content for demonstration
          guideContent = `# Mlytics MCP Server Guide

## Introduction

This guide explains how to use the Mlytics MCP server tools.

## Available Tools

- automated-login: Authenticate with Mlytics API
- show-credit-info: Display credit usage information
- create-cdn-site: Create a new CDN site
- add-dns-record: Add DNS records to a site
- update-domain-settings: Update domain configuration
- get-historical-reports: Retrieve historical usage data
- query-guide: Query this documentation
- capacity-forecast: Generate capacity planning forecasts

## Authentication Methods

The MCP server supports two authentication methods:
1. JWT Token via Automated Login
2. API Key authentication

## Usage Examples

Check the readme.md file for examples.`;
        }
        
        // Helper function to parse the markdown into sections
        const parseSections = (content) => {
          const sections = {};
          const lines = content.split('\n');
          let currentSection = 'General';
          let currentSectionContent = [];
          
          // Find all sections (headers starting with #)
          for (const line of lines) {
            if (line.startsWith('# ')) {
              // Top-level heading, start a new section
              if (currentSectionContent.length > 0) {
                sections[currentSection] = currentSectionContent.join('\n');
                currentSectionContent = [];
              }
              currentSection = line.substring(2).trim();
            } else if (line.startsWith('## ')) {
              // Second-level heading, add as subsection
              if (currentSectionContent.length > 0) {
                sections[currentSection] = currentSectionContent.join('\n');
                currentSectionContent = [];
              }
              currentSection = line.substring(3).trim();
            } else if (line.startsWith('### ')) {
              // Third-level heading, add as deeper subsection
              if (currentSectionContent.length > 0) {
                sections[currentSection] = currentSectionContent.join('\n');
                currentSectionContent = [];
              }
              currentSection = line.substring(4).trim();
            }
            
            currentSectionContent.push(line);
          }
          
          // Add the last section
          if (currentSectionContent.length > 0) {
            sections[currentSection] = currentSectionContent.join('\n');
          }
          
          return sections;
        };
        
        // Parse the guide into sections
        const sections = parseSections(guideContent);
        
        // Handle section request
        if (section) {
          // Find the section (case insensitive)
          const sectionKey = Object.keys(sections).find(
            key => key.toLowerCase() === section.toLowerCase()
          );
          
          if (sectionKey) {
            const sectionContent = sections[sectionKey];
            
            // Format the output according to the requested format
            switch (format) {
              case 'markdown':
                return createTextResponse(JSON.stringify({
                  success: true,
                  data: {
                    section: sectionKey,
                    content: sectionContent
                  },
                  message: `Retrieved section '${sectionKey}' in markdown format`
                }));
              
              case 'text':
                // Convert markdown to plain text (basic conversion)
                const textContent = sectionContent
                  .replace(/#+\s+(.+)$/gm, '$1') // Remove heading markers
                  .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
                  .replace(/\*(.+?)\*/g, '$1') // Remove italic
                  .replace(/`(.+?)`/g, '$1') // Remove code
                  .replace(/```[\s\S]+?```/g, '[CODE BLOCK]'); // Replace code blocks
                
                return createTextResponse(JSON.stringify({
                  success: true,
                  data: {
                    section: sectionKey,
                    content: textContent
                  },
                  message: `Retrieved section '${sectionKey}' in text format`
                }));
              
              case 'html':
                // Basic markdown to HTML conversion
                const htmlContent = sectionContent
                  .replace(/^# (.+)$/gm, '<h1>$1</h1>') // H1
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>') // H2
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>') // H3
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // Bold
                  .replace(/\*(.+?)\*/g, '<em>$1</em>') // Italic
                  .replace(/`(.+?)`/g, '<code>$1</code>') // Inline code
                  .replace(/```([\s\S]+?)```/g, '<pre><code>$1</code></pre>') // Code blocks
                  .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>'); // Links
                
                return createTextResponse(JSON.stringify({
                  success: true,
                  data: {
                    section: sectionKey,
                    content: htmlContent
                  },
                  message: `Retrieved section '${sectionKey}' in HTML format`
                }));
              
              case 'json':
                // Structure the section data
                const sectionParts = sectionContent.split('\n\n');
                
                return createTextResponse(JSON.stringify({
                  success: true,
                  data: {
                    section: sectionKey,
                    title: sectionKey,
                    content: sectionContent,
                    parts: sectionParts
                  },
                  message: `Retrieved section '${sectionKey}' in JSON format`
                }));
              
              default:
                return createTextResponse(JSON.stringify({
                  success: true,
                  data: {
                    section: sectionKey,
                    content: sectionContent
                  },
                  message: `Retrieved section '${sectionKey}'`
                }));
            }
          } else {
            // Section not found
            return createTextResponse(JSON.stringify({
              success: false,
              data: {
                availableSections: Object.keys(sections)
              },
              message: `Section '${section}' not found in the guide`
            }));
          }
        }
        
        // Handle keyword search
        if (keyword) {
          const matchingSections = {};
          let contextLines = 5; // Number of lines of context to include
          
          // Search for the keyword in each section
          for (const [sectionName, sectionContent] of Object.entries(sections)) {
            if (sectionContent.toLowerCase().includes(keyword.toLowerCase())) {
              // Found a match in this section
              const lines = sectionContent.split('\n');
              const matches = [];
              
              // Find all matching lines with context
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(keyword.toLowerCase())) {
                  // Extract context lines
                  const startLine = Math.max(0, i - contextLines);
                  const endLine = Math.min(lines.length - 1, i + contextLines);
                  const contextContent = lines.slice(startLine, endLine + 1).join('\n');
                  
                  matches.push({
                    line: i + 1,
                    content: lines[i].trim(),
                    context: contextContent
                  });
                }
              }
              
              if (matches.length > 0) {
                matchingSections[sectionName] = matches;
              }
            }
          }
          
          // Format the keyword search results according to the requested format
          switch (format) {
            case 'markdown':
              let markdownResults = `# Search Results for "${keyword}"\n\n`;
              
              Object.entries(matchingSections).forEach(([section, matches]) => {
                markdownResults += `## ${section}\n\n`;
                
                matches.forEach(match => {
                  markdownResults += `Line ${match.line}: \`${match.content}\`\n\n`;
                  markdownResults += "```\n" + match.context + "\n```\n\n";
                });
              });
              
              return createTextResponse(JSON.stringify({
                success: true,
                data: {
                  keyword,
                  content: markdownResults,
                  matchCount: Object.values(matchingSections).flat().length
                },
                message: `Found ${Object.values(matchingSections).flat().length} matches for '${keyword}' in markdown format`
              }));
            
            case 'text':
              let textResults = `Search Results for "${keyword}"\n\n`;
              
              Object.entries(matchingSections).forEach(([section, matches]) => {
                textResults += `Section: ${section}\n\n`;
                
                matches.forEach(match => {
                  textResults += `Line ${match.line}: ${match.content}\n\n`;
                  textResults += "Context:\n" + match.context + "\n\n";
                });
              });
              
              return createTextResponse(JSON.stringify({
                success: true,
                data: {
                  keyword,
                  content: textResults,
                  matchCount: Object.values(matchingSections).flat().length
                },
                message: `Found ${Object.values(matchingSections).flat().length} matches for '${keyword}' in text format`
              }));
            
            case 'html':
              let htmlResults = `<h1>Search Results for "${keyword}"</h1>`;
              
              Object.entries(matchingSections).forEach(([section, matches]) => {
                htmlResults += `<h2>${section}</h2>`;
                
                matches.forEach(match => {
                  htmlResults += `<p><strong>Line ${match.line}:</strong> <code>${match.content}</code></p>`;
                  htmlResults += "<pre>" + match.context + "</pre>";
                });
              });
              
              return createTextResponse(JSON.stringify({
                success: true,
                data: {
                  keyword,
                  content: htmlResults,
                  matchCount: Object.values(matchingSections).flat().length
                },
                message: `Found ${Object.values(matchingSections).flat().length} matches for '${keyword}' in HTML format`
              }));
            
            case 'json':
              return createTextResponse(JSON.stringify({
                success: true,
                data: {
                  keyword,
                  matches: matchingSections,
                  matchCount: Object.values(matchingSections).flat().length
                },
                message: `Found ${Object.values(matchingSections).flat().length} matches for '${keyword}' in JSON format`
              }));
            
            default:
              return createTextResponse(JSON.stringify({
                success: true,
                data: {
                  keyword,
                  matches: matchingSections,
                  matchCount: Object.values(matchingSections).flat().length
                },
                message: `Found ${Object.values(matchingSections).flat().length} matches for '${keyword}'`
              }));
          }
        }
        
        // If neither section nor keyword provided, return table of contents
        const tableOfContents = Object.keys(sections).map(sectionName => ({
          title: sectionName,
          level: sectionName.startsWith('# ') ? 1 : 
                 sectionName.startsWith('## ') ? 2 : 
                 sectionName.startsWith('### ') ? 3 : 0
        }));
        
        // Format the table of contents according to the requested format
        switch (format) {
          case 'markdown':
            let markdownToc = "# Guide Table of Contents\n\n";
            tableOfContents.forEach(section => {
              markdownToc += `${'  '.repeat(section.level - 1)}- ${section.title}\n`;
            });
            
            return createTextResponse(JSON.stringify({
              success: true,
              data: {
                content: markdownToc,
                sections: tableOfContents
              },
              message: "Retrieved guide table of contents in markdown format"
            }));
          
          case 'text':
            let textToc = "Guide Table of Contents\n\n";
            tableOfContents.forEach(section => {
              textToc += `${'  '.repeat(section.level - 1)}${section.title}\n`;
            });
            
            return createTextResponse(JSON.stringify({
              success: true,
              data: {
                content: textToc,
                sections: tableOfContents
              },
              message: "Retrieved guide table of contents in text format"
            }));
          
          case 'html':
            let htmlToc = "<h1>Guide Table of Contents</h1><ul>";
            tableOfContents.forEach(section => {
              htmlToc += `<li style="margin-left: ${(section.level - 1) * 20}px">${section.title}</li>`;
            });
            htmlToc += "</ul>";
            
            return createTextResponse(JSON.stringify({
              success: true,
              data: {
                content: htmlToc,
                sections: tableOfContents
              },
              message: "Retrieved guide table of contents in HTML format"
            }));
          
          case 'json':
            return createTextResponse(JSON.stringify({
              success: true,
              data: {
                sections: tableOfContents,
                sectionCount: tableOfContents.length
              },
              message: "Retrieved guide table of contents in JSON format"
            }));
          
          default:
            return createTextResponse(JSON.stringify({
              success: true,
              data: {
                sections: tableOfContents
              },
              message: "Retrieved guide table of contents"
            }));
        }
      } catch (error) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Error querying guide: ${error.message}`
        }));
      }
    }
    else if (name === 'capacity-forecast') {
      const { 
        org_id,
        usage_type,
        historical_days,
        forecast_days,
        growth_rate,
        include_seasonality,
        confidence_interval,
        threshold_warning,
        threshold_critical,
        apiKey: providedApiKey
      } = CapacityForecastSchema.parse(args);
      
      try {
        // Generate the capacity forecast
        const forecastData = generateCapacityForecast(
          org_id,
          usage_type,
          historical_days,
          forecast_days,
          growth_rate,
          include_seasonality,
          confidence_interval,
          threshold_warning,
          threshold_critical
        );
        
        // Save the forecast to local storage
        const forecasts = await loadDataOrDefault(capacityForecastsFile, []);
        
        // Create a forecast record with metadata
        const forecastRecord = {
          id: crypto.randomUUID(),
          org_id,
          usage_type,
          created_at: new Date().toISOString(),
          parameters: {
            historical_days,
            forecast_days,
            growth_rate,
            include_seasonality,
            confidence_interval,
            threshold_warning,
            threshold_critical
          },
          forecast: forecastData
        };
        
        // Add to forecasts history and save
        forecasts.push(forecastRecord);
        await saveData(capacityForecastsFile, forecasts);
        
        // Return the forecast data
        return createTextResponse(JSON.stringify({
          success: true,
          data: forecastData.data,
          message: `Capacity forecast generated successfully for ${usage_type}`
        }));
      } catch (error) {
        return createTextResponse(JSON.stringify({
          success: false,
          message: `Error generating capacity forecast: ${error.message}`
        }));
      }
    }
    else {
      return createTextResponse(JSON.stringify({
        success: false,
        message: `Unknown tool: ${name}`
      }));
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createTextResponse(JSON.stringify({
        success: false,
        message: `Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      }));
    }
    
    return createTextResponse(JSON.stringify({
      success: false,
      message: `Error executing tool ${name}: ${error.message}`
    }));
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
