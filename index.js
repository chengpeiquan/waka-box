require("dotenv").config();
const { WakaTimeClient, RANGE } = require("wakatime-client");
const Octokit = require("@octokit/rest");

const {
  GIST_ID: gistId,
  GH_TOKEN: githubToken,
  WAKATIME_API_KEY: wakatimeApiKey
} = process.env;

const wakatime = new WakaTimeClient(wakatimeApiKey);

const octokit = new Octokit({ auth: `token ${githubToken}` });

async function main() {
  const stats = await wakatime.getMyStats({ range: RANGE.LAST_7_DAYS });
  await updateGist(stats);
}

function trimRightStr(str, len) {
  // Ellipsis takes 3 positions, so the index of substring is 0 to total length - 3.
  return str.length > len ? str.substring(0, len - 3) + "..." : str;
}

async function updateGist(stats) {
  let gist;
  try {
    gist = await octokit.gists.get({ gist_id: gistId });
  } catch (error) {
    console.error(`Unable to get gist\n${error}`);
  }

  // Replace the Other language to be my most used language.
  (() => {
    const list = stats.data.languages;
    const otherIndex = list.findIndex(lang => lang.name === "Other");
    const tsIndex = list.findIndex(lang => lang.name === "TypeScript");

    if (otherIndex === -1 || tsIndex === -1) return;
    const ohter = list[otherIndex];
    const ts = list[tsIndex];

    // Merge the time.
    ts.hours += ohter.hours;
    ts.minutes += ohter.minutes;
    if (ts.minutes >= 60) {
      ts.minutes = ts.minutes - 60;
      ++ts.hours;
    }

    // Update total.
    ts.digital = `${ts.hours}:${ts.minutes}`;
    ts.text = `${ts.hours} hrs ${ts.minutes} mins`;
    ts.total_seconds += ohter.total_seconds;
    ts.percent += ohter.percent;

    // Remove the Other language.
    stats.data.languages.splice(otherIndex, 1);

    // Resort the list.
    stats.data.languages.sort((a, b) => b.total_seconds - a.total_seconds);
  })();

  const lines = [];
  for (let i = 0; i < Math.min(stats.data.languages.length, 5); i++) {
    const data = stats.data.languages[i];
    const { name, percent, text: time } = data;

    const line = [
      trimRightStr(name, 10).padEnd(10),
      time.padEnd(14),
      generateBarChart(percent, 20),
      String(percent.toFixed(1)).padStart(5) + "%"
    ];

    lines.push(line.join(" "));
  }

  if (lines.length == 0) return;

  try {
    // Get original filename to update that same file
    const filename = Object.keys(gist.data.files)[0];
    await octokit.gists.update({
      gist_id: gistId,
      files: {
        [filename]: {
          filename: `📊 Weekly development breakdown`,
          content: lines.join("\n")
        }
      }
    });
  } catch (error) {
    console.error(`Unable to update gist\n${error}`);
  }
}

function generateBarChart(percent, size) {
  const syms = "░▏▎▍▌▋▊▉█";

  const frac = Math.floor((size * 8 * percent) / 100);
  const barsFull = Math.floor(frac / 8);
  if (barsFull >= size) {
    return syms.substring(8, 9).repeat(size);
  }
  const semi = frac % 8;

  return [syms.substring(8, 9).repeat(barsFull), syms.substring(semi, semi + 1)]
    .join("")
    .padEnd(size, syms.substring(0, 1));
}

(async () => {
  await main();
})();
