// Playwright-based authentication for Mlytics Portal
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Constants
const AUTH_DIR = path.join(os.homedir(), '.mlytics-cdn-mcp');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');
const PORTAL_URL = 'https://portal.mlytics.com/';
const LOGIN_URL = 'https://portal.mlytics.com/login';
const DEFAULT_TIMEOUT = 60000; // 60 seconds

// Ensure authentication directory exists
const ensureAuthDirExists = async () => {
  try {
    await fs.mkdir(AUTH_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating auth directory:', error);
    throw error;
  }
};

// Save auth data
const saveAuthData = async (data) => {
  await ensureAuthDirExists();
  await fs.writeFile(AUTH_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

// Load auth data
const loadAuthData = async () => {
  try {
    const data = await fs.readFile(AUTH_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
};

/**
 * Helper functions for browser-based login
 */

// Find element using multiple possible selectors
async function findElement(page, selectors) {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.error(`Found element with selector: ${selector}`);
        return selector;
      }
    } catch (e) {}
  }
  return null;
}

// Take a screenshot if in visible mode
async function takeScreenshot(page, filename, headless) {
  if (!headless) {
    await ensureAuthDirExists();
    await page.screenshot({ path: path.join(AUTH_DIR, filename) });
    console.error(`Screenshot saved to ${filename}`);
  }
}

// Extract JWT from localStorage for portal.mlytics.com
async function extractJwt(page) {
  // Log the current URL so we can see where we are
  const currentUrl = page.url();
  console.error(`Current page URL: ${currentUrl}`);
  
  // Since this is specifically for portal.mlytics.com with known token key
  const jwt = await page.evaluate(() => {
    const token = localStorage.getItem('jwtToken');
    if (token) {
      return { key: 'jwtToken', value: token };
    }
    return null;
  });
  
  if (jwt) {
    console.error('Successfully found JWT token with key: jwtToken');
    return jwt;
  }
  
  // If not found, log all localStorage keys for debugging
  console.error('JWT token not found with key "jwtToken", checking all localStorage items...');
  
  const allStorage = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      result[key] = value;
    }
    return result;
  });
  
  console.error('All localStorage keys:', Object.keys(allStorage).join(', '));
  
  // Try cookies if localStorage doesn't have it
  const cookies = await page.context().cookies();
  const jwtCookie = cookies.find(c => c.name === 'jwtToken');
  
  if (jwtCookie) {
    console.error('Found JWT token in cookies with name: jwtToken');
    return { key: 'jwtToken', value: jwtCookie.value };
  }
  
  return null;
}

/**
 * Automated login to Mlytics Portal
 * @param {Object} params Login parameters
 * @param {string} params.email User email
 * @param {string} params.password User password
 * @param {boolean} params.headless Whether to run browser in headless mode
 * @returns {Promise<Object>} Authentication data
 */
