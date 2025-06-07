/**
 * FTP Deployment Script for Screen Recorder App
 * 
 * This script deploys the built application to an FTP server.
 * It handles both root and non-root remote directories and provides
 * detailed progress logging during the upload process.
 * 
 * Important: Make sure to quote any special characters in your .env password
 * to prevent issues with # being interpreted as comments
 */

import ftpPkg from 'ftp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

// Extract Client from CommonJS module
const FtpClient = ftpPkg;

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredVars = ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD'];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`Error: Missing required environment variable: ${varName}`);
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }
}

// FTP Configuration
const config = {
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASSWORD.replace(/^"(.*)"$/, '$1'), // Remove quotes if present
  port: parseInt(process.env.FTP_PORT || '21', 10),
  connTimeout: 30000, // 30 seconds
  pasvTimeout: 30000,
  keepalive: 10000
};

const localRoot = path.join(__dirname, 'dist');
const remoteRoot = process.env.FTP_REMOTE_ROOT || '/';

console.log('Starting FTP deployment');
console.log(`Local directory: ${localRoot}`);
console.log(`Remote directory: ${remoteRoot}`);
console.log(`Host: ${config.host}, User: ${config.user}`);

// Recursive function to upload files
function uploadDirectory(client, localDir, remoteDir, callback) {
  fs.readdir(localDir, (err, files) => {
    if (err) {
      console.error(`Error reading directory ${localDir}:`, err);
      return callback(err);
    }

    let pending = files.length;
    if (!pending) return callback(null);

    files.forEach(file => {
      const localPath = path.join(localDir, file);
      const remotePath = path.posix.join(remoteDir, file);
      
      fs.stat(localPath, (err, stat) => {
        if (err) {
          console.error(`Error getting stats for ${localPath}:`, err);
          if (--pending === 0) callback(null);
          return;
        }
        
        if (stat.isDirectory()) {
          // Create directory and upload contents recursively
          client.mkdir(remotePath, true, err => {
            if (err) {
              console.error(`Error creating directory ${remotePath}:`, err);
              if (--pending === 0) callback(null);
              return;
            }
            
            console.log(`Created directory: ${remotePath}`);
            uploadDirectory(client, localPath, remotePath, err => {
              if (err) console.error(err);
              if (--pending === 0) callback(null);
            });
          });
        } else {
          // Upload file
          client.put(localPath, remotePath, err => {
            if (err) {
              console.error(`Error uploading ${localPath} to ${remotePath}:`, err);
            } else {
              console.log(`✓ Uploaded: ${file}`);
            }
            if (--pending === 0) callback(null);
          });
        }
      });
    });
  });
}

// Connect to FTP and start upload
const client = new FtpClient();

client.on('ready', () => {
  console.log('FTP connection established successfully!');
  
  // Skip directory creation if we're using the root directory
  if (remoteRoot === '/') {
    console.log('Using root directory, no need to create it');
    navigateAndUpload(remoteRoot);
  } else {
    // Ensure remote directory exists for non-root paths
    client.mkdir(remoteRoot, true, err => {
      if (err) {
        console.error(`Error creating remote directory ${remoteRoot}:`, err);
        client.end();
        process.exit(1);
      }
      navigateAndUpload(remoteRoot);
    });
  }
});

// Function to navigate to directory and start upload
function navigateAndUpload(dir) {
  client.cwd(dir, err => {
    if (err) {
      console.error(`Error changing to remote directory ${dir}:`, err);
      client.end();
      process.exit(1);
    }
    
    // Start uploading files
    console.log(`Starting to upload files from ${localRoot} to ${dir}`);
    uploadDirectory(client, localRoot, '', err => {
      if (err) {
        console.error('Deployment failed:', err);
        process.exit(1);
      } else {
        console.log('Deployment completed successfully!');
      }
      client.end();
    });
  });
}

client.on('error', err => {
  console.error('FTP connection error:', err);
  process.exit(1);
});

// Display more detailed connection information
client.on('greeting', msg => {
  console.log('FTP Server greeting:', msg);
});

// Connect to the FTP server
console.log('Connecting to FTP server...');
client.connect(config);
