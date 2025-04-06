// Test script for Playwright login to Mlytics Portal
// Run with: node test-login.js

import { chromium } from 'playwright';

// Set to false to see the browser during login process
const HEADLESS = false;
// Set to portal URL
const PORTAL_URL = 'https://portal.mlytics.com/';
// Add your test credentials here
const TEST_EMAIL = 'test@example.com'; // Replace with a real test email
const TEST_PASSWORD = 'password123';    // Replace with a real test password

async function testLogin() {
  console.log(`Starting test login for ${TEST_EMAIL} to ${PORTAL_URL}`);
  
  // Launch browser
  const browser = await chromium.launch({ 
    headless: HEADLESS,
    // Slow down operations to see what's happening
    slowMo: 100
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  // Log all console messages
  context.on('console', msg => {
    console.log(`Browser console [${msg.type()}]: ${msg.text()}`);
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to portal
    console.log('Navigating to portal...');
    await page.goto(PORTAL_URL);
    
    // Debug info
    console.log(`Current URL: ${page.url()}`);
    
    // Wait for a bit to see where we landed
    await page.waitForTimeout(3000);
    
    // We may be automatically redirected to login page
    // If not, look for login button or link
    if (!page.url().includes('/login')) {
      console.log('Looking for login link...');
      
      // Try different selectors that might be used for login link/button
      const loginSelectors = [
        'text=Login', 
        'text=Sign In', 
        'a[href*="login"]',
        'button:has-text("Login")',
        '[data-testid="login-button"]'
      ];
      
      for (const selector of loginSelectors) {
        try {
          console.log(`Trying to find login element with selector: ${selector}`);
          const loginElement = await page.$(selector);
          if (loginElement) {
            console.log(`Found login element with selector: ${selector}`);
            await loginElement.click();
            break;
          }
        } catch (e) {
          console.log(`Selector ${selector} failed: ${e.message}`);
        }
      }
      
      await page.waitForTimeout(2000);
      console.log(`After login click, URL: ${page.url()}`);
    }
    
    // Now we should be on login form page
    // Let's try to identify the form elements
    console.log('Looking for login form...');
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'login-page.png' });
    console.log('Screenshot saved as login-page.png');
    
    // Log some HTML for debugging
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    console.log('=== Page HTML snippet ===');
    console.log(bodyHTML.substring(0, 500) + '...');
    console.log('========================');
    
    // Try to find input fields - various possibilities
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="email" i]',
      'input[id*="email" i]',
      'input[data-testid="email-input"]'
    ];
    
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="password" i]',
      'input[id*="password" i]',
      'input[data-testid="password-input"]'
    ];
    
    // Find email field
    let emailField = null;
    for (const selector of emailSelectors) {
      try {
        console.log(`Looking for email field with: ${selector}`);
        const field = await page.$(selector);
        if (field) {
          emailField = selector;
          console.log(`Found email field with: ${selector}`);
          break;
        }
      } catch (e) {}
    }
    
    // Find password field
    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        console.log(`Looking for password field with: ${selector}`);
        const field = await page.$(selector);
        if (field) {
          passwordField = selector;
          console.log(`Found password field with: ${selector}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!emailField || !passwordField) {
      throw new Error('Could not find login form fields');
    }
    
    // Fill in the form
    console.log('Filling login form...');
    await page.fill(emailField, TEST_EMAIL);
    await page.fill(passwordField, TEST_PASSWORD);
    
    // Find submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign In")',
      'input[type="submit"]',
      '[data-testid="login-submit"]'
    ];
    
    let submitButton = null;
    for (const selector of submitSelectors) {
      try {
        console.log(`Looking for submit button with: ${selector}`);
        const button = await page.$(selector);
        if (button) {
          submitButton = selector;
          console.log(`Found submit button with: ${selector}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!submitButton) {
      throw new Error('Could not find submit button');
    }
    
    // Submit the form
    console.log('Submitting login form...');
    await Promise.all([
      page.click(submitButton),
      // Wait for navigation, but catch errors as some sites use AJAX
      page.waitForNavigation().catch(e => console.log('Navigation promise rejected:', e.message))
    ]);
    
    // Wait to see what happens
    await page.waitForTimeout(5000);
    console.log(`After login, URL: ${page.url()}`);
    
    // Check if login was successful
    const isLoginPage = page.url().includes('/login') || page.url().includes('/auth');
    
    if (isLoginPage) {
      // Take screenshot of error page
      await page.screenshot({ path: 'login-failed.png' });
      console.log('Login failed. Screenshot saved as login-failed.png');
      
      // Try to get error message
      const errorSelectors = [
        '.error-message',
        '.alert-error',
        '.alert-danger',
        '[role="alert"]',
        '.form-error'
      ];
      
      let errorMessage = 'Unknown error';
      for (const selector of errorSelectors) {
        try {
          const errorEl = await page.$(selector);
          if (errorEl) {
            errorMessage = await errorEl.textContent();
            break;
          }
        } catch (e) {}
      }
      
      throw new Error(`Login failed: ${errorMessage}`);
    }
    
    console.log('Login successful!');
    
    // Take screenshot of dashboard
    await page.screenshot({ path: 'login-success.png' });
    console.log('Screenshot saved as login-success.png');
    
    // Try to extract JWT
    const jwt = await page.evaluate(() => {
      // Try different possible localStorage keys
      const possibleKeys = ['jwtToken', 'token', 'jwt', 'auth.token', 'authToken'];
      for (const key of possibleKeys) {
        const value = localStorage.getItem(key);
        if (value) return { key, value };
      }
      return null;
    });
    
    if (jwt) {
      console.log(`Found JWT in localStorage with key: ${jwt.key}`);
      console.log(`JWT token: ${jwt.value.substring(0, 15)}...`);
    } else {
      console.log('Could not find JWT token in localStorage');
      
      // Log all localStorage for debugging
      const allStorage = await page.evaluate(() => {
        const result = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          result[key] = localStorage.getItem(key);
        }
        return result;
      });
      
      console.log('All localStorage items:');
      for (const [key, value] of Object.entries(allStorage)) {
        const displayValue = typeof value === 'string' 
          ? (value.length > 20 ? value.substring(0, 20) + '...' : value)
          : value;
        console.log(`- ${key}: ${displayValue}`);
      }
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    // Close browser
    await browser.close();
  }
}

// Run the test
testLogin().catch(console.error);