# Safe .env read/write (no sed — passwords may contain / & and quotes).
# Requires: node

env_file_get() {
  local key="$1" file="$2"
  node -e "
    const fs = require('fs');
    const key = process.argv[1];
    const path = process.argv[2];
    const text = fs.readFileSync(path, 'utf8');
    for (const line of text.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      if (t.slice(0, i).trim() !== key) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith(\"'\") && v.endsWith(\"'\"))) {
        v = v.slice(1, -1);
      }
      process.stdout.write(v.replace(/\r$/, ''));
      process.exit(0);
    }
    process.exit(1);
  " "${key}" "${file}" 2>/dev/null || true
}

env_file_set() {
  local key="$1" value="$2" file="$3"
  node -e "
    const fs = require('fs');
    const key = process.argv[1];
    const value = process.argv[2];
    const path = process.argv[3];
    const line = key + '=' + JSON.stringify(value);
    let lines = [];
    try { lines = fs.readFileSync(path, 'utf8').split(/\n/); } catch { /* new file */ }
    let found = false;
    const out = lines.map((l) => {
      if (l.startsWith(key + '=')) { found = true; return line; }
      return l;
    });
    if (!found) out.push(line);
    fs.writeFileSync(path, out.filter((l, i, a) => !(i === a.length - 1 && l === '')).join('\n') + '\n');
  " "${key}" "${value}" "${file}"
}

# Export vars from .env for bash (safe for special characters).
load_env_exports() {
  local envfile="${1:?}"
  [[ -f "${envfile}" ]] || return 1
  eval "$(node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const text = fs.readFileSync(path, 'utf8');
    for (const line of text.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith(\"'\") && v.endsWith(\"'\"))) {
        v = v.slice(1, -1);
      }
      console.log('export ' + k + '=' + JSON.stringify(v.replace(/\r$/, '')));
    }
  " "${envfile}")"
}
