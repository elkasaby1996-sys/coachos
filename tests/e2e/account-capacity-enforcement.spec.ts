import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { seedEntitlementCoach } from "./utils/account-entitlement-seeds";
import { ensureUser, pgQuery } from "./utils/auth-seeds";
import {
  signInWithEmail,
  waitForAuthSessionReady,
  waitForBootstrapResolved,
} from "./utils/test-helpers";

test.describe.configure({ mode: "parallel" });

test("pending team commitment accepts at exact capacity", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price04:${info.testId}:owner`);
  const member = await seedEntitlementCoach(`price04:${info.testId}:member`);
  const token = randomBytes(32).toString("hex");
  await pgQuery(`insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Pending capacity space','${coach.userId}');
    insert into public.workspace_member_invites(workspace_id,email,role,client_access_mode,token_hash,status,invited_by_user_id,expires_at)
    values('${coach.workspaceId}','${member.email}','viewer','assigned_clients_only',public.hash_workspace_team_invite_token('${token}'),'pending','${coach.userId}',now()+interval '1 day');`);
  await signInWithEmail(page, member.email, member.password);
  await page.goto(`/team-invites/${token}`);
  const accepted = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(
      "/rpc/accept_workspace_team_invite",
    ),
  );
  await page
    .getByRole("button", { name: "Accept invite", exact: true })
    .click();
  expect((await accepted).ok()).toBe(true);
  const rows = await pgQuery<{ status: string; seats: number }>(
    `select m.status,(select count(distinct subject_key)::int from public.account_capacity_subjects('${coach.userId}',now()) where dimension='coach_seats') seats from public.workspace_members m where workspace_id='${coach.workspaceId}' and user_id='${member.userId}';`,
  );
  expect(rows).toEqual([{ status: "active", seats: 2 }]);
});

test("completed client reactivation denial stays visible in the lifecycle dialog", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price04:${info.testId}`);
  const ids = Array.from({ length: 11 }, () => randomUUID());
  const completed = randomUUID();
  await pgQuery(`insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Lifecycle capacity space','${coach.userId}');
    insert into auth.users(id,email) values ${ids.map((id) => `('${id}','${id}@price04.test')`).join(",")};
    insert into public.clients(user_id,workspace_id,lifecycle_state) values ${ids
      .slice(0, 10)
      .map((id) => `('${id}','${coach.workspaceId}','active')`)
      .join(",")};
    insert into public.clients(id,user_id,workspace_id,display_name,lifecycle_state) values('${completed}','${ids[10]}','${coach.workspaceId}','Completed capacity client','completed');`);
  await signInWithEmail(page, coach.email, coach.password);
  await page.goto(`/pt/clients/${completed}`);
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Mark active", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const denied = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(
      "/rpc/pt_update_client_lifecycle",
    ),
  );
  await dialog
    .getByRole("button", { name: "Save lifecycle", exact: true })
    .click();
  expect((await denied).status()).toBe(400);
  await expect(dialog.getByRole("alert")).toContainText(
    "Current clients capacity has been reached",
  );
  await expect(
    dialog.getByRole("button", { name: "Save lifecycle", exact: true }),
  ).toBeEnabled();
  expect(
    await pgQuery(
      `select lifecycle_state from public.clients where id='${completed}';`,
    ),
  ).toEqual([{ lifecycle_state: "completed" }]);
});

