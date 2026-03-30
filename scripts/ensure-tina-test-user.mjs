import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_EMAIL = "tina.tester@example.com";
const DEFAULT_PASSWORD = "Tina-Test-Only-2026!";
const DEFAULT_NAME = "Tina Tester";
const TINA_WORKSPACE_PREFERENCES_KEY = "tina_workspace_v1";
const TINA_PACKET_VERSIONS_PREFERENCES_KEY = "tina_packet_versions_v1";

function loadDotEnvLikeFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const text = fs.readFileSync(filePath, "utf8");
  const values = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

async function listAllUsers(admin) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw error;
    }

    users.push(...(data?.users ?? []));

    if (!data?.users?.length || data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return users;
}

async function resetTinaWorkspacePreferences(admin, userId) {
  const profileQuery = admin.from("user_profiles");
  const { data, error } = await profileQuery
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return false;
  }

  const currentPreferences =
    data.preferences && typeof data.preferences === "object" ? { ...data.preferences } : {};

  delete currentPreferences[TINA_WORKSPACE_PREFERENCES_KEY];
  delete currentPreferences[TINA_PACKET_VERSIONS_PREFERENCES_KEY];

  const { error: updateError } = await admin
    .from("user_profiles")
    .update({ preferences: currentPreferences })
    .eq("id", userId);

  if (updateError) {
    throw updateError;
  }

  return true;
}

async function main() {
  const envFromFile = loadDotEnvLikeFile(path.join(process.cwd(), ".env.local"));
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? envFromFile.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? envFromFile.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.TINA_TEST_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.TINA_TEST_PASSWORD ?? DEFAULT_PASSWORD;
  const fullName = process.env.TINA_TEST_NAME ?? DEFAULT_NAME;
  const shouldResetTinaPreferences = process.env.TINA_RESET_TINA_PREFS !== "0";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase URL or service role key.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const users = await listAllUsers(admin);
  const existing = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        full_name: fullName,
      },
    });

    if (error) {
      throw error;
    }

    const resetApplied = shouldResetTinaPreferences
      ? await resetTinaWorkspacePreferences(admin, existing.id)
      : false;

    console.log(
      `Tina tester refreshed for ${email}${resetApplied ? " and Tina workspace preferences were cleared" : ""}.`
    );
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (error) {
    throw error;
  }

  console.log(`Tina tester created for ${email}.`);
}

main().catch((error) => {
  console.error("[ensure-tina-test-user] Failed:", error);
  process.exitCode = 1;
});
