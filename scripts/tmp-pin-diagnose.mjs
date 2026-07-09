// scroll pin 连带问题诊断一次性脚本,验证后删除本文件
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// A. 直接进 /work,分步滚动观测
await page.goto("http://localhost:3000/work", { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

const info = await page.evaluate(() => ({
  totalHeight: document.documentElement.scrollHeight,
  hasPinSpacer: Boolean(document.querySelector(".pin-spacer")),
}));
console.log(`A. /work total height: ${info.totalHeight}, pin-spacer: ${info.hasPinSpacer}`);

for (const y of [0, 600, 1500, 2500, 3500, 4500]) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await new Promise((r) => setTimeout(r, 700));
  const state = await page.evaluate(() => {
    const stage = document.querySelector("[data-stage]");
    const footer = document.querySelector("footer");
    const sr = stage.getBoundingClientRect();
    const fr = footer.getBoundingClientRect();
    const currentName = document.querySelector("[data-gallery-name].text-foreground a");
    return {
      scrollY: Math.round(window.scrollY),
      stageTop: Math.round(sr.top),
      stageVisible: sr.bottom > 0 && sr.top < 900,
      footerTop: Math.round(fr.top),
      footerOverStage: fr.top < sr.bottom && sr.bottom > 0 && sr.top < 900 && fr.top < 900,
      current: currentName ? currentName.textContent : "?",
    };
  });
  console.log(`  scrollY=${state.scrollY} stageTop=${state.stageTop} visible=${state.stageVisible} footerTop=${state.footerTop} footerOverlap=${state.footerOverStage} current="${state.current}"`);
}

// B. pin 途中切页:检查残留与新页状态
await page.evaluate(() => window.scrollTo(0, 1500));
await new Promise((r) => setTimeout(r, 500));
const blogLink = await page.$('header nav a[href="/blog"]');
await blogLink.click();
await new Promise((r) => setTimeout(r, 3000));
const afterNav = await page.evaluate(() => ({
  url: location.pathname,
  scrollY: Math.round(window.scrollY),
  pinSpacerLeft: Boolean(document.querySelector(".pin-spacer")),
  bodyStyle: document.body.getAttribute("style") ?? "none",
  htmlStyle: document.documentElement.getAttribute("style") ?? "none",
  blogTitleVisible: (() => { const h = document.querySelector("h1"); return h && h.getBoundingClientRect().top < 900; })(),
}));
console.log(`B. after mid-pin nav: url=${afterNav.url} scrollY=${afterNav.scrollY} pinSpacerLeft=${afterNav.pinSpacerLeft}`);
console.log(`   body style: ${afterNav.bodyStyle}`);
console.log(`   html style: ${afterNav.htmlStyle}`);
console.log(`   blog h1 in viewport: ${afterNav.blogTitleVisible}`);

// C. 客户端导航回 /work:pin 是否仍工作
const workLink = await page.$('header nav a[href="/work"]');
await workLink.click();
await new Promise((r) => setTimeout(r, 3000));
const backState = await page.evaluate(() => ({
  url: location.pathname,
  totalHeight: document.documentElement.scrollHeight,
  pinSpacer: Boolean(document.querySelector(".pin-spacer")),
  scrollY: Math.round(window.scrollY),
}));
console.log(`C. back on /work: height=${backState.totalHeight} pinSpacer=${backState.pinSpacer} scrollY=${backState.scrollY}`);
await page.evaluate(() => window.scrollTo(0, 1500));
await new Promise((r) => setTimeout(r, 800));
const pinWorks = await page.evaluate(() => {
  const stage = document.querySelector("[data-stage]");
  const currentName = document.querySelector("[data-gallery-name].text-foreground a");
  return { stageTop: Math.round(stage.getBoundingClientRect().top), current: currentName ? currentName.textContent : "?" };
});
console.log(`   after scroll 1500: stageTop=${pinWorks.stageTop} current="${pinWorks.current}"`);

console.log(`page errors: ${errors.length === 0 ? "none" : errors.join(" | ")}`);
await browser.close();
