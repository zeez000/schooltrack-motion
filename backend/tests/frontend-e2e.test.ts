import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHmac } from "node:crypto";
import {
  chromium,
  expect as browserExpect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import request from "supertest";
import { env } from "../src/config/env.js";
import { prisma } from "../src/services/database.js";
import {
  app,
  bearer,
  createFixture,
  login,
  loginSession,
  resetDatabase,
  TEST_PASSWORD,
} from "./helpers/database.js";

let browser: Browser,
  context: BrowserContext,
  page: Page,
  apiServer: Server,
  webServer: Server,
  apiBase: string,
  webBase: string;
let fixture: Awaited<ReturnType<typeof createFixture>>;
const address = (server: Server) =>
  `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const listen = (server: Server) =>
  new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
beforeAll(async () => {
  apiServer = createServer(app);
  await listen(apiServer);
  apiBase = address(apiServer);
  const site = resolve(process.cwd(), "../site");
  webServer = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, "http://localhost").pathname;
      const file = resolve(
        site,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (!file.startsWith(site + "\\") && !file.startsWith(site + "/")) {
        res.writeHead(403);
        res.end();
        return;
      }
      const types: Record<string, string> = {
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
      };
      res.setHeader(
        "content-type",
        types[extname(file)] || "application/octet-stream",
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await listen(webServer);
  webBase = address(webServer);
  env.corsOrigins.push(webBase);
  browser = await chromium.launch({ headless: true });
}, 60000);
afterAll(async () => {
  await browser?.close();
  if (webServer) await close(webServer);
  if (apiServer) await close(apiServer);
});
beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
  // Exercise the school's logical date deterministically, independent of the runner's timezone.
  await prisma.school.update({
    where: { id: fixture.schoolA.id },
    data: { timezone: "UTC" },
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await context.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
  page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${webBase}/?api=${encodeURIComponent(apiBase)}`);
});
afterEach(async () => {
  await context?.close();
});
async function signIn(email: string) {
  await page.locator("#real-app input[name=email]").fill(email);
  await page.locator("#real-app input[name=password]").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await browserExpect(page.locator("#real-app .app-topline")).toContainText(
    email,
  );
  await browserExpect(page.locator("#real-app")).not.toContainText(
    "Loading school records…",
  );
}
const nav = (label: string) =>
  page
    .locator("#real-app")
    .getByRole("button", { name: label, exact: true })
    .click();
