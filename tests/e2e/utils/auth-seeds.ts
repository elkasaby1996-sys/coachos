import { createClient } from "@supabase/supabase-js";

type SeedUser = {
  email: string;
  password: string;
  fullName: string;
};

export const authSmokeFixtures = {
  ptComplete: {
    email: "smoke-pt-complete@repsync.test",
    password: "SmokePass123!",
    fullName: "Smoke PT Complete",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workspaceName: "Smoke PT Complete Workspace",
  },
  ptIncompleteProfile: {
    email: "smoke-pt-incomplete@repsync.test",
    password: "SmokePass123!",
    fullName: "Smoke PT Incomplete",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "Smoke PT Incomplete Workspace",
  },
  clientNoWorkspace: {
    email: "smoke-client-empty@repsync.test",
    password: "SmokePass123!",
    fullName: "Smoke Client Empty",
    clientId: "33333333-3333-4333-8333-333333333333",
  },
  clientInvite: {
    email: "smoke-client-invite@repsync.test",
    password: "SmokePass123!",
    fullName: "Smoke Client Invite",
    clientId: "44444444-4444-4444-8444-444444444444",
    inviteCode: "SMOKE-INVITE-CLIENT",
    inviteToken: "smoke-invite-client-token",
  },
} as const;

const localServiceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function getSupabaseApiUrl() {
  return process.env.E2E_SUPABASE_API_URL?.trim() || "http://127.0.0.1:54321";
}

