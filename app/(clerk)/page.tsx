import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PlannerApp } from "@/components/planner-app";

export default async function Page() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in" as never);
  }

  return <PlannerApp userId={userId} />;
}
