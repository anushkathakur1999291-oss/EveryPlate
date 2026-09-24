const fs = require('fs');
const path = require('path');
function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
    else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      const newLines = [];
      const lines = content.split('\n');
      for (let line of lines) {
        if (line.includes('context/AuthContext') && line.includes('useAuth')) {
            // we replace the import, maybe splitting it
            // if it imports both AuthProvider and useAuth... usually it doesn't.
            if (line.includes('AuthProvider')) {
              newLines.push(line.replace(/,\s*useAuth\s*/, ' '));
              newLines.push(line.replace('context/AuthContext', 'hooks/useAuth').replace('AuthProvider', ''));
            } else {
              newLines.push(line.replace('context/AuthContext', 'hooks/useAuth'));
            }
            changed = true;
        } else if (line.includes('context/SocketContext') && (line.includes('useSocket') || line.includes('useSocketEvent'))) {
            newLines.push(line.replace('context/SocketContext', 'hooks/useSocket'));
            changed = true;
        } else {
            newLines.push(line);
        }
      }
      if (changed) fs.writeFileSync(fullPath, newLines.join('\n'));
    }
  }
}
walk('./src');