test("client invite denial is private and leaves the link unused", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price04:${info.testId}`);
  const token = randomUUID();
  const email = `${randomUUID()}@price04.test`;
  const client = await ensureUser({
    email,
    password: coach.password,
    fullName: "Invite client",
  });
  const existing = Array.from({ length: 10 }, () => randomUUID());
  await pgQuery(`insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Client capacity space','${coach.userId}');
    insert into auth.users(id,email) values ${existing.map((id) => `('${id}','${id}@price04.test')`).join(",")};
    insert into public.clients(user_id,workspace_id) values ${existing.map((id) => `('${id}','${coach.workspaceId}')`).join(",")};
    insert into public.clients(user_id,full_name,display_name,email,phone,date_of_birth,sex,height_value,height_unit,weight_value_current,weight_unit,account_onboarding_completed_at)
    values('${client}','Invite client','Invite client','${email}','+966500000001','1995-01-01','male',180,'cm',80,'kg',now());
    insert into public.invites(workspace_id,code,token,max_uses,created_by_user_id,expires_at) values('${coach.workspaceId}','${token}','${token}',100,'${coach.userId}',now()+interval '1 day');`);
  await signInWithEmail(page, email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  const acceptance = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/rpc/accept_invite"),
  );
  await page.goto(`/invite/${token}`);
  expect((await acceptance).status()).toBe(400);
  await expect(
    page.getByText("This coach is not accepting additional clients right now."),
  ).toBeVisible();
  await expect(
    page.getByText(/committed of|View Billing|Growth plan/),
  ).toHaveCount(0);
  const uses = await pgQuery<{ uses: number }>(
    `select uses from public.invites where code='${token}';`,
  );
  expect(uses[0].uses).toBe(0);
});

test("non-owner team denial preserves input without account totals", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price04:${info.testId}:owner`);
  const admin = await seedEntitlementCoach(`price04:${info.testId}:admin`);
  const slug = `capacity-${randomUUID()}`;
  await pgQuery(`insert into public.workspaces(id,name,slug,owner_user_id) values('${coach.workspaceId}','Team capacity space','${slug}','${coach.userId}');
    insert into public.workspace_members(workspace_id,user_id,role,status) values('${coach.workspaceId}','${admin.userId}','admin','active');`);
  await signInWithEmail(page, admin.email, admin.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await page.goto(`/w/${slug}/settings/team`);
  await page
    .getByRole("button", { name: "Invite member", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const email = `${randomUUID()}@price04.test`;
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  const denied = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(
      "/rpc/create_workspace_team_invite",
    ),
  );
  await dialog.getByRole("button", { name: /Send invite/ }).click();
  const deniedResponse = await denied;
  expect(deniedResponse.status()).toBe(400);
  await deniedResponse.finished();
  const capacityAlert = dialog
    .getByRole("alert")
    .filter({ hasText: "This account cannot add" });
  await expect(capacityAlert).toContainText("Ask the owner to review Billing");
  await expect(capacityAlert).not.toContainText(/committed|of 2|trial|Growth/);
  await expect(dialog.getByLabel("Email", { exact: true })).toHaveValue(email);
  await expect(dialog.getByRole("link", { name: "View Billing" })).toHaveCount(
    0,
  );
});

test("workspace denial retains the form and offers owner Billing navigation", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price04:${info.testId}`);
  await pgQuery(
    `insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','First space','${coach.userId}');`,
  );
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  await page.goto("/pt-hub/workspaces");
  await page.getByRole("button", { name: "Create Space", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByPlaceholder("Velocity Performance")
    .fill("Retained capacity form");
  const denied = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/rpc/create_workspace"),
  );
  await dialog
    .getByRole("button", { name: "Create space", exact: true })
    .click();
  expect((await denied).status()).toBe(400);
  await expect(dialog.getByRole("alert")).toContainText(
    "Workspaces capacity has been reached",
  );
  await expect(dialog.getByRole("alert")).toContainText("1 committed of 1");
  await expect(dialog.getByPlaceholder("Velocity Performance")).toHaveValue(
    "Retained capacity form",
  );
  await expect(
    dialog.getByRole("link", { name: "View Billing" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Create space", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("workspace-capacity-denial.png"),
    fullPage: true,
  });
});

test("real package API preserves drafts and enforces publication transitions", async ({
  page,
}, info) => {
  const coach = await seedEntitlementCoach(`price04:${info.testId}`);
  await pgQuery(`insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Package space','${coach.userId}');
    insert into public.pt_packages(pt_user_id,title,status,is_public) select '${coach.userId}','Published '||n,'active',true from generate_series(1,3) n;`);
  await signInWithEmail(page, coach.email, coach.password);
  await waitForAuthSessionReady(page);
  await waitForBootstrapResolved(page);
  const result = await page.evaluate(async (userId) => {
    const modulePath = "/src/features/pt-hub/lib/pt-hub.ts";
    const api = await import(modulePath);
    await api.createPtPackage({
      ptUserId: userId,
      input: {
        title: "Retained draft",
        status: "draft",
        isPublic: false,
        features: [],
      },
    });
    try {
      await api.createPtPackage({
        ptUserId: userId,
        input: {
          title: "Denied publication",
          status: "active",
          isPublic: true,
          features: [],
        },
      });
      return "unexpected-success";
    } catch (error) {
      return (error as { code?: string }).code;
    }
  }, coach.userId);
  expect(result).toBe("ACCOUNT_CAPACITY_LIMIT_REACHED");
  const rows = await pgQuery<{ title: string }>(
    `select title from public.pt_packages where pt_user_id='${coach.userId}' order by title;`,
  );
  expect(rows.map((r) => r.title)).toEqual([
    "Published 1",
    "Published 2",
    "Published 3",
    "Retained draft",
  ]);
  await page.evaluate(async (userId) => {
    const path = "/src/lib/supabase.ts";
    const { supabase } = await import(path);
    const { data } = await supabase
      .from("pt_packages")
      .select("id,title")
      .eq("pt_user_id", userId);
    const first = data.find(
      (p: { title: string }) => p.title === "Published 1",
    );
    const draft = data.find(
      (p: { title: string }) => p.title === "Retained draft",
    );
    const hide = await supabase.rpc("update_my_pt_package", {
      p_package_id: first.id,
      p_input: { is_public: false },
    });
    if (hide.error) throw hide.error;
    const publish = await supabase.rpc("update_my_pt_package", {
      p_package_id: draft.id,
      p_input: { status: "active", is_public: true },
    });
    if (publish.error) throw publish.error;
  }, coach.userId);
});

