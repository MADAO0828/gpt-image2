const fs = require('fs');
const s = fs.readFileSync('admin.html', 'utf8');
const ids = ['exportSettingsBtn','exportUsersBackupBtn','importSettingsBtn','cfgImportExport'];
for (const id of ids) {
  if (!s.includes('id="' + id + '"') && !s.includes("id='" + id + "'")) throw new Error('missing ' + id);
}
if (!s.includes('/api/settings/backup')) throw new Error('missing backup endpoint wiring');
console.log('admin backup UI wiring present');
