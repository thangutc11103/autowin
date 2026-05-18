const fs = require('fs');
const path = require('path');

const baseDir = "C:\\Users\\DELL\\OneDrive\\Documents\\WinD\\Dự án AI find Video\\find-app";

const dirs = [
  path.join(baseDir, "app\\api\\auth\\tiktok\\callback"),
  path.join(baseDir, "app\\api\\auth\\meta\\callback"),
  path.join(baseDir, "app\\api\\auth\\youtube\\callback")
];

dirs.forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
  console.log("Created:", dir);
});

console.log("\nAll directories created successfully!");
