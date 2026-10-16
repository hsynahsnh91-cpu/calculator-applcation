// Optional browser QA: supply PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE, or install
// playwright-core and @sparticuz/chromium locally without changing package.json.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright-core"
);
const bundled = process.env.CHROMIUM_EXECUTABLE
  ? null
  : (await import(process.env.CHROMIUM_MODULE || "@sparticuz/chromium"))
      .default;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_EXECUTABLE || (await bundled.executablePath()),
  args: bundled?.args || ["--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const url = process.env.APP_URL || "http://127.0.0.1:5173/";
const ownOrigin = new URL(url).origin;
const output = pathToFileURL(
  path.resolve(process.env.TEST_OUTPUT ?? "test-results") + path.sep,
);
await mkdir(output, { recursive: true });
const errors = [],
  external = [],
  results = [];
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
await context.route("**/*", (route) => {
  const request = route.request().url();
  if (
    /^https?:/.test(request) &&
    (ownOrigin === "null" || new URL(request).origin !== ownOrigin)
  ) {
    external.push(request);
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (event) => {
  if (event.type() === "error") errors.push(event.text());
});
page.setDefaultTimeout(12000);
async function test(name, run) {
  try {
    await run();
    results.push({ name, pass: true });
    console.log("PASS", name);
  } catch (error) {
    results.push({ name, pass: false, error: String(error) });
    console.error("FAIL", name, error);
    await page
      .screenshot({
        path: fileURLToPath(new URL(`failure-${results.length}.png`, output)),
        fullPage: true,
      })
      .catch(() => {});
    for (let index = 0; index < 3; index++)
      await page.keyboard.press("Escape").catch(() => {});
  }
}
async function tool(name) {
  await page
    .getByRole("button", { name: "فتح أدوات السؤال", exact: true })
    .click();
  await page.getByRole("menuitem", { name, exact: false }).click();
}
async function fresh() {
  if (await page.getByRole("dialog").count())
    await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "محادثة جديدة", exact: true }).click();
}
async function lastTurn() {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("pro_calc_conversation_v1") || "[]").at(-1),
  );
}
async function solve(question) {
  const count = await page.locator(".assistant-message").count();
  await page.locator(".smart-prompt").fill(question);
  await page
    .getByRole("button", { name: "إرسال المسألة", exact: true })
    .click();
  await page.waitForFunction(
    (previous) =>
      document.querySelectorAll(".assistant-message").length > previous,
    count,
  );
  return lastTurn();
}
async function completeAnswer() {
  await page
    .locator(".assistant-message")
    .last()
    .locator(".steps-block")
    .waitFor();
  await page
    .locator(".assistant-message")
    .last()
    .locator(".follow-ups")
    .waitFor();
  await page.waitForFunction(() => {
    const p = [
      ...document.querySelectorAll(".assistant-message .answer-intro"),
    ].at(-1);
    return p?.textContent === p?.getAttribute("aria-label");
  });
  const visuals = (await lastTurn()).answer.results.reduce(
    (sum, result) => sum + result.visuals.length,
    0,
  );
  if (visuals)
    await page.waitForFunction(
      (count) =>
        [...document.querySelectorAll(".assistant-message")]
          .at(-1)
          .querySelectorAll(".answer-visual").length >= count,
      visuals,
    );
}
async function cleanMath() {
  assert.equal(await page.locator(".katex-error").count(), 0);
  assert(
    !(await page.locator("main").innerText()).includes(
      "تعذّر عرض الصيغة الرياضية",
    ),
  );
}
const acceptance = [
  ["جد مشتق f(x)=x^3-3x+1 ونظّم جدول تغيراته", "calculusEngine", "3"],
  ["حل المعادلة 2x^2-5x+3=0", "equationSolver", "\\frac{3}{2}"],
  ["احسب تكامل x e^x من 0 إلى 1", "integrationEngine", "= 1"],
  ["جد نهاية (x^2-1)/(x-1) عندما x تؤول إلى 1", "limitsEngine", "= 2"],
  ["جد محدد ومقلوب المصفوفة [[1,2],[3,4]]", "matricesEngine", "-2"],
  ["حل المعادلة z^2+2z+5=0 في مجموعة الأعداد العقدية", "complexTools", "2i"],
  [
    "كيس فيه 3 كرات حمراء و5 بيضاء سُحبت كرتان معًا، جد احتمال أن تكونا مختلفتي اللون",
    "probabilityEngine",
    "{15}{28}",
  ],
  [
    "متتالية حسابية حدها الأول 3 وأساسها 4، جد مجموع أول 20 حدًا",
    "sequences",
    "820",
  ],
  [
    "جد المسافة بين النقطة A(1,2,3) والمستوي 2x-y+2z-5=0",
    "geometryEngine",
    "{1}{3}",
  ],
  ["احسب sin(30°)+√2", "mathEngine", "\\sqrt{2}"],
];
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await test("single RTL conversation; no header, section pages, or bottom navigation", async () => {
  assert.equal(await page.locator("html").getAttribute("lang"), "ar");
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
  assert.equal(await page.locator("header, nav").count(), 0);
  assert.equal(await page.locator(".smart-prompt").count(), 1);
  assert((await page.locator("h1").innerText()).includes("ماذا يدور في ذهنك؟"));
  assert.equal(
    await page.getByRole("button", { name: /إملاء صوتي/ }).count(),
    0,
  );
  assert(
    await page.evaluate(() => document.fonts.check("400 16px Cairo", "مرحبًا")),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("welcome-desktop.png", output)),
    fullPage: true,
  });
});
await test("editable name is stored only locally", async () => {
  await page.getByRole("button", { name: "صديقي", exact: true }).click();
  await page.getByRole("textbox", { name: "اسمك", exact: true }).fill("نورا");
  await page.getByRole("button", { name: "حفظ الاسم", exact: true }).click();
  await page.reload();
  assert(
    await page.getByRole("button", { name: "نورا", exact: true }).isVisible(),
  );
});
for (const [index, [question, engine, expected]] of acceptance.entries())
  await test(`browser acceptance ${index + 1}: ${engine}`, async () => {
    const turn = await solve(question);
    assert.equal(
      turn.answer.unsolved.length,
      0,
      JSON.stringify(turn.answer.unsolved),
    );
    assert.deepEqual(
      turn.answer.results.map((result) => result.engine),
      [engine],
    );
    assert(turn.answer.results[0].finalLatex.includes(expected));
    assert(turn.answer.results[0].verification.passed);
    assert(
      await page
        .locator(".assistant-message")
        .last()
        .locator(".final-answer .katex")
        .count(),
    );
    await cleanMath();
    if (index === 0) {
      await page
        .locator(".assistant-message")
        .last()
        .locator("svg[role=img]")
        .waitFor();
      assert.equal(
        await page
          .locator(".assistant-message")
          .last()
          .getByText("جدول التغيرات", { exact: true })
          .count(),
        1,
      );
      await page.screenshot({
        path: fileURLToPath(new URL("derivative-desktop.png", output)),
        fullPage: true,
      });
    }
    if (index === 6) {
      await page
        .locator(".assistant-message")
        .last()
        .locator(".probability-tree")
        .waitFor();
      assert(
        (await page
          .locator(".assistant-message")
          .last()
          .locator(".tree-node")
          .count()) > 4,
      );
    }
  });
