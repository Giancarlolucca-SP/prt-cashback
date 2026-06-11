#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_EMAIL || "dono@gt3.local";
const password = process.env.QA_PASSWORD || "Gt3@2026dev";
const edgePath = process.env.QA_BROWSER_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const screenshotDir = resolve(process.cwd(), ".qa-screenshots");

const routes = [
  "/login",
  "/preview",
  "/resultados",
  "/leads",
  "/clientes",
  "/estoque",
  "/administrativo",
  "/configuracoes",
  "/auditoria",
];

const viewports = [
  { height: 900, label: "desktop", width: 1440 },
  { height: 844, label: "mobile", width: 390 },
];

async function readiness() {
  const response = await fetch(`${apiBaseUrl}/health/ready`);
  if (!response.ok) {
    throw new Error(`/health/ready returned ${response.status}`);
  }
}

function slug(route) {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/[^a-z0-9-]+/gi, "-");
}

function isKnownDevConsoleNoise(text) {
  return (
    text.includes("eval() is not supported in this environment") ||
    text.includes("React requires eval() in development mode") ||
    text.includes("React will never use eval() in production mode") ||
    text.includes("Failed to load resource: the server responded with a status of 404")
  );
}

async function login(page) {
  await page.goto(`${webBaseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function checkPage(page, route, viewportLabel) {
  const response = await page.goto(`${webBaseUrl}${route}`, { waitUntil: "networkidle" });
  if (!response?.ok()) {
    throw new Error(`${route} returned ${response?.status() ?? "no response"}`);
  }

  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => ({
    bodyTextLength: document.body.innerText.trim().length,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  if (metrics.bodyTextLength < 40) {
    throw new Error(`${route} rendered too little text`);
  }

  if (metrics.scrollWidth > metrics.clientWidth + 2) {
    throw new Error(`${route} has horizontal overflow on ${viewportLabel}: ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
  }

  await page.screenshot({
    fullPage: true,
    path: resolve(screenshotDir, `${viewportLabel}-${slug(route)}.png`),
  });
}

async function main() {
  await readiness();
  mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
  });

  const consoleErrors = [];
  const responseErrors = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error" && !isKnownDevConsoleNoise(message.text())) {
          consoleErrors.push(`${viewport.label}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        consoleErrors.push(`${viewport.label}: ${error.message}`);
      });
      page.on("response", (response) => {
        const status = response.status();
        const url = response.url();
        if (status >= 400 && !url.includes("/favicon.ico")) {
          responseErrors.push(`${viewport.label}: ${status} ${url}`);
        }
      });

      await login(page);

      for (const route of routes) {
        await checkPage(page, route, viewport.label);
      }

      const themeButton = page.getByRole("button", { name: /tema|theme|claro|escuro/i }).first();
      if (await themeButton.count()) {
        await themeButton.click();
        await page.waitForTimeout(250);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Console/page errors detected:\n${consoleErrors.slice(0, 10).join("\n")}`);
  }
  if (responseErrors.length > 0) {
    throw new Error(`HTTP errors detected:\n${responseErrors.slice(0, 10).join("\n")}`);
  }

  console.log("qa:visual:local ok");
  console.log(`- routes: ${routes.length}`);
  console.log(`- viewports: ${viewports.map((item) => `${item.label}:${item.width}x${item.height}`).join(", ")}`);
  console.log(`- screenshots: ${screenshotDir}`);
}

main().catch((error) => {
  console.error("qa:visual:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
