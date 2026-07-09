// /work 无法导航出去的聚焦诊断一次性脚本,验证后删除本文件
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on("pageerror", (e) => console.log(`PAGEERROR: ${e}`));
page.on("console", (m) => {
  const t = m.text();
  if (!t.includes("Download the React DevTools")) console.log(`CONSOLE[${m.type()}]: ${t}`);
});

await page.goto("http://localhost:3000/work", { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// 在页面里记录 revealer transform 采样 + 点击事件是否被拦截
await page.evaluate(() => {
  window.__log = [];
  const el = document.querySelector("[data-revealer]");
  setInterval(() => {
    window.__log.push(`${Date.now() % 100000} t=${getComputedStyle(el).transform.slice(0, 40)} url=${location.pathname}`);
  }, 200);
  document.addEventListener(
    "click",
    (e) => {
      window.__log.push(`CLICK defaultPrevented=${e.defaultPrevented} target=${e.target.tagName}`);
    },
    false, // 冒泡末端:看 revealer 捕获层是否已 preventDefault
  );
});

// 复现失败场景:先滚到 pin 中段,再点击导航
await page.evaluate(() => window.scrollTo(0, 1500));
await new Promise((r) => setTimeout(r, 700));
const blogLink = await page.$('header nav a[href="/blog"]');
await blogLink.click();
await new Promise((r) => setTimeout(r, 4000));

const log = await page.evaluate(() => window.__log.slice(-22));
console.log(log.join("\n"));
console.log(`final url: ${page.url()}`);
await browser.close();
