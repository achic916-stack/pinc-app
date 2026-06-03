const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt');

if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('requestedPermissions?.contains(permission) ?: false')) {
    content = content.replace(
      'return requestedPermissions.contains(permission)',
      'return requestedPermissions?.contains(permission) ?: false'
    );
    fs.writeFileSync(file, content, 'utf8');
    console.log('Successfully patched PermissionsService.kt for SDK 35');
  } else {
    console.log('PermissionsService.kt is already patched');
  }
} else {
  console.log('PermissionsService.kt not found at:', file);
}
