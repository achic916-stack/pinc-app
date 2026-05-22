const fs = require('fs');
const path = require('path');

function touchDir(dir) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            // Prepend \\?\ to bypass MAX_PATH limits on Windows
            const fullPath = path.join(dir, file);
            const bypassPath = '\\\\?\\' + fullPath;
            
            try {
                const stat = fs.lstatSync(bypassPath);
                if (stat.isDirectory()) {
                    touchDir(fullPath);
                } else {
                    const now = new Date();
                    fs.utimesSync(bypassPath, now, now);
                }
            } catch (e) {
                // Ignore if we can't touch it
                // console.log("Failed to touch", bypassPath);
            }
        }
    } catch (e) {
        // Ignore read dir errors
    }
}

console.log("Touching gradle caches...");
touchDir("C:\\Users\\achic\\.gradle\\caches");

console.log("Touching node_modules...");
touchDir("C:\\Users\\achic\\.gemini\\antigravity\\scratch\\pinc_app\\node_modules");

console.log("Done!");
