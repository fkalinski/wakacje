#!/usr/bin/env node

import { generateToken, generateApiKeyToken } from '../middleware/auth';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const type = args[0];

if (!type || (type !== 'user' && type !== 'api')) {
  console.log('Usage: npm run generate-token <user|api> [options]');
  console.log('\nFor user token:');
  console.log('  npm run generate-token user <userId> <email> [role]');
  console.log('\nFor API key:');
  console.log('  npm run generate-token api <keyId> <name>');
  console.log('\nExamples:');
  console.log('  npm run generate-token user user123 john@example.com admin');
  console.log('  npm run generate-token api api-key-1 "Production API Key"');
  process.exit(1);
}

if (type === 'user') {
  const userId = args[1];
  const email = args[2];
  const role = args[3] || 'user';
  
  if (!userId || !email) {
    console.error('Error: userId and email are required for user tokens');
    process.exit(1);
  }
  
  const token = generateToken(userId, email, role);
  
  console.log('\n=== User JWT Token Generated ===');
  console.log('User ID:', userId);
  console.log('Email:', email);
  console.log('Role:', role);
  console.log('\nToken:');
  console.log(token);
  console.log('\nUse this token in the Authorization header:');
  console.log('Authorization: Bearer', token);
  
} else if (type === 'api') {
  const keyId = args[1];
  const name = args[2];
  
  if (!keyId || !name) {
    console.error('Error: keyId and name are required for API keys');
    process.exit(1);
  }
  
  const token = generateApiKeyToken(keyId, name);
  
  console.log('\n=== API Key Generated ===');
  console.log('Key ID:', keyId);
  console.log('Name:', name);
  console.log('\nAPI Key:');
  console.log(token);
  console.log('\nUse this key in the x-api-key header:');
  console.log('x-api-key:', token);
}

console.log('\n✅ Token generated successfully!');
console.log('⚠️  Remember to keep your tokens secure and never commit them to version control.');