for (const dimension of [
  "active_workspaces",
  "counted_clients",
  "coach_seats",
  "published_packages",
] as const) {
  test(`concurrent final ${dimension} slot commits exactly one domain result`, async ({
    page,
  }, info) => {
    expect(page).toBeDefined();
    const coach = await seedEntitlementCoach(`price04:${info.testId}`);
    const ids = [randomUUID(), randomUUID()];
    if (dimension !== "active_workspaces") {
      await pgQuery(
        `insert into public.workspaces(id,name,owner_user_id) values('${coach.workspaceId}','Race space','${coach.userId}');`,
      );
    }
    if (dimension === "counted_clients") {
      const clients = Array.from({ length: 11 }, () => randomUUID());
      await pgQuery(`insert into auth.users(id,email) values ${clients.map((id) => `('${id}','${id}@price04.test')`).join(",")};
        insert into public.clients(user_id,workspace_id) values ${clients
          .slice(0, 9)
          .map((id) => `('${id}','${coach.workspaceId}')`)
          .join(",")};
        insert into public.invites(workspace_id,code,token,max_uses,created_by_user_id) values ${ids.map((id) => `('${coach.workspaceId}','${id}','${id}',100,'${coach.userId}')`).join(",")};`);
      const results = await Promise.allSettled(
        clients
          .slice(9)
          .map((id, index) =>
            pgQuery(
              `begin; select set_config('request.jwt.claim.sub','${id}',true); set local role authenticated; select public.accept_invite(p_code=>'${ids[index]}',p_display_name=>'Race client'); commit;`,
            ),
          ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const used = await pgQuery<{ uses: number }>(
        `select sum(uses)::int uses from public.invites where code in ('${ids[0]}','${ids[1]}');`,
      );
      expect(used[0].uses).toBe(1);
    } else {
      if (dimension === "published_packages") {
        await pgQuery(
          `insert into public.pt_packages(pt_user_id,title,status,is_public) values('${coach.userId}','Before one','active',true),('${coach.userId}','Before two','active',true);`,
        );
      }
      const write = (id: string) =>
        dimension === "active_workspaces"
          ? `insert into public.workspaces(id,name,owner_user_id) values('${id}','Final workspace','${coach.userId}');`
          : dimension === "coach_seats"
            ? `begin; select set_config('request.jwt.claim.sub','${coach.userId}',true); set local role authenticated; select public.create_workspace_team_invite('${coach.workspaceId}','${id}@price04.test','viewer'); commit;`
            : `begin; select set_config('request.jwt.claim.sub','${coach.userId}',true); set local role authenticated; select public.create_my_pt_package('{"title":"${id}","status":"active","is_public":true}'); commit;`;
      const results = await Promise.allSettled(
        ids.map((id) => pgQuery(write(id))),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect(
        String(rejected && "reason" in rejected ? rejected.reason : ""),
      ).toContain("ACCOUNT_CAPACITY_LIMIT_REACHED");
    }
    const residual = await pgQuery<{ active: number }>(
      `select count(*)::int active from public.account_capacity_reservations r join public.billing_accounts a on a.id=r.billing_account_id where a.owner_user_id='${coach.userId}' and r.status='active';`,
    );
    expect(residual[0].active).toBe(0);
  });
}

test("first lead conversion admits two dimensions and rolls back workspace denial", async ({
  page,
}, info) => {
  expect(page).toBeDefined();
  const coach = await seedEntitlementCoach(`price04:${info.testId}`);
  const lead = randomUUID();
  const client = randomUUID();
  await pgQuery(`insert into auth.users(id,email) values('${client}','${client}@price04.test');
    insert into public.pt_hub_leads(id,user_id,full_name,goal_summary,applicant_user_id) values('${lead}','${coach.userId}','Lead fixture','Goal','${client}');
    begin; select set_config('request.jwt.claim.sub','${coach.userId}',true); set local role authenticated;
    select public.pt_hub_approve_lead('${lead}',null,'First conversion',false); commit;`);
  const converted = await pgQuery<{ status: string; client_id: string }>(
    `select status,converted_client_id client_id from public.pt_hub_leads where id='${lead}';`,
  );
  expect(converted[0].status).toBe("converted");
  expect(converted[0].client_id).toBeTruthy();
  await expect(
    pgQuery(
      `begin; select set_config('request.jwt.claim.sub','${coach.userId}',true); set local role authenticated; select public.pt_hub_approve_lead('${lead}',null,'Denied conversion',true); commit;`,
    ),
  ).rejects.toThrow("ACCOUNT_CAPACITY_LIMIT_REACHED");
  const counts = await pgQuery<{ workspaces: number; clients: number }>(
    `select (select count(*)::int from public.workspaces where owner_user_id='${coach.userId}') workspaces,(select count(*)::int from public.clients where user_id='${client}') clients;`,
  );
  expect(counts[0]).toEqual({ workspaces: 1, clients: 1 });
});
