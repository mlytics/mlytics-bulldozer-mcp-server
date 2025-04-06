// Schema definition for the automated login tool
const AutomatedLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  storePath: z.string().optional().default('./tokens/jwt_token.json'),
});

// Function to handle the automated login for Mlytics portal
server.addToolHandler(async (name, args) => {
  if (name === 'automated-login') {
    try {
      const { email, password, storePath } = AutomatedLoginSchema.parse(args);
      
      console.log(`Attempting to login with account: ${email}`);
      
      // Launch a new browser instance
      const browser = await playwright.chromium.launch({
        headless: true
      });
      
      const context = await browser.newContext();
      const page = await context.newPage();
      
      // Navigate to login page
      await page.goto('https://portal.mlytics.com/login');
      console.log('Navigated to login page');
      
      // Fill in login credentials
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      
      // Click login button
      await page.click('button:has-text("Login")');
      console.log('Login form submitted');
      
      // Wait for navigation to complete (either dashboard or another page)
      await page.waitForNavigation();
      
      // Extract cookies
      const cookies = await context.cookies();
      const jwtCookie = cookies.find(cookie => cookie.name === 'jwtToken');
      
      if (!jwtCookie) {
        throw new Error('JWT token not found in cookies');
      }
      
      // Extract the token and decode payload for display
      const jwtToken = jwtCookie.value;
      const tokenParts = jwtToken.split('.');
      
      if (tokenParts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }
      
      // Decode the payload part (second part of the JWT)
      const payloadBase64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
      
      // Store the token to the specified path
      const fs = require('fs');
      const path = require('path');
      
      // Ensure directory exists
      const dir = path.dirname(storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Format for storage with metadata
      const tokenData = {
        token: jwtToken,
        issued_at: new Date(payload.iat * 1000).toISOString(),
        expires_at: new Date(payload.exp * 1000).toISOString(),
        user_id: payload.subject.user_id,
        user_email: payload.subject.user_email,
        organization_id: payload.subject.organization_id
      };
      
      // Save the token to file
      fs.writeFileSync(storePath, JSON.stringify(tokenData, null, 2));
      console.log(`Token saved to ${storePath}`);
      
      // Close browser
      await browser.close();
      
      return createTextResponse(JSON.stringify({
        success: true,
        message: `Successfully logged in as ${email}`,
        token_info: {
          user_id: payload.subject.user_id,
          user_email: payload.subject.user_email,
          organization_id: payload.subject.organization_id,
          expires_at: new Date(payload.exp * 1000).toISOString(),
          token_path: storePath
        }
      }));
    } catch (error) {
      console.error('Login failed:', error);
      return createTextResponse(JSON.stringify({
        success: false,
        message: `Login failed: ${error.message}`
      }));
    }
  }
  
  // Continue with other tool handlers...
});