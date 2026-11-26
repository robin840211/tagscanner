import { execFileSync } from 'node:child_process';

export const repositoryUrl = 'https://github.com/robin840211/tagscanner';

function calendarDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function getBuildInfo() {
  try {
    const [commit, timestamp] = execFileSync('git', ['log', '-1', '--format=%H%n%cI'], {
      encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split(/\r?\n/);
    const date = new Date(timestamp);
    if (/^[0-9a-f]{40}$/.test(commit) && Number.isFinite(date.getTime())) {
      return { commit, shortHash: commit.slice(0, 7), date: calendarDate(date) };
    }
  } catch {
    // Source archives can be built without Git metadata.
  }
  return { commit: '', shortHash: '', date: calendarDate(new Date()) };
}
