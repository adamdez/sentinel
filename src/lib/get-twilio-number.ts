import { createServerClient } from "./supabase";

export async function getTwilioPhoneNumber(userId: string): Promise<string> {
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase.from("user_profiles") as any)
    .select("email")
    .eq("id", userId)
    .single();

  const email = String(profile?.email || "").toLowerCase().trim();

  if (email.includes("adam")) return process.env.TWILIO_PHONE_NUMBER_ADAM || process.env.TWILIO_PHONE_NUMBER || "";
  if (email.includes("logan")) return process.env.TWILIO_PHONE_NUMBER_LOGAN || process.env.TWILIO_PHONE_NUMBER || "";
  if (email.includes("nathan")) return process.env.TWILIO_PHONE_NUMBER_NATHAN || process.env.TWILIO_PHONE_NUMBER || "";

  // Fallback to base TWILIO_PHONE_NUMBER
  return process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER_ADAM || "";
}
