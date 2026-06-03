"use server";

import { revalidatePath } from "next/cache";
import { approveAlert, rejectAlert } from "../../../src/alerts/review.js";

export async function approve(formData: FormData) {
  const id = String(formData.get("id"));
  await approveAlert(id, "admin-ui");
  revalidatePath("/admin/review");
}

export async function reject(formData: FormData) {
  const id = String(formData.get("id"));
  await rejectAlert(id, "admin-ui");
  revalidatePath("/admin/review");
}