async function activeJourney() {
  const driver = await login(fixture.driverA.email);
  const started = await request(app)
    .post(`/api/routes/${fixture.routeA.id}/start`)
    .set(bearer(driver))
    .send({ direction: "MORNING" });
  expect(started.status).toBe(201);
  return driver;
}
async function browserApi(email: string, path: string, options: unknown = {}) {
  return page.evaluate(
    async ({ email, password, base, path, options }) => {
      const client = (window as any).SchoolTrackAPI.createClient(base);
      await client.login(email, password);
      try {
        return { status: 200, body: await client.request(path, options) };
      } catch (e: any) {
        return { status: e.status, code: e.code };
      }
    },
    { email, password: TEST_PASSWORD, base: apiBase, path, options },
  );
}
describe("real frontend against the backend (no demo fallback)", () => {
  it("parent login, own-child Today, unrelated denial, missing boarding and notifications", async () => {
    const admin = await login(fixture.adminA.email);
    expect(
      (
        await request(app)
          .post("/api/checkpoints")
          .set(bearer(admin))
          .send({
            studentId: fixture.studentA.id,
            eventType: "SCHOOL_GATE_ENTRY",
            source: "MANUAL",
          })
      ).status,
    ).toBe(201);
    await signIn(fixture.parentA.email);
    await browserExpect(page.locator("#real-child")).toContainText("Mira Demo");
    await browserExpect(
      page.locator("#real-app [data-checkpoint=BUS_BOARDING]"),
    ).toHaveAttribute("data-status", "NOT_RECORDED");
    await browserExpect(
      page.locator("#real-app [data-checkpoint=SCHOOL_GATE_ENTRY]"),
    ).toHaveAttribute("data-status", "RECORDED");
    expect(
      (
        await browserApi(
          fixture.parentA.email,
          `/api/students/${fixture.studentB.id}/today`,
        )
      ).status,
    ).toBe(404);
    await nav("Updates");
    await browserExpect(page.locator("#real-app")).toContainText(
      "School entry",
    );
    await page.locator("#real-app [data-read]").first().click();
    await browserExpect(
      page.locator("#real-app .status-badge").first(),
    ).toHaveText("Read");
    await nav("Journeys");
    await browserExpect(page.locator("#real-app")).toContainText("No journeys");
    await nav("Attendance");
    await browserExpect(page.locator("#real-app")).toContainText(
      "No attendance records",
    );
    expect(
      await page.evaluate(() => [localStorage.length, sessionStorage.length]),
    ).toEqual([0, 0]);
  });
  it("stale bus GPS, live SSE update, and GPS never implies boarding", async () => {
    const driver = await activeJourney();
    await prisma.vehicleLocation.create({
      data: {
        schoolId: fixture.schoolA.id,
        vehicleId: fixture.vehicleA.id,
        latitude: 13,
        longitude: 80,
        timestamp: new Date(Date.now() - 900000),
      },
    });
    await signIn(fixture.parentA.email);
    await browserExpect(page.locator("#real-bus")).toContainText("STALE");
    await browserExpect(page.locator("#real-bus")).toContainText(
      "Last updated:",
    );
    await browserExpect(page.locator("#real-bus .live-status")).toHaveText(
      "CONNECTED",
    );
    expect(
      (
        await request(app)
          .post(`/api/vehicles/${fixture.vehicleA.id}/location`)
          .set(bearer(driver))
          .send({ latitude: 14, longitude: 81 })
      ).status,
    ).toBe(201);
    await browserExpect(page.locator("#real-bus")).toContainText("Latitude 14");
    await browserExpect(
      page.locator("#real-app [data-checkpoint=BUS_BOARDING]"),
    ).toHaveAttribute("data-status", "AWAITING_RECORD");
    expect(
      await prisma.checkpointEvent.count({
        where: { eventType: "BUS_BOARDING" },
      }),
    ).toBe(0);
  });
  it("teacher assigned roster, attendance, mandatory correction reason and classroom arrival", async () => {
    await signIn(fixture.teacherA.email);
    await browserExpect(page.locator("#real-class")).not.toContainText(
      "Grade 4",
    );
    const row = () =>
      page.locator(`[data-roster-student="${fixture.studentA.id}"]`);
    await browserExpect(row()).toContainText("Mira Demo");
    await row().getByRole("button", { name: "Save attendance" }).click();
    await browserExpect(row().locator(".status-badge")).toHaveText("PRESENT");
    await row().locator("select[name=status]").selectOption("ABSENT");
    await row().getByRole("button", { name: "Save attendance" }).click();
    await browserExpect(page.getByRole("alert")).toContainText(
      "requires a correction reason",
    );
    expect(
      (
        await prisma.attendanceRecord.findFirstOrThrow({
          where: { studentId: fixture.studentA.id },
        })
      ).status,
    ).toBe("PRESENT");
    await nav("Retry");
    await row().locator("select[name=status]").selectOption("ABSENT");
    await row()
      .locator("input[name=correctionReason]")
      .fill("Parent confirmed absence");
    await row().getByRole("button", { name: "Save attendance" }).click();
    await browserExpect(row().locator(".status-badge")).toHaveText("ABSENT");
    expect(await prisma.attendanceCorrection.count()).toBe(1);
    await row()
      .getByRole("button", { name: "Confirm classroom arrival" })
      .click();
    await browserExpect(
      page.locator("#real-app .real-message[role=status]"),
    ).toContainText("Classroom arrival recorded");
    expect(
      await prisma.checkpointEvent.count({
        where: { eventType: "CLASSROOM_ENTRY" },
      }),
    ).toBe(1);
  });
  it("driver assigned routes only, boarding, return guardian verification and route completion", async () => {
    await prisma.route.create({
      data: { schoolId: fixture.schoolA.id, name: "Unassigned route" },
    });
    await signIn(fixture.driverA.email);
    await browserExpect(page.locator("#real-route")).not.toContainText(
      "Unassigned route",
    );
    await browserExpect(page.locator("#real-app")).not.toContainText(
      "Rohan Other",
    );
    await nav("Start morning route");
    await browserExpect(
      page.locator("#real-app .real-message[role=status]"),
    ).toContainText("Route action recorded");
    await page.locator("#real-app [data-board]").first().click();
    await browserExpect(
      page.locator("#real-app .real-message[role=status]"),
    ).toContainText("Boarding checkpoint recorded");
    expect(
      await prisma.checkpointEvent.count({
        where: { eventType: "BUS_BOARDING" },
      }),
    ).toBe(1);
    await page.locator("#real-direction").selectOption("RETURN");
    const guardian = await prisma.guardian.findFirstOrThrow({
      where: { studentId: fixture.studentA.id },
    });
    await prisma.guardian.update({
      where: { id: guardian.id },
      data: { authorisedPickup: false },
    });
    expect(
      (
        await browserApi(
          fixture.driverA.email,
          `/api/students/${fixture.studentA.id}/handover`,
          { method: "POST", body: { guardianId: guardian.id } },
        )
      ).status,
    ).toBe(403);
    await prisma.guardian.update({
      where: { id: guardian.id },
      data: { authorisedPickup: true },
    });
    const handover = page.locator(
      `[data-form=handover][data-student-id="${fixture.studentA.id}"]`,
    );
    await handover.locator("select").selectOption(guardian.id);
    await handover.getByRole("button").click();
    expect(
      await prisma.checkpointEvent.count({
        where: { eventType: "GUARDIAN_HANDOVER" },
      }),
    ).toBe(0);
    await handover.locator("input[type=checkbox]").check();
    await handover.getByRole("button").click();
    await browserExpect(
      page.locator("#real-app .real-message[role=status]"),
    ).toContainText("Guardian handover recorded");
    expect(
      await prisma.checkpointEvent.count({
        where: { eventType: "GUARDIAN_HANDOVER" },
      }),
    ).toBe(1);
    await nav("Finish route");
    await browserExpect(
      page.locator("#real-app .real-message[role=status]"),
    ).toContainText("Route action recorded");
  });
  it("admin tenant isolation, operational screens and one-time device credentials", async () => {
    await signIn(fixture.adminA.email);
    await browserExpect(page.locator("#real-app")).not.toContainText(
      fixture.parentB.email,
    );
    for (const label of [
      "Students",
      "Guardians",
      "Classes",
      "Teachers",
      "Vehicles",
      "Routes",
      "Route stops",
      "Student routes",
      "Transport staff",
      "Audit logs",
    ]) {
      await nav(label);
      await browserExpect(page.locator("#real-app")).not.toContainText(
        "Loading school records…",
      );
      await browserExpect(page.locator("#real-app [role=alert]")).toHaveCount(
        0,
      );
      await browserExpect(page.locator("#real-app")).not.toContainText(
        "Rohan Other",
      );
    }
    await nav("Devices");
    await page.locator("#real-app summary").click();
    await page.locator("#real-app input[name=deviceKey]").fill("e2e-reader");
    await page.locator("#real-app input[value=SCHOOL_GATE_ENTRY]").check();
    await nav("Save record");
    await browserExpect(page.locator(".real-secret code")).not.toBeEmpty();
    const first = await page.locator(".real-secret code").textContent();
    await nav("I have saved it");
    await nav("Rotate device token");
    await browserExpect(page.locator(".real-secret code")).not.toHaveText(
      first!,
    );
    expect(await page.locator("#real-app").textContent()).not.toContain(
      "tokenHash",
    );
    await nav("I have saved it");
    await nav("Disable device");
    await browserExpect(page.locator("#real-app")).toContainText("INACTIVE");
  });
  it("expired signed access token refreshes once, rotates refresh token and logout revokes it", async () => {
    const session = await loginSession(fixture.parentA.email);
    const [header, body] = session.accessToken.split(".");
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString());
    claims.exp = Math.floor(Date.now() / 1000) - 1;
    const expiredBody = Buffer.from(JSON.stringify(claims)).toString(
      "base64url",
    );
    const expired = `${header}.${expiredBody}.${createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${header}.${expiredBody}`).digest("base64url")}`;
    const result = await page.evaluate(
      async ({ base, session, expired }) => {
        const c = (window as any).SchoolTrackAPI.createClient(base);
        c.setSession({ ...session, accessToken: expired });
        const responses = await Promise.all([
          c.request("/api/auth/me"),
          c.request("/api/me/students"),
        ]);
        const rotated = c.refreshToken;
        await c.logout();
        return {
          role: responses[0].user.role,
          rotated,
          cleared: !c.accessToken && !c.refreshToken,
        };
      },
      { base: apiBase, session, expired },
    );
    expect(result.role).toBe("PARENT");
    expect(result.rotated).not.toBe(session.refreshToken);
    expect(result.cleared).toBe(true);
    expect(
      (
        await request(app)
          .post("/api/auth/refresh")
          .send({ refreshToken: result.rotated })
      ).status,
    ).toBe(401);
    await signIn(fixture.parentA.email);
    await nav("Log out");
    await browserExpect(page.locator("#real-app")).toContainText(
      "Sign in with",
    );
  });
  it("API outage is honest and never switches to fictional students; reload clears memory session", async () => {
    await signIn(fixture.parentA.email);
    await page.route(`${apiBase}/**`, (route) => route.abort());
    await nav("Refresh records");
    await browserExpect(page.getByRole("alert")).toContainText(
      "SchoolTrack is unavailable",
    );
    await browserExpect(page.locator("#app")).toBeHidden();
    await page.unroute(`${apiBase}/**`);
    await page.reload();
    await browserExpect(page.locator("#real-app")).toContainText(
      "Sign in with",
    );
    await page
      .getByRole("button", {
        name: "DEMO PREVIEW — fictional data",
        exact: true,
      })
      .click();
    await browserExpect(page.locator("#real-app")).toBeHidden();
    await browserExpect(page.locator("#app")).toBeVisible();
  });
  it("mobile role layouts and reduced-motion preserve accessibility", async () => {
    for (const email of [
      fixture.parentA.email,
      fixture.teacherA.email,
      fixture.driverA.email,
      fixture.adminA.email,
    ]) {
      await signIn(email);
      for (const width of [320, 375, 768]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
      }
      expect(
        await page
          .locator("#real-app .control-button")
          .first()
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe("0s");
      await nav("Log out");
    }
  });
  it("preserves premium desktop application with ordinary motion and no third-party code", async () => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await signIn(fixture.parentA.email);
    await browserExpect(page.locator("#real-app")).toContainText(
      "STUDENT CHECKPOINT",
    );
    expect(await page.locator('script[src*="cdn.jsdelivr.net"]').count()).toBe(
      0,
    );
    await mkdir(resolve(process.cwd(), "../test-results"), { recursive: true });
    await page
      .locator("#real-app")
      .screenshot({
        path: resolve(process.cwd(), "../test-results/real-parent.png"),
      });
  });
});