function getServiceRoleKey() {
  return process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim() || localServiceRoleKey;
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function pgQuery<T = unknown>(query: string): Promise<T[]> {
  const response = await fetch(`${getSupabaseApiUrl()}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`pg/query failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T[];
}

function getAdminClient() {
  return createClient(getSupabaseApiUrl(), getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getUserIdByEmail(email: string) {
  const rows = await pgQuery<{ id: string }>(
    `select id::text as id from auth.users where email = ${sqlString(email)} limit 1;`,
  );
  return rows[0]?.id ?? null;
}

async function ensureUser(user: SeedUser) {
  const admin = getAdminClient();
  const existingUserId = await getUserIdByEmail(user.email);

  if (existingUserId) {
    const { error } = await admin.auth.admin.updateUserById(existingUserId, {
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.fullName,
        name: user.fullName,
      },
    });
    if (error) throw error;
    return existingUserId;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      full_name: user.fullName,
      name: user.fullName,
    },
  });
  if (error) throw error;
  if (!data.user?.id) {
    throw new Error(`Failed to create auth user for ${user.email}.`);
  }
  return data.user.id;
}

export async function seedAuthSmokeStates() {
  const ptCompleteUserId = await ensureUser(authSmokeFixtures.ptComplete);
  const ptIncompleteUserId = await ensureUser(authSmokeFixtures.ptIncompleteProfile);
  const clientNoWorkspaceUserId = await ensureUser(authSmokeFixtures.clientNoWorkspace);
  const clientInviteUserId = await ensureUser(authSmokeFixtures.clientInvite);

  await pgQuery(`
    delete from public.workspace_client_onboardings
    where client_id in (
      '${authSmokeFixtures.clientNoWorkspace.clientId}'::uuid,
      '${authSmokeFixtures.clientInvite.clientId}'::uuid
    );

    delete from public.invites
    where token = ${sqlString(authSmokeFixtures.clientInvite.inviteToken)}
       or code = ${sqlString(authSmokeFixtures.clientInvite.inviteCode)};

    delete from public.clients
    where id in (
      '${authSmokeFixtures.clientNoWorkspace.clientId}'::uuid,
      '${authSmokeFixtures.clientInvite.clientId}'::uuid
    )
       or user_id in (
         '${clientNoWorkspaceUserId}'::uuid,
         '${clientInviteUserId}'::uuid
       );

    delete from public.workspace_members
    where workspace_id in (
      '${authSmokeFixtures.ptComplete.workspaceId}'::uuid,
      '${authSmokeFixtures.ptIncompleteProfile.workspaceId}'::uuid
    )
       or user_id in (
         '${ptCompleteUserId}'::uuid,
         '${ptIncompleteUserId}'::uuid
       );

    delete from public.pt_profiles
    where user_id in (
      '${ptCompleteUserId}'::uuid,
      '${ptIncompleteUserId}'::uuid
    );

    delete from public.workspaces
    where id in (
      '${authSmokeFixtures.ptComplete.workspaceId}'::uuid,
      '${authSmokeFixtures.ptIncompleteProfile.workspaceId}'::uuid
    );

    insert into public.workspaces (id, name, owner_user_id)
    values
      (
        '${authSmokeFixtures.ptComplete.workspaceId}'::uuid,
        ${sqlString(authSmokeFixtures.ptComplete.workspaceName)},
        '${ptCompleteUserId}'::uuid
      ),
      (
        '${authSmokeFixtures.ptIncompleteProfile.workspaceId}'::uuid,
        ${sqlString(authSmokeFixtures.ptIncompleteProfile.workspaceName)},
        '${ptIncompleteUserId}'::uuid
      );

    insert into public.workspace_members (workspace_id, user_id, role)
    values
      (
        '${authSmokeFixtures.ptComplete.workspaceId}'::uuid,
        '${ptCompleteUserId}'::uuid,
        'pt_owner'
      ),
      (
        '${authSmokeFixtures.ptIncompleteProfile.workspaceId}'::uuid,
        '${ptIncompleteUserId}'::uuid,
        'pt_owner'
      );

    insert into public.pt_profiles (
      user_id,
      workspace_id,
      full_name,
      display_name,
      phone,
      location_country,
      location_city,
      onboarding_completed_at
    )
    values
      (
        '${ptCompleteUserId}'::uuid,
        '${authSmokeFixtures.ptComplete.workspaceId}'::uuid,
        ${sqlString(authSmokeFixtures.ptComplete.fullName)},
        ${sqlString(authSmokeFixtures.ptComplete.fullName)},
        '+966 500 111 111',
        'Saudi Arabia',
        'Riyadh',
        now()
      ),
      (
        '${ptIncompleteUserId}'::uuid,
        '${authSmokeFixtures.ptIncompleteProfile.workspaceId}'::uuid,
        ${sqlString(authSmokeFixtures.ptIncompleteProfile.fullName)},
        ${sqlString(authSmokeFixtures.ptIncompleteProfile.fullName)},
        null,
        null,
        null,
        null
      );

    insert into public.clients (
      id,
      workspace_id,
      user_id,
      status,
      display_name,
      full_name,
      email,
      phone,
      date_of_birth,
      sex,
      height_value,
      height_unit,
      weight_value_current,
      weight_unit,
      account_onboarding_completed_at
    )
    values
      (
        '${authSmokeFixtures.clientNoWorkspace.clientId}'::uuid,
        null,
        '${clientNoWorkspaceUserId}'::uuid,
        'active',
        ${sqlString(authSmokeFixtures.clientNoWorkspace.fullName)},
        ${sqlString(authSmokeFixtures.clientNoWorkspace.fullName)},
        ${sqlString(authSmokeFixtures.clientNoWorkspace.email)},
        '+966 500 222 222',
        '1995-01-01',
        'female',
        170,
        'cm',
        65,
        'kg',
        now()
      ),
      (
        '${authSmokeFixtures.clientInvite.clientId}'::uuid,
        null,
        '${clientInviteUserId}'::uuid,
        'active',
        ${sqlString(authSmokeFixtures.clientInvite.fullName)},
        ${sqlString(authSmokeFixtures.clientInvite.fullName)},
        ${sqlString(authSmokeFixtures.clientInvite.email)},
        '+966 500 333 333',
        '1996-02-02',
        'male',
        180,
        'cm',
        80,
        'kg',
        now()
      );

    insert into public.invites (
      workspace_id,
      role,
      code,
      token,
      expires_at,
      max_uses,
      uses,
      created_by_user_id
    )
    values (
      '${authSmokeFixtures.ptComplete.workspaceId}'::uuid,
      'client',
      ${sqlString(authSmokeFixtures.clientInvite.inviteCode)},
      ${sqlString(authSmokeFixtures.clientInvite.inviteToken)},
      now() + interval '7 days',
      1,
      0,
      '${ptCompleteUserId}'::uuid
    );
  `);

  return {
    ptComplete: {
      email: authSmokeFixtures.ptComplete.email,
      password: authSmokeFixtures.ptComplete.password,
    },
    ptIncompleteProfile: {
      email: authSmokeFixtures.ptIncompleteProfile.email,
      password: authSmokeFixtures.ptIncompleteProfile.password,
    },
    clientNoWorkspace: {
      email: authSmokeFixtures.clientNoWorkspace.email,
      password: authSmokeFixtures.clientNoWorkspace.password,
    },
    clientInvite: {
      email: authSmokeFixtures.clientInvite.email,
      password: authSmokeFixtures.clientInvite.password,
      inviteToken: authSmokeFixtures.clientInvite.inviteToken,
    },
  };
}