await test("answer order is final → steps → applicable visuals → suggestions", async () => {
  const answer = page.locator(".assistant-message").first();
  assert(
    await answer
      .locator(".final-answer")
      .evaluate(
        (element) =>
          !!(
            element.compareDocumentPosition(
              element.parentElement.querySelector(".steps-block"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
  );
  assert(
    await answer
      .locator(".steps-block")
      .evaluate(
        (element) =>
          !!(
            element.compareDocumentPosition(
              element.parentElement.querySelector(".answer-visual"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
  );
  assert(await answer.locator(".follow-ups").count());
});
await test("manual save, guarded history, and a nested confirmation Escape", async () => {
  await page
    .locator(".assistant-message")
    .last()
    .getByRole("button", { name: "حفظ في السجل", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pro_calc_history_v2")).length,
    ),
    1,
  );
  await tool("السجل");
  await page.getByRole("dialog", { name: "السجل", exact: true }).waitFor();
  await page.getByRole("button", { name: "مسح الكل", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 2);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelectorAll("[role=dialog]").length === 1,
  );
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    "hidden",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
});
await test("copy action uses the composed answer and solution text", async () => {
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedAnswer = text;
        },
      },
    }),
  );
  await page
    .locator(".assistant-message")
    .last()
    .getByRole("button", { name: "نسخ الجواب", exact: true })
    .click();
  assert(
    (await page.evaluate(() => window.__copiedAnswer)).includes("خطوات") ||
      (await page.evaluate(() => window.__copiedAnswer)).includes(
        "الحساب والتبسيط",
      ),
  );
});
await test("conversation and context survive reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".assistant-message").count(), 10);
  await cleanMath();
});
await test("new conversation resets the shared function but keeps saved history", async () => {
  await fresh();
  assert.equal(await page.locator(".assistant-message").count(), 0);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pro_calc_history_v2")).length,
    ),
    1,
  );
  const turn = await solve("ارسم المنحنى");
  assert.equal(turn.answer.results.length, 0);
  assert(turn.answer.unsolved.length);
});
await test("physical ^ creates an editable exponent, not visible raw notation", async () => {
  await fresh();
  await page.locator(".smart-prompt").click();
  await page.keyboard.insertText("جد مشتق f(x)=x");
  await page.keyboard.type("^3");
  assert.equal(await page.locator(".smart-prompt math-field").count(), 1);
  assert.equal(
    await page
      .locator(".smart-prompt math-field")
      .evaluate((field) => field.value),
    "x^3",
  );
  assert(!(await page.locator(".smart-prompt").innerText()).includes("^"));
  await page.screenshot({
    path: fileURLToPath(new URL("editable-exponent.png", output)),
    fullPage: true,
  });
  await page.keyboard.press("Space");
  await page.keyboard.insertText("-3x+1");
  await page.keyboard.press("Enter");
  await page.locator(".assistant-message .final-answer").waitFor();
  const turn = await lastTurn();
  assert(turn.answer.results[0].verification.passed);
  await cleanMath();
});
await test("Shift+Enter creates a new line without sending, including inside math", async () => {
  await fresh();
  await page.locator(".smart-prompt").click();
  await page.keyboard.insertText("السطر الأول");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.insertText("السطر الثاني");
  assert((await page.locator(".smart-prompt").innerText()).includes("\n"));
  assert.equal(await page.locator(".assistant-message").count(), 0);
  await page.locator(".smart-prompt").fill("x");
  await page.keyboard.type("^2");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.insertText("سطر جديد");
  assert((await page.locator(".smart-prompt").innerText()).includes("\n"));
  assert.equal(await page.locator(".assistant-message").count(), 0);
});
await test("mathematical keypad inserts a genuine fraction in the mixed composer", async () => {
  await fresh();
  await page.locator(".smart-prompt").fill("احسب ");
  await tool("لوحة المفاتيح الرياضية");
  await page.locator(".chat-modal math-field").evaluate((field) => {
    field.value = "\\frac{1}{2}";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page
    .getByRole("button", { name: "إدراج في السؤال", exact: true })
    .click();
  assert.equal(await page.locator(".smart-prompt math-field").count(), 1);
  await page
    .getByRole("button", { name: "إرسال المسألة", exact: true })
    .click();
  await page.locator(".assistant-message .final-answer").waitFor();
  assert.equal(Number((await lastTurn()).answer.results[0].decimal), 0.5);
  await cleanMath();
});
await test("local formula bank is a modal, not a navigation page", async () => {
  await tool("بنك القوانين");
  await page
    .getByRole("dialog", { name: "بنك القوانين", exact: true })
    .waitFor();
  await page.locator(".chat-modal .katex").first().waitFor();
  assert((await page.locator(".chat-modal .katex").count()) > 0);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".smart-prompt").count(), 1);
});
await test("menu arrows, modal focus trap, and reduced-motion preferences", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "فتح أدوات السؤال", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.evaluate(() => document.activeElement.getAttribute("role")),
    "menuitem",
  );
  await page.keyboard.press("Escape");
  await tool("بنك القوانين");
  const dialog = page.getByRole("dialog", {
    name: "بنك القوانين",
    exact: true,
  });
  const selectors =
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
  const elements = dialog.locator(selectors).filter({ visible: true });
  await elements.last().focus();
  await page.keyboard.press("Tab");
  assert(
    await elements
      .first()
      .evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.press("Shift+Tab");
  assert(
    await elements
      .last()
      .evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.press("Escape");
  assert(
    await page
      .getByRole("button", { name: "فتح أدوات السؤال", exact: true })
      .evaluate((element) => element === document.activeElement),
  );
  assert(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
});
await test("angle selection persists and affects only unmarked scientific angles", async () => {
  await page.getByRole("button", { name: "فتح أدوات السؤال" }).click();
  await page.getByRole("button", { name: "GRAD", exact: true }).click();
  await page.keyboard.press("Escape");
  const turn = await solve("احسب sin(100)");
  assert.equal(Number(turn.answer.results[0].decimal), 1);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pro_calc_settings")).angleMode,
    ),
    "GRAD",
  );
  await page.getByRole("button", { name: "فتح أدوات السؤال" }).click();
  await page.getByRole("button", { name: "DEG", exact: true }).click();
  await page.keyboard.press("Escape");
});
await test("compound request shares its definition and retains partial success", async () => {
  await fresh();
  const turn = await solve(
    "لتكن f(x)=x^2\nأ) جد مشتقتها\nب) احسب تكامل مشتقتها من 0 إلى 1\nج) احسب تكامل 1/x من -1 إلى 1",
  );
  assert.deepEqual(
    turn.answer.results.map((result) => result.engine),
    ["calculusEngine", "integrationEngine"],
  );
  assert.equal(turn.answer.unsolved.length, 1);
  assert.equal(turn.answer.results[1].decimal, 1);
  assert(await page.locator(".final-answer").count());
  assert(await page.locator(".clarification-card").count());
});
await test("follow-up buttons are live and use the current conversation context", async () => {
  const before = await page.locator(".assistant-message").count();
  await page
    .locator(".assistant-message")
    .last()
    .getByRole("button", { name: "ارسم المنحنى", exact: true })
    .click();
  await page.waitForFunction(
    (previous) =>
      document.querySelectorAll(".assistant-message").length > previous,
    before,
  );
  const turn = await lastTurn();
  assert.equal(turn.answer.results[0].engine, "calculusEngine");
  assert.equal(turn.answer.unsolved.length, 0);
});
await test("clear conversation is explicit and does not delete saved history", async () => {
  await tool("مسح المحادثة");
  await page
    .getByRole("button", { name: "نعم، امسح المحادثة", exact: true })
    .click();
  assert.equal(await page.locator(".assistant-message").count(), 0);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pro_calc_history_v2")).length,
    ),
    1,
  );
});
await test("phone and narrow viewport have no horizontal document overflow", async () => {
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await page.screenshot({
    path: fileURLToPath(new URL("welcome-mobile.png", output)),
    fullPage: true,
  });
  await page.getByRole("button", { name: "فتح أدوات السؤال" }).click();
  const box = await page.locator(".tools-menu").boundingBox();
  assert(box.y >= 0);
  assert(box.x >= 0);
  assert(box.x + box.width <= 391);
  await page.screenshot({
    path: fileURLToPath(new URL("tools-mobile.png", output)),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await solve(
    "جد محدد ومقلوب المصفوفة [[1,2,0,1],[0,1,2,3],[1,0,1,0],[2,1,0,1]]",
  );
  await cleanMath();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
});
await test("unwanted solving/composer captions are absent; keyboard shortcuts are retained", async () => {
  await fresh();
  assert.equal(await page.locator(".composer-caption").count(), 0);
  await solve("احسب 2+2");
  assert.equal(await page.locator(".answer-timing").count(), 0);
  const text = await page.locator("body").innerText();
  for (const phrase of [
    "حل محلي",
    "Enter للإرسال",
    "Shift+Enter لسطر جديد",
    "محلي بالكامل · بدون إنترنت",
  ])
    assert(!text.includes(phrase));
});
await test("three exact complex forms stack on a narrow phone without document overflow", async () => {
  await fresh();
  await page.setViewportSize({ width: 360, height: 844 });
  const turn = await solve("اكتب الأشكال الثلاثة للعدد العقدي z=1+i");
  assert.equal(turn.answer.unsolved.length, 0);
  const cards = page
    .locator(".assistant-message")
    .last()
    .locator(".complex-form-card");
  await cards.nth(2).waitFor();
  assert.equal(await cards.count(), 3);
  const boxes = await cards.evaluateAll((items) =>
    items.map((item) => {
      const r = item.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width };
    }),
  );
  assert(boxes[1].y > boxes[0].y && boxes[2].y > boxes[1].y);
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await cleanMath();
  await page.screenshot({
    path: fileURLToPath(new URL("complex-forms-mobile.png", output)),
    fullPage: true,
  });
});
await test("complex forms and aliases survive reload, and conjugate follow-up is live", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".complex-form-card").nth(2).waitFor();
  const count = await page.locator(".assistant-message").count();
  await page
    .locator(".assistant-message")
    .last()
    .getByRole("button", { name: "جد مرافقه", exact: true })
    .click();
  await page.waitForFunction(
    (n) => document.querySelectorAll(".assistant-message").length > n,
    count,
  );
  const turn = await lastTurn();
  assert.equal(turn.answer.unsolved.length, 0);
  assert.match(turn.answer.results[0].finalLatex, /1 - i/);
});
await test("Euler exponential gives the correct exact real and imaginary parts in the Worker", async () => {
  await fresh();
  const turn = await solve("احسب e^(i*pi/3) باستخدام قانون أويلر");
  assert.equal(turn.answer.unsolved.length, 0);
  assert(turn.answer.results[0].verification.passed);
  assert.match(turn.answer.results[0].finalLatex, /frac\{1\}\{2\}.*sqrt\{3\}/);
  await cleanMath();
});
await test("large De Moivre powers stay compact and never overflow the mobile answer", async () => {
  await fresh();
  const turn = await solve("احسب z^2024 بديموافر حيث z=1+i");
  assert.equal(turn.answer.unsolved.length, 0);
  assert.match(turn.answer.results[0].finalLatex, /2.*1012/);
  assert(turn.answer.results[0].finalLatex.length < 100);
  assert(turn.answer.results[0].verification.passed);
  await cleanMath();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await completeAnswer();
  await page.screenshot({
    path: fileURLToPath(new URL("demoivre-mobile.png", output)),
    fullPage: true,
  });
});
await test("multiple-angle and power-reduction identities are genuine mobile KaTeX", async () => {
  await fresh();
  for (const question of [
    "بسط cos(3theta) وsin(3theta) بديموافر",
    "بسط cos(theta)^2 باستخدام أويلر",
  ]) {
    const turn = await solve(question);
    assert.equal(turn.answer.unsolved.length, 0);
    assert(turn.answer.results[0].verification.passed);
    assert(!turn.answer.results[0].finalLatex.includes("${"));
    await cleanMath();
  }
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await completeAnswer();
  await page.screenshot({
    path: fileURLToPath(new URL("trig-mobile.png", output)),
    fullPage: true,
  });
});
await test("negative discriminant is impossible in R; an explicit follow-up solves it in C", async () => {
  await fresh();
  const real = await solve("حل المعادلة x^2+1=0 في الأعداد الحقيقية");
  assert.equal(real.answer.results[0].engine, "equationSolver");
  assert(
    (await page.locator(".final-answer").innerText())
      .replace(/[\s\u200b-\u200f]+/g, "")
      .includes("مستحيلةالحل"),
  );
  assert(!real.answer.results[0].verification.passed);
  await completeAnswer();
  await page.screenshot({
    path: fileURLToPath(new URL("real-domain-mobile.png", output)),
    fullPage: true,
  });
  const count = await page.locator(".assistant-message").count();
  await page
    .locator(".assistant-message")
    .last()
    .getByRole("button", { name: /في الأعداد العقدية/ })
    .click();
  await page.waitForFunction(
    (n) => document.querySelectorAll(".assistant-message").length > n,
    count,
  );
  const complex = await lastTurn();
  assert.equal(complex.answer.results[0].engine, "complexTools");
  assert(complex.answer.results[0].verification.passed);
  assert.match(complex.answer.results[0].finalLatex, /i/);
  await cleanMath();
});
await test("complex plane distance and three-point ratio angles use arrowed segments", async () => {
  await fresh();
  const distance = await solve("احسب المسافة بين A(1,2) وB(4,6)");
  assert.match(distance.answer.results[0].finalLatex, /AB=.*=5$/);
  let svg = page.locator(".assistant-message").last().locator("svg[role=img]");
  await svg.waitFor();
  assert(await svg.locator("line[marker-end]").count());
  const angle = await solve(
    "احسب زاوية BAC في المستوي العقدي z_A=1+i وz_B=2+i وz_C=1+2i",
  );
  assert.equal(angle.answer.unsolved.length, 0);
  assert(angle.answer.results[0].verification.passed);
  assert.match(angle.answer.results[0].finalLatex, /z_C-z_A.*z_B-z_A/);
  await cleanMath();
});
await test("translation, homothety and centered rotation produce checked image coordinates", async () => {
  await fresh();
  for (const [question, re, im] of [
    ["انسحاب z=1+i بشعاع b=2-i", 3, 0],
    ["تحاكي z=2+i مركزه omega=1 ونسبته k=-2", -1, -2],
    ["دوران z=1+i حول المبدأ بزاوية 90 درجة", -1, 1],
  ]) {
    const turn = await solve(question);
    assert.equal(turn.answer.unsolved.length, 0);
    const result = turn.answer.results[0];
    assert(result.verification.passed);
    const point = result.visuals
      .find((v) => v.kind === "complex")
      .points.find((p) => p.label === "M′");
    assert.equal(point.re, re);
    assert.equal(point.im, im);
    await cleanMath();
  }
  const svg = page
    .locator(".assistant-message")
    .last()
    .locator("svg[role=img]");
  await svg.waitFor();
  assert(await svg.locator("circle[stroke-dasharray]").count());
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await completeAnswer();
  await page.screenshot({
    path: fileURLToPath(new URL("rotation-mobile.png", output)),
    fullPage: true,
  });
});
await test("nth roots lie on the plotted circle, remain reviewable and persist", async () => {
  await fresh();
  const turn = await solve("جد جذور العدد العقدي 1+i حيث n=7");
  const visual = turn.answer.results[0].visuals.find(
    (v) => v.kind === "complex",
  );
  assert.equal(visual.points.length, 7);
  assert(turn.answer.results[0].verification.passed);
  assert(visual.circle.radius > 0);
  for (const point of visual.points)
    assert(
      Math.abs(Math.hypot(point.re, point.im) - visual.circle.radius) < 1e-8,
    );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".assistant-message svg[role=img]").waitFor();
  await cleanMath();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
});
// Probability workbench and cross-tool integration, using the actual bundled Worker.
async function openProbabilityBoard() {
  await fresh();
  await tool("لوحة الاحتمالات والإحصاء");
  await page.getByTestId("probability-board").waitFor();
}
async function submitProbabilityBoard() {
  const before = await page.locator(".assistant-message").count();
  await page
    .getByRole("button", { name: "حل في المحادثة", exact: true })
    .click();
  await page.waitForFunction(
    (previous) =>
      document.querySelectorAll(".assistant-message").length > previous,
    before,
  );
  await completeAnswer();
  return lastTurn();
}
const boardMath = async (selector) =>
  page
    .locator(selector)
    .locator('annotation[encoding="application/x-tex"]')
    .allTextContents();
