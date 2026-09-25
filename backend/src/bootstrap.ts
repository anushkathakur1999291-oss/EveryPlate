import path from 'path';
import Module from 'module';

// Ensure module resolution finds dependencies in Vercel serverless environments
const candidatePaths = [
  '/var/task/backend/node_modules',
  '/var/task/node_modules',
  path.resolve(__dirname, '../node_modules'),
  path.resolve(__dirname, '../../node_modules'),
  path.resolve(__dirname, 'backend/node_modules'),
  path.resolve(__dirname, '../backend/node_modules'),
];

const currentPaths = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
process.env.NODE_PATH = [...candidatePaths, ...currentPaths].join(path.delimiter);

if (typeof (Module as any)._initPaths === 'function') {
  (Module as any)._initPaths();
}
