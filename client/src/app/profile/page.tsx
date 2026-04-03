import { getUserProfile } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import ProfileClient from "@/components/ProfileClient";

export default async function ProfilePage() {
  const result = await getUserProfile();

  if (result.error || !result.user) {
    redirect("/");
  }

  return <ProfileClient user={result.user} />;
}