export const automatedLogin = async ({ email, password, headless = true }) => {
  console.error(`Starting automated login for ${email}`);
  
  // Launch browser
  const browser = await chromium.launch({ 
    headless,
    slowMo: headless ? 0 : 50 // Add slight delay in visible mode
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // Go directly to login page
    console.error('Navigating to login page');
    await page.goto(LOGIN_URL, { timeout: DEFAULT_TIMEOUT });
    
    // Find email field
    const emailSelectors = ['input[type="email"]', 'input[name="email"]'];
    const emailField = await findElement(page, emailSelectors);
    if (!emailField) {
      await takeScreenshot(page, 'login-error.png', headless);
      throw new Error('Could not find email field');
    }
    
    // Find password field
    const passwordField = await findElement(page, ['input[type="password"]']);
    if (!passwordField) {
      await takeScreenshot(page, 'login-error.png', headless);
      throw new Error('Could not find password field');
    }
    
    // Fill login form
    console.error('Filling login form');
    await page.fill(emailField, email);
    await page.fill(passwordField, password);
    
    // Find submit button
    const submitButton = await findElement(page, [
      'button[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign In")'
    ]);
    
    if (!submitButton) {
      await takeScreenshot(page, 'login-error.png', headless);
      throw new Error('Could not find submit button');
    }
    
    // Submit form
    console.error('Submitting login form');
    await page.click(submitButton);
    
    // Wait for navigation to complete
    try {
      await page.waitForNavigation({ timeout: 10000 });
    } catch (e) {
      console.error('Navigation timeout, continuing anyway');
    }
    
    // Wait a moment for any post-login redirects or JS execution
    // Need a longer wait for localStorage to be populated with the token
    console.error('Waiting for localStorage to be populated with JWT token...');
    await page.waitForTimeout(5000);
    
    // Additional wait for localStorage with the jwtToken key to be populated
    try {
      await page.waitForFunction(() => localStorage.getItem('jwtToken') !== null, { timeout: 10000 })
        .then(() => console.error('JWT token found in localStorage'))
        .catch(() => console.error('Timed out waiting for JWT token to appear in localStorage'));
    } catch (e) {
      console.error('Error while waiting for token:', e.message);
    }
    
    // Check if we're still on login page (failed login)
    if (page.url().includes('/login') || page.url().includes('/auth')) {
      await takeScreenshot(page, 'login-failed.png', headless);
      throw new Error('Login failed - still on login page');
    }
    
    console.error('Login successful, extracting JWT');
    await takeScreenshot(page, 'login-success.png', headless);
    
    // Extract JWT from localStorage
    const jwt = await extractJwt(page);
    
    if (!jwt) {
      throw new Error('Could not find JWT token in localStorage');
    }
    
    console.error(`Found JWT in localStorage with key: ${jwt.key}`);
    
    // Store the token
    const authData = {
      jwt: jwt.value,
      tokenKey: jwt.key,
      email,
      timestamp: new Date().toISOString(),
      expiresAt: null
    };
    
    await saveAuthData(authData);
    console.error('JWT extracted and saved successfully');
    return authData;
  } catch (error) {
    console.error(`Automated login failed: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
};

/**
 * Get stored JWT token
 * @returns {Promise<string|null>} JWT token or null if not found
 */
export const getStoredJwt = async () => {
  const authData = await loadAuthData();
  return authData?.jwt || null;
};

/**
 * Get stored token key name
 * @returns {Promise<string|null>} Token key name or null if not found
 */
export const getStoredTokenKey = async () => {
  const authData = await loadAuthData();
  return authData?.tokenKey || 'jwtToken'; // Default to jwtToken if not specified
};

/**
 * Check if stored JWT is valid
 * @returns {Promise<boolean>} Whether JWT is valid
 */
export const isJwtValid = async () => {
  const authData = await loadAuthData();
  
  if (!authData || !authData.jwt) {
    return false;
  }
  
  // If we have an expiry time, check it
  if (authData.expiresAt) {
    const expiryDate = new Date(authData.expiresAt);
    const now = new Date();
    
    // If token expired, return false
    if (expiryDate <= now) {
      return false;
    }
  }
  
  // If the token is more than 24 hours old and we don't have an expiry,
  // consider it potentially expired
  if (!authData.expiresAt && authData.timestamp) {
    const tokenDate = new Date(authData.timestamp);
    const now = new Date();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    if (now.getTime() - tokenDate.getTime() > dayInMs) {
      console.error('Token is more than 24 hours old, considering it expired');
      return false;
    }
  }
  
  // TODO: Add a verification API call to check if token is still valid
  
  return true;
};

/**
 * Get JWT token, refreshing if needed
 * @param {Object} credentials Login credentials (email, password)
 * @returns {Promise<string>} Valid JWT token
 */
export const getValidJwt = async (credentials) => {
  // Check if we have a valid token
  const isValid = await isJwtValid();
  
  // If token is valid, return it
  if (isValid) {
    return await getStoredJwt();
  }
  
  // Otherwise, login again
  const authData = await automatedLogin(credentials);
  return authData.jwt;
};

/**
 * Create axios headers with authentication token
 * @returns {Promise<Object>} Headers object with authentication
 */
export const getAuthHeaders = async () => {
  const jwt = await getStoredJwt();
  const tokenKey = await getStoredTokenKey();
  
  if (!jwt) {
    throw new Error('No authentication token available');
  }
  
  // Return headers based on what the API expects
  return {
    'Authorization': `Bearer ${jwt}`,
    'X-Auth-Token': jwt,
    // Add any other headers needed by the API
  };
};