await test("probability board is quiet and on demand, not a restored section page", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await page.getByTestId("probability-board").count(), 0);
  await openProbabilityBoard();
  assert.equal(
    await page
      .getByRole("dialog", { name: "لوحة الاحتمالات والإحصاء", exact: true })
      .count(),
    1,
  );
  assert(
    (await page
      .getByRole("tab", { name: "السحب", exact: true })
      .getAttribute("aria-selected")) === "true",
  );
  assert((await boardMath(".probability-space")).join("").includes("28"));
  assert.equal(
    await page.getByRole("tab", { name: "الأحداث", exact: true }).count(),
    1,
  );
  assert.equal(await page.locator("header,nav.bottom-nav").count(), 0);
  await page.screenshot({
    path: fileURLToPath(new URL("probability-board-desktop.png", output)),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
});
await test("changing the target colour or counts immediately updates p and its colour", async () => {
  await openProbabilityBoard();
  const red = await page
    .getByTestId("target-probability")
    .evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--target-color"),
    );
  await page
    .getByRole("combobox", { name: "اللون المطلوب", exact: true })
    .selectOption("1");
  assert(
    (await boardMath('[data-testid="target-probability"]'))
      .join("")
      .includes("\\frac{5}{8}"),
  );
  const white = await page
    .getByTestId("target-probability")
    .evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--target-color"),
    );
  assert.notEqual(red, white);
  const whiteMath = await page
    .getByTestId("target-probability")
    .locator(".probability-math")
    .evaluate((e) => getComputedStyle(e).color);
  assert.equal(
    whiteMath,
    await page
      .getByTestId("target-probability")
      .locator("i")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  await page
    .getByRole("combobox", { name: "اللون المطلوب", exact: true })
    .selectOption("0");
  const redMath = await page
    .getByTestId("target-probability")
    .locator(".probability-math")
    .evaluate((e) => getComputedStyle(e).color);
  assert.notEqual(redMath, whiteMath);
  assert.equal(
    redMath,
    await page
      .getByTestId("target-probability")
      .locator("i")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  assert.equal(
    await page
      .locator(".probability-live .probability-math")
      .evaluate((e) => getComputedStyle(e).fontSize),
    "16px",
  );
  await page
    .getByRole("combobox", { name: "اللون المطلوب", exact: true })
    .selectOption("1");
  assert.notEqual(
    await page
      .getByTestId("target-probability")
      .locator(".probability-math")
      .evaluate((e) => getComputedStyle(e).color),
    "rgb(203, 212, 223)",
  );
  assert(
    (await page
      .getByTestId("target-probability")
      .locator(".probability-math")
      .evaluate((e) => getComputedStyle(e).fontSize)) === "15px",
  );

  await page
    .getByRole("spinbutton", { name: "عدد كرات بيضاء", exact: true })
    .fill("3");
  assert(
    (await boardMath('[data-testid="target-probability"]'))
      .join("")
      .includes("\\frac{1}{2}"),
  );
  assert((await boardMath(".probability-space")).join("").includes("15"));
  await page.keyboard.press("Escape");
});
await test("all added colours participate in live urn feedback and remain editable", async () => {
  await openProbabilityBoard();
  await page.getByRole("button", { name: "إضافة لون", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "عدد كرات خضراء", exact: true })
    .fill("4");
  await page
    .getByRole("combobox", { name: "اللون المطلوب", exact: true })
    .selectOption("2");
  assert(
    (await boardMath('[data-testid="target-probability"]'))
      .join("")
      .includes("\\frac{1}{3}"),
  );
  await page
    .getByRole("textbox", { name: "اسم اللون 3", exact: true })
    .fill("زرقاء");
  assert(
    (await page.getByTestId("target-probability").innerText()).includes(
      "زرقاء",
    ),
  );
  assert.equal(await page.locator('.urn-bowl [data-color="زرقاء"]').count(), 4);
  await page
    .getByRole("button", { name: "حذف اللون زرقاء", exact: true })
    .click();
  assert.equal(await page.locator(".urn-color-row").count(), 2);
  await page.keyboard.press("Escape");
});
await test("shuffle randomizes only bounded ball positions, never counts or probabilities", async () => {
  await openProbabilityBoard();
  const before = await page
      .locator(".urn-bowl i")
      .evaluateAll((items) => items.map((item) => item.getAttribute("style"))),
    prob = (await boardMath(".probability-live")).join("");
  await page
    .getByRole("button", { name: "إعادة ترتيب الكرات عشوائيًا", exact: true })
    .click();
  const after = await page
    .locator(".urn-bowl i")
    .evaluateAll((items) => items.map((item) => item.getAttribute("style")));
  assert.notDeepEqual(before, after);
  assert.equal(await page.locator('.urn-bowl [data-color="حمراء"]').count(), 3);
  assert.equal(await page.locator('.urn-bowl [data-color="بيضاء"]').count(), 5);
  assert.equal((await boardMath(".probability-live")).join(""), prob);
  await page
    .getByRole("spinbutton", { name: "عدد كرات حمراء", exact: true })
    .fill("10000");
  assert.equal(await page.locator(".urn-bowl i").count(), 80);
  assert(
    (await page.locator(".urn-preview-note").innerText()).includes("نسبية"),
  );
  await page.keyboard.press("Escape");
});
await test("drawing dropdown explains all three counting modes and recomputes n(Omega)", async () => {
  await openProbabilityBoard();
  const modes = page.getByRole("combobox", { name: "نمط السحب", exact: true });
  assert.equal(await modes.locator("option").count(), 3);
  await modes.selectOption("successive_without_rep");
  assert(
    (await page.getByTestId("drawing-explanation").innerText()).includes(
      "تراتيب",
    ),
  );
  assert((await boardMath(".probability-space")).join("").includes("56"));
  await modes.selectOption("successive_with_rep");
  assert(
    (await page.getByTestId("drawing-explanation").innerText()).includes("قوة"),
  );
  assert((await boardMath(".probability-space")).join("").includes("64"));
  await modes.selectOption("simultaneous");
  assert(
    (await page.getByTestId("drawing-explanation").innerText()).includes(
      "توافيق",
    ),
  );
  await page.keyboard.press("Escape");
});
await test("exactly, at least and less-than are distinct live events with ordered wording", async () => {
  await openProbabilityBoard();
  const compare = page.getByRole("combobox", {
    name: "مقارنة العدد",
    exact: true,
  });
  await compare.selectOption("eq");
  assert(
    (await boardMath(".probability-live")).join("").includes("\\frac{15}{28}"),
  );
  await compare.selectOption("ge");
  assert(
    (await boardMath(".probability-live")).join("").includes("\\frac{9}{14}"),
  );
  assert(
    (await page.locator(".probability-event-description").innerText()).endsWith(
      "أو أكثر",
    ),
  );
  await compare.selectOption("lt");
  assert(
    (await boardMath(".probability-live")).join("").includes("\\frac{5}{14}"),
  );
  assert(
    (
      await page.locator(".probability-event-description").innerText()
    ).startsWith("أقل من"),
  );
  assert(
    !/الناجحة|الفاشلة/.test(
      await page.getByTestId("probability-board").innerText(),
    ),
  );
  await page.keyboard.press("Escape");
});
await test("the board inserts a complete editable question without sending it", async () => {
  await openProbabilityBoard();
  await page
    .getByRole("button", { name: "إدراج في السؤال", exact: true })
    .click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator(".assistant-message").count(), 0);
  assert(
    (await page.locator(".smart-prompt").innerText()).includes("الألوان="),
  );
  await page
    .getByRole("button", { name: "إرسال المسألة", exact: true })
    .click();
  await completeAnswer();
  assert(
    Math.abs((await lastTurn()).answer.results[0].decimal - 9 / 14) < 1e-12,
  );
});
await test("direct board solve uses the real Worker and stores structured probability context", async () => {
  await openProbabilityBoard();
  await page
    .getByRole("combobox", { name: "نمط السحب", exact: true })
    .selectOption("successive_with_rep");
  const turn = await submitProbabilityBoard();
  assert(Math.abs(turn.answer.results[0].decimal - 39 / 64) < 1e-12);
  assert(turn.answer.results[0].verification.passed);
  assert.equal(turn.answer.context.probability.urn.mode, "successive_with_rep");
  await cleanMath();
});
await test("an answer opens its own older experiment, not a newer unrelated distribution", async () => {
  await fresh();
  await solve(
    "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين معًا، احسب احتمال اختلاف اللون",
  );
  await completeAnswer();
  await solve("التوزيع الثنائي n=5 p=1/3، احسب P(X=2)");
  await completeAnswer();
  await page
    .locator(".assistant-message")
    .first()
    .getByRole("button", { name: "تعديل تجربة الاحتمالات", exact: true })
    .click();
  await page.getByTestId("probability-board").waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "السحب", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "عدد كرات حمراء", exact: true })
      .inputValue(),
    "3",
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "الحدث المطلوب", exact: true })
      .inputValue(),
    "different",
  );
  await page.keyboard.press("Escape");
});
await test("event controls expose independent and disjoint assumptions only on selection", async () => {
  await openProbabilityBoard();
  await page.getByRole("tab", { name: "الأحداث", exact: true }).click();
  await page
    .getByRole("combobox", { name: "المعلومة عن العلاقة", exact: true })
    .selectOption("disjoint");
  assert.equal(
    await page
      .getByRole("textbox", { name: "احتمال تقاطع A وB", exact: true })
      .count(),
    0,
  );
  const turn = await submitProbabilityBoard();
  assert(Math.abs(turn.answer.results[0].decimal - 5 / 6) < 1e-12);
});
await test("Bayes controls appear immediately and the rendered tree is normalized", async () => {
  await openProbabilityBoard();
  await page.getByRole("tab", { name: "الأحداث", exact: true }).click();
  await page
    .getByRole("combobox", { name: "نوع حساب الأحداث", exact: true })
    .selectOption("mixture");
  assert.equal(
    await page
      .getByRole("textbox", { name: "أوزان الفروع q", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("checkbox", {
      name: "احتمال الفرع بعد وقوع B — بايز",
      exact: true,
    })
    .check();
  assert.equal(
    await page
      .getByRole("textbox", { name: "رقم الفرع H", exact: true })
      .count(),
    1,
  );
  const turn = await submitProbabilityBoard();
  assert(Math.abs(turn.answer.results[0].decimal - 0.5) < 1e-12);
  assert(turn.answer.results[0].verification.passed);
  const tree = turn.answer.results[0].visuals.find((v) => v.kind === "tree");
  assert(tree);
  const visit = (node) => {
    if (node.children?.length) {
      const sum = node.children.reduce((s, c) => {
        const [n, d = 1] = c.probability.split("/").map(Number);
        return s + n / d;
      }, 0);
      assert(Math.abs(sum - 1) < 1e-12);
      node.children.forEach(visit);
    }
  };
  visit(tree.root);
  await page.screenshot({
    path: fileURLToPath(new URL("probability-bayes-desktop.png", output)),
    fullPage: true,
  });
});
await test("a law built in the board has complete moments and a live calculus bridge", async () => {
  await openProbabilityBoard();
  await page.getByRole("tab", { name: "المتحولات", exact: true }).click();
  const math = await boardMath(".probability-help");
  assert(math.includes("X(\\Omega)"));
  assert(!math.some((s) => s.includes("\\\\Omega")));
  let turn = await submitProbabilityBoard();
  assert(turn.answer.results[0].finalLatex.includes("E(X^2)"));
  assert(turn.answer.results[0].verification.passed);
  assert.deepEqual(turn.answer.context.probability.law.values, ["0", "1", "2"]);
  await page
    .getByRole("button", {
      name: "أنشئ الدالة المولدة الاحتمالية",
      exact: true,
    })
    .click();
  await completeAnswer();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("pro_calc_conversation_v1"))
      .at(-1)
      .answer.context.expression?.includes("x"),
  );
  turn = await solve("جد مشتقة الدالة");
  await completeAnswer();
  assert.equal(turn.answer.results[0].engine, "calculusEngine");
});
await test("joint-law controls check every cell rather than confusing zero covariance with independence", async () => {
  await openProbabilityBoard();
  await page.getByRole("tab", { name: "المتحولات", exact: true }).click();
  await page
    .getByRole("combobox", { name: "نوع قانون المتحول", exact: true })
    .selectOption("joint");
  await page
    .getByRole("textbox", { name: "صفوف الجدول المشترك J", exact: true })
    .fill("[1/2,0],[0,1/2]");
  const turn = await submitProbabilityBoard();
  assert(turn.answer.results[0].finalLatex.includes("غير مستقلين"));
  assert(turn.answer.results[0].verification.passed);
});
await test("binomial p changes update the coloured meter without changing the meaning of tails", async () => {
  await openProbabilityBoard();
  await page.getByRole("tab", { name: "التوزيعات", exact: true }).click();
  await page
    .getByRole("textbox", { name: "عدد المحاولات n", exact: true })
    .fill("5");
  await page
    .getByRole("textbox", { name: "احتمال الحدث p", exact: true })
    .fill("1/4");
  await page
    .getByRole("textbox", { name: "حد العدد k", exact: true })
    .fill("2");
  await page
    .getByRole("combobox", { name: "لون الحدث في العرض", exact: true })
    .selectOption("زرقاء");
  assert.equal(
    await page.locator(".probability-p-track>i").evaluate((e) => e.style.width),
    "25%",
  );
  assert(
    (
      await page.locator(".probability-p-track").getAttribute("aria-label")
    ).includes("زرقاء"),
  );
  const turn = await submitProbabilityBoard();
  assert(Math.abs(turn.answer.results[0].decimal - 47 / 128) < 1e-12);
  assert(turn.answer.results[0].verification.passed);
});
await test("statistics produce a real frequency histogram with readable underlying data", async () => {
  await openProbabilityBoard();
  await page.getByRole("tab", { name: "الإحصاء", exact: true }).click();
  await page
    .getByRole("textbox", { name: "قيم البيانات", exact: true })
    .fill("1,2,3");
  await page
    .getByRole("textbox", { name: "التكرارات (اختياري)", exact: true })
    .fill("2,3,1");
  const turn = await submitProbabilityBoard();
  assert(turn.answer.results[0].finalLatex.includes("\\frac{11}{6}"));
  assert(turn.answer.results[0].verification.passed);
  assert.equal(
    await page
      .getByRole("img", { name: "المدرج التكراري", exact: true })
      .count(),
    1,
  );
  const h = turn.answer.results[0].visuals.find((v) => v.kind === "histogram");
  assert.equal(
    h.bins.reduce((sum, b) => sum + b.value, 0),
    6,
  );
  await page.locator(".histogram-data summary").last().click();
  assert(await page.locator(".histogram-data table").last().isVisible());
  await page.screenshot({
    path: fileURLToPath(new URL("statistics-histogram.png", output)),
    fullPage: true,
  });
});
await test("the frequency-table matrix bridge is usable by the existing matrix engine", async () => {
  await openProbabilityBoard();
  await page.getByRole("tab", { name: "الإحصاء", exact: true }).click();
  await page
    .getByRole("textbox", { name: "قيم البيانات", exact: true })
    .fill("1,2");
  await page
    .getByRole("textbox", { name: "التكرارات (اختياري)", exact: true })
    .fill("2,3");
  await page
    .getByRole("checkbox", {
      name: "ربط جدول التكرارات بأدوات المصفوفات",
      exact: true,
    })
    .check();
  let turn = await submitProbabilityBoard();
  assert.deepEqual(turn.answer.context.matrix, [
    [1, 2],
    [2, 3],
  ]);
  turn = await solve("جد محدد المصفوفة");
  await completeAnswer();
  assert.equal(turn.answer.results[0].engine, "matricesEngine");
  assert(turn.answer.results[0].finalLatex.includes("-1"));
});
await test("ordered urn conditional controls calculate the correct restricted space", async () => {
  await openProbabilityBoard();
  await page
    .getByRole("combobox", { name: "نمط السحب", exact: true })
    .selectOption("successive_without_rep");
  await page
    .getByRole("combobox", { name: "الحدث المطلوب", exact: true })
    .selectOption("ordered");
  await page
    .getByRole("combobox", { name: "لون الأولى", exact: true })
    .selectOption("بيضاء");
  await page
    .getByRole("combobox", { name: "لون الثانية", exact: true })
    .selectOption("حمراء");
  await page
    .getByRole("combobox", { name: "الشرط المرصود", exact: true })
    .selectOption("first");
  const turn = await submitProbabilityBoard();
  assert(Math.abs(turn.answer.results[0].decimal - 3 / 7) < 1e-12);
  assert(
    turn.answer.results[0].steps.some(
      (s) => s.title === "الفضاء العيني المشروط",
    ),
  );
});
await test("invalid urn controls never show a stale live probability or allow a solve", async () => {
  await openProbabilityBoard();
  await page
    .getByRole("textbox", { name: "عدد الكرات المسحوبة r", exact: true })
    .fill("9");
  assert.equal(await page.getByTestId("live-event-probability").count(), 0);
  assert(
    await page
      .getByRole("button", { name: "حل في المحادثة", exact: true })
      .isDisabled(),
  );
  assert((await page.getByRole("alert").innerText()).includes("أكبر"));
  await page.keyboard.press("Escape");
});
await test("probability context and histogram visuals survive an offline reload", async () => {
  await fresh();
  await solve(
    "كيس فيه 3 حمراء و5 بيضاء، سحب كرتين معًا، احسب قانون احتمال عدد الكرات الحمراء",
  );
  await completeAnswer();
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".probability-histogram").waitFor();
  const turn = await solve("احسب V(X)");
  await completeAnswer();
  assert(Math.abs(turn.answer.results[0].decimal - 45 / 112) < 1e-12);
  await cleanMath();
});
await test("probability board tabs, focus and floating layout work at narrow phone widths", async () => {
  await openProbabilityBoard();
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const dialog = await page.getByRole("dialog").boundingBox();
    assert(dialog.x >= 0 && dialog.x + dialog.width <= width + 1);
    assert(
      await page
        .locator(".chat-modal-body")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
  }
  await page.getByRole("tab", { name: "السحب", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    await page
      .getByRole("tab", { name: "الأحداث", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.getByRole("tab", { name: "السحب", exact: true }).click();
  assert.equal(await page.locator(".probability-guide").count(), 0);
  await page.getByRole("button", { name: /مراجعة القواعد الأساسية/ }).click();
  assert.equal(await page.locator(".probability-guide").count(), 1);
  await page.locator(".chat-modal-body").evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({
    path: fileURLToPath(new URL("probability-board-mobile.png", output)),
    fullPage: true,
  });
  await page.getByTestId("live-event-probability").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: fileURLToPath(new URL("probability-controls-mobile.png", output)),
    fullPage: true,
  });
  await cleanMath();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
});

// Verbatim Syrian textbook statement, copied formatting and reviewed image input.
const textbookQuestion = JSON.parse(
  await readFile(
    new URL("./fixtures/syrian-complex.json", import.meta.url),
    "utf8",
  ),
).question;
await test("the exact Syrian textbook question solves both demands with named exponentials and conjugate deduction", async () => {
  await fresh();
  await page.setViewportSize({ width: 1280, height: 900 });
  const turn = await solve(textbookQuestion);
  await completeAnswer();
  assert.equal(turn.answer.unsolved.length, 0);
  assert.equal(turn.answer.results.length, 2);
  const [a, c] = turn.answer.results;
  assert(a.finalLatex.includes("z_{A}=2e^{i"));
  assert(c.finalLatex.includes("z_{C}=2e^{-i"));
  assert(a.finalLatex.includes("\\frac{\\pi}{3}"));
  assert(c.steps.some((s) => s.latex.includes("\\overline{z_{A}}")));
  assert(a.verification.passed && c.verification.passed);
  await cleanMath();
  await page.screenshot({
    path: fileURLToPath(new URL("syrian-complex-desktop.png", output)),
    fullPage: true,
  });
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await page.screenshot({
    path: fileURLToPath(new URL("syrian-complex-mobile.png", output)),
    fullPage: true,
  });
});
await test("textbook definitions persist across reload and a named follow-up selects B rather than the last C", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".assistant-message .final-answer").waitFor();
  const turn = await solve("اكتب الشكل الأسي للعدد z_B");
  await completeAnswer();
  assert.equal(turn.answer.unsolved.length, 0);
  assert.equal(turn.answer.results.length, 1);
  assert(turn.answer.results[0].finalLatex.includes("z_{B}=2e^{i0}"));
  assert(
    turn.answer.context.complex.values.z_A &&
      turn.answer.context.complex.values.z_C,
  );
  await cleanMath();
});
await test("Levantine, Egyptian, Gulf and Maghrebi form requests use the same correct Worker result", async () => {
  for (const request of [
    "بدي حوللي z_A للشكل الأسي",
    "عايز z_A بالصورة الأسية",
    "أبغى اكتب z_A بالشكل الأسي",
    "بغيت نكتب z_A بالصيغة الأسية",
  ]) {
    await fresh();
    const turn = await solve("z_A=1+i√3، " + request);
    await completeAnswer();
    assert.equal(turn.answer.unsolved.length, 0);
    assert(turn.answer.results[0].finalLatex.includes("z_{A}=2e^{i"));
    assert(turn.answer.results[0].verification.passed);
    await cleanMath();
  }
});
await test("printed complex notation is OCR-reviewed, mathematically previewed, and solved only after approval", async () => {
  await fresh();
  const data = await page.evaluate(async () => {
    await document.fonts.ready;
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 430;
    const p = c.getContext("2d");
    p.fillStyle = "white";
    p.fillRect(0, 0, c.width, c.height);
    p.fillStyle = "black";
    p.font = "38px Cairo";
    p.direction = "rtl";
    p.textAlign = "right";
    p.fillText("اكتب الشكل الأسي ثم استنتج باستعمال المرافق", 1150, 70);
    p.direction = "ltr";
    p.textAlign = "left";
    p.font = "48px sans-serif";
    p.fillText("z_A = 1 + i √3", 100, 165);
    p.fillText("z_B = 2", 100, 260);
    p.fillText("z_C = 1 - i √3", 100, 355);
    return c.toDataURL("image/png").split(",")[1];
  });
  const fixture = fileURLToPath(new URL("printed-complex-problem.png", output));
  await writeFile(fixture, Buffer.from(data, "base64"));
  await page
    .locator('input[type=file][accept*="image/png"]')
    .setInputFiles(fixture);
  await page.locator(".ocr-review").waitFor({ timeout: 65000 });
  const raw = await page.locator(".ocr-review").inputValue();
  assert(raw.trim().length > 0);
  await writeFile(
    fileURLToPath(new URL("ocr-textbook-raw.txt", output)),
    raw + "\n",
  );
  assert.equal(await page.locator(".assistant-message").count(), 0);
  assert(
    await page
      .getByRole("button", { name: "إرسال المسألة", exact: true })
      .isDisabled(),
  );
  // OCR is not assumed infallible: exercise the required human review/correction.
  await page.locator(".ocr-review").fill(textbookQuestion);
  const preview = page.getByTestId("ocr-math-preview");
  await preview.locator(".katex").first().waitFor();
  assert(
    (await preview.locator("annotation").allTextContents()).some((t) =>
      t.includes("sqrt{3}"),
    ),
  );
  await cleanMath();
  await page.screenshot({
    path: fileURLToPath(new URL("ocr-complex-review-mobile.png", output)),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "استخدام النص في مربع السؤال", exact: true })
    .click();
  await page
    .getByRole("button", { name: "إرسال المسألة", exact: true })
    .click();
  await page.locator(".assistant-message").waitFor();
  await completeAnswer();
  const turn = await lastTurn();
  assert.equal(turn.answer.unsolved.length, 0);
  assert.equal(turn.answer.results.length, 2);
  assert(turn.answer.results[0].finalLatex.includes("z_{A}=2e^{i"));
  assert(turn.answer.results[1].finalLatex.includes("z_{C}=2e^{-i"));
  assert(turn.image.startsWith("data:image/jpeg;base64,"));
  await cleanMath();
});

await test("local OCR returns reviewable text and never solves before approval", async () => {
  await fresh();
  const data = await page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1100;
    canvas.height = 230;
    const paint = canvas.getContext("2d");
    paint.fillStyle = "white";
    paint.fillRect(0, 0, 1100, 230);
    paint.fillStyle = "black";
    paint.font = "44px Cairo";
    paint.direction = "rtl";
    paint.textAlign = "right";
    paint.fillText("حل المعادلة", 1020, 90);
    paint.direction = "ltr";
    paint.textAlign = "left";
    paint.font = "48px sans-serif";
    paint.fillText("2x + 3 = 7", 100, 170);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const fixture = fileURLToPath(new URL("printed-problem.png", output));
  await writeFile(fixture, Buffer.from(data, "base64"));
  await page
    .locator('input[type=file][accept*="image/png"]')
    .setInputFiles(fixture);
  await page.locator(".ocr-review").waitFor({ timeout: 65000 });
  assert((await page.locator(".ocr-review").inputValue()).length > 0);
  assert.equal(await page.locator(".assistant-message").count(), 0);
  assert(
    await page.getByRole("button", { name: "إرسال المسألة" }).isDisabled(),
  );
  await page.screenshot({
    path: fileURLToPath(new URL("ocr-review-mobile.png", output)),
    fullPage: true,
  });
  await page.locator(".ocr-review").fill("حل المعادلة 2x+3=7");
  await page
    .getByRole("button", { name: "استخدام النص في مربع السؤال", exact: true })
    .click();
  await page
    .getByRole("button", { name: "إرسال المسألة", exact: true })
    .click();
  await page.locator(".assistant-message .final-answer").waitFor();
  const turn = await lastTurn();
  assert.match(turn.answer.results[0].finalLatex, /= 2/);
  assert(turn.image.startsWith("data:image/jpeg;base64,"));
});
await test("cancelling OCR initialization leaves the composer and solver usable", async () => {
  await fresh();
  await page
    .locator('input[type=file][accept*="image/png"]')
    .setInputFiles(fileURLToPath(new URL("printed-problem.png", output)));
  await page
    .getByRole("button", { name: "إزالة الصورة وإلغاء قراءتها", exact: true })
    .click();
  assert.equal(await page.locator(".image-attachment").count(), 0);
  const turn = await solve("احسب 2+2");
  assert.equal(Number(turn.answer.results[0].decimal), 4);
});
await test("malformed saved answer is ignored instead of crashing React", async () => {
  await page.evaluate(() =>
    localStorage.setItem(
      "pro_calc_conversation_v1",
      '[{"id":"bad","question":"x","answer":{"results":[null]}}]',
    ),
  );
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".assistant-message").count(), 0);
  assert(await page.locator("h1").isVisible());
});
// Controlled Worker faults exercise cancellation and the watchdog, not solver accuracy.
const faultContext = await browser.newContext();
await faultContext.route("**/*", (route) =>
  /^https?:/.test(route.request().url()) &&
  new URL(route.request().url()).origin !== ownOrigin
    ? route.abort()
    : route.continue(),
);
await faultContext.addInitScript(() => {
  window.__solverMode = "stall";
  window.__terminatedWorkers = 0;
  const Native = window.Worker;
  window.Worker = class extends Native {
    postMessage(message, ...args) {
      if (message?.question && window.__solverMode === "stall") return;
      if (message?.question && window.__solverMode === "error") {
        queueMicrotask(() =>
          this.dispatchEvent(
            new ErrorEvent("error", { message: "Controlled worker fault" }),
          ),
        );
        return;
      }
      return super.postMessage(message, ...args);
    }
    terminate() {
      window.__terminatedWorkers++;
      return super.terminate();
    }
  };
});
const faultPage = await faultContext.newPage();
await faultPage.goto(url, { waitUntil: "networkidle" });
async function faultSend(question) {
  await faultPage.locator(".smart-prompt").fill(question);
  await faultPage
    .getByRole("button", { name: "إرسال المسألة", exact: true })
    .click();
}
await test("solver stop terminates a stalled Worker and the next question works", async () => {
  await faultSend("احسب 77+1");
  await faultPage
    .getByRole("button", { name: "إيقاف التحليل", exact: true })
    .click();
  assert((await faultPage.evaluate(() => window.__terminatedWorkers)) > 0);
  assert.equal(await faultPage.locator(".assistant-message").count(), 0);
  await faultPage.evaluate(() => (window.__solverMode = "normal"));
  await faultSend("احسب 2+2");
  await faultPage.locator(".final-answer").waitFor();
  assert((await faultPage.locator(".final-answer").innerText()).includes("4"));
});
await test("watchdog returns an honest clarification, not a fake numerical answer", async () => {
  await faultPage.evaluate(() => (window.__solverMode = "stall"));
  await faultSend("احسب 777+1");
  await faultPage
    .locator(".assistant-message")
    .nth(1)
    .waitFor({ timeout: 18000 });
  const answer = faultPage.locator(".assistant-message").nth(1);
  assert.equal(await answer.locator(".final-answer").count(), 0);
  assert((await answer.innerText()).includes("لم يكتمل التحقق"));
});
await test("Worker failure becomes an Arabic clarification without crashing the chat", async () => {
  await faultPage.evaluate(() => (window.__solverMode = "error"));
  await faultSend("احسب 9+9");
  await faultPage.locator(".assistant-message").nth(2).waitFor();
  const answer = faultPage.locator(".assistant-message").nth(2);
  assert.equal(await answer.locator(".final-answer").count(), 0);
  assert((await answer.innerText()).includes("تعذّر تشغيل محرك الحساب المحلي"));
});
await faultContext.close();
// Controlled protocol tests, not a claim that a headless browser has an Arabic audio pack.
for (const availability of [
  "available",
  "downloadable",
  "unavailable",
  "server-only",
])
  await test(`speech policy: ${availability}`, async () => {
    const speechContext = await browser.newContext({
      userAgent: "Mozilla/5.0 Chrome/153.0.0 Safari/537.36",
    });
    await speechContext.route("**/*", (route) =>
      /^https?:/.test(route.request().url()) &&
      new URL(route.request().url()).origin !== ownOrigin
        ? route.abort()
        : route.continue(),
    );
    await speechContext.addInitScript((status) => {
      window.__speechCalls = [];
      class Recognition {
        static available(options) {
          window.__speechCalls.push({ action: "available", options });
          return Promise.resolve(status);
        }
        start() {
          window.__speechCalls.push({
            action: "start",
            lang: this.lang,
            local: this.processLocally,
          });
          setTimeout(() => {
            this.onresult?.({
              results: [
                { isFinal: true, 0: { transcript: "احسب اثنين زائد اثنين" } },
              ],
            });
            this.onend?.();
          }, 10);
        }
        abort() {}
        stop() {
          this.onend?.();
        }
      }
      Recognition.prototype.processLocally = false;
      if (status === "server-only") delete Recognition.available;
      window.SpeechRecognition = Recognition;
      window.webkitSpeechRecognition = undefined;
    }, availability);
    const speechPage = await speechContext.newPage();
    await speechPage.goto(url, { waitUntil: "networkidle" });
    const button = speechPage.getByRole("button", {
      name: "إملاء صوتي محلي",
      exact: true,
    });
    if (availability === "available") {
      await button.click();
      await speechPage.waitForFunction(() =>
        document.querySelector(".smart-prompt").textContent.includes("اثنين"),
      );
      const calls = await speechPage.evaluate(() => window.__speechCalls);
      assert(
        calls.some(
          (call) =>
            call.action === "start" &&
            call.lang === "ar-SA" &&
            call.local === true,
        ),
      );
    } else {
      assert.equal(await button.count(), 0);
      assert(
        !(await speechPage.evaluate(() => window.__speechCalls)).some(
          (call) => call.action === "start",
        ),
      );
    }
    const calls = await speechPage.evaluate(() => window.__speechCalls);
    for (const call of calls.filter((item) => item.action === "available"))
      assert.deepEqual(call.options, {
        langs: ["ar-SA"],
        processLocally: true,
      });
    await speechContext.close();
  });
await test("no external HTTP requests or uncaught browser errors", async () => {
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});
await writeFile(
  new URL("browser-results.json", output),
  JSON.stringify({ url, results, errors, external }, null, 2),
);
await browser.close();
console.log(
  `\nBrowser: ${results.filter((result) => result.pass).length} passed, ${results.filter((result) => !result.pass).length} failed`,
);
if (results.some((result) => !result.pass)) process.exitCode = 1;
